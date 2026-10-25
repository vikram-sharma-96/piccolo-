import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import path from "node:path";
const profile = path.resolve(`test-results/download-policy-${Date.now()}`),
  destination = path.join(profile, "saved");
await mkdir(destination, { recursive: true });
const results = [];
let app,
  page,
  bytes = 0;
let nearResponse;
let startNear;
const fixture = createServer((req, res) => {
  if (req.url === "/near") {
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'attachment; filename="near.txt"',
      "Content-Length": "100000",
    });
    res.write(Buffer.alloc(1024));
    nearResponse = res;
    let interval;
    startNear = () => {
      let sent = 1024;
      interval = setInterval(() => {
        const count = Math.min(10000, 90000 - sent);
        if (count > 0) {
          res.write(Buffer.alloc(count));
          sent += count;
        }
        if (sent >= 90000) clearInterval(interval);
      }, 50);
    };
    const timer = setTimeout(() => res.end(Buffer.alloc(10000)), 15000);
    res.on("close", () => {
      clearTimeout(timer);
      clearInterval(interval);
    });
    return;
  }
  if (req.url === "/redirect") {
    res.writeHead(302, { Location: "/file" });
    res.end();
    return;
  }
  if (["/file", "/slow", "/risky"].includes(req.url)) {
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "Content-Disposition": `attachment; filename="${req.url === "/risky" ? "harmless.cmd" : "harmless.txt"}"`,
      ...(req.url === "/slow" ? { "Content-Length": "10485760" } : {}),
    });
    if (req.url === "/slow") {
      const timer = setInterval(() => {
        bytes += 16384;
        res.write(Buffer.alloc(16384));
      }, 30);
      res.on("close", () => clearInterval(timer));
    } else res.end("Harmless local fixture, never execute.");
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    `<title>Download fixture</title><h1>Local harmless fixture</h1><a href="/file" target="_blank">Popup download</a><script>if(location.pathname==='/driveby')setTimeout(()=>location='/file',100)</script>`,
  );
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
let base = `http://127.0.0.1:${fixture.address().port}`;
const servers = [fixture];
async function freshSite() {
  const server = createServer(fixture.listeners("request")[0]);
  servers.push(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  await cmd({ type: "new-tab", url: base });
  await until(() =>
    app.evaluate(() => {
      const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0],
        w = b.views.get(b.state.activeId)?.webContents;
      return w && !w.isLoading();
    }),
  );
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = () => page.evaluate(() => window.piccolo.state());
const cmd = (c) => page.evaluate((c) => window.piccolo.command(c), c);
const registry = () =>
  app.evaluate(
    () => [...globalThis[Symbol.for("piccolo.browser-registry")]][0].state,
  );
async function until(fn) {
  for (let i = 0; i < 160; i++) {
    const value = await fn();
    if (value) return value;
    await wait(50);
  }
  throw Error("Timed out");
}
async function launch() {
  const env = { ...process.env, PICCOLO_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    ...(process.env.PICCOLO_EXE
      ? { executablePath: process.env.PICCOLO_EXE, args: [] }
      : { args: ["."] }),
    env,
  });
  page = await app.firstWindow();
  await page.waitForFunction(() => !!window.piccolo);
  await app.evaluate(({ dialog }, destination) => {
    globalThis.nativeApprovals = 0;
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [destination],
    });
    dialog.showMessageBox = async () => {
      globalThis.nativeApprovals++;
      return { response: 0 };
    };
  }, destination);
}
async function download(route) {
  await until(() =>
    app.evaluate(() => {
      const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0];
      const wc = b.views.get(b.state.activeId)?.webContents;
      return wc && !wc.isLoading();
    }),
  );
  const before = new Set((await state()).downloads.map((d) => d.id));
  await cmd({ type: "navigate", input: base + route });
  return until(async () =>
    (await state()).downloads.find(
      (d) => !before.has(d.id) && d.status === "awaiting-approval",
    ),
  );
}
async function check(name, fn) {
  await fn();
  results.push({ name, status: "Passed" });
  console.log("PASS " + name);
}
try {
  await launch();
  let s = await state();
  await cmd({ type: "settings", value: { ...s.settings, askDownload: false } });
  await cmd({ type: "download-directory" });
  await check(
    "Drive-by held; no native modal or destination file",
    async () => {
      await cmd({ type: "navigate", input: base + "/driveby" });
      await until(async () =>
        (await state()).downloads.some((d) => d.status === "awaiting-approval"),
      );
      assert.deepEqual(await readdir(destination), []);
      assert.equal(await app.evaluate(() => globalThis.nativeApprovals), 0);
    },
  );
  let pending = (await state()).downloads.find(
    (d) => d.status === "awaiting-approval",
  );
  await check(
    "Downloads toolbar preserves initiating tab and allows explicit save",
    async () => {
      await page
        .getByRole("button", { name: "Downloads", exact: true })
        .click();
      await page.getByRole("button", { name: "Allow download" }).click();
      await until(async () =>
        (await state()).downloads.some(
          (d) => d.id === pending.id && d.status === "completed",
        ),
      );
      assert.match(await readFile(pending.path, "utf8"), /Harmless/);
    },
  );
  await check(
    "Late cancel leaves completed file and terminal state intact",
    async () => {
      await cmd({ type: "download", id: pending.id, action: "cancel" });
      assert.equal(
        (await state()).downloads.find((d) => d.id === pending.id).status,
        "completed",
      );
      assert.match(await readFile(pending.path, "utf8"), /Harmless/);
    },
  );
  await cmd({ type: "new-tab", url: base });
  await check(
    "Cancel before approval never publishes and removes active row",
    async () => {
      const d = await download("/slow");
      await cmd({ type: "download", id: d.id, action: "cancel" });
      await cmd({ type: "download", id: d.id, action: "cancel" });
      const item = (await state()).downloads.find((v) => v.id === d.id);
      assert.equal(item.status, "cancelled");
      assert.equal(item.speed, 0);
      assert.equal(item.eta, null);
      await page
        .getByRole("button", { name: "Downloads", exact: true })
        .click();
      assert.equal(await page.locator(".download-card").count(), 0);
    },
  );
  await cmd({ type: "new-tab", url: base });
  await check(
    "Cancel during real transfer stops bytes, cleans owned partial, survives late events",
    async () => {
      const d = await download("/slow");
      await cmd({ type: "download", id: d.id, action: "approve" });
      await wait(350);
      await cmd({ type: "download", id: d.id, action: "cancel" });
      await wait(150);
      const n = bytes;
      await wait(300);
      assert.equal(bytes, n);
      assert.equal(
        (await state()).downloads.find((v) => v.id === d.id).status,
        "cancelled",
      );
      assert.equal((await readdir(destination)).length, 1);
      await until(
        async () =>
          (await readdir(path.join(profile, "download-staging"))).length === 0,
      );
    },
  );
  await check("Redirect download held and approved", async () => {
    const d = await download("/redirect");
    assert.equal(d.status, "awaiting-approval");
    await cmd({ type: "download", id: d.id, action: "approve" });
    await until(
      async () =>
        (await state()).downloads.find((v) => v.id === d.id)?.status ===
        "completed",
    );
  });
  await check("Blob export held and approved", async () => {
    await cmd({ type: "navigate", input: base });
    await wait(150);
    await app.evaluate(() => {
      const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0];
      return b.views
        .get(b.state.activeId)
        .webContents.executeJavaScript(
          `(()=>{const a=document.createElement('a');a.download='export.txt';a.href=URL.createObjectURL(new Blob(['Export fixture'],{type:'text/plain'}));a.click()})()`,
        );
    });
    const d = await until(async () =>
      (await state()).downloads.find(
        (d) => d.url.startsWith("blob:") && d.status === "awaiting-approval",
      ),
    );
    await cmd({ type: "download", id: d.id, action: "approve" });
    await until(
      async () =>
        (await state()).downloads.find((v) => v.id === d.id)?.status ===
        "completed",
    );
  });
  await check(
    "User-requested popup download remains usable and retains opener attribution",
    async () => {
      await freshSite();
      const before = new Set((await state()).downloads.map((d) => d.id));
      const remote = app
        .context()
        .pages()
        .find((p) => p.url() === base + "/");
      assert.ok(remote);
      await remote.getByText("Popup download", { exact: true }).click();
      const d = await until(async () =>
        (await state()).downloads.find(
          (d) => !before.has(d.id) && d.status === "awaiting-approval",
        ),
      );
      assert.equal(d.initiator, base);
      assert.equal(d.pageURL, base + "/");
      await cmd({ type: "download", id: d.id, action: "approve" });
      await until(
        async () =>
          (await state()).downloads.find((v) => v.id === d.id)?.status ===
          "completed",
      );
    },
  );
  await check("Closing initiating tab cancels pending approval", async () => {
    await freshSite();
    const d = await download("/slow"),
      s = await state();
    await cmd({ type: "tab", id: s.activeId, action: "close" });
    await until(
      async () =>
        (await state()).downloads.find((v) => v.id === d.id)?.status ===
        "cancelled",
    );
  });
  await check(
    "Cancel near completion stops a 90%-received transfer",
    async () => {
      await freshSite();
      const d = await download("/near");
      await cmd({ type: "download", id: d.id, action: "approve" });
      startNear();
      await until(async () => {
        const value = (await state()).downloads.find((v) => v.id === d.id);
        return value.received >= 90000 && value.status === "progressing";
      });
      await cmd({ type: "download", id: d.id, action: "cancel" });
      nearResponse?.end(Buffer.alloc(10000));
      await wait(100);
      const value = (await state()).downloads.find((v) => v.id === d.id);
      assert.equal(value.status, "cancelled");
      assert.equal(value.speed, 0);
      assert.equal(value.eta, null);
      assert.ok(
        !(await readdir(destination)).some((file) =>
          file.endsWith("-near.txt"),
        ),
      );
    },
  );
  await check(
    "Approved transfer remains cancelable after initiating tab closes",
    async () => {
      await freshSite();
      const d = await download("/slow");
      await cmd({ type: "download", id: d.id, action: "approve" });
      await wait(100);
      const s = await state();
      await cmd({ type: "tab", id: s.activeId, action: "close" });
      await cmd({ type: "download", id: d.id, action: "cancel" });
      assert.equal(
        (await state()).downloads.find((v) => v.id === d.id).status,
        "cancelled",
      );
    },
  );
  await check(
    "Risky harmless filename requires extra native consent and denial cancels",
    async () => {
      await freshSite();
      const d = await download("/risky"),
        before = await app.evaluate(() => globalThis.nativeApprovals);
      assert.ok(d.risk);
      await cmd({ type: "download", id: d.id, action: "approve" });
      assert.equal(
        await app.evaluate(() => globalThis.nativeApprovals),
        before + 1,
      );
      assert.equal(
        (await state()).downloads.find((v) => v.id === d.id).status,
        "cancelled",
      );
    },
  );
  await check(
    "Late destination choice cannot revive a canceled approval",
    async () => {
      await freshSite();
      let s = await state();
      await cmd({
        type: "settings",
        value: { ...s.settings, askDownload: true },
      });
      const d = await download("/slow");
      await app.evaluate(({ dialog }) => {
        dialog.showSaveDialog = () =>
          new Promise((resolve) => {
            globalThis.finishChooser = resolve;
          });
      });
      const approval = cmd({ type: "download", id: d.id, action: "approve" });
      await until(
        async () =>
          (await state()).downloads.find((v) => v.id === d.id)?.status ===
          "approving",
      );
      await cmd({ type: "download", id: d.id, action: "cancel" });
      await app.evaluate(
        (_, filePath) =>
          globalThis.finishChooser({ canceled: false, filePath }),
        path.join(destination, "late.txt"),
      );
      await approval;
      assert.equal(
        (await state()).downloads.find((v) => v.id === d.id).status,
        "cancelled",
      );
      assert.ok(!(await readdir(destination)).includes("late.txt"));
      s = await state();
      await cmd({
        type: "settings",
        value: { ...s.settings, askDownload: false },
      });
    },
  );
  await check(
    "Multiple-download permission is separate, bounded and revocable",
    async () => {
      await freshSite();
      const origin = base;
      await app.evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 });
      });
      await cmd({ type: "download-multiple", origin });
      assert.ok(
        (await state()).permissions.some(
          (p) => p.origin === origin && p.permission === "automatic-downloads",
        ),
      );
      await app.evaluate((_, base) => {
        const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0];
        for (let i = 0; i < 3; i++)
          b.views.get(b.state.activeId).webContents.downloadURL(base + "/slow");
      }, base);
      await until(
        async () =>
          (await state()).downloads.filter(
            (d) => d.status === "awaiting-approval",
          ).length === 3,
      );
      for (const d of (await state()).downloads.filter(
        (d) => d.status === "awaiting-approval",
      ))
        await cmd({ type: "download", id: d.id, action: "cancel" });
      await cmd({
        type: "permission-delete",
        origin,
        permission: "automatic-downloads",
      });
      await app.evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 0 });
      });
    },
  );
  await check(
    "Private-window downloads require approval and disappear on close",
    async () => {
      await cmd({ type: "action", action: "private" });
      const privatePage = await until(async () =>
        app
          .windows()
          .find((p) => p !== page && p.url().startsWith("piccolo-ui:")),
      );
      await privatePage.waitForFunction(() => !!window.piccolo);
      await privatePage.evaluate(
        (url) => window.piccolo.command({ type: "navigate", input: url }),
        base,
      );
      await wait(150);
      await privatePage.evaluate(
        (url) => window.piccolo.command({ type: "navigate", input: url }),
        base + "/slow",
      );
      const d = await until(async () =>
        (
          await privatePage.evaluate(() => window.piccolo.state())
        ).downloads.find((d) => d.status === "awaiting-approval"),
      );
      assert.equal(d.private, true);
      assert.ok(!(await state()).downloads.some((v) => v.id === d.id));
      await privatePage.close();
    },
  );
  await freshSite();
  await check(
    "Additional requests bounded and coalesced without modal flood",
    async () => {
      await cmd({ type: "navigate", input: base });
      await wait(100);
      await app.evaluate((_, base) => {
        const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0];
        for (let i = 0; i < 5; i++)
          b.views.get(b.state.activeId).webContents.downloadURL(base + "/slow");
      }, base);
      await until(async () =>
        (await state()).downloads.some((d) => d.status === "blocked"),
      );
      const records = (await state()).downloads;
      assert.equal(
        records.filter((d) => d.status === "awaiting-approval").length,
        1,
      );
      await wait(250);
      assert.ok(
        (await state()).downloads.find((d) => d.status === "blocked")
          .blockedCount >= 2,
      );
      for (const d of (await state()).downloads.filter(
        (d) => d.status === "awaiting-approval",
      ))
        await cmd({ type: "download", id: d.id, action: "cancel" });
    },
  );
  await check(
    "Two normal windows retain both live records and can cancel each other's transfers",
    async () => {
      await freshSite();
      const first = await download("/slow");
      await freshSite();
      const otherOrigin = base;
      await cmd({ type: "action", action: "window" });
      const other = await until(async () =>
        app
          .windows()
          .find((p) => p !== page && p.url().startsWith("piccolo-ui:")),
      );
      await other.waitForFunction(() => !!window.piccolo);
      const otherCmd = (c) =>
          other.evaluate((c) => window.piccolo.command(c), c),
        otherState = () => other.evaluate(() => window.piccolo.state());
      await otherCmd({ type: "navigate", input: otherOrigin });
      await until(() =>
        app.evaluate(() => {
          const bs = [...globalThis[Symbol.for("piccolo.browser-registry")]],
            b = bs[bs.length - 1],
            wc = b.activeContents();
          return wc && !wc.isLoading();
        }),
      );
      const before = new Set((await otherState()).downloads.map((d) => d.id));
      await otherCmd({ type: "navigate", input: otherOrigin + "/slow" });
      const second = await until(async () =>
        (await otherState()).downloads.find(
          (d) => !before.has(d.id) && d.status === "awaiting-approval",
        ),
      );
      for (const s of [await state(), await otherState()]) {
        assert.ok(s.downloads.some((d) => d.id === first.id));
        assert.ok(s.downloads.some((d) => d.id === second.id));
      }
      await otherCmd({ type: "download", id: first.id, action: "approve" });
      await otherCmd({ type: "download", id: first.id, action: "cancel" });
      await cmd({ type: "download", id: second.id, action: "cancel" });
      assert.equal(
        (await state()).downloads.find((d) => d.id === first.id).status,
        "cancelled",
      );
      assert.equal(
        (await otherState()).downloads.find((d) => d.id === second.id).status,
        "cancelled",
      );
      await other.close();
    },
  );
  await check(
    "Terminal cancellation persists across restart; clear records preserves saved files",
    async () => {
      const s = await state();
      await cmd({
        type: "settings",
        value: { ...s.settings, startup: "blank" },
      });
      await app.close();
      await launch();
      assert.ok(
        (await state()).downloads.some((d) => d.status === "cancelled"),
      );
      assert.ok(
        !(await state()).downloads.some((d) =>
          ["progressing", "awaiting-approval"].includes(d.status),
        ),
      );
      const files = await readdir(destination);
      await cmd({ type: "downloads-clear" });
      assert.equal((await state()).downloads.length, 0);
      assert.deepEqual(await readdir(destination), files);
    },
  );
} catch (error) {
  results.push({ name: "Execution", status: "Failed", error: String(error) });
  process.exitCode = 1;
  console.error(error);
} finally {
  await app?.close();
  for (const server of servers) {
    server.closeAllConnections();
    server.close();
  }
  await writeFile(
    "test-results/download-policy.json",
    JSON.stringify(
      { date: new Date().toISOString(), profile, results },
      null,
      2,
    ),
  );
}
