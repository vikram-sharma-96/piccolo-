import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { AgentEngine } from "../src/main/agent-engine";
import { AdalProvider } from "../src/main/agent-adal";
import {
  parseAgentDecision,
  type AgentProvider,
  type AgentCapability,
} from "../src/shared/agent";
function provider(decisions: unknown[]): AgentProvider {
  return {
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
}
const proposal = (capability: string, args: unknown = {}) => ({
  objective: "Unit fixture operation",
  capability,
  arguments: args,
  plan: [],
});
const verify: AgentCapability = {
  id: "verify",
  description: "fixture verification",
  schema: z.object({}).strict(),
  permission: "tabs",
  consequential: false,
  verification: true,
  timeoutMs: 500,
  execute: async () => ({ verified: true, observed: "fixture" }),
};
test("Independent verification does not hide an unresolved failed capability", async () => {
  const engine = new AgentEngine(
    provider([proposal("edit"), proposal("verify"), proposal("finish")]),
    [
      {
        ...verify,
        id: "edit",
        verification: false,
        execute: async () => {
          throw Error("Controlled write failure");
        },
      },
      verify,
    ],
    "fixture",
    [],
    5,
    async () => {},
  );
  await engine.run();
  assert.equal(engine.task.status, "failed");
  assert.match(engine.task.error || "", /Unresolved failed steps/);
  assert.equal(engine.task.artifacts.length, 0);
});
test("Agent cannot claim completion without an actual verification capability", async () => {
  const engine = new AgentEngine(
    provider([proposal("finish", { summary: "done" })]),
    [],
    "fixture",
    [],
    3,
    async () => {},
  );
  await engine.run();
  assert.equal(engine.task.status, "failed");
  assert.equal(engine.task.artifacts.length, 0);
});
test("Agent records observed verification and completion artifact with provenance", async () => {
  const engine = new AgentEngine(
    provider([
      proposal("verify"),
      proposal("finish", { summary: "verified fixture" }),
    ]),
    [verify],
    "fixture",
    [{ kind: "tab", id: "fixture", title: "test" }],
    3,
    async () => {},
  );
  await engine.run();
  assert.equal(engine.task.status, "completed");
  assert.equal(engine.task.steps[0].verified, true);
  assert.equal(engine.task.artifacts[0].sources[0].id, "fixture");
  assert.match(engine.task.artifacts[0].data, /verified fixture/);
});
test("Unknown capability never executes or becomes authorized by a provider answer", async () => {
  let ran = false;
  const engine = new AgentEngine(
    provider([proposal("shell")]),
    [
      {
        ...verify,
        execute: async () => {
          ran = true;
        },
      },
    ],
    "fixture",
    [],
    3,
    async () => {},
  );
  await engine.run();
  assert.equal(engine.task.status, "failed");
  assert.equal(ran, false);
  assert.equal(engine.task.steps[0].status, "skipped");
  assert.match(engine.task.steps[0].error || "", /no operation was executed/);
});
test("Capability schemas reject unknown or malformed arguments before side effects", async () => {
  let ran = false;
  const engine = new AgentEngine(
    provider([proposal("verify", { extra: "not allowed" })]),
    [
      {
        ...verify,
        execute: async () => {
          ran = true;
        },
      },
    ],
    "fixture",
    [],
    3,
    async () => {},
  );
  await engine.run();
  assert.equal(engine.task.status, "failed");
  assert.equal(ran, false);
});
test("Repeated ineffective actions stop before a third identical invocation", async () => {
  let ran = 0;
  const engine = new AgentEngine(
    provider(Array.from({ length: 4 }, () => proposal("verify"))),
    [
      {
        ...verify,
        execute: async () => {
          ran++;
          throw Error("Controlled fixture failure");
        },
      },
    ],
    "fixture",
    [],
    6,
    async () => {},
  );
  await engine.run();
  assert.equal(ran, 2);
  assert.equal(engine.task.status, "failed");
  assert.match(engine.task.error || "", /Repeated/);
});
test("Call budget keeps partial work and never fabricates completion", async () => {
  const engine = new AgentEngine(
    provider([proposal("verify")]),
    [verify],
    "fixture",
    [],
    1,
    async () => {},
  );
  await engine.run();
  assert.equal(engine.task.status, "failed");
  assert.equal(engine.task.steps[0].status, "succeeded");
  assert.match(engine.task.error || "", /budget/);
});
test("Cancellation reaches an active operation and records a terminal state", async () => {
  let started!: () => void;
  const gate = new Promise<void>((r) => (started = r));
  const engine = new AgentEngine(
    provider([proposal("verify")]),
    [
      {
        ...verify,
        execute: async (_a, signal) =>
          new Promise((_resolve, reject) => {
            started();
            signal.addEventListener(
              "abort",
              () => reject(Error("fixture canceled")),
              { once: true },
            );
          }),
      },
    ],
    "fixture",
    [],
    3,
    async () => {},
  );
  const running = engine.run();
  await gate;
  await engine.cancel();
  await running;
  assert.equal(engine.task.status, "canceled");
  assert.equal(engine.task.steps[0].status, "canceled");
  assert.equal(engine.task.checkpoint.replay, false);
});
test("Strict decision parser excludes hidden reasoning or extra privileged fields", () => {
  assert.throws(() =>
    parseAgentDecision(
      JSON.stringify({ ...proposal("verify"), reasoning: "private reasoning" }),
    ),
  );
  assert.throws(() => parseAgentDecision("not JSON"));
});
test("Rapid pause/resume waits for an interrupted operation to settle before replanning", async () => {
  let begin!: () => void;
  const started = new Promise<void>((r) => (begin = r));
  let count = 0;
  const engine = new AgentEngine(
    provider([
      proposal("verify"),
      proposal("verify"),
      proposal("finish", { summary: "resumed" }),
    ]),
    [
      {
        ...verify,
        execute: async (_a, signal) => {
          if (++count === 1)
            return new Promise((_resolve, reject) => {
              begin();
              signal.addEventListener(
                "abort",
                () => setTimeout(() => reject(Error("fixture canceled")), 20),
                { once: true },
              );
            });
          return { verified: true };
        },
      },
    ],
    "fixture",
    [],
    4,
    async () => {},
  );
  const running = engine.run();
  await started;
  await engine.pause();
  await engine.resume();
  await running;
  assert.equal(engine.task.status, "completed");
  assert.equal(engine.task.steps[0].status, "canceled");
  assert.equal(engine.task.steps[1].status, "succeeded");
});
test("Changed observations permit repeated reads without being treated as ineffective actions", async () => {
  let reads = 0;
  const engine = new AgentEngine(
    provider([
      ...Array.from({ length: 4 }, () => proposal("verify")),
      proposal("finish", { summary: "changed data verified" }),
    ]),
    [{ ...verify, execute: async () => ({ verified: true, value: ++reads }) }],
    "fixture",
    [],
    6,
    async () => {},
  );
  await engine.run();
  assert.equal(reads, 4);
  assert.equal(engine.task.status, "completed");
});
test("AdaL protocol denies all direct tool callbacks and discards private thought events", () => {
  const adapter = new AdalProvider("", "unused-unit-fixture") as any;
  const frames: any[] = [];
  adapter.send = (frame: any) => frames.push(frame);
  adapter.frame({
    type: "control_request",
    request_id: "fixture",
    request: {
      subtype: "can_use_tool",
      tool_name: "read_file",
      input: { file_path: "unattached-fixture" },
    },
  });
  assert.equal(frames[0].response.behavior, "deny");
  adapter.active = {
    text: "operational output",
    cleanup: () => {},
    resolve: () => {},
    reject: () => {},
  };
  adapter.frame({
    type: "thought.delta",
    content: "private fixture reasoning",
  });
  assert.equal(adapter.active.text, "operational output");
});
