import "./style.css";
import {
  initialize,
  getService,
  ICommandService,
  IEditorService,
  IWorkingCopyService,
  IMarkerService,
  IExtensionService,
} from "@codingame/monaco-vscode-api";
import getWorkbench from "@codingame/monaco-vscode-workbench-service-override";
import getExtensions, {
  ExtensionHostKind,
} from "@codingame/monaco-vscode-extensions-service-override";
import { registerExtension } from "@codingame/monaco-vscode-api/extensions";
import "vscode/localExtensionHost";
import getConfiguration, {
  updateUserConfiguration,
} from "@codingame/monaco-vscode-configuration-service-override";
import { initUserConfiguration } from "@codingame/monaco-vscode-configuration-service-override/common";
import getStorage from "@codingame/monaco-vscode-storage-service-override";
import getTextmate from "@codingame/monaco-vscode-textmate-service-override";
import getTheme from "@codingame/monaco-vscode-theme-service-override";
import getLanguages from "@codingame/monaco-vscode-languages-service-override";
import getExplorer from "@codingame/monaco-vscode-explorer-service-override";
import getSearch from "@codingame/monaco-vscode-search-service-override";
import getMarkers from "@codingame/monaco-vscode-markers-service-override";
import getDialogs from "@codingame/monaco-vscode-dialogs-service-override";
import getWorkingCopy from "@codingame/monaco-vscode-working-copy-service-override";
import getModel from "@codingame/monaco-vscode-model-service-override";
import {
  registerFileSystemOverlay,
  registerCustomProvider,
  InMemoryFileSystemProvider,
  initFile,
  createIndexedDBProviders,
  FileSystemProviderCapabilities,
  FileSystemProviderError,
  FileSystemProviderErrorCode,
  FileChangeType,
} from "@codingame/monaco-vscode-files-service-override";
import {
  Emitter,
  Event,
} from "@codingame/monaco-vscode-api/vscode/vs/base/common/event";
import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import "@codingame/monaco-vscode-javascript-default-extension";
import "@codingame/monaco-vscode-typescript-basics-default-extension";
import "@codingame/monaco-vscode-json-default-extension";
import "@codingame/monaco-vscode-html-default-extension";
import "@codingame/monaco-vscode-css-default-extension";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import ExtensionWorker from "@codingame/monaco-vscode-api/workers/extensionHost.worker?worker";
import ExtensionWorkerURL from "@codingame/monaco-vscode-api/workers/extensionHost.worker?worker&url";
import EditorWorkerURL from "monaco-editor/esm/vs/editor/editor.worker?worker&url";
import TextmateWorkerURL from "@codingame/monaco-vscode-textmate-service-override/worker?worker&url";
import SearchWorkerURL from "@codingame/monaco-vscode-search-service-override/worker?worker&url";
import TextmateWorker from "@codingame/monaco-vscode-textmate-service-override/worker?worker";
import SearchWorker from "@codingame/monaco-vscode-search-service-override/worker?worker";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
const bridge = (window as any).piccoloCode;
const request = (data: any) => bridge.request(data);
const $ = (id: string) => document.getElementById(id)!;
$("project-controls").onclick = () =>
  void request({ action: "manage" }).catch(failure);
$("reload").onclick = () => void request({ action: "reload" }).catch(failure);
$("close").onclick = () => void request({ action: "close" }).catch(failure);
function failure(error: any) {
  $("failure").hidden = false;
  $("failure").textContent = String(error?.message || error).slice(0, 800);
}
addEventListener("unhandledrejection", (event) => failure(event.reason));
const state = await request({ action: "state" });
document.documentElement.dataset.theme = state.appearance;
$("project").textContent = "Piccolo / " + state.name;
$("trust").textContent = state.trusted
  ? "Trusted project"
  : "Restricted · extensions and terminal blocked";
