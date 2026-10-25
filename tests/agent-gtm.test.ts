import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { gtmBrief, verifyGtmBrief } from "../src/shared/agent-gtm";
import { writeGtmDocuments } from "../src/main/agent-gtm";
import { TaskSheets } from "../src/main/agent-sheet";
import { AdalProvider } from "../src/main/agent-adal";
import { AgentEngine } from "../src/main/agent-engine";
import type { AgentProvider } from "../src/shared/agent";
const observation = {
  tabId: "fixture-tab",
  title: "Fixture competitor",
  url: "https://example.com/competitor",
  text: "An AI browser. Pro $9 per month.",
};
const input = {
  competitors: [
    {
      tabId: "fixture-tab",
      positioning: "An AI browser.",
      pricing: "Pro $9 per month.",
      targetAudience: "unknown",
    },
  ],
  proposedPositioning: "A proposed Piccolo launch angle.",
  launchPost: "Piccolo launch draft.",
  emailDraft: "Piccolo email draft.",
};
test("GTM every competitor claim links to its observed source and missing links fail verification", () => {
  const brief = gtmBrief(input, [observation]);
  assert.equal(verifyGtmBrief(brief.text, brief.claims).verified, true);
  assert.equal(verifyGtmBrief(brief.text, brief.claims).unknown, 1);
  const broken = brief.text.replace(
    "([source](<https://example.com/competitor>))",
    "",
  );
  assert.equal(verifyGtmBrief(broken, brief.claims).verified, false);
  assert.equal(verifyGtmBrief(broken, brief.claims).missingSources.length, 1);
  assert.throws(
    () =>
      gtmBrief(
        {
          ...input,
          competitors: [
            { ...input.competitors[0], pricing: "Invented price $99" },
          ],
        },
        [observation],
      ),
    /not visibly quoted/,
  );
});
test("Unavailable source fields become explicit linked unknowns, not guesses", () => {
  const brief = gtmBrief(input, [{ ...observation, unreachable: true }]);
  assert.equal(
    brief.claims.filter((claim) => claim.value === "unknown").length,
    3,
  );
  assert.equal(verifyGtmBrief(brief.text, brief.claims).verified, true);
  assert.throws(() => gtmBrief(input, []), /Missing/);
});
test("Native approval denial prevents all GTM disk writes; approved drafts write only owned Markdown files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-gtm-")),
    store = new TaskSheets(root),
    task = randomUUID(),
    docs = [{ role: "launch-post" as const, text: "DRAFT. Nothing sent." }];
  let approvals = 0;
  await assert.rejects(
    writeGtmDocuments(
      task,
      docs,
      store,
      async () => {
        approvals++;
        throw Error("Denied native approval");
      },
      new AbortController().signal,
    ),
    /Denied/,
  );
  assert.equal(approvals, 1);
  assert.deepEqual(await readdir(root), []);
  const artifacts = await writeGtmDocuments(
    task,
    docs,
    store,
    async () => {
      approvals++;
    },
    new AbortController().signal,
  );
  assert.equal(approvals, 2);
  assert.equal(
    await readFile(path.join(root, task, artifacts[0].fileName!), "utf8"),
    "DRAFT. Nothing sent.",
  );
  await store.prune([]);
  assert.deepEqual(await readdir(root), []);
});
test("Image callback permits only the exact once-approved generation; send/publish and changed arguments stay denied", () => {
  const adapter: any = new AdalProvider("", "unused-unit-fixture"),
    frames: any[] = [];
  adapter.send = (frame: any) => frames.push(frame);
  adapter.imageRequest = {
    prompt: "Piccolo launch banner",
    model: "fixture-model",
    file: "C:/fixture/banner.png",
  };
  const args = {
    prompt: "Piccolo launch banner",
    model_name: "fixture-model",
    path_to_save: "C:/fixture/banner.png",
    aspect_ratio: "16:9",
    image_size: "1K",
    n: 1,
  };
  adapter.frame({
    type: "control_request",
    request_id: "bad",
    request: { subtype: "can_use_tool", tool_name: "send_email", input: args },
  });
  assert.equal(frames.at(-1).response.behavior, "deny");
  adapter.frame({
    type: "control_request",
    request_id: "path",
    request: {
      subtype: "can_use_tool",
      tool_name: "generate_image",
      input: { ...args, path_to_save: "C:/outside.png" },
    },
  });
  assert.equal(frames.at(-1).response.behavior, "deny");
  adapter.frame({
    type: "control_request",
    request_id: "ok",
    request: {
      subtype: "can_use_tool",
      tool_name: "generate_image",
      input: args,
    },
  });
  assert.equal(frames.at(-1).response.behavior, "allow");
  adapter.frame({
    type: "control_request",
    request_id: "again",
    request: {
      subtype: "can_use_tool",
      tool_name: "generate_image",
      input: args,
    },
  });
  assert.equal(frames.at(-1).response.behavior, "deny");
});
test("Publishing and sending cannot be performed by a draft-only GTM capability registry", async () => {
  for (const capability of ["send_email", "publish_post"]) {
    const provider: AgentProvider = {
      id: "unit-fixture",
      model: "fixture",
      text: true,
      vision: false,
      structured: true,
      streaming: false,
      audio: false,
      query: async () =>
        JSON.stringify({
          objective: "Forbidden external action fixture",
          capability,
          arguments: {},
          plan: [],
        }),
      close: async () => {},
    };
    const engine = new AgentEngine(
      provider,
      [],
      "draft-only fixture",
      [],
      1,
      async () => {},
    );
    await engine.run();
    assert.equal(engine.task.status, "failed");
    assert.equal(engine.task.steps[0].status, "skipped");
    assert.equal(engine.task.artifacts.length, 0);
  }
});
