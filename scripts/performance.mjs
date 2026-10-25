import { createHash } from "node:crypto";
import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, writeFile, stat, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";
const out = path.resolve("test-results");
await mkdir(out, { recursive: true });
const profile = path.join(out, `perf-profile-${Date.now()}`);
const executable =
  process.env.PICCOLO_EXE ||
  path.resolve("release/0.6.0/win-unpacked/Piccolo.exe");
const server = createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(
    "<title>Performance fixture</title><h1>Piccolo test page</h1><p>A static local HTTP page without scripts, images or advertising.</p>",
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
let app;
const records = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const started = performance.now();
  const env = { ...process.env, PICCOLO_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: executable, args: [], env });
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  page.on("console", (message) => {
    if (message.type() === "error") console.error("Renderer:", message.text());
  });
  await page.locator(".hero-search").waitFor();
  const startup = performance.now() - started;
  const cmd = (c) => page.evaluate((c) => window.piccolo.command(c), c);
  const state = () => page.evaluate(() => window.piccolo.state());
  async function sample(name) {
    await wait(2000);
    await cmd({ type: "metrics" });
    const samples = [];
    for (let i = 0; i < 3; i++) {
      await wait(1000);
      const m = await cmd({ type: "metrics" });
      samples.push({
        workingSetKiB: m.processes.reduce(
          (n, p) => n + p.memory.workingSetSize,
          0,
        ),
        cpuPercent: m.processes.reduce((n, p) => n + p.cpu.percentCPUUsage, 0),
        processes: m.processes,
        webContents: m.webContents,
        processCount: m.processes.length,
        webContentsCount: m.webContents?.length,
      });
    }
    records.push({ name, samples });
    console.log("Measured", name);
  }
  await sample("new-tab idle, gradient");
  await cmd({ type: "navigate", input: base + "/one" });
  await wait(1000);
  await sample("one active static local page");
  for (let i = 0; i < 4; i++) {
    await cmd({ type: "new-tab", url: base + `/tab-${i}` });
    await wait(250);
  }
  await sample("five loaded static local pages");
  const s = await state();
  for (const tab of s.tabs.slice(1))
    await cmd({ type: "tab", action: "close", id: tab.id });
  await sample("after closing four tabs");
  for (let i = 0; i < 10; i++) {
    await cmd({ type: "new-tab", url: base + `/cycle-${i}` });
    await wait(200);
    const current = await state();
    await cmd({ type: "tab", action: "close", id: current.activeId });
  }
  await sample("after ten open/close cycles");
  await cmd({ type: "navigate", input: "piccolo://newtab" });
  // Deterministic geometric canvas recording from the earlier verified run.
  // Generating it in a background window can produce a header with no video frames.
  const bytes = await readFile("tests/fixtures/performance-wallpaper.webm");
  const asset = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webm";
  await mkdir(path.join(profile, "wallpapers"), { recursive: true });
  await writeFile(path.join(profile, "wallpapers", asset), Buffer.from(bytes));
  const settings = (await state()).settings;
  await cmd({
    type: "settings",
    value: {
      ...settings,
      lowPower: false,
      wallpaper: { ...settings.wallpaper, kind: "video", asset },
    },
  });
  await page.locator("video").waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v.readyState >= 2 && !v.paused;
  });
  await sample("video wallpaper enabled (320x180 VP8, muted)");
  const current = (await state()).activeId;
  await cmd({ type: "new-tab", url: base + "/wallpaper-hidden" });
  await sample("video wallpaper hidden by webpage");
  await cmd({ type: "tab", action: "close", id: (await state()).activeId });
  await cmd({ type: "tab", action: "activate", id: current });
  await page.locator("video").waitFor();
  await page.waitForFunction(() => !document.querySelector("video").paused);
  const before = await page.locator("video").evaluate((v) => v.currentTime);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].minimize(),
  );
  await wait(500);
  const paused = await page.evaluate(
    () =>
      !document.querySelector("video") ||
      document.querySelector("video").paused,
  );
  await sample("video wallpaper minimized");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].hide(),
  );
  await sample("video wallpaper window hidden");
  if (await page.locator("video").count())
    throw Error("Hidden wallpaper decoder was retained.");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].show(),
  );
  records.push({
    name: "wallpaper paused when minimized",
    passed: paused,
    before,
  });
  if (!paused) throw Error("Video did not pause on minimize");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].restore(),
  );
  await wait(200);
  await cmd({
    type: "settings",
    value: {
      ...settings,
      lowPower: true,
      wallpaper: { ...settings.wallpaper, kind: "video", asset },
    },
  });
  await sample("video wallpaper disabled by low-power mode");
  const lowPowerPaused = await page.evaluate(
    () =>
      !document.querySelector("video") ||
      document.querySelector("video").paused,
  );
  if (!lowPowerPaused) throw Error("Low-power video still playing");
  await writeFile(
    path.join(out, process.env.PERF_REPORT || "performance.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        exe: executable,
        exeBytes: (await stat(executable)).size,
        asarSHA256: createHash("sha256")
          .update(
            await readFile(
              path.join(path.dirname(executable), "resources", "app.asar"),
            ),
          )
          .digest("hex"),
        app: await app.evaluate(({ app }) => app.getVersion()),
        os: os.version(),
        release: os.release(),
        arch: os.arch(),
        cpu: os.cpus()[0].model,
        logicalCPUs: os.cpus().length,
        ram: os.totalmem(),
        startupMs: startup,
        method:
          "Playwright Electron, fresh profile, first content visible; reduced-motion emulated off consistently for opt-in video; 2 second settle then 3 samples 1 second apart; process working sets summed (may double count shared pages). Debugging overhead is present. Warm file cache; not a machine cold boot.",
        records,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  if (app) {
    const page = app.windows().find((p) => p.url().startsWith("piccolo-ui:"));
    if (page)
      console.error(
        "Wallpaper diagnostic",
        await page
          .evaluate(() => {
            const v = document.querySelector("video");
            return {
              video: v
                ? {
                    src: v.currentSrc,
                    paused: v.paused,
                    readyState: v.readyState,
                    networkState: v.networkState,
                    error: v.error?.message,
                  }
                : null,
              hidden: document.hidden,
              reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
            };
          })
          .catch(() => null),
      );
  }
  await writeFile(
    path.join(out, `failed-${process.env.PERF_REPORT || "performance.json"}`),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        error: String(error),
        exe: executable,
        records,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  server.closeAllConnections();
  server.close();
}