(window as any).MonacoEnvironment = {
  getWorker: (_: unknown, label: string) =>
    label === "TextMateWorker"
      ? new TextmateWorker()
      : label === "extensionHostWorkerMain"
        ? new ExtensionWorker()
        : label === "LocalFileSearchWorker"
          ? new SearchWorker()
          : new EditorWorker(),
};
(window as any).MonacoEnvironment.getWorkerUrl = (_: unknown, label: string) =>
  (
    ({
      extensionHostWorkerMain: ExtensionWorkerURL,
      editorWorkerService: EditorWorkerURL,
      TextMateWorker: TextmateWorkerURL,
      LocalFileSearchWorker: SearchWorkerURL,
    }) as any
  )[label];
(window as any).MonacoEnvironment.getWorkerOptions = () => ({ type: "module" });
await createIndexedDBProviders();
registerCustomProvider("vscode", new InMemoryFileSystemProvider());
await initFile(
  URI.from({
    scheme: "vscode",
    authority: "schemas-associations",
    path: "/schemas-associations.json",
  }),
  "{}",
);
const nativeRequest = request;
const fileRequest = async (data: any) => {
  try {
    return await nativeRequest(data);
  } catch (e: any) {
    if (String(e).includes("ENOENT"))
      throw FileSystemProviderError.create(
        "File not found",
        FileSystemProviderErrorCode.FileNotFound,
      );
    throw e;
  }
};
const changes = new Emitter<any[]>(),
  versions = new Map<string, string>();
function relative(uri: any) {
  if (uri.path === "/project") return "";
  if (!uri.path.startsWith("/project/"))
    throw FileSystemProviderError.create(
      "Outside project",
      FileSystemProviderErrorCode.FileNotFound,
    );
  return uri.path.slice(9);
}
function writable(uri: any) {
  if (!uri.path.startsWith("/project/"))
    throw FileSystemProviderError.create(
      "Writes are confined to the selected project.",
      FileSystemProviderErrorCode.NoPermissions,
    );
  return relative(uri);
}
const provider = {
  capabilities: FileSystemProviderCapabilities.FileReadWrite,
  onDidChangeCapabilities: Event.None,
  onDidChangeFile: changes.event,
  watch: () => ({ dispose() {} }),
  stat: async (uri: any) =>
    fileRequest({ action: "stat", path: relative(uri) }),
  readdir: async (uri: any) =>
    fileRequest({ action: "list", path: relative(uri) }),
  readFile: async (uri: any) => {
    const r = await fileRequest({ action: "read", path: relative(uri) });
    versions.set(uri.path, r.revision);
    return Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
  },
  writeFile: async (uri: any, bytes: Uint8Array) => {
    writable(uri);
    if (!versions.has(uri.path)) {
      try {
        const disk = await fileRequest({ action: "read", path: relative(uri) });
        versions.set(uri.path, disk.revision);
      } catch (error) {
        if (
          !(error instanceof FileSystemProviderError) ||
          error.code !== FileSystemProviderErrorCode.FileNotFound
        )
          throw error;
      }
    }
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const r = await request({
      action: "write",
      path: relative(uri),
      data: btoa(binary),
      revision: versions.get(uri.path) ?? null,
    });
    versions.set(uri.path, r.revision);
    changes.fire([{ resource: uri, type: FileChangeType.UPDATED }]);
  },
  mkdir: async (uri: any) => {
    writable(uri);
    await request({ action: "mkdir", path: relative(uri) });
    changes.fire([{ resource: uri, type: FileChangeType.ADDED }]);
  },
  rename: async (from: any, to: any) => {
    writable(from);
    writable(to);
    await request({ action: "rename", path: relative(from), to: relative(to) });
    versions.delete(from.path);
    changes.fire([
      { resource: from, type: FileChangeType.DELETED },
      { resource: to, type: FileChangeType.ADDED },
    ]);
  },
  delete: async (uri: any) => {
    writable(uri);
    await request({ action: "delete", path: relative(uri) });
    versions.delete(uri.path);
    changes.fire([{ resource: uri, type: FileChangeType.DELETED }]);
  },
};
registerFileSystemOverlay(100, provider);
const configuration = {
  "telemetry.telemetryLevel": "off",
  "workbench.enableExperiments": false,
  "files.autoSave": "off",
  "workbench.startupEditor": "none",
  "extensions.autoUpdate": false,
  "editor.minimap.enabled": false,
  "window.autoDetectColorScheme": false,
  "workbench.colorTheme":
    state.appearance === "light" ? "Light Modern" : "Dark Modern",
  "json.schemaDownload.enable": false,
  "security.workspace.trust.enabled": true,
  "security.workspace.trust.startupPrompt": "never",
  "window.restoreWindows": "none",
};
await initUserConfiguration(JSON.stringify(configuration));
await initialize(
  {
    ...getWorkbench(),
    ...getExtensions({
      enableWorkerExtensionHost: state.trusted,
      iframeAlternateDomain: location.origin + "/",
    }),
    ...getConfiguration(),
    ...getStorage(),
    ...getTextmate(),
    ...getTheme(),
    ...getLanguages(),
    ...getExplorer(),
    ...getSearch(),
    ...getMarkers(),
    ...getDialogs(),
    ...getWorkingCopy(),
    ...getModel(),
  },
  $("workbench"),
  {
    workspaceProvider: {
      workspace: { folderUri: URI.file("/project") },
      trusted: state.trusted,
      open: async () => false,
    },
    enableWorkspaceTrust: true,
    productConfiguration: {
      nameShort: "Piccolo Code",
      nameLong: "Piccolo Code",
      version: "1.142.0",
      enableTelemetry: false,
    },
    defaultLayout: { views: [{ id: "workbench.explorer.fileView" }] },
  },
  { userHome: URI.file("/project") },
);
const own = registerExtension(
  {
    name: "piccolo-workbench",
    publisher: "piccolo",
    version: "0.6.0",
    engines: { vscode: "*" },
  },
  ExtensionHostKind.LocalProcess,
);
const api = await own.getApi();
await own.setAsDefaultApi();
api.commands.registerCommand("piccolo.git.status", () =>
  request({ action: "git", operation: "status" }),
);
const commands = await getService(ICommandService),
  workingCopies = await getService(IWorkingCopyService),
  markers = await getService(IMarkerService),
  extensionService = await getService(IExtensionService);
