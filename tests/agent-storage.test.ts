import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { AgentArchive } from "../src/main/agent-storage";
import { redactAgentText } from "../src/shared/agent";
import type { AgentTask } from "../src/shared/agent";
// Reversible fixture cipher tests persistence only. Actual Windows DPAPI is checked in Electron smoke tests.
const cipher = {
  encrypt: async (value: string) => Buffer.from("unit:" + value),
  decrypt: async (value: Buffer) => {
    const text = value.toString();
    if (!text.startsWith("unit:")) throw Error("Corrupt unit fixture");
    return text.slice(5);
  },
};
function task(data: string): AgentTask {
  const id = randomUUID();
  return {
    id,
    instruction: "fixture",
    provider: "unit-fixture",
    model: "fixture",
    status: "completed",
    created: 1,
    updated: 1,
    plan: [],
    steps: [],
    events: [],
    grants: [],
    capabilities: [],
    sources: [],
    calls: 1,
    maxCalls: 1,
    checkpoint: { next: 0, replay: false },
    artifacts: [
      {
        id: randomUUID(),
        taskId: id,
        mime: "text/plain",
        sha256: createHash("sha256").update(data).digest("hex"),
        created: 1,
        sources: [],
        verified: false,
        title: "Fixture",
        data,
      },
    ],
  };
}
test("Agent archive stores blobs separately and does not re-encrypt unchanged artifacts per checkpoint", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-agent-archive-"));
  let blobWrites = 0;
  const record = task("fixture blob ".repeat(1000));
  const archive = new AgentArchive(root, {
    ...cipher,
    encrypt: async (value) => {
      if (value === record.artifacts[0].data) blobWrites++;
      return cipher.encrypt(value);
    },
  });
  await archive.write([record]);
  await archive.write([record]);
  assert.equal(blobWrites, 1);
  const stored = await archive.read();
  assert.equal(stored[0].artifacts[0].data, "");
  assert.equal(
    (await archive.artifact(stored[0].artifacts[0])).data,
    record.artifacts[0].data,
  );
  assert.ok(
    !(await readFile(path.join(root, "tasks.bin"), "utf8")).includes(
      "fixture blob",
    ),
  );
});
test("Agent artifact corruption and path escapes fail closed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-agent-integrity-")),
    archive = new AgentArchive(root, cipher),
    record = task("original");
  await archive.write([record]);
  await writeFile(
    path.join(root, "artifacts", record.artifacts[0].id + ".bin"),
    "unit:changed",
  );
  await assert.rejects(
    archive.artifact((await archive.read())[0].artifacts[0]),
    /hash/,
  );
  record.artifacts[0].id = "../outside";
  await assert.rejects(archive.write([record]));
});
test("Failed checkpoint write preserves the previous committed task metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-agent-atomic-"));
  let fail = false;
  const archive = new AgentArchive(root, {
      ...cipher,
      encrypt: async (value) => {
        if (fail && value.startsWith("["))
          throw Error("Controlled encryption failure");
        return cipher.encrypt(value);
      },
    }),
    before = task("before"),
    after = task("after");
  await archive.write([before]);
  fail = true;
  await assert.rejects(archive.write([after]), /Controlled/);
  assert.equal((await archive.read())[0].id, before.id);
});
test("Retention deletes only unreferenced owned blobs and clear preserves unrelated files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-agent-retention-")),
    archive = new AgentArchive(root, cipher),
    first = task("first"),
    second = task("second");
  await archive.write([first, second]);
  await archive.write([second]);
  await assert.rejects(
    access(path.join(root, "artifacts", first.artifacts[0].id + ".bin")),
  );
  await writeFile(path.join(root, "keep.txt"), "unrelated");
  await archive.clear();
  assert.equal(
    await readFile(path.join(root, "keep.txt"), "utf8"),
    "unrelated",
  );
  assert.deepEqual(await archive.read(), []);
});
test("Recognizable secrets are redacted without changing ordinary text", () => {
  const key = "sk-" + "x".repeat(30);
  assert.ok(!redactAgentText("key " + key).includes(key));
  assert.equal(
    redactAgentText("password='fixture-secret'"),
    "password='[REDACTED]'",
  );
  assert.equal(redactAgentText("Answer 43"), "Answer 43");
});
