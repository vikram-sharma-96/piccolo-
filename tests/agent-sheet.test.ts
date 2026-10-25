import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  unlink,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TaskSheets } from "../src/main/agent-sheet";
import { AgentEngine } from "../src/main/agent-engine";
import { z } from "zod";
import type { AgentProvider, AgentCapability } from "../src/shared/agent";
import {
  normalizeSheetRows,
  encodeSheet,
  parseCsv,
  writeSheetSchema,
} from "../src/shared/agent-sheet";
const rows = () =>
  normalizeSheetRows([
    {
      name: "Fixture",
      product: 'Text, voice "tools"\nsecond line',
      pricing: "$5/month",
      source_url: "https://example.com/pricing",
      status: "ok",
    },
  ]);
test("Cancel during final disk verification cannot revive a task as completed", async () => {
  let release!: () => void, ready!: () => void;
  const entered = new Promise<void>((resolve) => (ready = resolve)),
    blocked = new Promise<void>((resolve) => (release = resolve));
  const decisions = [
    {
      objective: "Verify fixture",
      capability: "check",
      arguments: {},
      plan: [],
    },
    {
      objective: "Finish fixture",
      capability: "finish",
      arguments: {},
      plan: [],
    },
  ];
  const provider: AgentProvider = {
    id: "unit-fixture",
    model: "fixture",
    text: true,
    vision: false,
    structured: true,
    streaming: false,
    audio: false,
    query: async () => JSON.stringify(decisions.shift()),
    close: async () => {},
  };
  const cap: AgentCapability = {
    id: "check",
    description: "fixture",
    schema: z.object({}).strict(),
    permission: "artifacts",
    consequential: false,
    verification: true,
    timeoutMs: 500,
    execute: async () => ({ verified: true }),
  };
  const engine = new AgentEngine(
    provider,
    [cap],
    "fixture",
    [],
    3,
    async () => {},
    async () => {
      ready();
      await blocked;
    },
  );
  const running = engine.run();
  await entered;
  await engine.cancel();
  release();
  await running;
  assert.equal(engine.task.status, "canceled");
  assert.equal(engine.task.artifacts.length, 0);
});
test("Large page context stays valid JSON and preserves the most recent unreachable observation", async () => {
  let prompt = "";
  const provider: AgentProvider = {
    id: "unit-fixture",
    model: "fixture",
    text: true,
    vision: false,
    structured: true,
    streaming: false,
    audio: false,
    query: async (text) => {
      prompt = text;
      return JSON.stringify({
        objective: "Stop fixture",
        capability: "finish",
        arguments: {},
        plan: [],
      });
    },
    close: async () => {},
  };
  const engine = new AgentEngine(
    provider,
    [],
    "fixture",
    [],
    2,
    async () => {},
  );
  for (let i = 0; i < 3; i++)
    engine.task.steps.push({
      id: randomUUID(),
      objective: "Observed fixture page",
      capability: "browser.observe",
      status: "succeeded",
      started: 1,
      permission: "tabs",
      verified: false,
      inputSummary: "fixture",
      result: {
        text: "Observed pricing $5/month. " + "x".repeat(30000),
        structure: [],
      },
    });
  engine.task.steps.push({
    id: randomUUID(),
    objective: "Observed failure",
    capability: "browser.observe",
    status: "succeeded",
    started: 1,
    permission: "tabs",
    verified: false,
    inputSummary: "fixture",
    result: {
      unreachable: true,
      text: "unknown",
      failureReason: "ERR_NAME_NOT_RESOLVED",
    },
  });
  await engine.run();
  const context = JSON.parse(prompt.slice(prompt.indexOf("\n") + 1));
  assert.ok(JSON.stringify(context).length <= 65000);
  assert.equal(context.history.at(-1).result.unreachable, true);
  assert.ok(context.history.some((step: any) => step.result?.truncated));
});
test("Task cannot bypass sheet verification with an unrelated successful check", async () => {
  const decisions = [
    {
      plan: [],
      objective: "Check other evidence",
      capability: "verify.other",
      arguments: {},
    },
    { plan: [], objective: "Finish", capability: "finish", arguments: {} },
  ];
  const provider: AgentProvider = {
    id: "unit-fixture",
    model: "fixture",
    text: true,
    vision: false,
    structured: true,
    streaming: false,
    audio: false,
    query: async () => JSON.stringify(decisions.shift()),
    close: async () => {},
  };
  const cap: AgentCapability = {
    id: "verify.other",
    schema: z.object({}).strict(),
    description: "fixture",
    permission: "artifacts",
    consequential: false,
    verification: true,
    timeoutMs: 500,
    execute: async () => ({ verified: true }),
  };
  const engine = new AgentEngine(
    provider,
    [cap],
    "fixture",
    [],
    3,
    async () => {},
  );
  engine.task.artifacts.push({
    id: randomUUID(),
    taskId: engine.task.id,
    mime: "text/csv",
    sha256: "fixture",
    created: 1,
    sources: [],
    verified: false,
    title: "Sheet",
    data: encodeSheet(rows()),
  });
  await engine.run();
  assert.equal(engine.task.status, "failed");
  assert.match(engine.task.error || "", /verify_sheet/);
});
test("Completion rechecks disk even after a prior matching sheet verification", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-sheet-finish-")),
    store = new TaskSheets(root),
    id = randomUUID(),
    file = id + ".csv",
    csv = encodeSheet(rows());
  let engine: AgentEngine;
  const decisions = [
    {
      plan: [],
      objective: "Verify disk",
      capability: "verify_sheet",
      arguments: {},
    },
    { plan: [], objective: "Finish", capability: "finish", arguments: {} },
  ];
  const provider: AgentProvider = {
    id: "unit-fixture",
    model: "fixture",
    text: true,
    vision: false,
    structured: true,
    streaming: false,
    audio: false,
    query: async () => {
      if (!decisions.length) throw Error("No decision");
      return JSON.stringify(decisions.shift());
    },
    close: async () => {},
  };
  const cap: AgentCapability = {
    id: "verify_sheet",
    schema: z.object({}).strict(),
    description: "fixture",
    permission: "artifacts",
    consequential: false,
    verification: true,
    timeoutMs: 500,
    execute: async () => {
      const result = await store.verify(engine.task.id, file, csv);
      engine.task.artifacts[0].verified = result.verified;
      await store.write(
        engine.task.id,
        file,
        csv.replace("$5/month", "$99/month"),
      );
      return { artifactId: id, ...result };
    },
  };
  engine = new AgentEngine(
    provider,
    [cap],
    "fixture",
    [],
    3,
    async () => {},
    async (task) => {
      if (!(await store.verify(task.id, file, csv)).verified)
        throw Error("Changed disk cells before completion");
    },
  );
  await store.write(engine.task.id, file, csv);
  engine.task.artifacts.push({
    id,
    taskId: engine.task.id,
    mime: "text/csv",
    sha256: "fixture",
    created: 1,
    sources: [],
    verified: false,
    title: "Sheet",
    data: csv,
    fileName: file,
  });
  await engine.run();
  assert.equal(engine.task.status, "failed");
  assert.match(engine.task.error || "", /Changed disk cells/);
});
test("write_sheet creates actual CSV and read-back verifies every header and data cell", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-sheet-")),
    store = new TaskSheets(root),
    task = randomUUID(),
    file = randomUUID() + ".csv",
    csv = encodeSheet(rows());
  const saved = await store.write(task, file, csv);
  assert.equal(await readFile(saved, "utf8"), csv);
  const result = await store.verify(task, file, csv);
  assert.equal(result.verified, true);
  assert.equal(result.matched, 10);
  assert.equal(result.mismatched, 0);
  assert.equal(result.missing, 0);
  assert.equal(parseCsv(csv)[1][1], rows()[0].product);
});
test("verify_sheet detects changed cells, extra cells and a missing file from disk", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-sheet-")),
    store = new TaskSheets(root),
    task = randomUUID(),
    file = randomUUID() + ".csv",
    csv = encodeSheet(rows()),
    saved = await store.write(task, file, csv);
  await writeFile(saved, csv.replace("$5/month", "$99/month"));
  let check = await store.verify(task, file, csv);
  assert.equal(check.verified, false);
  assert.equal(check.mismatched, 1);
  assert.equal(
    check.cells.find((cell) => cell.status === "mismatched")?.column,
    "pricing",
  );
  await writeFile(saved, csv + '"unexpected"\r\n');
  check = await store.verify(task, file, csv);
  assert.equal(check.verified, false);
  assert.equal(check.mismatched, 1);
  await unlink(saved);
  check = await store.verify(task, file, csv);
  assert.equal(check.missing, 10);
  assert.equal(check.verified, false);
});
test("sheet updates replace actual file and prior expected cells no longer pass", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-sheet-")),
    store = new TaskSheets(root),
    task = randomUUID(),
    file = randomUUID() + ".csv",
    before = encodeSheet(rows()),
    after = encodeSheet([
      { ...rows()[0], pricing: "unknown", status: "unknown" },
    ]);
  await store.write(task, file, before);
  await store.write(task, file, after);
  assert.equal((await store.verify(task, file, before)).verified, false);
  assert.equal((await store.verify(task, file, after)).verified, true);
});
test("missing and unreachable values are unknown; page formula text cannot execute as CSV formulas", () => {
  const normalized = normalizeSheetRows([
    {
      name: "Example",
      product: "",
      pricing: null,
      source_url: "https://example.com",
      status: "ok",
    },
    {
      name: "unknown",
      product: "invented",
      pricing: "invented",
      source_url: "https://unreachable.invalid",
      status: "unreachable",
    },
  ]);
  assert.equal(normalized[0].status, "unknown");
  assert.equal(
    normalizeSheetRows([
      {
        name: "Example",
        product: "Known product",
        pricing: "Annual $10; monthly rate unknown",
        source_url: "https://example.com",
        status: "ok",
      },
    ])[0].status,
    "unknown",
  );
  assert.equal(normalized[0].product, "unknown");
  assert.equal(normalized[1].pricing, "unknown");
  const csv = encodeSheet([{ ...rows()[0], name: "=1+1" }]);
  assert.equal(parseCsv(csv)[1][0], "'=1+1");
  assert.equal(
    writeSheetSchema.safeParse({ rows: [], fileName: "../../outside.csv" })
      .success,
    false,
  );
});
test("task sheets reject paths/links and retention keeps unrelated files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-sheet-")),
    store = new TaskSheets(root),
    task = randomUUID(),
    file = randomUUID() + ".csv";
  await assert.rejects(store.write(task, "../../outside.csv", "no"));
  await store.write(task, file, encodeSheet(rows()));
  await writeFile(path.join(root, task, "keep.txt"), "unrelated");
  await store.prune([]);
  assert.equal(
    await readFile(path.join(root, task, "keep.txt"), "utf8"),
    "unrelated",
  );
  const other = await mkdtemp(path.join(tmpdir(), "piccolo-sheet-outside-")),
    link = randomUUID();
  await symlink(other, path.join(root, link), "junction");
  await assert.rejects(store.write(link, file, "no"), /link/);
});
