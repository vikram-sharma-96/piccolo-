import { app, protocol, session } from "electron";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { Browser, browsers } from "../src/main/browser";
import { Store } from "../src/main/store";
import { settingsSchema } from "../src/shared/model";
async function run() {
  const profile = mkdtempSync(path.join(tmpdir(), "piccolo-lifecycle-"));
  app.setPath("userData", profile);
  // Without this listener Electron quits when the last window closes, which
  // silently ended the process (exit 0) before results were written.
  app.on("window-all-closed", () => {});
  protocol.registerSchemesAsPrivileged([
    { scheme: "piccolo-ui", privileges: { standard: true, secure: true } },
  ]);
  await mkdir("test-results", { recursive: true });
  const results: string[] = [];
  let store: Store;
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("<title>Lifecycle fixture</title><h1>Lifecycle fixture</h1>");
  });
  async function wait(condition: () => boolean) {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error("Lifecycle timeout");
  }
  await app.whenReady();
  session.fromPartition("piccolo-ui").protocol.handle(
    "piccolo-ui",
    () =>
      new Response("<title>Lifecycle UI fixture</title>", {
        headers: { "content-type": "text/html" },
      }),
  );
  try {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    store = new Store(path.join(profile, "test.sqlite"));
    const b = new Browser(store, settingsSchema.parse({}), [], [], []);
    b.newTab(base + "/one");
    await wait(
      () => b.active().title === "Lifecycle fixture" && !b.active().loading,
    );
    const first = b.active();
    b.newTab(base + "/two");
    await wait(
      () => b.active().title === "Lifecycle fixture" && !b.active().loading,
    );
    assert.equal(b.views.get(first.id)!.webContents.isBeingCaptured(), false);
    b.agentTasks = 1;
    b.discard(first);
    assert.equal(first.discarded, false);
    assert.ok(b.views.has(first.id));
    results.push("Approved MCP task protects inactive tab from sleeping");
    b.agentTasks = 0;
    b.discard(first);
    assert.equal(first.discarded, true);
    assert.equal(b.views.has(first.id), false);
    results.push("Actual inactive tab destruction without CDP capture");
    b.activate(first.id);
    await wait(() => first.title === "Lifecycle fixture" && !first.loading);
    assert.equal(first.discarded, false);
    assert.ok(b.views.has(first.id));
    results.push("Discarded tab reloaded and restored");
    b.views.get(first.id)!.webContents.forcefullyCrashRenderer();
    await wait(() => !!first.error);
    assert.match(first.error, /stopped/);
    await b.command({ type: "action", action: "reload" });
    await wait(() => !first.error && !first.loading);
    results.push("Real renderer crash and reload recovery");
    const count = b.state.tabs.length;
    const ids = [...b.views.values()].map((v) => v.webContents.id);
    for (const t of [...b.state.tabs]) if (t.id !== first.id) b.closeTab(t.id);
    assert.equal(b.state.tabs.length, 1);
    assert.equal(b.views.size, 1);
    results.push("Closed tab WebContents removed");
    await b.persistSession();
    b.win.close();
    await new Promise((r) => setTimeout(r, 100));
    const snapshot = await store.get<any[]>("last-session", []);
    assert.equal(snapshot.length, 1);
    assert.equal(snapshot[0].url, base + "/one");
    results.push("Last-window close saves session snapshot");
    await store.close();
    await assert.rejects(store.call("get", "x"));
    results.push("Closed database rejects further operations");
    await writeFile(
      "test-results/lifecycle.json",
      JSON.stringify(
        { passed: true, results, initialTabCount: count, webContentsIds: ids },
        null,
        2,
      ),
    );
    console.log(results.join("\n"));
    app.exit(0);
  } catch (error) {
    console.error(error);
    await writeFile(
      "test-results/lifecycle.json",
      JSON.stringify({ passed: false, results, error: String(error) }, null, 2),
    );
    app.exit(1);
  } finally {
    server.close();
  }
}
void run();
