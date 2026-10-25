import { _electron as electron } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import { processTree } from "./agent-metrics.mjs";
const profile = path.resolve("test-results/agent-recovery-" + Date.now());
await mkdir(profile, { recursive: true });
const env = { ...process.env, PICCOLO_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const results = [];
const launch = () =>
  electron.launch({
    ...(process.env.PICCOLO_EXE
      ? { executablePath: process.env.PICCOLO_EXE, args: [] }
      : { args: ["."] }),
    env,
  });
const data = "Retained checkpoint fixture",
  id = randomUUID(),
  artifactId = randomUUID();
try {
  app = await launch();
  let page = await app.firstWindow();
  await page.waitForFunction(() => window.piccolo);
  // Seed a deterministic interrupted checkpoint with the real OS encryption facility.
  // This tests restart recovery, not OS crash cleanup or model behavior.
  await app.evaluate(
    async ({ app, safeStorage }, { profile, id, artifactId, data }) => {
      const fs = process.getBuiltinModule("fs/promises"),
        path = process.getBuiltinModule("path"),
        crypto = process.getBuiltinModule("crypto");
      const root = path.join(profile, "agent");
      await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
      const task = {
        id,
        provider: "recovery-fixture",
        model: "fixture",
        instruction: "Interrupted checkpoint fixture",
        status: "acting",
        created: Date.now(),
        updated: Date.now(),
        plan: ["Review checkpoint"],
        steps: [],
        events: [],
        sources: [],
        capabilities: [],
        grants: [
          {
            id: crypto.randomUUID(),
            scope: "provider",
            resources: ["fixture"],
            revoked: false,
          },
        ],
        calls: 1,
        maxCalls: 4,
        checkpoint: { next: 0, replay: false },
        artifacts: [
          {
            id: artifactId,
            taskId: id,
            title: "Checkpoint fixture",
            mime: "text/plain",
            sha256: crypto.createHash("sha256").update(data).digest("hex"),
            data: "",
            created: Date.now(),
            sources: [],
            verified: false,
          },
        ],
      };
      await fs.writeFile(
        path.join(root, "artifacts", artifactId + ".bin"),
        await safeStorage.encryptStringAsync(data),
      );
      await fs.writeFile(
        path.join(root, "tasks.bin"),
        await safeStorage.encryptStringAsync(JSON.stringify([task])),
      );
    },
    { profile, id, artifactId, data },
  );
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.waitForFunction(() => window.piccolo);
  await page.evaluate(() =>
    window.piccolo.command({ type: "new-tab", url: "piccolo://agents" }),
  );
  const status = await page.evaluate(() =>
    window.piccolo.command({ type: "agent", action: "status" }),
  );
  assert.equal(status.tasks[0].status, "interrupted");
  assert.ok(status.tasks[0].grants.every((g) => g.revoked));
  assert.equal(status.active, undefined);
  assert.ok(!(await processTree(app)).some((p) => /bun/i.test(p.name)));
  const artifact = await page.evaluate(
    (artifactId) =>
      window.piccolo.command({
        type: "agent",
        action: "artifact",
        value: artifactId,
      }),
    artifactId,
  );
  assert.equal(artifact.data, data);
  assert.equal(
    artifact.sha256,
    createHash("sha256").update(data).digest("hex"),
  );
  results.push({
    name: "Restart marks checkpoint interrupted, revokes old grants, retains encrypted artifact and starts no provider",
    status: "Passed",
  });
  await writeFile(path.join(profile, "agent", "keep.txt"), "unrelated");
  await page.evaluate(() =>
    window.piccolo.command({ type: "agent", action: "delete" }),
  );
  assert.equal(
    await readFile(path.join(profile, "agent", "keep.txt"), "utf8"),
    "unrelated",
  );
  assert.equal(
    (
      await page.evaluate(() =>
        window.piccolo.command({ type: "agent", action: "status" }),
      )
    ).tasks.length,
    0,
  );
  results.push({
    name: "Clear history deletes owned records and preserves unrelated files",
    status: "Passed",
  });
  console.log("PASS agent recovery and deletion");
} catch (error) {
  results.push({ status: "Failed", error: String(error), stack: error.stack });
  console.error(error);
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => {});
  await writeFile(
    path.join(profile, "report.json"),
    JSON.stringify({ profile, results }, null, 2),
  );
  console.log("Evidence", profile);
}
