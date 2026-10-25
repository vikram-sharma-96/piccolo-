import { _electron as electron } from "playwright";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { zipSync, strToU8 } from "fflate";
import path from "node:path";
import assert from "node:assert/strict";
const profile = path.resolve("test-results/coding-" + Date.now()),
  project = path.join(profile, "project");
await mkdir(path.join(project, ".vscode"), { recursive: true });
await writeFile(path.join(project, "hello.js"), "export const answer = 42;\n");
await writeFile(path.join(project, "data.json"), '{"answer":42}');
await writeFile(path.join(project, "example.pcheck"), "hello fixture");
await writeFile(path.join(project, ".env"), "SECRET_FIXTURE_ONLY");
await writeFile(
  path.join(project, "preview.cjs"),
  `const http=require('node:http'),fs=require('node:fs');const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<title>Piccolo coding fixture</title><h1>'+fs.readFileSync('hello.js','utf8')+'</h1>')});server.listen(0,'127.0.0.1',()=>fs.writeFileSync('preview-port.txt',String(server.address().port)));`,
);
await writeFile(
  path.join(project, "package.json"),
  JSON.stringify({
    name: "piccolo-workflow-fixture",
    version: "1.0.0",
    scripts: {
      preinstall:
        "node -e \"require('fs').writeFileSync('unwanted-install.txt','bad')\"",
    },
  }),
);
await writeFile(
  path.join(project, ".vscode/tasks.json"),
  JSON.stringify({
    version: "2.0.0",
    tasks: [
      {
        label: "never automatic",
        type: "shell",
        command:
          "node -e \"require('fs').writeFileSync('unwanted-task.txt','bad')\"",
        runOptions: { runOn: "folderOpen" },
      },
    ],
  }),
);
await writeFile(
  path.join(project, ".vscode/settings.json"),
  JSON.stringify({
    "task.allowAutomaticTasks": "on",
    "security.workspace.trust.enabled": false,
  }),
);
execFileSync("git", ["init"], { cwd: project, stdio: "ignore" });
execFileSync("git", ["config", "user.name", "Piccolo fixture"], {
  cwd: project,
});
execFileSync("git", ["config", "user.email", "fixture@example.invalid"], {
  cwd: project,
});
execFileSync(
  "git",
  [
    "add",
    "hello.js",
    "data.json",
    "example.pcheck",
    "preview.cjs",
    "package.json",
    ".vscode",
  ],
  { cwd: project },
);
execFileSync("git", ["commit", "-m", "Initial fixture"], {
  cwd: project,
  stdio: "ignore",
});
await mkdir(path.join(project, ".git/hooks"), { recursive: true });
await writeFile(
  path.join(project, ".git/hooks/pre-commit"),
  "#!/bin/sh\ntouch hook-ran.txt\n",
  { mode: 0o755 },
);
const fixtureVSIX = path.join(profile, "fixture.vsix"),
  badVSIX = path.join(profile, "unsafe.vsix"),
  nodeVSIX = path.join(profile, "node-only.vsix");
