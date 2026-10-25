import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";
const output = path.resolve("test-results");
await mkdir(output, { recursive: true });
const profile = path.join(output, `profile-${Date.now()}`);
const records = [];
const server = createServer((req, res) => {
  if (req.url === "/loading") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.write("<title>Loading fixture</title><h1>Still loading</h1>");
    const timer = setTimeout(() => res.end("Finished"), 15000);
    res.on("close", () => clearTimeout(timer));
    return;
  }
  if (req.url === "/file") {
    res.writeHead(200, {
      "Content-Disposition": 'attachment; filename="piccolo-test.txt"',
      "Content-Type": "text/plain",
    });
    res.end("Piccolo real download fixture\n");
  } else if (req.url === "/slow") {
    res.writeHead(200, {
      "Content-Disposition": 'attachment; filename="slow.bin"',
      "Content-Type": "application/octet-stream",
      "Content-Length": "10485760",
    });
    const interval = setInterval(() => res.write(Buffer.alloc(65536)), 100);
    res.on("close", () => clearInterval(interval));
  } else {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<title>Piccolo fixture ${req.url}</title><h1>Real browsing fixture</h1><a href="/second">Next page</a><a href="/popup" target="_blank">Popup</a><a href="/file">Download</a><a href="/slow">Slow download</a><input aria-label="fixture input"><script>localStorage.setItem('fixture','normal');</script>`,
    );
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
let app;
let page;
let widgetSnapshot;
const exe = process.env.PICCOLO_EXE;
async function launch() {
  const started = performance.now();
  app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: ["."] }),
    env: Object.fromEntries(
      Object.entries({ ...process.env, PICCOLO_PROFILE: profile }).filter(
        ([key]) => key !== "ELECTRON_RUN_AS_NODE",
      ),
    ),
    timeout: 30000,
  });
  const deadline = Date.now() + 20000;
  page = undefined;
  while (Date.now() < deadline) {
    page = app.windows().find((p) => p.url().startsWith("piccolo-ui://app/"));
    if (page) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!page) throw Error("Trusted UI window did not appear");
  await page.waitForFunction(() => !!window.piccolo);
  await page.locator(".content").waitFor();
  records.push({
    check: "launch-ui-ms",
    value: Math.round(performance.now() - started),
  });
}
const cmd = (c) => page.evaluate((c) => window.piccolo.command(c), c);
const state = () => page.evaluate(() => window.piccolo.state());
async function check(name, fn) {
  await fn();
  records.push({ check: name, passed: true });
  console.log("PASS", name);
}
async function waitState(predicate, target = page) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const s = await target.evaluate(() => window.piccolo.state());
    if (predicate(s)) return s;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("State condition timed out: " + predicate.toString());
}
async function waitTab(url) {
  await waitState((s) =>
    s.tabs.some(
      (t) =>
        t.url === url && !t.loading && t.title.startsWith("Piccolo fixture"),
    ),
  );
}
async function remote(code) {
  return app.evaluate(({ webContents }, code) => {
    const wc = webContents
      .getAllWebContents()
      .find(
        (w) =>
          w.getLastWebPreferences().preload === undefined &&
          w.getLastWebPreferences().nodeIntegration === false,
      );
    if (!wc)
      throw Error(
        "No remote view: " +
          JSON.stringify(
            webContents
              .getAllWebContents()
              .map((w) => ({ id: w.id, url: w.getURL(), type: w.getType() })),
          ),
      );
    return wc.executeJavaScript(code);
  }, code);
}
try {
  await launch();
  await page.screenshot({ path: path.join(output, "newtab.png") });
  await check("new-tab widget autosave", async () => {
    await page
      .getByRole("textbox", { name: "Notes", exact: true })
      .fill("Persisted smoke note");
    await page.getByRole("textbox", { name: "Notes", exact: true }).blur();
    await waitState((s) => s.settings.notes === "Persisted smoke note");
    await page
      .getByRole("button", { name: "Make it yours", exact: true })
      .click();
    const first = (await state()).settings.widgets[0];
    await page.getByTitle("Resize widget", { exact: true }).first().click();
    await waitState((s) => s.settings.widgets[0].width !== first.width);
    await page.getByTitle("Move later", { exact: true }).first().click();
    await waitState((s) => s.settings.widgets[1].id === first.id);
    await page.getByRole("button", { name: "+ clock", exact: true }).click();
    await waitState((s) => s.settings.widgets.length === 5);
    await page.getByTitle("Remove widget", { exact: true }).last().click();
    await waitState((s) => s.settings.widgets.length === 4);
    widgetSnapshot = (await state()).settings.widgets;
    await page
      .getByRole("button", { name: "Done editing", exact: true })
      .click();
  });
  await check("real website and remote isolation", async () => {
    await cmd({ type: "navigate", input: base + "/first" });
    await waitTab(base + "/first");
    assert.deepEqual(
      await remote("[typeof require,typeof process,typeof window.piccolo]"),
      ["undefined", "undefined", "undefined"],
    );
  });
  await check("Stop cancels a loading document", async () => {
    await cmd({ type: "navigate", input: base + "/loading" });
    await waitState((s) => s.tabs.find((t) => t.id === s.activeId).loading);
    await cmd({ type: "action", action: "stop" });
    await waitState((s) => !s.tabs.find((t) => t.id === s.activeId).loading);
    assert.equal(
      await app.evaluate(() =>
        [...globalThis[Symbol.for("piccolo.browser-registry")]][0]
          .activeContents()
          .isLoading(),
      ),
      false,
    );
    await cmd({ type: "navigate", input: base + "/first" });
    await waitTab(base + "/first");
  });
  await check(
    "Window fullscreen enters and leaves with native view bounds intact",
    async () => {
      await cmd({ type: "action", action: "fullscreen" });
      for (let i = 0; i < 40; i++) {
        if (
          await app.evaluate(() =>
            [
              ...globalThis[Symbol.for("piccolo.browser-registry")],
            ][0].win.isFullScreen(),
          )
        )
          break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(
        await app.evaluate(() =>
          [
            ...globalThis[Symbol.for("piccolo.browser-registry")],
          ][0].win.isFullScreen(),
        ),
        true,
      );
      const checkFullscreenBounds=async()=>{
        await new Promise(r=>setTimeout(r,100));
        const geometry=await app.evaluate(()=>{const b=[...globalThis[Symbol.for('piccolo.browser-registry')]][0];return {bounds:b.views.get(b.state.activeId).getBounds(),size:b.win.getContentSize()};});
        assert.deepEqual(geometry.bounds,{x:0,y:94,width:geometry.size[0],height:geometry.size[1]-94});
      };
      await checkFullscreenBounds();
      await cmd({ type: "action", action: "fullscreen" });
      for (let i = 0; i < 40; i++) {
        if (
          !(await app.evaluate(() =>
            [
              ...globalThis[Symbol.for("piccolo.browser-registry")],
            ][0].win.isFullScreen(),
          ))
        )
          break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(
        await app.evaluate(() =>
          [
            ...globalThis[Symbol.for("piccolo.browser-registry")],
          ][0].win.isFullScreen(),
        ),
        false,
      );
      await checkFullscreenBounds();
    },
  );
  await check("failed navigation shows trusted recovery UI", async () => {
    await cmd({ type: "navigate", input: "http://127.0.0.1:1/" });
    await waitState((s) => !!s.tabs.find((t) => t.id === s.activeId)?.error);
    await page
      .getByRole("heading", { name: "A small interruption." })
      .waitFor();
    await cmd({ type: "navigate", input: base + "/first" });
    await waitTab(base + "/first");
  });
  await check("find controls and zoom", async () => {
    await cmd({ type: "find", text: "fixture" });
    const bounds = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]
        .contentView.children.filter(
          (v) => v.webContents && v.webContents.getURL().startsWith("http"),
        )
        .find((v) => v.getVisible())
        .getBounds(),
    );
    assert.equal(bounds.y, 136);
    await cmd({ type: "find", text: "", close: true });
    await cmd({ type: "action", action: "zoom-in" });
    const zoomState = await state();
    assert.ok(zoomState.tabs.find((t) => t.id === zoomState.activeId).zoom > 1);
    await cmd({ type: "action", action: "zoom-reset" });
  });
  await check("unexpected popups denied; user link opens a tab", async () => {
    const before = (await state()).tabs.length;
    await remote(
      `for(let i=0;i<5;i++)window.open(${JSON.stringify(base + "/unwanted")})`,
    );
    await new Promise((r) => setTimeout(r, 200));
    assert.equal((await state()).tabs.length, before);
    const remotePage = app.windows().find((w) => w.url() === base + "/first");
    assert.ok(remotePage);
    await remotePage.getByRole("link", { name: "Popup", exact: true }).click();
    await waitState((s) => s.tabs.length === before + 1);
    await waitTab(base + "/popup");
    await cmd({ type: "tab", action: "close", id: (await state()).activeId });
  });
  await check("back forward reload", async () => {
    await cmd({ type: "navigate", input: base + "/second" });
    await waitTab(base + "/second");
    await cmd({ type: "action", action: "back" });
    await waitTab(base + "/first");
    await cmd({ type: "action", action: "forward" });
    await waitTab(base + "/second");
    await cmd({ type: "action", action: "reload" });
    await waitTab(base + "/second");
  });
  await check("tab lifecycle reorder pin reopen", async () => {
    const first = (await state()).tabs[0].id;
    await cmd({ type: "new-tab", url: base + "/other" });
    await waitTab(base + "/other");
    let s = await state();
    const second = s.activeId;
    await cmd({ type: "reorder", id: second, before: first });
    assert.equal((await state()).tabs[0].id, second);
    await cmd({ type: "tab", action: "pin", id: second });
    assert.equal((await state()).tabs[0].pinned, true);
    await cmd({ type: "tab", action: "duplicate", id: second });
    await cmd({ type: "tab", action: "close", id: (await state()).activeId });
    await cmd({ type: "action", action: "reopen" });
    assert.equal((await state()).tabs.length, 3);
    await cmd({ type: "tab", action: "activate", id: first });
  });
  await check("native view bounds and trusted overlay", async () => {
    const before = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]
        .contentView.children.filter(
          (v) => v.webContents && v.webContents.getURL().startsWith("http"),
        )
        .map((v) => ({ visible: v.getVisible(), bounds: v.getBounds() })),
    );
    assert.equal(before.filter((v) => v.visible).length, 1);
    assert.equal(before.find((v) => v.visible).bounds.y, 94);
    await cmd({ type: "overlay", open: true });
    const shown = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]
        .contentView.children.filter(
          (v) => v.webContents && v.webContents.getURL().startsWith("http"),
        )
        .some((v) => v.getVisible()),
    );
    assert.equal(shown, false);
    await cmd({ type: "overlay", open: false });
  });
  await check("history bookmark and settings persistence", async () => {
    const visits = await cmd({ type: "history", query: "fixture" });
    assert.ok(visits.length >= 2);
    await cmd({
      type: "bookmark",
      action: "save",
      value: { title: "Smoke bookmark", url: base + "/first", folder: "Tests" },
    });
    const s = await state();
    await cmd({
      type: "settings",
      value: { ...s.settings, askDownload: false },
    });
    await app.evaluate(({ dialog }, output) => {
      globalThis.originalDialog = dialog.showOpenDialog;
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [output],
      });
    }, output);
    await cmd({ type: "download-directory" });
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = globalThis.originalDialog;
    });
    assert.ok(
      (await state()).bookmarks.some((b) => b.title === "Smoke bookmark"),
    );
  });
  await check("real download completion", async () => {
    await remote(`location.href=${JSON.stringify(base + "/file")}`);
    await waitState((s) =>
      s.downloads.some(
        (d) =>
          d.name === "piccolo-test.txt" && d.status === "awaiting-approval",
      ),
    );
    await cmd({
      type: "download",
      id: (await state()).downloads.find((d) => d.name === "piccolo-test.txt")
        .id,
      action: "approve",
    });
    await waitState((s) =>
      s.downloads.some(
        (d) => d.name === "piccolo-test.txt" && d.status === "completed",
      ),
    );
    const d = (await state()).downloads.find(
      (d) => d.name === "piccolo-test.txt",
    );
    assert.match(await readFile(d.path, "utf8"), /real download/);
  });
  await check("real download cancellation", async () => {
    await remote(`location.href=${JSON.stringify(base + "/slow")}`);
    await waitState((s) => s.downloads.some((d) => d.name === "slow.bin"));
    const d = (await state()).downloads.find((d) => d.name === "slow.bin");
    await cmd({ type: "download", id: d.id, action: "approve" });
    await waitState((s) =>
      s.downloads.some((x) => x.id === d.id && x.received > 0),
    );
    await cmd({ type: "download", id: d.id, action: "pause" });
    await waitState(
      (s) => s.downloads.find((x) => x.id === d.id).status === "paused",
    );
    await cmd({ type: "download", id: d.id, action: "resume" });
    await waitState(
      (s) => s.downloads.find((x) => x.id === d.id).status === "progressing",
    );
    await cmd({ type: "download", id: d.id, action: "cancel" });
    await waitState((s) =>
      s.downloads.some(
        (d) => d.name === "slow.bin" && d.status === "cancelled",
      ),
    );
  });
  await check("private session storage and history isolation", async () => {
    await app.evaluate(({ session }) =>
      session.fromPartition("persist:browsing").cookies.set({
        url: "https://example.com",
        name: "normal-only",
        value: "secret",
      }),
    );
    await cmd({ type: "action", action: "private" });
    const privateWindow =
      app
        .windows()
        .find((w) => w !== page && w.url().startsWith("piccolo-ui:")) ||
      (await app.waitForEvent("window"));
    await privateWindow.waitForFunction(() => !!window.piccolo);
    assert.equal(
      await privateWindow.evaluate(() =>
        window.piccolo.state().then((s) => s.private),
      ),
      true,
    );
    await privateWindow.evaluate(
      (url) => window.piccolo.command({ type: "navigate", input: url }),
      base + "/private",
    );
    await waitState(
      (s) =>
        s.tabs.some(
          (t) =>
            !t.loading &&
            t.title.startsWith("Piccolo fixture") &&
            t.url.includes("/private"),
        ),
      privateWindow,
    );
    const cookies = await app.evaluate(({ webContents }) =>
      webContents
        .getAllWebContents()
        .find((w) => w.getURL().includes("/private"))
        .session.cookies.get({ name: "normal-only" }),
    );
    assert.equal(cookies.length, 0);
    const history = await privateWindow.evaluate(() =>
      window.piccolo.command({ type: "history", query: "" }),
    );
    assert.deepEqual(history, []);
    await privateWindow.evaluate(() => window.close());
    assert.equal((await cmd({ type: "history", query: "/private" })).length, 0);
  });
  await check("process metrics", async () => {
    const m = await cmd({ type: "metrics" });
    assert.ok(m.processes.length > 0);
    records.push({ check: "several-tabs-process-snapshot", value: m });
  });
  await check("captured tab is protected from sleeping", async () => {
    await waitState((s) => s.tabs.every((t) => !t.loading));
    const s = await state();
    const target = s.tabs.find((t) => t.id !== s.activeId && !t.pinned);
    await cmd({ type: "tab", action: "discard", id: target.id });
    assert.equal(
      (await state()).tabs.find((t) => t.id === target.id).discarded,
      false,
    );
  });
  await check("public HTTPS website", async () => {
    await cmd({ type: "new-tab", url: "https://example.com/" });
    await waitState((s) =>
      s.tabs.some(
        (t) =>
          t.url === "https://example.com/" &&
          t.title.includes("Example Domain") &&
          !t.loading,
      ),
    );
    await cmd({ type: "tab", action: "close", id: (await state()).activeId });
  });
  await check("session restored after relaunch", async () => {
    const count = (await state()).tabs.length;
    await app.close();
    await launch();
    assert.equal((await state()).tabs.length, count);
    assert.equal((await state()).settings.notes, "Persisted smoke note");
    assert.deepEqual((await state()).settings.widgets, widgetSnapshot);
    assert.ok(
      (await state()).bookmarks.some((b) => b.title === "Smoke bookmark"),
    );
  });
  await page.screenshot({ path: path.join(output, "restored.png") });
  await check("unexpected shutdown snapshot recovery", async () => {
    await cmd({ type: "new-tab", url: base + "/recovered" });
    await waitTab(base + "/recovered");
    const count = (await state()).tabs.length;
    await new Promise((r) => setTimeout(r, 500));
    const closed = app.waitForEvent("close");
    await app.evaluate(({ app }) => app.exit(77)).catch(() => {});
    await closed;
    await launch();
    const restored = await state();
    assert.equal(restored.recovered, true);
    assert.equal(restored.tabs.length, count);
    assert.ok(restored.tabs.some((t) => t.url === base + "/recovered"));
  });
} catch (error) {
  records.push({ check: "failure", error: String(error), stack: error.stack });
  console.error(error);
  if (page)
    await page
      .screenshot({ path: path.join(output, "failure.png") })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  server.closeAllConnections();
  server.close();
  await writeFile(
    path.join(output, exe ? "packaged-smoke.json" : "smoke.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        os: os.version(),
        arch: os.arch(),
        cpus: os.cpus()[0]?.model,
        ram: os.totalmem(),
        exe: exe || "development Electron",
        profile,
        records,
      },
      null,
      2,
    ),
  );
}