async function loadExtensions() {
  if (!state.trusted) return;
  await (
    await import("@codingame/monaco-vscode-json-language-features-default-extension")
  ).whenReady();
  for (const extension of state.extensions) {
    if (!extension.enabled) continue;
    try {
      const registered = registerExtension(
        extension.manifest,
        ExtensionHostKind.LocalWebWorker,
      );
      for (const file of extension.files)
        registered.registerFileUrl(
          file,
          location.origin +
            "/extensions/" +
            extension.id +
            "/" +
            file +
            "?v=" +
            extension.sha256,
        );
      await registered.whenReady();
    } catch (error) {
      failure("Extension " + extension.id + ": " + String(error));
    }
  }
}
await loadExtensions();
let terminal: Terminal | undefined,
  fit: FitAddon | undefined,
  resize: ResizeObserver | undefined;
let terminalElement: HTMLDivElement | undefined;
let currentPanel = "";
function panel(title: string) {
  if (title !== "Terminal · PowerShell") resize?.disconnect();
  currentPanel = title;
  $("panel").hidden = false;
  $("panel-tools").replaceChildren();
  $("panel-body").replaceChildren();
  const h = document.createElement("strong");
  h.textContent = title;
  $("panel-tools").append(h);
  button($("panel-tools"), "Hide panel", () => {
    $("panel").hidden = true;
  });
}
function button(parent: HTMLElement, label: string, click: () => unknown) {
  const e = document.createElement("button");
  e.textContent = label;
  e.addEventListener("click", () => {
    void Promise.resolve(click()).catch(failure);
  });
  parent.append(e);
  return e;
}
function text(parent: HTMLElement, value: string) {
  const e = document.createElement("pre");
  e.textContent = value;
  parent.append(e);
}
async function open(path: string) {
  const doc = await api.workspace.openTextDocument(
    URI.file("/project/" + path),
  );
  await api.window.showTextDocument(doc, { preview: false });
}
async function git() {
  panel("Git");
  const result = await request({ action: "git", operation: "status" });
  const tools = $("panel-tools");
  button(tools, "Refresh", git);
  const message = document.createElement("input");
  message.placeholder = "Commit message";
  message.setAttribute("aria-label", "Commit message");
  tools.append(message);
  button(tools, "Commit staged", async () => {
    await request({
      action: "git",
      operation: "commit",
      message: message.value,
    });
    await git();
  });
  for (const entry of result.entries) {
    const row = document.createElement("div");
    row.className = "code-row";
    const name = document.createElement("span");
    name.textContent = entry.status + " " + entry.path;
    row.append(name);
    button(row, "Diff", async () => {
      const diff = await request({
        action: "git",
        operation: "diff",
        path: entry.path,
      });
      text(
        $("panel-body"),
        diff.text || "No tracked diff. New files become tracked after staging.",
      );
    });
    button(row, "Stage", async () => {
      await request({ action: "git", operation: "stage", path: entry.path });
      await git();
    });
    button(row, "Unstage", async () => {
      await request({ action: "git", operation: "unstage", path: entry.path });
      await git();
    });
    $("panel-body").append(row);
  }
  if (!result.entries.length) text($("panel-body"), "Working tree clean.");
}
async function projectSearch() {
  panel("Project search");
  const input = document.createElement("input");
  input.setAttribute("aria-label", "Search project text");
  $("panel-tools").append(input);
  button($("panel-tools"), "Search", async () => {
    const r = await request({ action: "search", query: input.value });
    $("panel-body").replaceChildren();
    for (const hit of r.results)
      button(
        $("panel-body"),
        hit.path + ":" + hit.line + " · " + hit.text,
        () => open(hit.path),
      );
    if (!r.results.length) text($("panel-body"), "No matches.");
    if (r.truncated)
      text($("panel-body"), "Results limited to 200 matches / 5,000 files.");
  });
  input.focus();
}
async function extensions() {
  panel("Extensions · Open VSX / web extensions");
  const input = document.createElement("input");
  input.setAttribute("aria-label", "Search Open VSX");
  $("panel-tools").append(input);
  button($("panel-tools"), "Search", async () => {
    const r = await request({ action: "extension-search", query: input.value });
    $("panel-body").replaceChildren();
    for (const item of r) {
      const row = document.createElement("div");
      row.className = "code-row";
      const label = document.createElement("span");
      label.textContent = item.id + " " + item.version;
      const detail = document.createElement("small");
      detail.textContent = item.description || "";
      label.append(detail);
      row.append(label);
      button(row, "Review & install", async () => {
        await request({
          action: "extension-install",
          id: item.id,
          version: item.version,
        });
        await extensions();
      });
      $("panel-body").append(row);
    }
  });
  button($("panel-tools"), "Install VSIX…", async () => {
    await request({ action: "extension-vsix" });
    await extensions();
  });
  const installed = await request({ action: "extension-list" });
  for (const item of installed) {
    const row = document.createElement("div");
    row.className = "code-row";
    const label = document.createElement("span");
    label.textContent = item.id + " " + item.version;
    const detail = document.createElement("small");
    const host = extensionService.getExtensionsStatus()[item.id];
    detail.textContent =
      (item.enabled ? "Enabled" : "Disabled") +
      " · " +
      item.source +
      " · " +
      item.license +
      (item.error ? " · Blocked: " + item.error : "") +
      " · Web host" +
      (host?.activationTimes
        ? " · Active"
        : item.enabled
          ? " · Awaiting activation/reload"
          : "") +
      (host?.runtimeErrors?.length
        ? " · Activation error: " +
          host.runtimeErrors.map((e) => e.message).join("; ")
        : "");
    label.append(detail);
    row.append(label);
    for (const operation of [
      item.enabled ? "disable" : "enable",
      "update",
      "remove",
    ])
      button(row, operation, async () => {
        await request({ action: "extension-change", id: item.id, operation });
        await extensions();
      });
    $("panel-body").append(row);
  }
  text(
    $("panel-body"),
    "Browser/web extensions and declarative themes only. Desktop Node extensions, native modules and Microsoft-only services are unsupported. Changes require reopening the workspace and checking activation.",
  );
}
async function showTerminal() {
  if (!terminal) {
    await request({ action: "terminal-start" });
    terminal = new Terminal({
      fontSize: 13,
      scrollback: 2000,
      theme: {
        background: state.appearance === "light" ? "#f7f8fa" : "#101419",
        foreground: state.appearance === "light" ? "#252c36" : "#e4e7ed",
      },
    });
    fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.onData((data) => {
      void request({ action: "terminal-input", data }).catch(failure);
    });
    terminal.onResize(
      ({ cols, rows }) =>
        void request({ action: "terminal-resize", cols, rows }).catch(() => {}),
    );
  }
  panel("Terminal · PowerShell");
  const area = terminalElement || document.createElement("div");
  area.id = "terminal-area";
  $("panel-body").append(area);
  if (!terminalElement) {
    terminalElement = area;
    terminal.open(area);
  }
  resize?.disconnect();
  resize = new ResizeObserver(() => fit?.fit());
  resize.observe(area);
  fit?.fit();
  terminal.focus();
  button($("panel-tools"), "Stop terminal", async () => {
    await request({ action: "terminal-stop" });
    terminal?.dispose();
    terminal = undefined;
    terminalElement = undefined;
    resize?.disconnect();
    panel("Terminal stopped");
  });
}
async function preview() {
  panel("Local development preview");
  const input = document.createElement("input");
  input.value = "http://127.0.0.1:3000";
  input.setAttribute("aria-label", "Local preview URL");
  $("panel-tools").append(input);
  button($("panel-tools"), "Open browser tab", () =>
    request({ action: "preview", url: input.value }),
  );
  text(
    $("panel-body"),
    "Start your development server explicitly in Terminal, then open its loopback URL. Preview pages have ordinary website isolation.",
  );
}
for (const [id, fn] of Object.entries({
  files: () => commands.executeCommand("workbench.view.explorer"),
  search: projectSearch,
  save: () => commands.executeCommand("workbench.action.files.saveAll"),
  git,
  extensions,
  terminal: showTerminal,
  preview,
  palette: () => commands.executeCommand("workbench.action.showCommands"),
  close: () => request({ action: "close" } as any),
}))
  $(id).onclick = () => void Promise.resolve(fn()).catch(failure);
