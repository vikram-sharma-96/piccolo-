import path from "node:path";
import { constants } from "node:fs";
import {
  lstat,
  realpath,
  readdir,
  readFile,
  writeFile,
  rename,
  mkdir,
  unlink,
  open,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
export const revision = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const sensitive =
  /(^|\/)(?:\.git|\.ssh|\.aws|\.azure|\.gnupg|\.codex|\.npmrc|\.pypirc|\.netrc|\.env(?:\..*)?|.*\.(?:pem|key|pfx|p12)|credentials(?:\.[^/]*)?)($|\/)/i;
export class WorkspaceFiles {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public root: string) {}
  static async create(root: string) {
    const canonical = await realpath(root);
    if (!(await lstat(canonical)).isDirectory())
      throw Error("Choose a local project directory.");
    return new WorkspaceFiles(canonical);
  }
  async resolve(relative: string, automation = false) {
    if (
      relative.includes("\\") ||
      relative.includes("\0") ||
      relative.startsWith("/") ||
      relative
        .split("/")
        .some(
          (p) =>
            p === ".." ||
            p.includes(":") ||
            /[. ]$/.test(p) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
        )
    )
      throw Error("Invalid project-relative path.");
    if (automation && sensitive.test(relative))
      throw Error("Sensitive paths are unavailable to workspace automation.");
    const target = path.resolve(this.root, relative || ".");
    if (target !== this.root && !target.startsWith(this.root + path.sep))
      throw Error("Path leaves selected project.");
    let current = this.root;
    for (const segment of relative.split("/").filter(Boolean)) {
      current = path.join(current, segment);
      let info;
      try {
        info = await lstat(current);
      } catch (e: any) {
        if (e.code === "ENOENT") continue;
        throw e;
      }
      if (info.isSymbolicLink())
        throw Error("Symbolic links and junctions are not followed.");
      const actual = await realpath(current);
      if (actual !== this.root && !actual.startsWith(this.root + path.sep))
        throw Error("Path leaves selected project.");
    }
    return target;
  }
  async stat(relative: string, automation = false) {
    const s = await lstat(await this.resolve(relative, automation));
    return {
      type: s.isDirectory() ? 2 : 1,
      ctime: s.birthtimeMs,
      mtime: s.mtimeMs,
      size: s.size,
    };
  }
  async list(relative: string, automation = false) {
    const dir = await this.resolve(relative, automation),
      entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter(
        (e) =>
          !e.isSymbolicLink() &&
          (!automation ||
            !sensitive.test((relative ? relative + "/" : "") + e.name)),
      )
      .slice(0, 2000)
      .map((e) => [e.name, e.isDirectory() ? 2 : 1] as [string, number]);
  }
  async read(relative: string, automation = false) {
    const file = await this.resolve(relative, automation),
      handle = await open(
        file,
        constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
      );
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 8_000_000)
        throw Error("Only regular files up to 8 MB can be edited.");
      const bytes = await handle.readFile();
      return { data: bytes.toString("base64"), revision: revision(bytes) };
    } finally {
      await handle.close();
    }
  }
  private serial<T>(op: () => Promise<T>) {
    const next = this.queue.then(op);
    this.queue = next.catch(() => {});
    return next;
  }
  async write(
    relative: string,
    data: string,
    expected: string | null,
    automation = false,
    signal?: AbortSignal,
  ) {
    return this.serial(async () => {
      if (signal?.aborted) throw Error("Save cancelled.");
      const target = await this.resolve(relative, automation);
      if (target === this.root)
        throw Error("Cannot replace the project directory.");
      const bytes = Buffer.from(data, "base64");
      if (bytes.length > 8_000_000) throw Error("File exceeds 8 MB.");
      let current: Buffer | undefined;
      try {
        const info = await lstat(target);
        if (!info.isFile() || info.size > 8_000_000)
          throw Error("Only regular files up to 8 MB can be saved.");
        current = await readFile(target);
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
      if (current ? revision(current) !== expected : expected !== null)
        throw Error("File changed on disk. Reload or compare before saving.");
      const temporary = path.join(
        path.dirname(target),
        ".piccolo-save-" + randomUUID(),
      );
      try {
        await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
        await this.resolve(relative, automation);
        let latest: Buffer | undefined;
        try {
          latest = await readFile(target);
        } catch (e: any) {
          if (e.code !== "ENOENT") throw e;
        }
        if (latest ? revision(latest) !== expected : expected !== null)
          throw Error("File changed on disk while saving.");
        if (signal?.aborted) throw Error("Save cancelled.");
        await rename(temporary, target);
      } finally {
        await unlink(temporary).catch(() => {});
      }
      return { revision: revision(bytes) };
    });
  }
  async mkdir(relative: string, signal?: AbortSignal) {
    if (signal?.aborted) throw Error("Directory creation cancelled.");
    return mkdir(await this.resolve(relative));
  }
  async rename(relative: string, to: string, signal?: AbortSignal) {
    return this.serial(async () => {
      if (signal?.aborted) throw Error("Move cancelled.");
      const from = await this.resolve(relative),
        dest = await this.resolve(to);
      if (from === this.root || dest === this.root)
        throw Error("Cannot rename the project root.");
      try {
        await lstat(dest);
        throw Error("Destination already exists.");
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
      if (signal?.aborted) throw Error("Move cancelled.");
      await rename(from, dest);
    });
  }
  async search(query: string, signal?: AbortSignal) {
    const results: any[] = [];
    let visited = 0;
    const walk = async (dir: string) => {
      for (const [name, type] of await this.list(dir, true)) {
        if (signal?.aborted) throw Error("Search cancelled.");
        if (++visited > 5000 || results.length >= 200) return;
        const file = (dir ? dir + "/" : "") + name;
        if (type === 2) {
          if (!["node_modules", "dist", "build", ".cache"].includes(name))
            await walk(file);
        } else {
          try {
            const info = await this.stat(file, true);
            if (info.size > 500_000) continue;
            const data = Buffer.from(
              (await this.read(file, true)).data,
              "base64",
            );
            if (data.includes(0)) continue;
            const lines = data.toString("utf8").split("\n");
            for (let i = 0; i < lines.length && results.length < 200; i++)
              if (lines[i].toLowerCase().includes(query.toLowerCase()))
                results.push({
                  path: file,
                  line: i + 1,
                  text: lines[i].slice(0, 400),
                });
          } catch {}
        }
      }
    };
    await walk("");
    return { results, truncated: visited > 5000 || results.length >= 200 };
  }
}