const manifest = {
  publisher: "piccolo-fixture",
  name: "browser-tools",
  version: "1.0.0",
  engines: { vscode: "^1.100.0" },
  license: "MIT",
  browser: "extension.js",
  activationEvents: ["onStartupFinished"],
  contributes: {
    languages: [{ id: "piccolo-check", extensions: [".pcheck"] }],
    commands: [
      { command: "piccolo.fixture.git", title: "Piccolo fixture Git utility" },
    ],
  },
};
const extension = `const vscode=require('vscode');exports.activate=async function(context){let denied=false;try{require('fs')}catch{denied=true}const root=vscode.workspace.workspaceFolders[0].uri;const status=await vscode.commands.executeCommand('piccolo.git.status');context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider('piccolo-check',{provideDocumentFormattingEdits(doc){return [vscode.TextEdit.replace(new vscode.Range(doc.positionAt(0),doc.positionAt(doc.getText().length)),doc.getText().trim().toUpperCase()+'\\n')]}}));const diagnostics=vscode.languages.createDiagnosticCollection('piccolo-fixture');function check(doc){if(doc.languageId==='piccolo-check'&&doc.getText().includes('BROKEN'))diagnostics.set(doc.uri,[new vscode.Diagnostic(new vscode.Range(0,0,0,6),'Fixture diagnostic from a real worker host',vscode.DiagnosticSeverity.Error)]);else diagnostics.delete(doc.uri)}context.subscriptions.push(diagnostics,vscode.workspace.onDidOpenTextDocument(check),vscode.workspace.onDidChangeTextDocument(e=>check(e.document)));for(const doc of vscode.workspace.textDocuments)check(doc);context.subscriptions.push(vscode.commands.registerCommand('piccolo.fixture.git',()=>vscode.commands.executeCommand('piccolo.git.status')));await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root,'worker-proof.txt'),new TextEncoder().encode(JSON.stringify({worker:typeof document==='undefined',nativeBridge:typeof globalThis.piccoloCode,nodeRequireDenied:denied,gitStatus:!!status.entries,version:'1.0.0'})));};exports.deactivate=function(){};`;
await writeFile(
  fixtureVSIX,
  zipSync({
    "extension/package.json": strToU8(JSON.stringify(manifest)),
    "extension/extension.js": strToU8(extension),
    "extension/LICENSE": strToU8("MIT — Piccolo authored conformance fixture"),
  }),
);
await writeFile(
  badVSIX,
  zipSync({
    "extension/../../escape.txt": strToU8("unsafe archive fixture"),
    "extension/package.json": strToU8(JSON.stringify(manifest)),
  }),
);
await writeFile(
  nodeVSIX,
  zipSync({
    "extension/package.json": strToU8(
      JSON.stringify({
        ...manifest,
        name: "desktop-only",
        browser: undefined,
        main: "extension.js",
      }),
    ),
    "extension/extension.js": strToU8('throw Error("Must never run")'),
  }),
);
let app, page, code, client, other;
const results = [],
  measurements = [],
  errors = [],
  requests = new Set();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cmd = (c) => page.evaluate((c) => window.piccolo.command(c), c);