bridge.subscribe(async (event: any) => {
  if (event.type === "terminal-data") terminal?.write(event.text);
  if (event.type === "terminal-exit")
    terminal?.write("\r\n[Terminal exited]\r\n");
  if (event.type === "theme") {
    state.appearance = event.appearance;
    document.documentElement.dataset.theme = event.appearance;
    if (terminal)
      terminal.options.theme = {
        background: event.appearance === "light" ? "#f7f8fa" : "#101419",
        foreground: event.appearance === "light" ? "#252c36" : "#e4e7ed",
      };
    configuration["workbench.colorTheme"] =
      event.appearance === "light" ? "Light Modern" : "Dark Modern";
    await updateUserConfiguration(JSON.stringify(configuration));
  }
  if (event.type === "files-changed")
    changes.fire(
      event.paths.map((p: string) => ({
        resource: URI.file("/project/" + p),
        type: FileChangeType.UPDATED,
      })),
    );
});
(window as any).piccoloWorkbench = {
  ready: true,
  inspect: () => ({
    dirty: workingCopies.dirtyWorkingCopies
      .filter(
        (c: any) =>
          c.resource.path.startsWith("/project/") ||
          c.resource.scheme === "untitled",
      )
      .map((c: any) =>
        c.resource.path.startsWith("/project/")
          ? relative(c.resource)
          : "untitled:" + c.resource.path,
      ),
    documents: api.workspace.textDocuments
      .filter((d) => d.uri.path.startsWith("/project/"))
      .map((d) => ({
        path: relative(d.uri),
        dirty: d.isDirty,
        version: d.version,
      })),
    diagnostics: markers
      .read({ take: 100 })
      .filter((d: any) => d.resource.path.startsWith("/project/"))
      .map((d: any) => ({
        path: relative(d.resource),
        message: d.message,
        line: d.startLineNumber,
        severity: d.severity,
      })),
    extensions: extensionService.extensions.map((e) => ({
      id: e.identifier.value,
      active:
        !!extensionService.getExtensionsStatus()[e.identifier.value]
          ?.activationTimes,
      hostKind:
        extensionService.getExtensionsStatus()[e.identifier.value]
          ?.runningLocation?.kind,
      errors: extensionService
        .getExtensionsStatus()
        [e.identifier.value]?.runtimeErrors.map((error) => error.message),
    })),
    workerHost: state.trusted,
  }),
  open,
  save: async () => {
    await commands.executeCommand("workbench.action.files.saveAll");
    if (
      workingCopies.dirtyWorkingCopies.some(
        (c) =>
          c.resource.path.startsWith("/project/") ||
          c.resource.scheme === "untitled",
      )
    )
      throw Error(
        "Some files could not be saved. Reload or compare changed files.",
      );
  },
  edit: async (path: string, text: string, version: number) => {
    const document = await api.workspace.openTextDocument(
      URI.file("/project/" + path),
    );
    if (document.version !== version) throw Error("Editor version changed.");
    const edit = new api.WorkspaceEdit();
    edit.replace(
      document.uri,
      new api.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
      ),
      text,
    );
    return api.workspace.applyEdit(edit);
  },
  readEditor: async (path: string) => {
    const doc = await api.workspace.openTextDocument(
      URI.file("/project/" + path),
    );
    return {
      text: doc.getText(),
      version: doc.version,
      dirty: doc.isDirty,
      language: doc.languageId,
    };
  },
  command: async (action: string) => {
    if (action === "format")
      await extensionService.activateByEvent(
        "onLanguage:" + api.window.activeTextEditor?.document.languageId,
      );
    return commands.executeCommand(
      (
        {
          palette: "workbench.action.showCommands",
          find: "actions.find",
          replace: "editor.action.startFindReplaceAction",
          format: "editor.action.formatDocument",
        } as any
      )[action],
    );
  },
  extensions,
  git,
  search: projectSearch,
  terminal: showTerminal,
  snapshot: () => ({
    groups: api.window.tabGroups.all.map((group, index) => ({
      column: index + 1,
      files: group.tabs
        .map((tab) => (tab.input as any)?.uri?.path)
        .filter((p) => typeof p === "string" && p.startsWith("/project/"))
        .map((p) => p.slice(9)),
    })),
    active: api.window.activeTextEditor?.document.uri.path.startsWith(
      "/project/",
    )
      ? relative(api.window.activeTextEditor.document.uri)
      : undefined,
    panel: currentPanel,
  }),
};
if (state.layout?.groups) {
  for (const group of state.layout.groups.slice(0, 4))
    for (const file of group.files.slice(0, 20)) {
      try {
        const doc = await api.workspace.openTextDocument(
          URI.file("/project/" + file),
        );
        await api.window.showTextDocument(doc, {
          preview: false,
          viewColumn: group.column,
        });
      } catch {}
    }
  if (state.layout.active)
    try {
      await open(state.layout.active);
    } catch {}
}
addEventListener("unload", () => {
  resize?.disconnect();
  terminal?.dispose();
  changes.dispose();
});
