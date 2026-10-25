import { _electron as electron } from "playwright";
import { mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const profile = path.resolve("test-results/gtm-live-" + Date.now());
await mkdir(profile, { recursive: true });
const env = { ...process.env, PICCOLO_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
const urls = [
  "https://www.perplexity.ai/comet",
  "https://www.opera.com/neon",
  "https://www.diabrowser.com",
];
let app, page;
const results = [],
  approvals = [];
const command = (c) => page.evaluate((c) => window.piccolo.command(c), c);
try {
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  await page.waitForFunction(() => window.piccolo);
  await app.evaluate(({ dialog }) => {
    globalThis.gtmNativeApprovals = [];
    dialog.showMessageBox = async (_window, options) => {
      globalThis.gtmNativeApprovals.push({
        message: options.message,
        buttons: options.buttons,
      });
      return {
        response: options.buttons?.includes("Trust browser control")
          ? options.buttons.indexOf("Trust browser control")
          : 1,
      };
    };
  });
  await command({ type: "new-tab", url: "piccolo://agents" });
  await command({ type: "agent", action: "connect" });
  const connected = await command({ type: "agent", action: "status" });
  assert.equal(
    connected.connected,
    true,
    "Stop: real Piccolo Agent MCP is not connected.",
  );
  const tabs = [];
  for (const url of urls) {
    await command({ type: "new-tab", url });
    const state = await page.evaluate(() => window.piccolo.state());
    tabs.push(state.activeId);
    await page
      .waitForFunction(
        (id) =>
          window.piccolo
            .state()
            .then((state) => !state.tabs.find((tab) => tab.id === id)?.loading),
        state.activeId,
        { timeout: 45000 },
      )
      .catch(() => {});
  }
  const state = await page.evaluate(() => window.piccolo.state());
  await command({
    type: "tab",
    action: "activate",
    id: state.tabs.find((tab) => tab.url === "piccolo://agents").id,
  });
  const instruction =
    'Create a draft-only GTM launch kit for Piccolo, an existing Windows browser connecting Browser, Code and Agent with scoped permissions, explicit native approvals and recorded verification. Proposed audience: researchers and developers. Launch message: Browse. Build. Verify. Do not claim benchmarks, public availability, pricing, security superiority, general extension parity, or a download URL. First use generate_launch_banner exactly once to confirm the actually configured image provider; use prompt: "Create a polished 16:9 launch banner for Piccolo. Dark navy background, restrained lavender and cream typography. Exact headline Piccolo. Subheading Browse. Build. Verify. Small line Browser · Code · Agent. Abstract calm browser-tab forms, no screenshots, no competitor logos or claims. Refined desktop-software identity, readable text, no additional slogans." If image generation fails, stop; no fallback. Then observe only the three attached competitor pages, once each. Extract positioning, pricing and target audience as SHORT EXACT VISIBLE EXCERPTS, or literal unknown if not visible. Do not use prior knowledge or the user descriptions about competitor prices. Do not infer free, premium, or a target audience from imagery. Use write_gtm for all three competitors, a proposed own-product positioning angle, one concise launch post, and a short email draft with subject line. Drafts must mention Piccolo only, with no competitor comparisons or external-action claims. Use verify_gtm to reopen all four files, validate source links/unknowns/image dimensions, then finish only on pass. Never send or publish.';
  const { taskId } = await command({
    type: "agent",
    action: "start",
    value: { instruction, tabs, edit: true, workflow: "gtm", maxCalls: 18 },
  });
  let task;
  for (let i = 0; i < 490; i++) {
    const status = await command({ type: "agent", action: "status" });
    task = status.tasks.find((task) => task.id === taskId);
    if (
      ["completed", "failed", "canceled", "interrupted"].includes(
        task?.status,
      ) &&
      !status.cleaningUp
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  approvals.push(...(await app.evaluate(() => globalThis.gtmNativeApprovals)));
  await writeFile(
    path.join(profile, "task.json"),
    JSON.stringify(task, null, 2),
  );
  assert.equal(
    task.status,
    "completed",
    task.error +
      " " +
      JSON.stringify(
        task.steps.map((step) => ({
          capability: step.capability,
          error: step.error,
        })),
      ),
  );
  const roles = [
    "positioning-brief",
    "launch-post",
    "email-draft",
    "launch-banner",
  ];
  for (const role of roles) {
    const artifact = task.artifacts.find((artifact) => artifact.role === role);
    assert.ok(artifact?.verified, role + " must be verified");
    await copyFile(
      path.join(profile, "agent/tasks", taskId, artifact.fileName),
      path.join(profile, artifact.title),
    );
  }
  const check = task.steps.findLast((step) => step.capability === "verify_gtm");
  assert.equal(check.result.verified, true);
  assert.ok(
    check.result.checks.find((check) => check.role === "launch-banner").width >
      0,
  );
  assert.ok(
    approvals.some((approval) =>
      approval.message.includes("Generate one launch banner image"),
    ),
  );
  assert.ok(
    approvals.some((approval) =>
      approval.message.includes("Write GTM draft files"),
    ),
  );
  const final = await page.evaluate(() => window.piccolo.state());
  await command({
    type: "tab",
    action: "activate",
    id: final.tabs.find((tab) => tab.url === "piccolo://agents").id,
  });
  await page.screenshot({ path: path.join(profile, "gtm-complete.png") });
  results.push({
    name: "Real in-app AdaL GTM: configured banner generation, attached-only competitor observations, linked Markdown drafts, native approvals and disk verification",
    status: "Passed",
  });
  console.log("PASS actual GTM workflow");
} catch (error) {
  console.error(error);
  results.push({ status: "Failed", error: String(error), stack: error.stack });
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => {});
  await writeFile(
    path.join(profile, "report.json"),
    JSON.stringify(
      { profile, urls, results, approvals, date: new Date().toISOString() },
      null,
      2,
    ),
  );
  await writeFile(
    "test-results/gtm-live-latest.json",
    JSON.stringify({ profile, results }, null, 2),
  );
  console.log("Evidence " + profile);
}
