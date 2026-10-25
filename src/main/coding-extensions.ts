import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import * as yauzl from "yauzl";
import * as semver from "semver";
import { dialog, app } from "electron";
import type { Browser } from "./browser";
const hosts = new Set(["open-vsx.org", "openvsx.eclipsecontent.org"]);
let installing = false;
export async function registry(url: string, signal?: AbortSignal) {
  let target = new URL(url);
  for (let i = 0; i < 5; i++) {
    if (
      target.protocol !== "https:" ||
      !hosts.has(target.hostname) ||
      target.username ||
      target.password
    )
      throw Error("Unapproved extension registry host.");
    const r = await fetch(target, {
      redirect: "manual",
      signal: AbortSignal.any([
        AbortSignal.timeout(30000),
        ...(signal ? [signal] : []),
      ]),
    });
    if (r.status >= 300 && r.status < 400) {
      target = new URL(r.headers.get("location") || "", target);
      continue;
    }
    if (!r.ok) throw Error("Open VSX returned HTTP " + r.status);
    if (Number(r.headers.get("content-length")) > 32_000_000)
      throw Error("Extension exceeds 32 MB.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of r.body!) {
      size += chunk.length;
      if (size > 32_000_000) throw Error("Extension response exceeds 32 MB.");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw Error("Too many registry redirects.");
}
export async function searchExtensions(query: string, signal?: AbortSignal) {
  const data = JSON.parse(
    (
      await registry(
        "https://open-vsx.org/api/-/search?size=12&query=" +
          encodeURIComponent(query),
        signal,
      )
    ).toString(),
  );
  return (data.extensions || []).map((e: any) => ({
    id: e.namespace + "." + e.name,
    version: e.version,
    description: String(e.description || "").slice(0, 300),
  }));
}
const managed = () => path.join(app.getPath("userData"), "coding-extensions");
async function retire(b: Browser, directory: string) {
  const retired = await b.store.get<string[]>("coding-retired", []);
  await b.store.set("coding-retired", [...new Set([...retired, directory])]);
}
export async function cleanupRetired(b: Browser) {
  const active = await installedExtensions(b);
  const retired = await b.store.get<string[]>("coding-retired", []);
  for (const directory of retired) {
    if (
      /^[a-f0-9-]{36}$/.test(directory) &&
      !active.some((e) => e.directory === directory)
    )
      await cleanOwned(path.join(managed(), directory));
  }
  await b.store.set("coding-retired", []);
}
async function cleanOwned(folder: string) {
  const root = path.resolve(managed()),
    target = path.resolve(folder);
  if (!target.startsWith(root + path.sep))
    throw Error("Unsafe managed extension cleanup.");
  await rm(target, { recursive: true, force: true });
}
async function unzip(file: string, destination: string) {
  let total = 0,
    count = 0;
  await new Promise<void>((resolve, reject) =>
    yauzl.open(
      file,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) return reject(error);
        let stopped = false;
        const fail = (e: any) => {
          if (!stopped) {
            stopped = true;
            zip.close();
            reject(e);
          }
        };
        zip.on("error", fail);
        zip.on("end", () => {
          if (!stopped) resolve();
        });
        zip.on("entry", async (entry: yauzl.Entry) => {
          try {
            if (
              ++count > 5000 ||
              (total += entry.uncompressedSize) > 80_000_000
            )
              throw Error("VSIX archive exceeds safe extraction limits.");
            const name = entry.fileName;
            if (
              name.includes("\\") ||
              name.includes("\0") ||
              name.startsWith("/") ||
              name.split("/").some((p) => p === ".." || p.includes(":")) ||
              ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000
            )
              throw Error("Unsafe VSIX archive entry.");
            if (!name.startsWith("extension/")) {
              zip.readEntry();
              return;
            }
            const relative = name.slice(10);
            if (!relative) {
              zip.readEntry();
              return;
            }
            const target = path.resolve(destination, relative);
            if (
              !target.startsWith(destination + path.sep) ||
              relative.split("/").length > 20
            )
              throw Error("Unsafe extension path.");
            if (/\.(node|exe|dll|com|bat|cmd|ps1)$/i.test(relative))
              throw Error(
                "This VSIX contains desktop/native executable files; only web extensions are supported.",
              );
            if (name.endsWith("/")) {
              await mkdir(target, { recursive: true });
              zip.readEntry();
              return;
            }
            await mkdir(path.dirname(target), { recursive: true });
            zip.openReadStream(entry, (err, stream) => {
              if (err || !stream) return fail(err);
              const chunks: Buffer[] = [];
              let actual = 0;
              stream.on("data", (chunk) => {
                actual += chunk.length;
                if (actual > 8_000_000) {
                  stream.destroy();
                  fail(Error("An extension file exceeds 8 MB."));
                } else chunks.push(chunk);
              });
              stream.on("error", fail);
              stream.on("end", () => {
                if (stopped) return;
                void writeFile(target, Buffer.concat(chunks), {
                  flag: "wx",
                }).then(() => zip.readEntry(), fail);
              });
            });
          } catch (e) {
            fail(e);
          }
        });
        zip.readEntry();
      },
    ),
  );
}
export async function extensionFiles(directory: string) {
  const files: string[] = [];
  async function walk(dir: string) {
    for (const item of await readdir(path.join(directory, dir), {
      withFileTypes: true,
    })) {
      if (item.isSymbolicLink())
        throw Error("Managed extension contains a link.");
      const p = (dir ? dir + "/" : "") + item.name;
      if (item.isDirectory()) await walk(p);
      else files.push(p);
    }
  }
  await walk("");
  return files;
}
async function fingerprint(dir: string, files: string[]) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(file);
    hash.update(await readFile(path.join(dir, file)));
  }
  return hash.digest("hex");
}
export async function installedExtensions(b: Browser, verify = false) {
  const records = await b.store.get<any[]>("coding-extensions", []);
  if (!Array.isArray(records))
    throw Error("Invalid coding extension registry.");
  const result = [];
  for (const record of records) {
    const folder = path.resolve(managed(), record.directory);
    if (!folder.startsWith(path.resolve(managed()) + path.sep))
      throw Error("Invalid extension record.");
    if (verify && record.enabled) {
      try {
        const files = await extensionFiles(folder);
        if ((await fingerprint(folder, files)) !== record.sha256)
          throw Error(
            "Extension files changed: " +
              record.id +
              ". Disable or reinstall it.",
          );
        result.push({
          ...record,
          files,
          manifest: JSON.parse(
            await readFile(path.join(folder, "package.json"), "utf8"),
          ),
        });
      } catch (error) {
        result.push({ ...record, enabled: false, error: String(error) });
      }
    } else result.push(record);
  }
  return result;
}
export async function installExtension(
  b: Browser,
  source: { id?: string; version?: string; vsix?: string },
  signal?: AbortSignal,
) {
  if (installing) throw Error("An extension installation is already pending.");
  installing = true;
  try {
    const base = managed();
    await mkdir(base, { recursive: true });
    const staging = path.join(base, randomUUID()),
      archive = path.join(base, randomUUID() + ".vsix");
    await mkdir(staging);
    let committed = false;
    try {
      let downloaded: Buffer;
      if (source.vsix) {
        const info = await stat(source.vsix);
        if (info.size > 32_000_000) throw Error("VSIX exceeds 32 MB.");
        downloaded = await readFile(source.vsix);
      } else {
        const metadata = JSON.parse(
          (
            await registry(
              "https://open-vsx.org/api/" +
                source.id!.replace(".", "/") +
                "/" +
                source.version,
              signal,
            )
          ).toString(),
        );
        downloaded = await registry(metadata.files.download, signal);
      }
      await writeFile(archive, downloaded, { flag: "wx" });
      await unzip(archive, staging);
      const manifest = JSON.parse(
        await readFile(path.join(staging, "package.json"), "utf8"),
      );
      const id = manifest.publisher + "." + manifest.name;
      if (
        !/^[\w-]+\.[\w-]+$/.test(id) ||
        !semver.valid(manifest.version) ||
        !semver.satisfies("1.142.0", manifest.engines?.vscode || "", {
          includePrerelease: true,
        })
      )
        throw Error(
          "VSIX manifest is invalid or incompatible with Code OSS 1.142.0.",
        );
      if (
        source.id &&
        (source.id.toLowerCase() !== id.toLowerCase() ||
          source.version !== manifest.version)
      )
        throw Error(
          "Registry package identity/version differs from the requested extension.",
        );
      if (manifest.main && !manifest.browser)
        throw Error(
          "This extension requires a desktop Node extension host. Piccolo supports web extensions and declarative themes.",
        );
      if (manifest.enabledApiProposals?.length)
        throw Error("Proposed VS Code APIs are not supported.");
      if (
        !manifest.browser &&
        !(
          manifest.contributes?.themes ||
          manifest.contributes?.iconThemes ||
          manifest.contributes?.grammars ||
          manifest.contributes?.languages
        )
      )
        throw Error(
          "Extension has no supported browser entry or declarative contribution.",
        );
      const detail = [
        id + " " + manifest.version,
        "Source: " + (source.vsix ? "User-selected VSIX" : "Open VSX"),
        "License: " + (manifest.license || "Not declared"),
        "Web extensions can read/edit the selected project through VS Code APIs. They are third-party code, not antivirus scanned. Desktop processes, native modules and Microsoft-specific services are unavailable. Network access is blocked by default.",
        "Activation requires a trusted workspace and reopening the workbench.",
      ].join("\n");
      const { response } = await dialog.showMessageBox(b.win, {
        signal,
        type: "warning",
        title: "Install coding extension?",
        message: "Install " + id + "?",
        detail,
        buttons: ["Cancel", "Install"],
        defaultId: 0,
        cancelId: 0,
      });
      if (response !== 1 || signal?.aborted)
        throw Error("Extension installation cancelled.");
      const files = await extensionFiles(staging);
      const record = {
        id,
        version: manifest.version,
        enabled: true,
        source: source.vsix ? "User VSIX" : "Open VSX",
        license: String(manifest.license || "Not declared").slice(0, 200),
        directory: path.basename(staging),
        sha256: await fingerprint(staging, files),
      };
      const records = await installedExtensions(b);
      await b.store.set("coding-extensions", [
        ...records.filter((e) => e.id !== id),
        record,
      ]);
      committed = true;
      const previous = records.find((e) => e.id === id);
      if (previous) await retire(b, previous.directory);
      return { id, version: record.version, reopenRequired: true };
    } finally {
      await rm(archive, { force: true });
      if (!committed) await cleanOwned(staging);
    }
  } finally {
    installing = false;
  }
}
export async function changeExtension(
  b: Browser,
  id: string,
  operation: string,
  signal?: AbortSignal,
) {
  const records = await installedExtensions(b),
    entry = records.find((e) => e.id === id);
  if (!entry) throw Error("Unknown coding extension.");
  if (operation === "update") {
    if (entry.source !== "Open VSX")
      throw Error(
        "Install a newer user-selected VSIX to update this extension.",
      );
    const metadata = JSON.parse(
      (
        await registry(
          "https://open-vsx.org/api/" + id.replace(".", "/") + "/latest",
          signal,
        )
      ).toString(),
    );
    if (metadata.version === entry.version)
      return { upToDate: true, version: entry.version };
    return installExtension(b, { id, version: metadata.version }, signal);
  }
  if (operation === "remove") {
    const { response } = await dialog.showMessageBox(b.win, {
      signal,
      message: "Remove " + id + "?",
      buttons: ["Cancel", "Remove"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1 || signal?.aborted) throw Error("Removal cancelled.");
    await b.store.set(
      "coding-extensions",
      records.filter((e) => e.id !== id),
    );
    await retire(b, entry.directory);
  } else {
    entry.enabled = operation === "enable";
    if (entry.enabled) {
      const folder = path.resolve(managed(), entry.directory);
      const files = await extensionFiles(folder);
      if ((await fingerprint(folder, files)) !== entry.sha256)
        throw Error("Extension files changed. Reinstall before enabling.");
    }
    await b.store.set("coding-extensions", records);
  }
  return { reopenRequired: true };
}
