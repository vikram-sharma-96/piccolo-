import { _electron as electron } from "playwright";
import { mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const profile = path.resolve("test-results/sheet-live-" + Date.now());
await mkdir(profile, { recursive: true });
const env = { ...process.env, PICCOLO_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
const urls = [
  "https://elevenlabs.io/pricing",
  "https://otter.ai/pricing",
  "https://fireflies.ai/pricing",
  "https://piccolo-unreachable.invalid/pricing",
];
let app, page;
const results = [];
const command = (c) => page.evaluate((c) => window.piccolo.command(c), c);
try {
  app = await electron.launch({
    ...(process.env.PICCOLO_EXE
      ? { executablePath: process.env.PICCOLO_EXE, args: [] }
      : { args: ["."] }),
    env,
  });
  page = await app.firstWindow();
  await page.waitForFunction(() => window.piccolo);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_window, options) => ({
      response: options.buttons?.includes("Trust browser control")
        ? options.buttons.indexOf("Trust browser control")
        : 1,
    });
  });
  const tabs = [];
  for (const url of urls) {
    await command({ type: "new-tab", url });
    const state = await page.evaluate(() => window.piccolo.state());
    const id = state.activeId;
    tabs.push(id);
    await page
      .waitForFunction(
        (id) =>
          window.piccolo
            .state()
            .then((state) => !state.tabs.find((tab) => tab.id === id)?.loading),
        id,
        { timeout: 45000 },
      )
      .catch(() => {});
  }
  await command({ type: "new-tab", url: "piccolo://agents" });
  await command({ type: "agent", action: "connect" });
  const instruction =
    "Research 3 AI startups: product and pricing. Use only the four explicitly attached real pages: ElevenLabs, Otter, Fireflies plus one deliberately unreachable URL. Observe all four once with browser.observe. Do not use prior knowledge or guess. Extract one brief product description (under 30 words) and precisely ONE plan per startup: ElevenLabs Pro, Otter Basic, Fireflies Pro. Use the actual visible price/currency symbol and billing basis; never assume an ISO currency, infer a crossed-out price, or describe annual per-month rates as monthly billing. For Otter Basic, report only the visible Free price (Basic: Free); do not add a forever guarantee, which the source does not establish. Do not add other plans, terms, guarantees or promotional claims. Missing values must be unknown. Write one CSV with write_sheet, exactly four rows, columns name/product/pricing/source_url/status. Use actual observed URLs; fourth row name unknown, product unknown, pricing unknown, status unreachable when a navigation failure is observed. Mark partial/unreadable real pages unknown. Do not navigate elsewhere, interact with controls or run shell commands. Reopen and compare every cell with verify_sheet; finish only after it passes. No generic verify.artifact for CSV.";
  const { taskId } = await command({
    type: "agent",
    action: "start",
    value: { instruction, tabs, edit: true, maxCalls: 16 },
  });
  let task;
  for (let i = 0; i < 480; i++) {
    const state = await command({ type: "agent", action: "status" });
    task = state.tasks.find((task) => task.id === taskId);
    if (
      ["completed", "failed", "canceled", "interrupted"].includes(
        task?.status,
      ) &&
      !state.cleaningUp
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
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
  const sheet = task.artifacts.find((artifact) => artifact.mime === "text/csv");
  assert.ok(sheet?.verified);
  const check = task.steps.findLast(
    (step) => step.capability === "verify_sheet",
  );
  assert.equal(check.result.verified, true);
  assert.equal(check.result.matched, 25);
  assert.equal(check.result.mismatched, 0);
  assert.equal(check.result.missing, 0);
  const csv = await readFile(
    path.join(profile, "agent/tasks", taskId, sheet.fileName),
    "utf8",
  );
  assert.match(csv, /'?unknown/);
  assert.match(csv, /unreachable/);
  assert.equal(
    task.steps.filter(
      (step) =>
        step.capability === "browser.observe" && step.status === "succeeded",
    ).length,
    4,
  );
  const observed = task.steps
    .filter((step) => step.capability === "browser.observe")
    .map((step) => ({
      url: step.result?.url,
      unreachable: step.result?.unreachable,
      text: step.result?.text,
      error: step.result?.error,
    }));
  await writeFile(
    path.join(profile, "observations.json"),
    JSON.stringify(observed, null, 2),
  );
  await writeFile(
    path.join(profile, "verification.json"),
    JSON.stringify(check.result, null, 2),
  );
  await copyFile(
    path.join(profile, "agent/tasks", taskId, sheet.fileName),
    path.join(profile, "startups.csv"),
  );
  const finalState = await page.evaluate(() => window.piccolo.state());
  await command({
    type: "tab",
    action: "activate",
    id: finalState.tabs.find((tab) => tab.url === "piccolo://agents").id,
  });
  await page
    .getByRole("button", { name: "Inspect", exact: true })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: path.join(profile, "sheet-artifact.png") });
  results.push({
    name: "Real AdaL researches three actual pages plus failed URL, writes CSV, verifies all 25 cells and displays source-linked artifact",
    status: "Passed",
  });
  console.log("PASS live sheet research");
  console.log(csv);
} catch (error) {
  console.error(error);
  results.push({ status: "Failed", error: String(error), stack: error.stack });
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => {});
  await writeFile(
    path.join(profile, "report.json"),
    JSON.stringify(
      { profile, results, urls, date: new Date().toISOString() },
      null,
      2,
    ),
  );
  await writeFile(
    "test-results/sheet-live-latest.json",
    JSON.stringify({ profile, results }, null, 2),
  );
  console.log("Evidence " + profile);
}
