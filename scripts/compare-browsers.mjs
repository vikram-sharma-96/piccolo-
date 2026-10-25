import { _electron as electron, chromium } from "playwright";
import { spawn, execFile } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";

const piccolo =
  process.env.PICCOLO_EXE ||
  path.resolve("release/0.4.0/win-unpacked/Piccolo.exe");
const brave = path.join(
  process.env.LOCALAPPDATA,
  "BraveSoftware/Brave-Browser/Application/brave.exe",
);
await stat(brave);
const braveProductVersion = await new Promise((resolve, reject) =>
  execFile(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-Item -LiteralPath '${brave.replace(/'/g, "''")}').VersionInfo.ProductVersion`,
    ],
    { windowsHide: true },
    (error, stdout) => (error ? reject(error) : resolve(stdout.trim())),
  ),
);
const out = path.resolve(`test-results/comparison-${Date.now()}`);
await mkdir(out, { recursive: true });
const video = await readFile("tests/fixtures/performance-wallpaper.webm");
const fixture = createServer((req, res) => {
  if (req.url === "/wallpaper.webm") {
    res.writeHead(200, { "Content-Type": "video/webm" });
    res.end(video);
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      req.url === "/video"
        ? '<title>Video fixture</title><video muted autoplay loop src="/wallpaper.webm" style="position:fixed;inset:0;width:100%;height:100%;object-fit:cover"></video>'
        : "<title>Performance fixture</title><h1>Piccolo test page</h1><p>A static local HTTP page without scripts, images or advertising.</p>",
    );
  }
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${fixture.address().port}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function snapshot(root) {
  const script = `$all=Get-CimInstance Win32_Process; $ids=[System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add(${root}); do { $added=$false; foreach($item in $all){if($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)){$added=$true}} } while($added); @(Get-Process -Id @($ids) -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,WorkingSet64,CPU) | ConvertTo-Json -Compress`;
  const text = await new Promise((resolve, reject) =>
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    ),
  );
  const parsed = JSON.parse(text);
  return {
    time: performance.now(),
    processes: Array.isArray(parsed) ? parsed : [parsed],
  };
}
const records = [];
let app, browser, child;
async function run(kind) {
  const profile = path.join(out, kind);
  await mkdir(profile, { recursive: true });
  let page, root, navigate, newTab, tabs, closeTab, minimize, restore;
  const started = performance.now();
  if (kind === "Piccolo") {
    const env = { ...process.env, PICCOLO_PROFILE: profile };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: piccolo, args: [], env });
    root = app.process().pid;
    page = await app.firstWindow();
    await page.locator(".hero-search").waitFor();
    const cmd = (c) => page.evaluate((c) => window.piccolo.command(c), c);
    navigate = (url) => cmd({ type: "navigate", input: url });
    newTab = (url) => cmd({ type: "new-tab", url });
    tabs = async () => (await page.evaluate(() => window.piccolo.state())).tabs;
    closeTab = (t) => cmd({ type: "tab", action: "close", id: t.id });
    minimize = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].minimize(),
      );
    restore = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].restore(),
      );
  } else {
    child = spawn(
      brave,
      [
        `--user-data-dir=${profile}`,
        "--remote-debugging-port=0",
        "--remote-debugging-address=127.0.0.1",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1380,900",
        "brave://newtab/",
      ],
      { stdio: "ignore", windowsHide: true },
    );
    root = child.pid;
    let port;
    for (let i = 0; i < 200; i++) {
      try {
        port = (
          await readFile(path.join(profile, "DevToolsActivePort"), "utf8")
        ).split("\n")[0];
        if (port) break;
      } catch {}
      await wait(100);
    }
    if (!port) throw Error("Brave debug connection unavailable");
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    page = context.pages()[0];
    await page.waitForLoadState("domcontentloaded");
    navigate = (url) => page.goto(url);
    newTab = async (url) => {
      page = await context.newPage();
      await page.goto(url);
    };
    tabs = async () => context.pages();
    closeTab = (t) => t.close();
    minimize = async () => {
      const cdp = await context.newCDPSession(page);
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: { windowState: "minimized" },
      });
      await cdp.detach();
    };
    restore = async () => {
      const cdp = await context.newCDPSession(page);
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: { windowState: "normal" },
      });
      await cdp.detach();
    };
  }
  const startupMs = performance.now() - started;
  const record = {
    browser: kind,
    version:
      kind === "Piccolo"
        ? await app.evaluate(({ app }) => app.getVersion())
        : `${braveProductVersion} (Chromium ${browser.version()})`,
    homepage: kind === "Piccolo" ? "piccolo://newtab" : page.url(),
    startupMs,
    profile,
    scenarios: [],
  };
  records.push(record);
  async function sample(name) {
    await wait(2000);
    let previous = await snapshot(root);
    const samples = [];
    for (let i = 0; i < 3; i++) {
      await wait(1000);
      const current = await snapshot(root);
      const prior = new Map(previous.processes.map((p) => [p.Id, p.CPU || 0]));
      const cpuSeconds = current.processes.reduce(
        (n, p) =>
          n + Math.max(0, (p.CPU || 0) - (prior.get(p.Id) ?? p.CPU ?? 0)),
        0,
      );
      samples.push({
        workingSetMiB:
          current.processes.reduce((n, p) => n + p.WorkingSet64, 0) / 1048576,
        cpuOneCorePercent:
          (cpuSeconds / ((current.time - previous.time) / 1000)) * 100,
        processCount: current.processes.length,
        processes: current.processes,
      });
      previous = current;
    }
    record.scenarios.push({ name, samples });
    console.log("Measured", kind, name);
  }
  await sample("default homepage (different content)");
  await navigate(base + "/one");
  await wait(500);
  await sample("one identical static webpage");
  for (let i = 0; i < 4; i++) {
    await newTab(base + "/tab-" + i);
    await wait(150);
  }
  await sample("five identical static webpages");
  const all = await tabs();
  for (const t of all.slice(1)) await closeTab(t);
  if (kind === "Brave") page = (await tabs())[0];
  await sample("after closing four tabs");
  for (let i = 0; i < 10; i++) {
    await newTab(base + "/cycle-" + i);
    await wait(150);
    const ts = await tabs();
    await closeTab(ts[ts.length - 1]);
    if (kind === "Brave") page = (await tabs())[0];
  }
  await sample("after ten tab cycles");
  if (kind === "Piccolo") {
    await navigate("piccolo://newtab");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const asset = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webm";
    await mkdir(path.join(profile, "wallpapers"), { recursive: true });
    await writeFile(path.join(profile, "wallpapers", asset), video);
    const settings = await page.evaluate(
      async () => (await window.piccolo.state()).settings,
    );
    await page.evaluate(
      (settings) =>
        window.piccolo.command({
          type: "settings",
          value: {
            ...settings,
            lowPower: false,
            wallpaper: {
              ...settings.wallpaper,
              kind: "video",
              asset: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webm",
            },
          },
        }),
      settings,
    );
  } else await navigate(base + "/video");
  await page.locator("video").waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v.readyState >= 2 && !v.paused;
  });
  await sample("same video, different host UI");
  await minimize();
  await sample("video window minimized");
  await restore();
  if (kind === "Piccolo") {
    await app.close();
    app = undefined;
  } else {
    await browser.close();
    browser = undefined;
    child.kill();
    child = undefined;
  }
}
try {
  await run("Piccolo");
  await run("Brave");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => {});
  await browser?.close().catch(() => {});
  child?.kill();
  fixture.closeAllConnections();
  fixture.close();
  await writeFile(
    path.resolve("test-results/browser-comparison.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        os: os.version(),
        cpu: os.cpus()[0].model,
        logicalCPUs: os.cpus().length,
        ram: os.totalmem(),
        executables: { Piccolo: piccolo, Brave: brave },
        piccoloAsarSHA256: createHash("sha256")
          .update(
            await readFile(
              path.join(path.dirname(piccolo), "resources/app.asar"),
            ),
          )
          .digest("hex"),
        method:
          "Fresh isolated profiles, visible Windows applications, GPU/security defaults retained, CDP attached to both and Node inspector additionally attached to Piccolo. Same local static fixture and deterministic 320x180 VP8 video. Two-second settling, three one-second-plus-CIM samples, summed Windows working sets (shared pages double counted); CPU is percent of one logical core. Sequential single runs, warm OS cache, no causal or battery-life claim. Default homepages and video host UIs differ.",
        records,
      },
      null,
      2,
    ),
  );
}