async function launch() {
  const env = { ...process.env, PICCOLO_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    ...(process.env.PICCOLO_EXE
      ? { executablePath: process.env.PICCOLO_EXE, args: [] }
      : { args: ["."] }),
    env,
  });
  app.context().on("page", (p) => {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("request", (r) => requests.add(r.url()));
  });
  page = await app.firstWindow();
  await page.waitForFunction(() => !!window.piccolo);
  await page.locator(".content").waitFor();
}
async function dialogs(response = 1, file = project) {
  await app.evaluate(
    ({ dialog }, { response, file }) => {
      dialog.showMessageBox = async () => ({
        response,
        checkboxChecked: false,
      });
      dialog.showOpenDialog = async () => ({
        filePaths: [file],
        canceled: false,
      });
    },
    { response, file },
  );
}
async function connect(name) {
  const c = new Client({ name, version: "1" }),
    exe = process.env.PICCOLO_EXE || process.execPath,
    entry = process.env.PICCOLO_EXE
      ? path.join(
          path.dirname(exe),
          "resources/app.asar/dist/mcp-stdio-entry.cjs",
        )
      : path.resolve("dist/mcp-stdio-entry.cjs");
  await c.connect(
    new StdioClientTransport({
      command: exe,
      args: [entry, "--client=" + name],
      env: {
        PICCOLO_PROFILE: profile,
        ...(process.env.PICCOLO_EXE ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
      },
      stderr: "pipe",
    }),
    { timeout: 40000 },
  );
  return c;
}
async function call(name, args = {}, c = client) {
  const r = await c.callTool({ name, arguments: args }, { timeout: 40000 });
  if (r.isError) throw Error(JSON.stringify(r.content));
  const t = r.content.find((c) => c.type === "text");
  return t ? JSON.parse(t.text) : r;
}
async function check(name, fn) {
  await fn();
  results.push({ name, status: "Passed" });
  console.log("PASS " + name);
}
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await wait(100);
  }
  throw Error("Condition timed out");
}
async function getCode() {
  code = await until(() =>
    app
      .context()
      .pages()
      .find((p) => p.url().startsWith("piccolo-code:")),
  );
  await code.waitForFunction(() => window.piccoloWorkbench?.ready, undefined, {
    timeout: 45000,
  });
}
async function grant() {
  const id = await app.evaluate(async () => {
    const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0];
    return (await b.store.get("mcp-pairs", [])).find(
      (p) => p.name === "coding-audit",
    ).id;
  });
  await dialogs();
  await cmd({ type: "workspace", action: "grant-client", value: id });
}
async function screenshot(name) {
  const r = await call("workspace_editor", { action: "screenshot" });
  await writeFile(
    path.join(profile, name + ".png"),
    Buffer.from(r.content.find((c) => c.type === "image").data, "base64"),
  );
}
async function measure(name) {
  await wait(2000);
  const samples = [];
  for (let i = 0; i < 3; i++) {
    await wait(1000);
    const metrics = await app.evaluate(({ app }) => app.getAppMetrics());
    const rootPid = app.process().pid;
    const subtree = JSON.parse(
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `$all=Get-CimInstance Win32_Process; $owned=@(${rootPid}); do { $next=@($all | Where-Object { $_.ParentProcessId -in $owned -and $_.ProcessId -notin $owned } | ForEach-Object { [int]$_.ProcessId }); $owned += $next } while ($next.Count); @($owned | ForEach-Object { $p=Get-Process -Id $_ -ErrorAction SilentlyContinue; if($p){[pscustomobject]@{pid=$p.Id;name=$p.ProcessName;workingSetBytes=$p.WorkingSet64;cpuMilliseconds=$p.TotalProcessorTime.TotalMilliseconds}} }) | ConvertTo-Json -Compress`,
        ],
        { encoding: "utf8" },
      ),
    );
    samples.push({
      time: Date.now(),
      workingSetKiB: metrics.reduce((n, p) => n + p.memory.workingSetSize, 0),
      cpuPercent: metrics.reduce((n, p) => n + p.cpu.percentCPUUsage, 0),
      electronProcesses: metrics.length,
      subtree,
    });
  }
  measurements.push({ name, samples });
}
try {
  await launch();
  await measure("fresh ordinary browser");
  await check(
    "Ordinary browsing starts no workbench, native terminal or coding service",
    async () => {
      const state = await app.evaluate(({ webContents }) => ({
        code: webContents
          .getAllWebContents()
          .filter((w) => w.getURL().startsWith("piccolo-code:")).length,
        loaded: Object.keys(
          process
            .getBuiltinModule("module")
            .createRequire(
              process
                .getBuiltinModule("path")
                .join(process.cwd(), "package.json"),
            ).cache,
        ).some((p) => p.endsWith("coding.cjs")),
      }));
      assert.equal(state.code, 0);
      assert.equal(state.loaded, false);
    },
  );
  await dialogs(1);
  await cmd({ type: "optional", service: "mcp", action: "server-start" });
  await dialogs(2);
  client = await connect("coding-audit");
  other = await connect("browser-only");
  await dialogs(1);
  await check(
    "Browser grants do not grant project files, terminal or workspace UI data",
    async () => {
      assert.equal((await call("workspace_state")).available, false);
      await assert.rejects(
        call("workspace_files", { action: "list" }),
        /Separate workspace/,
      );
      await cmd({ type: "workspace", action: "pick" });
      await getCode();
      assert.equal(
        (await code.evaluate(() => window.piccoloWorkbench.inspect()))
          .workerHost,
        false,
      );
      await assert.rejects(
        call("workspace_files", { action: "list" }),
        /Separate workspace/,
      );
      await assert.rejects(
        call("piccolo_ui", { action: "read" }),
        /Separate workspace/,
      );
    },
  );
  await check(
    "Selected project opens restricted; scripts, package lifecycle and terminal never run automatically",
    async () => {
      await wait(600);
      await assert.rejects(access(path.join(project, "unwanted-task.txt")));
      await assert.rejects(access(path.join(project, "unwanted-install.txt")));
      assert.equal(
        (
          await code.evaluate(() =>
            window.piccoloCode.request({ action: "state" }),
          )
        ).terminalRunning,
        false,
      );
      await assert.rejects(
        code.evaluate(() =>
          window.piccoloCode.request({ action: "terminal-start" }),
        ),
        /Trust/,
      );
    },
  );
  await cmd({ type: "workspace", action: "trust" });
  await getCode();
  await grant();
  await check(
    "Separately granted client can inspect selected project; other paired client stays blocked",
    async () => {
      const s = await call("workspace_state");
      assert.equal(s.trusted, true);
      assert.equal(s.name, "project");
      const files = await call("workspace_files", { action: "list" });
      assert.ok(files.some(([name]) => name === "hello.js"));
      assert.ok(!files.some(([name]) => name === ".env"));
      await assert.rejects(
        call("workspace_files", { action: "read", path: ".env" }),
        /Sensitive/,
      );
      await assert.rejects(
        call("workspace_files", { action: "read", path: "../outside.txt" }),
        /Invalid/,
      );
      await assert.rejects(
        call("workspace_files", { action: "list" }, other),
        /Separate workspace/,
      );
    },
  );
  await check(
    "Real editor open/edit/save with dirty state, buffer versions and disk-conflict protection",
    async () => {
      await call("workspace_editor", { action: "open", path: "hello.js" });
      const doc = await call("workspace_editor", {
        action: "read",
        path: "hello.js",
      });
      assert.equal(doc.language, "javascript");
      await call("workspace_editor", {
        action: "edit",
        path: "hello.js",
        version: doc.version,
        text: "export const answer = 43;\n",
      });
      assert.ok(
        (await call("workspace_editor", { action: "inspect" })).dirty.includes(
          "hello.js",
        ),
      );
      await assert.rejects(
        call("workspace_editor", {
          action: "edit",
          path: "hello.js",
          version: doc.version,
          text: "stale edit",
        }),
        /version changed/,
      );
      const disk = await call("workspace_files", {
        action: "read",
        path: "hello.js",
      });
      await assert.rejects(
        call("workspace_files", {
          action: "write",
          path: "hello.js",
          revision: disk.revision,
          text: "overwrite dirty buffer",
        }),
        /unsaved/,
      );
      await call("workspace_editor", { action: "save" });
      assert.equal(
        await readFile(path.join(project, "hello.js"), "utf8"),
        "export const answer = 43;\n",
      );
      assert.deepEqual(
        (await call("workspace_editor", { action: "inspect" })).dirty,
        [],
      );
    },
  );
  await check(
    "Create, mkdir, move, delete and project search use real authorized filesystem operations",
    async () => {
      await call("workspace_files", { action: "mkdir", path: "src" });
      await call("workspace_files", {
        action: "write",
        path: "new.txt",
        revision: null,
        text: "searchable project fixture",
      });
      await call("workspace_files", {
        action: "rename",
        path: "new.txt",
        to: "src/moved.txt",
      });
      assert.equal(
        await readFile(path.join(project, "src/moved.txt"), "utf8"),
        "searchable project fixture",
      );
      assert.ok(
        (
          await call("workspace_files", {
            action: "search",
            query: "searchable",
          })
        ).results.some((r) => r.path === "src/moved.txt"),
      );
      await call("workspace_files", {
        action: "delete",
        path: "src/moved.txt",
      });
      await assert.rejects(access(path.join(project, "src/moved.txt")));
    },
  );
  await check(
    "Git diff, staging and commit operate on selected repository without running its hook",
    async () => {
      const diff = await call("workspace_git", {
        operation: "diff",
        path: "hello.js",
      });
      assert.ok(diff.text.includes("+export const answer = 43;"));
      await assert.rejects(
        call("workspace_git", { operation: "diff" }),
        /Select one/,
      );
      await call("workspace_git", { operation: "stage", path: "hello.js" });
      await call("workspace_git", {
        operation: "commit",
        message: "Verified Piccolo edit",
      });
      assert.equal(
        execFileSync("git", ["log", "-1", "--format=%s"], {
          cwd: project,
          encoding: "utf8",
        }).trim(),
        "Verified Piccolo edit",
      );
      await assert.rejects(access(path.join(project, "hook-ran.txt")));
    },
  );
  await check(
    "Built-in JSON web extension activates and formats actual saved JSON",
    async () => {
      await call("workspace_editor", { action: "open", path: "data.json" });
      await call("workspace_editor", { action: "format" });
      await until(
        async () =>
          (
            await call("workspace_editor", {
              action: "read",
              path: "data.json",
            })
          ).dirty,
      );
      await call("workspace_editor", { action: "save" });
      assert.ok(
        (await readFile(path.join(project, "data.json"), "utf8")).includes(
          "\n",
        ),
      );
      const status = (
        await call("workspace_editor", { action: "inspect" })
      ).extensions.find((e) => e.id === "vscode.json-language-features");
      assert.equal(status.active, true);
      assert.equal(status.hostKind, 2);
    },
  );
  await check(
    "Unsafe VSIX traversal and desktop-only extension packages are rejected",
    async () => {
      await dialogs(1, badVSIX);
      await assert.rejects(
        call("workspace_extensions", { action: "vsix" }),
        /Unsafe|invalid relative|path/,
      );
      await dialogs(1, nodeVSIX);
      await assert.rejects(
        call("workspace_extensions", { action: "vsix" }),
        /desktop Node extension host/,
      );
      await assert.rejects(access(path.join(profile, "escape.txt")));
    },
  );
  await check(
    "User VSIX installs and activates in a real isolated worker with project FS, language, formatter and Git APIs",
    async () => {
      await dialogs(1, fixtureVSIX);
      const installed = await call("workspace_extensions", { action: "vsix" });
      assert.equal(installed.id, "piccolo-fixture.browser-tools");
      await cmd({ type: "workspace", action: "reload" });
      await getCode();
      const proof = await until(async () =>
        JSON.parse(
          await readFile(path.join(project, "worker-proof.txt"), "utf8"),
        ),
      );
      assert.deepEqual(proof, {
        worker: true,
        nativeBridge: "undefined",
        nodeRequireDenied: true,
        gitStatus: true,
        version: "1.0.0",
      });
      await call("workspace_editor", {
        action: "open",
        path: "example.pcheck",
      });
      await call("workspace_editor", { action: "format" });
      await call("workspace_editor", { action: "save" });
      assert.equal(
        (
          await readFile(path.join(project, "example.pcheck"), "utf8")
        ).replaceAll("\r\n", "\n"),
        "HELLO FIXTURE\n",
      );
      let doc = await call("workspace_editor", {
        action: "read",
        path: "example.pcheck",
      });
      await call("workspace_editor", {
        action: "edit",
        path: "example.pcheck",
        version: doc.version,
        text: "BROKEN",
      });
      await until(async () =>
        (
          await call("workspace_editor", { action: "inspect" })
        ).diagnostics.some((d) => d.path === "example.pcheck"),
      );
      await call("workspace_editor", { action: "save" });
      const extension = (
        await call("workspace_editor", { action: "inspect" })
      ).extensions.find((e) => e.id === "piccolo-fixture.browser-tools");
      assert.equal(extension.hostKind, 2);
      assert.equal(extension.active, true);
    },
  );
  await check(
    "Open VSX discovery and genuine third-party declarative theme installation",
    async () => {
      const found = await call("workspace_extensions", {
        action: "search",
        query: "onedark",
      });
      assert.ok(found.length);
      await dialogs(1);
      await call("workspace_extensions", {
        action: "install",
        id: "akamud.vscode-theme-onedark",
        version: "2.3.0",
      });
      await cmd({ type: "workspace", action: "reload" });
      await getCode();
      assert.ok(
        (await call("workspace_extensions", { action: "list" })).some(
          (e) =>
            e.id === "akamud.vscode-theme-onedark" && e.source === "Open VSX",
        ),
      );
    },
  );
  await check(
    "Extension update activates the newer VSIX and registry update reports current version",
    async () => {
      const newer = path.join(profile, "fixture-update.vsix");
      await writeFile(
        newer,
        zipSync({
          "extension/package.json": strToU8(
            JSON.stringify({ ...manifest, version: "1.1.0" }),
          ),
          "extension/extension.js": strToU8(
            extension.replace("version:'1.0.0'", "version:'1.1.0'"),
          ),
          "extension/LICENSE": strToU8(
            "MIT — Piccolo authored conformance fixture",
          ),
        }),
      );
      await dialogs(1, newer);
      await code.evaluate(() =>
        window.piccoloCode.request({ action: "extension-vsix" }),
      );
      await cmd({ type: "workspace", action: "reload" });
      await getCode();
      await until(
        async () =>
          JSON.parse(
            await readFile(path.join(project, "worker-proof.txt"), "utf8"),
          ).version === "1.1.0",
      );
      const update = await call("workspace_extensions", {
        action: "update",
        id: "akamud.vscode-theme-onedark",
      });
      assert.equal(update.upToDate, true);
      await getCode();
      await dialogs(1);
    },
  );
  await check(
    "Extension disable, enable, removal and native host reload take real effect",
    async () => {
      await call("workspace_extensions", {
        action: "disable",
        id: "piccolo-fixture.browser-tools",
      });
      await getCode();
      assert.ok(
        !(
          await call("workspace_editor", { action: "inspect" })
        ).extensions.some((e) => e.id === "piccolo-fixture.browser-tools"),
      );
      const extensionFile = await app.evaluate(async ({ app }) => {
        const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0];
        const record = (await b.store.get("coding-extensions", [])).find(
          (e) => e.id === "piccolo-fixture.browser-tools",
        );
        return process
          .getBuiltinModule("path")
          .join(
            app.getPath("userData"),
            "coding-extensions",
            record.directory,
            "extension.js",
          );
      });
      const original = await readFile(extensionFile, "utf8");
      await writeFile(extensionFile, original + "\n// Harmless tamper fixture");
      await assert.rejects(
        call("workspace_extensions", {
          action: "enable",
          id: "piccolo-fixture.browser-tools",
        }),
        /changed/,
      );
      await writeFile(extensionFile, original);
      await call("workspace_extensions", {
        action: "enable",
        id: "piccolo-fixture.browser-tools",
      });
      await getCode();
      await until(async () =>
        (await call("workspace_editor", { action: "inspect" })).extensions.some(
          (e) => e.id === "piccolo-fixture.browser-tools" && e.active,
        ),
      );
      await call("workspace_extensions", {
        action: "remove",
        id: "piccolo-fixture.browser-tools",
      });
      await getCode();
      assert.ok(
        !(await call("workspace_extensions", { action: "list" })).some(
          (e) => e.id === "piccolo-fixture.browser-tools",
        ),
      );
    },
  );
  for (const mode of ["light", "dark", "system"])
    await check(
      mode + " browser/workbench theme, palette and keyboard navigation",
      async () => {
        await call("piccolo_settings", {
          action: "update",
          settings: { theme: mode },
        });
        const desired = (await page.evaluate(() => window.piccolo.state()))
          .appearance;
        await code.waitForFunction(
          (desired) => document.documentElement.dataset.theme === desired,
          desired,
        );
        await call("workspace_editor", { action: "open", path: "hello.js" });
        await call("workspace_editor", { action: "palette" });
        await code.locator(".quick-input-widget").waitFor({ state: "visible" });
        await code.bringToFront();
        await code.keyboard.press("Escape");
        await code.locator(".quick-input-widget").waitFor({ state: "hidden" });
        await code.waitForFunction(
          (desired) =>
            !!document.querySelector(
              desired === "light"
                ? ".monaco-workbench.vs"
                : ".monaco-workbench.vs-dark",
            ),
          desired,
        );
        await screenshot(mode + "-coding");
      },
    );
  await measure("trusted coding workbench and JSON worker");
  await check('System appearance follows native theme change events in both directions',async()=>{
    await call('piccolo_settings',{action:'update',settings:{theme:'system'}});
    try {for(const mode of ['dark','light']){
      await app.evaluate(({nativeTheme},mode)=>{nativeTheme.themeSource=mode;},mode);
      await code.waitForFunction(mode=>document.documentElement.dataset.theme===mode&&!!document.querySelector(mode==='light'?'.monaco-workbench.vs':'.monaco-workbench.vs-dark'),mode);
    }} finally {await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='system';});}
  });
  await check("Terminal start denial does not create a shell", async () => {
    await dialogs(0);
    await assert.rejects(
      call("workspace_terminal", { action: "start" }),
      /cancelled/,
    );
    assert.equal((await call("workspace_state")).terminalRunning, false);
    await dialogs(1);
  });
  await check(
    "Native ConPTY terminal runs explicitly approved development server and browser preview verifies saved source",
    async () => {
      await dialogs(1);
      await call("workspace_terminal", { action: "start" });
      await call("workspace_terminal", {
        action: "input",
        text: "node preview.cjs\r",
      });
      const port = await until(async () =>
        Number(await readFile(path.join(project, "preview-port.txt"), "utf8")),
      );
      await call("workspace_preview", { url: "http://127.0.0.1:" + port });
      await until(async () =>
        (await call("browser_read")).text?.includes("answer = 43"),
      );
      assert.ok((await call("workspace_terminal", { action: "read" })).running);
      await assert.rejects(
        call("workspace_preview", { url: "https://example.com" }),
        /loopback/,
      );
    },
  );
  await check(
    "Remote preview never gets project filesystem, terminal or privileged coding IPC",
    async () => {
      const webpages = app
        .context()
        .pages()
        .filter((p) => p.url().startsWith("http://127.0.0.1:"));
      assert.ok(webpages.length);
      assert.deepEqual(
        await webpages[0].evaluate(() => ({
          node: typeof require,
          code: typeof window.piccoloCode,
          browser: typeof window.piccolo,
        })),
        { node: "undefined", code: "undefined", browser: "undefined" },
      );
    },
  );
  await measure("coding with real terminal and local Node preview");
  await check(
    "User takeover revokes workspace automation and stops MCP-owned terminal processes",
    async () => {
      await cmd({ type: "workspace", action: "takeover" });
      await assert.rejects(
        call("workspace_files", { action: "list" }),
        /Separate workspace/,
      );
      const port = Number(
        await readFile(path.join(project, "preview-port.txt"), "utf8"),
      );
      await until(async () => {
        try {
          await fetch("http://127.0.0.1:" + port);
          return false;
        } catch {
          return true;
        }
      });
      await grant();
    },
  );
  await check(
    "Unsaved-change Cancel preserves editor; Save and close stops all coding resources",
    async () => {
      await cmd({ type: "workspace", action: "show" });
      await getCode();
      const doc = await call("workspace_editor", {
        action: "read",
        path: "hello.js",
      });
      await call("workspace_editor", {
        action: "edit",
        path: "hello.js",
        version: doc.version,
        text: "export const answer = 44;\n",
      });
      await dialogs(0);
      assert.equal(
        (await cmd({ type: "workspace", action: "close" })).closed,
        false,
      );
      assert.ok(
        (await call("workspace_editor", { action: "inspect" })).dirty.includes(
          "hello.js",
        ),
      );
      await dialogs(1);
      assert.equal(
        (await cmd({ type: "workspace", action: "close" })).closed,
        true,
      );
      assert.equal(
        await readFile(path.join(project, "hello.js"), "utf8"),
        "export const answer = 44;\n",
      );
      assert.equal(
        await app.evaluate(
          ({ webContents }) =>
            webContents
              .getAllWebContents()
              .filter((w) => w.getURL().startsWith("piccolo-code:")).length,
        ),
        0,
      );
    },
  );
  await measure("workspace closed, preview tab remains");
  await check(
    "Restart restores browser pairing, recent project and editor layout without auto-starting workspace processes",
    async () => {
      await client.close();
      client = undefined;
      await other.close();
      other = undefined;
      await app.close();
      await launch();
      await dialogs(1);
      client = await connect("coding-audit");
      assert.equal(
        await app.evaluate(
          ({ webContents }) =>
            webContents
              .getAllWebContents()
              .filter((w) => w.getURL().startsWith("piccolo-code:")).length,
        ),
        0,
      );
      const recent = await cmd({ type: "workspace", action: "status" });
      assert.equal(recent.recent[0].name, "project");
      await cmd({
        type: "workspace",
        action: "reopen",
        value: recent.recent[0].id,
      });
      await getCode();
      assert.equal(
        (
          await code.evaluate(() =>
            window.piccoloCode.request({ action: "state" }),
          )
        ).trusted,
        false,
      );
      await cmd({ type: "workspace", action: "trust" });
      await getCode();
      await until(async () =>
        (await call("workspace_editor", { action: "inspect" })).documents.some(
          (d) => d.path === "hello.js",
        ),
      );
      assert.equal(
        (
          await code.evaluate(() =>
            window.piccoloCode.request({ action: "state" }),
          )
        ).terminalRunning,
        false,
      );
      await screenshot("reopened-layout");
    },
  );
  await check('Browser pair revoke and restore removes persistent workspace grants',async()=>{
    await dialogs(1);
    const status=await cmd({type:'optional',service:'mcp',action:'status'});
    const id=status.clients.find(c=>c.name==='coding-audit').id;
    await cmd({type:'optional',service:'mcp',action:'revoke-client',value:id});
    const grants=await app.evaluate(async()=>{const b=[...globalThis[Symbol.for('piccolo.browser-registry')]][0];return b.store.get('coding-grants',[]);});
    assert.ok(!grants.some(g=>g.client===id));
    await cmd({type:'optional',service:'mcp',action:'restore-client',value:id});
    assert.equal((await call('workspace_state')).available,false);
  });
} catch (error) {
  results.push({
    name: "Coding workflow",
    status: "Failed",
    error: String(error),
    stack: error.stack,
  });
  console.error(error);
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => {});
  await other?.close().catch(() => {});
  await app
    ?.evaluate(({ app }) => {
      const localRequire = process
        .getBuiltinModule("module")
        .createRequire(
          process
            .getBuiltinModule("path")
            .join(app.getAppPath(), "package.json"),
        );
      const p = process
        .getBuiltinModule("path")
        .join(app.getAppPath(), "dist/coding.cjs");
      const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0];
      return localRequire(p).closeWorkspace(b, true);
    })
    .catch(() => {});
  await app?.close().catch(() => {});
  await writeFile(
    path.join(profile, "report.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        profile,
        executable: process.env.PICCOLO_EXE || "development",
        results,
        measurements,
        errors,
        requests: [...requests],
      },
      null,
      2,
    ),
  );
  await writeFile(
    "test-results/coding-latest.json",
    JSON.stringify({ profile, results }, null, 2),
  );
  console.log("Evidence: " + profile);
}
