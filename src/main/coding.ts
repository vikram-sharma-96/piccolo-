import {
  app,
  dialog,
  WebContentsView,
  session,
  ipcMain,
  net,
  shell,
  utilityProcess,
  type UtilityProcess,
  type IpcMainInvokeEvent,
} from "electron";
import { readFile, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Browser } from "./browser";
import { codingRequest, type CodingRequest } from "../shared/coding";
import { WorkspaceFiles } from "./workspace-files";
import {
  installedExtensions,
  searchExtensions,
  installExtension,
  changeExtension,
  cleanupRetired,
} from "./coding-extensions";
type Project = { id: string; root: string; name: string };
type OpenProject = {
  project: Project;
  files: WorkspaceFiles;
  b: Browser;
  view: WebContentsView;
  trusted: boolean;
  terminal?: UtilityProcess;
  startingTerminal?: boolean;
  approvingInput?: boolean;
  shellPid?: number;
  terminalText: string;
  checkedExtensions?: any[];
  allowClose?: boolean;
  closing?: boolean;
  appearance: string;
  managing?: boolean;
  abort: AbortController;
};
let current: OpenProject | undefined;
let selecting = false;
const activeSignals = new Map<string, Set<AbortController>>();
const clientScope = new AsyncLocalStorage<string>();
const terminalClients = new Set<string>();
let terminalOwner: string | undefined;
const events: { time: number; status: string; client: string }[] = [];
const generation = () => current;
const profile = () => app.getPath("userData");
function childEnv() {
  const env: Record<string, string> = {};
  for (const key of [
    "SystemRoot",
    "WINDIR",
    "PATH",
    "PATHEXT",
    "COMSPEC",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "PROGRAMDATA",
    "HOME",
    "LANG",
    "TERM",
  ])
    if (process.env[key]) env[key] = process.env[key]!;
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_OPTIONAL_LOCKS = "0";
  return env;
}
function requireCurrent(b?: Browser) {
  if (!current || (b && current.b !== b))
    throw Error("Open a project in this browser window first.");
  return current;
}
function send(s: OpenProject, event: any) {
  if (!s.view.webContents.isDestroyed())
    s.view.webContents.send("piccolo-code:event", event);
}
function notify(b: Browser) {
  b.state.workspaceRevision = (b.state.workspaceRevision || 0) + 1;
  b.emit();
}
export function syncBounds(b: Browser) {
  const s = current;
  if (!s || s.b !== b || s.view.webContents.isDestroyed()) return;
  const visible =
    b.active()?.url === "piccolo://workspaces" &&
    !b.overlay &&
    !b.active()?.error &&
    !s.managing;
  s.view.setVisible(visible);
  if (visible) {
    const [width, height] = b.win.getContentSize(),
      x = b.railWidth(),
      top =
        94 + (b.state.settings.bookmarksBar ? 28 : 0) + (b.state.agentTask ? 34 : 0) + (b.findOpen ? 42 : 0);
    s.view.setBounds({
      x,
      y: top,
      width: Math.max(1, width - x),
      height: Math.max(1, height - top),
    });
  }
  if (s.appearance !== b.state.appearance) {
    s.appearance = b.state.appearance;
    send(s, { type: "theme", appearance: s.appearance });
  }
}
async function invokeEditor(
  s: OpenProject,
  operation: string,
  args: any[] = [],
) {
  if (s.view.webContents.isDestroyed())
    throw Error("Coding workbench is closed.");
  const allowed = [
    "inspect",
    "open",
    "readEditor",
    "edit",
    "save",
    "command",
    "extensions",
    "git",
    "search",
    "terminal",
    "snapshot",
  ];
  if (!allowed.includes(operation))
    throw Error("Unsupported editor operation.");
  return s.view.webContents.executeJavaScript(
    `(()=>{const api=window.piccoloWorkbench;if(!api?.ready)throw Error('Workbench is still loading.');return api[${JSON.stringify(operation)}](...${JSON.stringify(args)});})()`,
  );
}
export async function editorOperation(
  b: Browser,
  operation: string,
  args: any[] = [],
) {
  return invokeEditor(requireCurrent(b), operation, args);
}
async function pendingChanges(s: OpenProject, strict = false) {
  try {
    return (await invokeEditor(s, "inspect")).dirty as string[];
  } catch {
    if(strict)throw Error('Workbench is still loading or unavailable. Wait for the editor before automation changes files.');
    return [];
  }
}
async function allowReplace(s: OpenProject) {
  const dirty = await pendingChanges(s);
  if (dirty.length) {
    const { response } = await dialog.showMessageBox(s.b.win, {
      type: "warning",
      message: "Save changes before closing the coding workspace?",
      detail: dirty.slice(0, 12).join("\n"),
      buttons: ["Cancel", "Save all", "Discard changes"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response === 0) return false;
    if (response === 1) {
      await invokeEditor(s, "save");
      if ((await pendingChanges(s)).length)
        throw Error(
          "Some documents could not be saved. Workspace remains open.",
        );
    }
  }
  try {
    const layout = await invokeEditor(s, "snapshot");
    await s.b.store.set("coding-layout-" + s.project.id, layout);
  } catch {
    console.warn(
      "Coding layout could not be saved. Saved project files are unaffected.",
    );
  }
  return true;
}
async function killTree(pid?: number) {
  if (!pid || pid < 1) return;
  if (process.platform === "win32")
    await new Promise<void>((resolve) => {
      const child = spawn(
        path.join(
          process.env.SystemRoot || "C:\\Windows",
          "System32",
          "taskkill.exe",
        ),
        ["/PID", String(pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      child.once("error", () => resolve());
      child.once("exit", () => resolve());
    });
}
async function stopTerminal(s: OpenProject) {
  const worker = s.terminal;
  s.terminal = undefined;
  terminalClients.clear();
  terminalOwner = undefined;
  s.terminalText='';
  if (worker) await killTree(s.shellPid);
  s.shellPid = undefined;
  if (worker) {
    worker.postMessage({ type: "stop" });
    await Promise.race([
      new Promise<void>((resolve) => worker.once("exit", () => resolve())),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          worker.kill();
          resolve();
        }, 300),
      ),
    ]);
  }
  send(s, { type: "terminal-exit" });
}
export async function closeWorkspace(b: Browser, force = false) {
  const s = current;
  if (!s || s.b !== b) return true;
  if (s.closing) return false;
  s.closing = true;
  try {
    if (!force && !(await allowReplace(s))) return false;
    if (s.terminal && !force) {
      const { response } = await dialog.showMessageBox(b.win, {
        type: "warning",
        message: "Stop the running terminal and close this workspace?",
        detail:
          "Shell processes started in this workspace will be stopped. Independently detached services may require manual shutdown.",
        buttons: ["Cancel", "Stop and close"],
        defaultId: 0,
        cancelId: 0,
      });
      if (response !== 1) return false;
    }
    s.abort.abort(Error("Workspace closed."));
    await require.cache[path.join(__dirname,'agent.cjs')]?.exports.revokeAgent({project:s.project.id});
    await stopTerminal(s);
    if (!s.view.webContents.isDestroyed()) {
      b.win.contentView.removeChildView(s.view);
      s.view.webContents.close();
    }
    if (current === s) current = undefined;
    await cleanupRetired(b);
    notify(b);
    return true;
  } finally {
    s.closing = false;
  }
}
export function confirmWindowClose(b: Browser, event: Electron.Event) {
  const s = current;
  if (!s || s.b !== b || s.allowClose) return false;
  event.preventDefault();
  void closeWorkspace(b)
    .then((ok) => {
      if (ok) {
        s.allowClose = true;
        b.win.close();
      }
    })
    .catch(() => {});
  return true;
}
export async function shutdown() {
  return current ? closeWorkspace(current.b) : true;
}
async function reload(s: OpenProject) {
  if (!(await allowReplace(s))) return false;
  s.view.webContents.reload();
  return true;
}
const codeURL = (p: Project) => "piccolo-code://p" + p.id + "/index.html";
async function configureSession(s: OpenProject) {
  const ses = s.view.webContents.session;
  if (await ses.protocol.isProtocolHandled("piccolo-code"))
    ses.protocol.unhandle("piccolo-code");
  ses.setPermissionCheckHandler(() => false);
  ses.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  ses.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  ses.on("will-download", (_event, item) => item.cancel());
  ses.protocol.handle("piccolo-code", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== "p" + s.project.id)
        return new Response("Forbidden", { status: 403 });
      const relative = decodeURIComponent(url.pathname).slice(1);
      let file: string;
      if (relative.startsWith("extensions/")) {
        const parts = relative.split("/"),
          id = parts[1],
          record = (s.checkedExtensions || []).find(
            (e) => e.id === id && e.enabled,
          );
        if (!s.trusted || !record)
          return new Response("Forbidden", { status: 403 });
        const root = path.resolve(
          profile(),
          "coding-extensions",
          record.directory,
        );
        file = path.resolve(root, parts.slice(2).join("/"));
        if (!file.startsWith(root + path.sep))
          return new Response("Forbidden", { status: 403 });
      } else {
        const root = path.join(__dirname, "code");
        file = path.resolve(root, relative || "index.html");
        if (!file.startsWith(root + path.sep))
          return new Response("Forbidden", { status: 403 });
      }
      const response = await net.fetch(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      let hashes = "";
      const workerEval =
        path.basename(file).includes("extensionHost.worker") ||
        path.basename(file).includes("webWorkerExtensionHostIframe")
          ? " 'unsafe-eval'"
          : "";
      if (file.endsWith(".html") && !relative.startsWith("extensions/")) {
        const html = await readFile(file, "utf8");
        hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
          .filter((m) => m[1].trim())
          .map(
            (m) =>
              "'sha256-" +
              createHash("sha256").update(m[1]).digest("base64") +
              "'",
          )
          .join(" ");
      }
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval' " +
          workerEval +
          " " +
          hashes +
          "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
      );
      headers.set("Cross-Origin-Resource-Policy", "same-origin");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
async function startView(b: Browser, project: Project) {
  await cleanupRetired(b);
  events.length = 0;
  const files = await WorkspaceFiles.create(project.root);
  const view = new WebContentsView({
    webPreferences: {
      partition: "persist:piccolo-code-" + project.id,
      preload: path.join(__dirname, "coding-preload.cjs"),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      additionalArguments: ["--piccolo-appearance=" + b.state.appearance],
    },
  });
  view.setBackgroundColor(
    b.state.appearance === "light" ? "#eef1f4" : "#101419",
  );
  const s: OpenProject = {
    b,
    project,
    files,
    view,
    trusted: false,
    terminalText: "",
    appearance: b.state.appearance,
    abort: new AbortController(),
  };
  current = s;
  await configureSession(s);
  view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  view.webContents.on("will-navigate", (event, url) => {
    if (url !== codeURL(project)) event.preventDefault();
  });
  view.webContents.on("render-process-gone", () => {
    void stopTerminal(s);
  });
  view.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = input.key.toLowerCase();
    if (input.control && !input.alt && key === "l") {
      event.preventDefault();
      b.win.webContents.focus();
      b.win.webContents.send("piccolo:focus");
    } else if (input.control && !input.shift && key === "t") {
      event.preventDefault();
      b.newTab();
      b.win.webContents.focus();
      b.win.webContents.send("piccolo:focus");
    } else if ((input.control && key === "r") || key === "f5") {
      event.preventDefault();
      void reload(s);
    }
  });
  b.win.contentView.addChildView(view);
  b.navigate("piccolo://workspaces");
  syncBounds(b);
  await view.webContents.loadURL(codeURL(project));
  notify(b);
  return { open: true, name: project.name };
}
export async function handleWorkspace(
  b: Browser,
  action: string,
  value?: string,
) {
  if (b.state.private)
    throw Error("Coding workspaces are available only in normal windows.");
  if (action === "status") {
    const recent = await b.store.get<Project[]>("coding-recent", []),
      clients = await b.store.get<any[]>("mcp-pairs", []),
      grants = await b.store.get<any[]>("coding-grants", []);
    return {
      open: !!current,
      name: current?.project.name,
      root: current?.project.root,
      trusted: !!current?.trusted,
      owner: current?.b.win.id,
      recent,
      clients: clients
        .filter((p) => !p.revoked)
        .map((p) => ({
          id: p.id,
          name: p.name,
          workspace:
            !!current &&
            grants.some(
              (g) => g.client === p.id && g.project === current!.project.id,
            ),
        })),
    };
  }
  if (action === "pick" || action === "reopen") {
    if (selecting) throw Error("A folder choice is already pending.");
    selecting = true;
    try {
      let root: string | undefined;
      const recent = await b.store.get<Project[]>("coding-recent", []);
      if (action === "pick") {
        const chosen = await dialog.showOpenDialog(b.win, {
          title: "Choose a coding project",
          properties: ["openDirectory"],
        });
        root = chosen.filePaths[0];
      } else root = recent.find((p) => p.id === value)?.root;
      if (!root) return { cancelled: true };
      root = await realpath(root);
      if (current && !(await closeWorkspace(current.b)))
        return { cancelled: true };
      const id = createHash("sha256")
          .update(root.toLowerCase())
          .digest("hex")
          .slice(0, 24),
        project = { id, root, name: path.basename(root) || root };
      await b.store.set(
        "coding-recent",
        [project, ...recent.filter((p) => p.id !== id)].slice(0, 8),
      );
      return startView(b, project);
    } finally {
      selecting = false;
    }
  }
  if (action === "close") {
    if (current && current.b !== b)
      throw Error("Close the workspace in its owning browser window.");
    return { closed: await closeWorkspace(b) };
  }
  const s = requireCurrent(b);
  if (action === "manage" || action === "show") {
    s.managing = action === "manage";
    if (b.active().url !== "piccolo://workspaces")
      b.newTab("piccolo://workspaces");
    b.state.workspaceRevision = (b.state.workspaceRevision || 0) + 1;
    b.emit();
    return { ok: true };
  }
  if (action === "trust") {
    const { response } = await dialog.showMessageBox(b.win, {
      type: "warning",
      message: s.trusted
        ? "Revoke trust for this project?"
        : "Trust " + s.project.name + "?",
      detail:
        "Trust allows explicitly installed web extensions to read/edit this project. Terminal commands still require starting a terminal explicitly and run with your user-account privileges. Piccolo does not run project scripts or install project dependencies when opening a folder.",
      buttons: ["Cancel", s.trusted ? "Revoke trust" : "Trust project"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1) return { trusted: s.trusted };
    if (!(await allowReplace(s))) return { cancelled: true };
    s.trusted = !s.trusted;
    if (!s.trusted) {
      await require.cache[path.join(__dirname,'agent.cjs')]?.exports.revokeAgent({project:s.project.id});
      s.abort.abort(Error("Workspace trust revoked."));
      s.abort = new AbortController();
      await stopTerminal(s);
    }
    s.view.webContents.reload();
    notify(b);
    return { trusted: s.trusted };
  }
  if (action === "reload") return { reloaded: await reload(s) };
  if (
    action === "grant-client" ||
    action === "revoke-client" ||
    action === "takeover"
  ) {
    const records = await b.store.get<any[]>("coding-grants", []);
    let next = records;
    if (action === "grant-client") {
      const clients = await b.store.get<any[]>("mcp-pairs", []);
      if (!clients.some((p) => p.id === value && !p.revoked))
        throw Error("Select a paired, non-revoked client.");
      const { response } = await dialog.showMessageBox(b.win, {
        type: "warning",
        message: "Allow this MCP client to work in " + s.project.name + "?",
        detail:
          "Separate workspace permission: read/edit ordinary project files, operate the editor and Git, open local previews and manage supported web extensions with installation approval. Sensitive paths remain blocked. Terminal input always requires separate native approval and runs with your Windows account privileges. Browser control alone does not grant this permission. Revoke here or choose Take over at any time.",
        buttons: ["Cancel", "Allow workspace"],
        defaultId: 0,
        cancelId: 0,
      });
      if (response !== 1) return { cancelled: true };
      next = [
        ...records.filter(
          (g) => !(g.client === value && g.project === s.project.id),
        ),
        { client: value, project: s.project.id },
      ];
    } else
      next = records.filter(
        (g) =>
          g.project !== s.project.id ||
          (action !== "takeover" && g.client !== value),
      );
    await b.store.set("coding-grants", next);
    if (action !== "grant-client") {
      if (action === "takeover") {
        await require.cache[path.join(__dirname,'agent.cjs')]?.exports.revokeAgent({project:s.project.id});
        if (terminalClients.size) await stopTerminal(s);
      } else if (value) revokeClient(value);
      for (const [client, controllers] of activeSignals)
        if (action === "takeover" || client === value)
          for (const control of controllers)
            control.abort(Error("Workspace automation revoked by user."));
    }
    notify(b);
    return { ok: true };
  }
  throw Error("Unknown workspace action.");
}
export async function hasWorkspaceGrant(b: Browser, client?: string) {
  if (!client || !current || current.b !== b || !current.trusted) return false;
  const grants = await b.store.get<any[]>("coding-grants", []);
  return grants.some(
    (g) => g.client === client && g.project === current!.project.id,
  );
}
export function revokeClient(client: string) {
  void require.cache[path.join(__dirname,'agent.cjs')]?.exports.revokeAgent({principal:client});
  for (const controller of activeSignals.get(client) || [])
    controller.abort(Error("Client permission revoked."));
  if (current && terminalClients.has(client)) {
    void stopTerminal(current);
    terminalClients.clear();
  }
}
export async function workspaceAccess<T>(
  b: Browser,
  client: string | undefined,
  signal: AbortSignal,
  fn: (signal: AbortSignal) => Promise<T>,
) {
  if (!(await hasWorkspaceGrant(b, client)))
    throw Error(
      "Separate workspace permission and project trust are required. Grant access in the Workspace panel.",
    );
  const s = requireCurrent(b),
    control = new AbortController(),
    set = activeSignals.get(client!) || new Set<AbortController>();
  if (
    [...activeSignals.values()].reduce((n, values) => n + values.size, 0) >= 4
  )
    throw Error(
      "Too many concurrent workspace requests. Wait for existing actions.",
    );
  activeSignals.set(client!, set);
  set.add(control);
  const combined = AbortSignal.any([signal, control.signal, s.abort.signal]);
  try {
    if (combined.aborted) throw Error("Workspace action cancelled.");
    const value = await clientScope.run(client!, () => fn(combined));
    events.push({
      time: Date.now(),
      status: "completed",
      client: client!.slice(0, 12),
    });
    return value;
  } catch (e) {
    events.push({
      time: Date.now(),
      status: combined.aborted ? "cancelled" : "failed",
      client: client!.slice(0, 12),
    });
    throw e;
  } finally {
    if (events.length > 100) events.splice(0, events.length - 100);
    set.delete(control);
    if (!set.size) activeSignals.delete(client!);
  }
}
async function git(
  s: OpenProject,
  operation: string,
  file?: string,
  message?: string,
  signal?: AbortSignal,
) {
  if (file) await s.files.resolve(file, true);
  const hooks = path.join(profile(), "coding-empty-hooks");
  await mkdir(hooks, { recursive: true });
  const base = [
    "--no-optional-locks",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.hooksPath=" + hooks,
    "-c",
    "commit.gpgSign=false",
    "-c",
    "core.pager=cat",
    "-c",
    "diff.external=",
  ];
  const run = (args: string[]) =>
    new Promise<string>((resolve, reject) => {
      if (signal?.aborted) return reject(Error("Git action cancelled."));
      const child = spawn("git", [...base, ...args], {
        cwd: s.project.root,
        env: childEnv(),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "",
        error = "";
      const abort = () => {
        void killTree(child.pid);
        child.kill();
      };
      signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk) => {
        out += chunk;
        if (out.length > 500_000) {
          abort();
          reject(Error("Git output exceeds 500 KB."));
        }
      });
      child.stderr.on("data", (chunk) => {
        error = (error + chunk).slice(-1000);
      });
      child.once("error", () =>
        reject(
          Error("Git is unavailable. Install Git and ensure it is on PATH."),
        ),
      );
      child.once("exit", (code) => {
        signal?.removeEventListener("abort", abort);
        if (signal?.aborted) reject(Error("Git action cancelled."));
        else if (code && !(args[0] === "config" && code === 1))
          reject(
            Error(
              error.replaceAll(s.project.root, "[project]") ||
                "Git command failed.",
            ),
          );
        else resolve(out);
      });
    });
  const top = await run(["rev-parse", "--show-toplevel"]);
  if (
    (await realpath(top.trim())).toLowerCase() !== s.project.root.toLowerCase()
  )
    throw Error(
      "Select the Git repository root to use Git. Parent repositories and redirected worktrees are outside this selected folder.",
    );
  if (clientScope.getStore() && operation === "commit")
    for (const staged of (await run(["diff", "--cached", "--name-only", "-z"]))
      .split("\0")
      .filter(Boolean))
      await s.files.resolve(staged, true);
  if (operation === "status") {
    const raw = await run([
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=normal",
      ]),
      records = raw.split("\0").filter(Boolean),
      entries = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i],
        status = record.slice(0, 2),
        p = record.slice(3);
      if (/[RC]/.test(status)) i++;
      if (!p.includes(".git/")) entries.push({ status, path: p });
    }
    return { entries };
  }
  let hasHead = true;
  if (operation === "diff" || operation === "unstage") {
    try {
      await run(["rev-parse", "--verify", "HEAD"]);
    } catch (error) {
      if (signal?.aborted) throw error;
      hasHead = false;
    }
  }
  if (operation === "diff")
    return {
      text: await run([
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        ...(hasHead ? ["HEAD"] : []),
        "--",
        file || ".",
      ]),
    };
  if (operation === "original") {
    if (!file) throw Error("A project-relative file is required.");
    return { text: await run(["show", "HEAD:./" + file]) };
  }
  if (!s.trusted) throw Error("Trust the project before changing Git state.");
  if (operation === "stage" || operation === "unstage") {
    if (!file) throw Error("Select one project-relative file.");
    const filters = await run([
      "config",
      "--get-regexp",
      "^filter\\..*\\.(clean|smudge|process|required)$",
    ]);
    for (const line of filters.split("\n")) {
      const key = line.split(/\s/)[0];
      if (key)
        base.push("-c", key + "=" + (key.endsWith(".required") ? "false" : ""));
    }
    await run(
      operation === "stage"
        ? ["add", "--", file]
        : hasHead
          ? ["reset", "HEAD", "--", file]
          : ["rm", "--cached", "--ignore-unmatch", "--", file],
    );
    return { ok: true };
  }
  if (operation === "commit") {
    if (!message?.trim()) throw Error("Enter a commit message.");
    await run(["commit", "--no-verify", "-m", message]);
    return { ok: true };
  }
  throw Error("Unsupported Git operation.");
}
async function startTerminal(s: OpenProject, signal?: AbortSignal) {
  const requestedOwner = clientScope.getStore();
  if (!s.trusted) throw Error("Trust the project before starting a terminal.");
    if (s.terminal) {
      if (clientScope.getStore() && terminalOwner !== clientScope.getStore()) throw Error('This terminal belongs to the user or another client.');
      return { running: true };
    }
  if (s.startingTerminal) throw Error("A terminal start is already pending.");
  s.startingTerminal = true;
  try {
    const { response } = await dialog.showMessageBox(s.b.win, {
      signal,
      type: "warning",
      message: "Start a terminal in " + s.project.name + "?",
      detail:
        "PowerShell runs as your Windows user. Commands can access files and start processes outside this project; the terminal is not an OS sandbox. No project startup script is run automatically.",
      buttons: ["Cancel", "Start terminal"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1 || signal?.aborted)
      throw Error("Terminal start cancelled.");
    if (current !== s) throw Error("Workspace changed.");
    const worker = utilityProcess.fork(
      path.join(__dirname, "coding-terminal.cjs"),
      [],
      {
        env: childEnv(),
        serviceName: "Piccolo coding terminal",
        stdio: "pipe",
      },
    );
    s.terminal = worker;
    let ready = false;
    const started = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.kill();
        reject(Error("Terminal startup timed out."));
      }, 5000);
      worker.on("message", (event: any) => {
        if (event.type === "started") {
          ready = true;
          clearTimeout(timer);
          resolve();
        }
        if (event.type === "error") {
          clearTimeout(timer);
          reject(Error(event.message));
        }
      });
      worker.once("exit", () => {
        clearTimeout(timer);
        if (!ready)
          reject(Error("The native terminal runtime could not start."));
      });
    });
    worker.on("message", (event: any) => {
      if (event.type === "started") s.shellPid = event.pid;
      if (event.type === "data") {
        if(s.terminal!==worker)return;
        s.terminalText = (s.terminalText + event.text).slice(-40000);
        send(s, { type: "terminal-data", text: event.text });
      }
      if (event.type === "exit" || event.type === "error") {
        if (s.terminal === worker) {
          s.terminal = undefined;
          s.shellPid = undefined;
        }
        send(s, event.type === "error" ? event : { type: "terminal-exit" });
      }
    });
    worker.on("exit", () => {
      if (s.terminal === worker) {
        s.terminal = undefined;
        s.shellPid = undefined;
      }
    });
    worker.once("spawn", () =>
      worker.postMessage({
        type: "start",
        cwd: s.project.root,
        env: childEnv(),
      }),
    );
    await started;
    if(signal?.aborted){await stopTerminal(s);throw Error('Terminal start canceled.');}
    terminalOwner = requestedOwner;
    return { running: true };
  } finally {
    s.startingTerminal = false;
  }
}
export async function requestWorkspace(
  b: Browser,
  raw: unknown,
  automation = false,
  signal?: AbortSignal,
) {
  const c = codingRequest.parse(raw),
    s = requireCurrent(b);
  signal = AbortSignal.any([s.abort.signal, ...(signal ? [signal] : [])]);
  if (signal?.aborted) throw Error("Workspace action cancelled.");
  if (c.action === "state") {
    s.checkedExtensions = await installedExtensions(b, true);
    return {
      name: s.project.name,
      id: s.project.id,
      trusted: s.trusted,
      appearance: b.state.appearance,
      extensions: s.checkedExtensions,
      terminalRunning: !!s.terminal,
      layout: await b.store.get("coding-layout-" + s.project.id, null),
    };
  }
  if(c.action==='agent'){b.newTab('piccolo://agents');return {opened:true};}
  if (["close", "reload", "trust", "manage"].includes(c.action))
    return handleWorkspace(b, c.action);
  if (c.action === "stat") return s.files.stat(c.path, automation);
  if (c.action === "list") return s.files.list(c.path, automation);
  if (c.action === "read") {
    const r = await s.files.read(c.path, automation);
    if (automation && r.data.length > 200_000)
      throw Error("Automation reads are limited to 150 KB.");
    return r;
  }
  if (c.action === "write") {
    if (automation && (await pendingChanges(s,true)).includes(c.path))
      throw Error(
        "The file has unsaved editor changes. User takeover is required.",
      );
    const result = await s.files.write(
      c.path,
      c.data,
      c.revision,
      automation,
      signal,
    );
    if (automation) send(s, { type: "files-changed", paths: [c.path] });
    return result;
  }
  if (
    automation &&
    (c.action === "rename" || c.action === "delete") &&
    (await pendingChanges(s,true)).some(
      (p) => p === c.path || p.startsWith(c.path + "/"),
    )
  )
    throw Error("The path has unsaved editor changes.");
  if (c.action === "mkdir") {
    await s.files.resolve(c.path, automation);
    return s.files.mkdir(c.path, signal);
  }
  if (c.action === "rename") {
    await s.files.resolve(c.path, automation);
    await s.files.resolve(c.to, automation);
    return s.files.rename(c.path, c.to, signal);
  }
  if (c.action === "delete") {
    const target = await s.files.resolve(c.path, automation);
    if (target === s.project.root)
      throw Error("Cannot delete the selected project root.");
    const { response } = await dialog.showMessageBox(b.win, {
      signal,
      type: "warning",
      message: "Move " + c.path + " to the Recycle Bin?",
      buttons: ["Cancel", "Move to Recycle Bin"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1 || signal.aborted) throw Error("Deletion cancelled.");
    await shell.trashItem(target);
    return { removed: true };
  }
  if (c.action === "search") return s.files.search(c.query, signal);
  if (
    c.action === "git" &&
    automation &&
    ["diff", "original", "stage", "unstage"].includes(c.operation)
  ) {
    if (!c.path) throw Error("Select one ordinary project file.");
    await s.files.resolve(c.path, true);
    try {
      if ((await s.files.stat(c.path, true)).type === 2)
        throw Error(
          "Select one regular file; recursive Git paths are unavailable to automation.",
        );
    } catch (e: any) {
      if (!String(e).includes("ENOENT")) throw e;
    }
  }
  if (c.action === "git") return git(s, c.operation, c.path, c.message, signal);
  if (c.action === "terminal-start") {
    const result = await startTerminal(s, signal);
    if (clientScope.getStore()) terminalClients.add(clientScope.getStore()!);
    return result;
  }
  if (c.action === "terminal-stop") {
    if (automation && s.terminal && terminalOwner !== clientScope.getStore()) throw Error('This terminal belongs to the user or another client.');
    await stopTerminal(s);
    return { stopped: true };
  }
  if (c.action === "terminal-resize") {
    s.terminal?.postMessage({ type: "resize", cols: c.cols, rows: c.rows });
    return { ok: true };
  }
  if (c.action === "terminal-input") {
    if (!automation && terminalOwner) throw Error('An MCP client owns this terminal. Choose Take over before entering commands.');
    if (automation && terminalOwner !== clientScope.getStore()) throw Error('This terminal belongs to the user or another client.');
    if (!s.trusted || !s.terminal)
      throw Error("Start an explicitly approved terminal first.");
    if (automation) {
      if (s.approvingInput)
        throw Error("A terminal input approval is already pending.");
      if (
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(
          c.data,
        )
      )
        throw Error(
          "Control sequences and bidirectional overrides are not accepted from MCP. Use Stop to cancel a terminal command.",
        );
      if (c.data.length > 1500)
        throw Error(
          "MCP terminal input is limited to 1500 characters so approval can show the complete input.",
        );
      s.approvingInput = true;
      try {
        const { response } = await dialog.showMessageBox(b.win, {
          signal,
          type: "warning",
          message: "Allow MCP terminal input?",
          detail:
            JSON.stringify(c.data) +
            "\nRuns with your user-account permissions. Repository text is not authorization.",
          buttons: ["Cancel", "Send to terminal"],
          defaultId: 0,
          cancelId: 0,
        });
        if (response !== 1 || signal?.aborted)
          throw Error("Terminal input cancelled.");
      } finally {
        s.approvingInput = false;
      }
    }
    if (!s.terminal || signal.aborted)
      throw Error("Terminal stopped or input cancelled.");
    if (clientScope.getStore()) terminalClients.add(clientScope.getStore()!);
    s.terminal.postMessage({ type: "input", text: c.data });
    return { sent: true };
  }
  if (c.action === "preview") {
    const url = new URL(c.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw Error("Use a loopback HTTP(S) development URL.");
    b.newTab(url.href);
    return { opened: true };
  }
  if (c.action === "extension-search") return searchExtensions(c.query, signal);
  if (c.action === "extension-list")
    return (await installedExtensions(b, true)).map((e) => ({
      id: e.id,
      version: e.version,
      enabled: e.enabled,
      source: e.source,
      license: e.license,
      error: e.error,
    }));
  if (!s.trusted)
    throw Error(
      "Trust this workspace before installing or enabling extensions.",
    );
  if (c.action === "extension-install")
    return installExtension(b, { id: c.id, version: c.version }, signal);
  if (c.action === "extension-vsix") {
    const { filePaths } = await dialog.showOpenDialog(b.win, {
      filters: [{ name: "VS Code extension", extensions: ["vsix"] }],
      properties: ["openFile"],
    });
    if (!filePaths[0]) return { cancelled: true };
    return installExtension(b, { vsix: filePaths[0] }, signal);
  }
  if (c.action === "extension-change") {
    if (!(await allowReplace(s))) throw Error("Extension change cancelled.");
    const result = await changeExtension(b, c.id, c.operation, signal);
    s.view.webContents.reload();
    return result;
  }
  throw Error("Unsupported workspace request.");
}
ipcMain.handle(
  "piccolo-code:request",
  async (event: IpcMainInvokeEvent, raw: unknown) => {
    const s = requireCurrent();
    if (
      event.sender !== s.view.webContents ||
      event.senderFrame !== event.sender.mainFrame ||
      event.senderFrame.url !== codeURL(s.project)
    )
      throw Error("Untrusted coding IPC sender.");
    return requestWorkspace(s.b, raw);
  },
);
export function terminalOutput(b: Browser) {
  if ((current?.terminal||current?.terminalText) && clientScope.getStore() && terminalOwner !== clientScope.getStore()) throw Error('This terminal belongs to the user or another client.');
  return { text: requireCurrent(b).terminalText, running: !!current?.terminal };
}
export function ownsWorkspace(b: Browser) {
  return !!current && current.b === b;
}
export function activity(b: Browser) {
  requireCurrent(b);
  return events;
}
export async function safeEditorState(b: Browser) {
  const s = requireCurrent(b);
  if(!(await s.view.webContents.executeJavaScript('Boolean(window.piccoloWorkbench?.ready)')))return {ready:false,dirty:[],documents:[],diagnostics:[],extensions:[]};
  const state = await invokeEditor(s, "inspect");
  state.ready=true;
  for (const key of ["dirty", "documents", "diagnostics"]) {
    const safe = [];
    for (const item of state[key]) {
      const file = typeof item === "string" ? item : item.path;
      try {
        await s.files.resolve(file, true);
        safe.push(item);
      } catch {}
    }
    state[key] = safe;
  }
  return state;
}
export async function assertInspectable(b: Browser) {
  const s = requireCurrent(b),
    state = await invokeEditor(s, "inspect");
  for (const document of state.documents)
    await s.files.resolve(document.path, true);
  for (const dirty of state.dirty) await s.files.resolve(dirty, true);
}
export async function capture(b: Browser) {
  const s = requireCurrent(b);
  const bytes = (await s.view.webContents.capturePage())
    .resize({ width: Math.min(1600, s.view.getBounds().width) })
    .toPNG();
  if (bytes.length > 4_000_000)
    throw Error("Workspace screenshot exceeds 4 MB.");
  return bytes;
}
