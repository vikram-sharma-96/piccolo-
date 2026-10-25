import { checkExtensionFiles } from "./extension-files";
import { createHash, randomUUID } from "node:crypto";
import { app, dialog, session, safeStorage } from "electron";
import {
  readFile,
  writeFile,
  mkdir,
  unlink,
  readdir,
  stat,
  cp,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Browser } from "./browser";
import { webURL } from "../shared/url";
type ExtensionRecord = {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  permissions: string[];
  manifestHash?: string;
  treeHash?: string;
  error?: string;
};
let extensions: ExtensionRecord[] = [];
let extensionsReady = false;
let proxy = {
  enabled: false,
  blocked: false,
  url: "",
  status: "Direct connection; no browser proxy configured.",
};
let dailyBusy = false;
let dailyController: AbortController | undefined;
let lastDailyAttempt = "";
export async function restoreOptional(b: Browser) {
  const records = await b.store.get<ExtensionRecord[]>("extensions", []);
  if (Array.isArray(records) && records.length) {
    extensions = records;
    extensionsReady = true;
    for (const r of extensions.filter((e) => e.enabled)) {
      try {
        if (!r.treeHash || (await checkExtensionFiles(r.path)) !== r.treeHash)
          throw Error("Extension files changed; reinstall for review.");
        if (
          !r.manifestHash ||
          createHash("sha256")
            .update(await readFile(path.join(r.path, "manifest.json")))
            .digest("hex") !== r.manifestHash
        )
          throw Error("Manifest changed; reinstall for review.");
        const e = await b.ses.extensions.loadExtension(r.path, {
          allowFileAccess: false,
        });
        r.id = e.id;
      } catch {
        r.enabled = false;
        r.error =
          "Could not load extension. Reinstall from its original folder.";
      }
    }
  }
}
export async function handleOptional(
  b: Browser,
  c: { service: string; action: string; value?: unknown },
): Promise<unknown> {
  if (c.service === "mcp") {
    const file = path.join(__dirname, "mcp.cjs");
    if (
      !require.cache[file] &&
      ["status", "server-stop", "disconnect", "cancel"].includes(c.action)
    ) {
      const saved = await b.store.get<any[]>("mcp-pairs", []);
      const clients = (Array.isArray(saved) ? saved : [])
        .slice(0, 32)
        .filter((p) => p && /^[a-f0-9]{64}$/.test(p.id))
        .map((p) => ({
          id: p.id,
          name: String(p.name || "Local client").slice(0, 40),
          full: p.full === true,
          private: p.private === true,
          revoked: p.revoked === true,
          connections: 0,
        }));
      return {
        serverEnabled: false,
        endpoint: "",
        clientConnected: false,
        tools: [],
        activity: [],
        busy: false,
        clients,
        trusted: clients.some((p) => p.full && !p.revoked),
        permissions:
          "MCP is disabled. Paired keys remain stored; revoke or restore individual grants below.",
      };
    }
    const mcp = require(file);
    return mcp.handleMcp(b, c.action, c.value);
  }
  if (c.service === "extensions") {
    if (!extensionsReady) {
      const saved = await b.store.get("extensions", []);
      extensions = Array.isArray(saved) ? saved : [];
      extensionsReady = true;
    }
    if (c.action === "install") {
      const { filePaths } = await dialog.showOpenDialog(b.win, {
        title: "Choose an unpacked extension",
        properties: ["openDirectory"],
      });
      if (!filePaths[0]) return extensions;
      if (extensions.length >= 20)
        throw Error(
          "Remove an extension before installing another (limit 20).",
        );
      const treeHash = await checkExtensionFiles(filePaths[0]);
      const manifestPath = path.join(filePaths[0], "manifest.json");
      if ((await stat(manifestPath)).size > 100000)
        throw Error("Manifest exceeds 100 KB.");
      const manifestBytes = await readFile(manifestPath);
      const manifestHash = createHash("sha256")
        .update(manifestBytes)
        .digest("hex");
      const m = JSON.parse(manifestBytes.toString("utf8"));
      if (
        ![2, 3].includes(m.manifest_version) ||
        typeof m.name !== "string" ||
        typeof m.version !== "string"
      )
        throw Error("Unsupported or invalid manifest.");
      if (
        !Array.isArray(m.content_scripts || []) ||
        !Array.isArray(m.permissions || []) ||
        !Array.isArray(m.host_permissions || [])
      )
        throw Error("Invalid manifest arrays.");
      const permissions = [
        ...(m.permissions || []),
        ...(m.host_permissions || []),
      ];
      if (
        !Array.isArray(m.permissions || []) ||
        !Array.isArray(m.host_permissions || []) ||
        permissions.length > 100 ||
        permissions.some((p) => typeof p !== "string")
      )
        throw Error("Invalid extension permissions.");
      const allowed = new Set([
        "storage",
        "activeTab",
        "http://*/*",
        "https://*/*",
        "<all_urls>",
      ]);
      if (
        permissions.some((p) => !allowed.has(p) && !/^https?:\/\//.test(p)) ||
        m.externally_connectable ||
        m.devtools_page ||
        m.background ||
        m.optional_permissions?.length ||
        m.optional_host_permissions?.length ||
        m.browser_specific_settings?.gecko ||
        m.chrome_url_overrides
      )
        throw Error(
          "This release supports only content-script/storage extensions. Background workers, native messaging, privileged APIs and page overrides are unavailable.",
        );
      if (
        (m.content_scripts || []).some(
          (s: any) =>
            s.world === "MAIN" ||
            (s.matches || []).some(
              (url: string) =>
                url !== "<all_urls>" && !/^https?:\/\//.test(url),
            ),
        )
      )
        throw Error("Only isolated HTTP(S) content scripts are supported.");
      const { response } = await dialog.showMessageBox(b.win, {
        type: "warning",
        message: `Install ${m.name.slice(0, 100)}?`,
        detail: `Untrusted extension code can read/change matching websites.\nPermissions: ${permissions.join(", ") || "content scripts only"}\nMatches: ${(
          m.content_scripts || []
        )
          .flatMap((s: any) => s.matches || [])
          .join(", ")
          .slice(
            0,
            1000,
          )}\nOnly install a folder you trust. Piccolo keeps a reviewed local copy and checks its integrity. Private windows and Piccolo UI are excluded.`,
        buttons: ["Cancel", "Install"],
        defaultId: 0,
        cancelId: 0,
      });
      if (response !== 1) return extensions;
      if (
        (await checkExtensionFiles(filePaths[0])) !== treeHash ||
        createHash("sha256")
          .update(await readFile(manifestPath))
          .digest("hex") !== manifestHash
      )
        throw Error("Extension changed during approval. Review it again.");
      const installRoot = path.join(app.getPath("userData"), "extensions");
      await mkdir(installRoot, { recursive: true });
      const installedPath = path.join(installRoot, randomUUID());
      let e: Electron.Extension;
      try {
        await cp(filePaths[0], installedPath, {
          recursive: true,
          dereference: false,
        });
        if ((await checkExtensionFiles(installedPath)) !== treeHash)
          throw Error("Extension changed while copying. Nothing was loaded.");
        e = await b.ses.extensions.loadExtension(installedPath, {
          allowFileAccess: false,
        });
      } catch (error) {
        // This exact path was generated inside our install root above, never supplied by a manifest.
        if (
          path.dirname(path.resolve(installedPath)) ===
          path.resolve(installRoot)
        )
          await rm(installedPath, { recursive: true, force: true });
        throw error;
      }
      extensions = extensions.filter((r) => r.id !== e.id);
      extensions.push({
        id: e.id,
        name: m.name.slice(0, 100),
        path: installedPath,
        treeHash,
        enabled: true,
        permissions: [
          ...permissions,
          ...(m.content_scripts || []).flatMap((s: any) => s.matches || []),
        ],
        manifestHash,
      });
    } else if (["enable", "disable", "remove"].includes(c.action)) {
      const id = z.string().max(100).parse(c.value);
      const record = extensions.find((e) => e.id === id);
      if (!record) throw Error("Extension not found.");
      if (c.action === "disable" || c.action === "remove") {
        b.ses.extensions.removeExtension(id);
        record.enabled = false;
      } else {
        if (
          !record.treeHash ||
          (await checkExtensionFiles(record.path)) !== record.treeHash
        )
          throw Error(
            "Extension files changed. Remove and reinstall for review.",
          );
        if (
          !record.manifestHash ||
          createHash("sha256")
            .update(await readFile(path.join(record.path, "manifest.json")))
            .digest("hex") !== record.manifestHash
        )
          throw Error(
            "Manifest changed. Remove and reinstall for permission review.",
          );
        const e = await b.ses.extensions.loadExtension(record.path, {
          allowFileAccess: false,
        });
        record.id = e.id;
        record.enabled = true;
      }
      if (c.action === "remove") {
        extensions = extensions.filter((r) => r !== record);
        const root = path.resolve(app.getPath("userData"), "extensions");
        const target = path.resolve(record.path);
        if (
          target.startsWith(root + path.sep) &&
          /^[a-f0-9-]{36}$/.test(path.basename(target))
        )
          await rm(target, { recursive: true, force: true });
      }
    }
    await b.store.set("extensions", extensions);
    return extensions;
  }
  if (c.service === "proxy") {
    if (c.action === "disconnect") {
      b.ses.enableNetworkEmulation({ offline: false });
      await b.ses.setProxy({ mode: "direct" });
      await b.ses.closeAllConnections();
      proxy = {
        enabled: false,
        blocked: false,
        url: "",
        status: "Direct connection.",
      };
    }
    if (c.action === "connect") {
      const url = z.string().max(2048).parse(c.value);
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        throw Error(
          "Enter a proxy URL such as http://127.0.0.1:8080 or socks5://127.0.0.1:1080.",
        );
      }
      if (
        !["http:", "https:", "socks5:"].includes(u.protocol) ||
        !u.hostname ||
        !u.port ||
        u.username ||
        u.password ||
        !["", "/"].includes(u.pathname) ||
        u.search ||
        u.hash
      )
        throw Error(
          "Proxy needs a host and port, without credentials or a path. Authenticated providers require a supported local client.",
        );
      const previous = { ...proxy };
      try {
        b.ses.enableNetworkEmulation({ offline: false });
        await b.ses.setProxy({
          mode: "fixed_servers",
          proxyRules:
            u.origin === "null" ? `${u.protocol}//${u.host}` : u.origin,
          proxyBypassRules: "<-loopback>",
        });
        await b.ses.closeAllConnections();
        const resolved = await b.ses.resolveProxy("https://example.com/");
        if (resolved === "DIRECT")
          throw Error("The proxy route was not applied.");
        // A cached successful response cannot prove a newly selected proxy works.
        const response = await b.ses.fetch(
          `https://example.com/?piccolo-probe=${randomUUID()}`,
          {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!response.ok) throw Error("HTTPS probe failed.");
        await response.body?.cancel();
        proxy = {
          enabled: true,
          blocked: false,
          url,
          status: `Browser proxy verified: ${resolved}. HTTPS probe succeeded. Normal browsing session only; this is not a system VPN.`,
        };
      } catch {
        if (previous.enabled) {
          await b.ses.setProxy({
            mode: "fixed_servers",
            proxyRules: previous.url,
            proxyBypassRules: "<-loopback>",
          });
          proxy = {
            ...previous,
            status:
              "New proxy verification failed. Previous browser proxy configuration restored; reachability has not been rechecked.",
          };
        } else {
          b.ses.enableNetworkEmulation({ offline: true });
          proxy = {
            enabled: false,
            blocked: true,
            url: "",
            status:
              "Proxy verification failed. Normal website networking is paused. Disconnect explicitly to return to direct mode.",
          };
        }
        await b.ses.closeAllConnections();
        throw Error(proxy.status);
      }
    }
    return proxy;
  }
  if (c.service === "daily") {
    const keyFile = path.join(app.getPath("userData"), "nasa-key.bin");
    if (c.action === "key") {
      const value = z
        .string()
        .regex(/^[a-zA-Z0-9_-]{10,128}$/)
        .parse(c.value);
      if (
        process.platform !== "win32" ||
        !(await safeStorage.isAsyncEncryptionAvailable())
      )
        throw Error(
          "Secure provider-key storage is unavailable on this platform.",
        );
      await writeFile(keyFile, await safeStorage.encryptStringAsync(value), {
        mode: 0o600,
      });
      lastDailyAttempt = "";
      return {
        status:
          "NASA API key saved using Windows OS encryption. It is not included in settings or exports.",
      };
    }
    if (c.action === "clear-key") {
      await unlink(keyFile).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      return { status: "NASA key removed; public DEMO_KEY will be used." };
    }

    if (c.action === "disable") {
      dailyController?.abort();
      await b.setSettings({ ...b.state.settings, dailyWallpaper: false });
      return { status: "Daily checks disabled." };
    }
    if (c.action === "enable") {
      const { response } = await dialog.showMessageBox(b.win, {
        message: "Enable daily NASA wallpaper?",
        detail:
          "Enabling this replaces your current wallpaper with an eligible daily static image (at most 10 MB). NASA API/image requests are direct and are not routed through the browser proxy. Copyright-marked images, videos and non-NASA image hosts are skipped. NASA attribution is displayed. No location or account is used. NASA media policy: https://www.nasa.gov/nasa-brand-center/images-and-media/",
        buttons: ["Cancel", "Enable"],
        defaultId: 0,
        cancelId: 0,
      });
      if (response !== 1) return { status: "Disabled" };
      await b.setSettings({ ...b.state.settings, dailyWallpaper: true });
    }
    if (c.action === "check" || c.action === "enable") lastDailyAttempt = "";
    if (b.state.settings.dailyWallpaper && c.action !== "status")
      await checkDaily(b);
    return (
      b.state.dailyCredit || {
        status: b.state.settings.dailyWallpaper
          ? "Enabled; check on next visible new tab."
          : "Disabled",
      }
    );
  }
  throw Error("Unknown optional service.");
}
export async function checkDaily(b: Browser) {
  if (b.state.private || !b.state.settings.dailyWallpaper || dailyBusy) return;
  const day = new Date().toISOString().slice(0, 10);
  if (lastDailyAttempt === day) return;
  lastDailyAttempt = day;
  dailyBusy = true;
  dailyController = new AbortController();
  try {
    const cached = await b.store.get<{
      day: string;
      asset: string;
      text: string;
      url: string;
    } | null>("daily-wallpaper", null);
    if (cached?.day === day) {
      b.state.dailyCredit = {
        text: cached.text,
        url: cached.url,
        status: "Cached daily image",
      };
      return;
    }
    let apiKey = "DEMO_KEY";
    try {
      const encrypted = await readFile(
        path.join(app.getPath("userData"), "nasa-key.bin"),
      );
      apiKey = (await safeStorage.decryptStringAsync(encrypted)).result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw Error(
          "Stored NASA key is unavailable. Remove it or save a new key.",
        );
    }
    const endpoint = new URL("https://api.nasa.gov/planetary/apod");
    endpoint.searchParams.set("api_key", apiKey);
    const response = await fetch(endpoint, {
      signal: AbortSignal.any([
        dailyController.signal,
        AbortSignal.timeout(10000),
      ]),
      redirect: "error",
    });
    if (!response.ok)
      throw Error(
        `NASA APOD returned HTTP ${response.status}. Configure your own API key or try later.`,
      );
    const data = (await response.json()) as any;
    if (data.media_type !== "image" || data.copyright)
      throw Error(
        "Today’s APOD is a video or copyright-marked image. Keeping the current background.",
      );
    const u = new URL(data.url);
    if (u.protocol !== "https:" || u.hostname !== "apod.nasa.gov")
      throw Error(
        "The daily image is hosted outside the supported NASA source.",
      );
    const image = await fetch(u, {
      signal: AbortSignal.any([
        dailyController.signal,
        AbortSignal.timeout(15000),
      ]),
      redirect: "error",
    });
    if (
      !image.ok ||
      !/^image\/(jpeg|png|webp)/.test(image.headers.get("content-type") || "")
    )
      throw Error("Unsupported daily image.");
    const reader = image.body!.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
        if (bytes > 10 * 1024 * 1024) throw Error("Daily image exceeds 10 MB.");
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel();
    }
    if (!b.state.settings.dailyWallpaper || dailyController.signal.aborted)
      throw Error("Cancelled");
    const asset = "dddddddd-dddd-dddd-dddd-dddddddddddd.jpg";
    const dir = path.join(app.getPath("userData"), "wallpapers");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, asset), Buffer.concat(chunks));
    const credit = {
      day,
      asset,
      text: `NASA APOD · ${String(data.title).slice(0, 100)}`,
      url: "https://apod.nasa.gov/apod/astropix.html",
    };
    await b.store.set("daily-wallpaper", credit);
    await b.setSettings({
      ...b.state.settings,
      wallpaper: { ...b.state.settings.wallpaper, kind: "image", asset },
    });
    b.state.dailyCredit = {
      text: credit.text,
      url: credit.url,
      status: "Daily image cached",
    };
  } catch (error) {
    if (!b.state.settings.dailyWallpaper) return;
    b.state.dailyCredit = {
      text: "Daily wallpaper · keeping current background",
      url: "https://apod.nasa.gov/",
      status:
        error instanceof Error &&
        /^(NASA|Today|The daily|Unsupported daily|Daily image|Stored NASA)/.test(
          error.message,
        )
          ? error.message
          : "Daily provider is offline or unavailable. Keeping the current background.",
    };
  } finally {
    dailyBusy = false;
    dailyController = undefined;
    b.emit();
  }
}
