import { test } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
test("real SQLite worker persists state, deduplicates recent visits, deletes by range and reopens", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "piccolo-db-test-"));
  let worker: Worker;
  let id = 0;
  const open = () => {
    worker = new Worker(path.resolve("src/main/database-worker.ts"), {
      workerData: { path: path.join(dir, "test.sqlite") },
    });
  };
  const call = (op: string, ...args: unknown[]) =>
    new Promise<any>((resolve, reject) => {
      const serial = ++id;
      const onMessage = (message: any) => {
        if (message.id !== serial) return;
        worker.off("message", onMessage);
        worker.off("error", reject);
        message.error ? reject(Error(message.error)) : resolve(message.result);
      };
      worker.on("message", onMessage);
      worker.once("error", reject);
      worker.postMessage({ id: serial, op, args });
    });
  open();
  try {
    await call("set", "settings", { theme: "light" });
    await call("visit", "https://example.com/", "First");
    await call("visit", "https://example.com/", "Updated title");
    let visits = await call("history", "example");
    assert.equal(visits.length, 1);
    assert.equal(visits[0].title, "Updated title");
    await call("visit", "https://example.org/", "Other");
    await call("delete", visits[0].id);
    assert.equal((await call("history", "example.com")).length, 0);
    await call("close");
    await worker!.terminate();
    open();
    assert.equal(
      JSON.parse((await call("get", "settings")).value).theme,
      "light",
    );
    assert.equal((await call("history", "Other")).length, 1);
    await call("clear", 0);
    assert.equal((await call("history", "")).length, 0);
    await call("close");
  } finally {
    await worker!.terminate();
    const cleanupTarget = path.resolve(dir);
    assert.ok(
      cleanupTarget.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(cleanupTarget).startsWith("piccolo-db-test-"),
    );
    await rm(cleanupTarget, { recursive: true, force: true });
  }
});
