import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  processTree,
  remainingProcesses,
  measureAgent,
} from "./agent-metrics.mjs";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
const profile = path.resolve("test-results/agent-" + Date.now());
await mkdir(profile, { recursive: true });
const server = createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html");
  if (_req.url === "/form") {
    res.end(
      '<title>Agent form fixture</title><h1>Local form</h1><label>Name <input id="name"></label><button id="submit">Save</button><p id="result"></p><script>let tries=0;document.querySelector("#submit").onclick=()=>{tries++;document.querySelector("#result").textContent=tries===1?"Controlled error. Retry once.":"Saved "+document.querySelector("#name").value;};</script>',
    );
    return;
  }
  res.end(
    "<title>Piccolo agent fixture</title><h1>Beacon research</h1><p>The launch number is 731. The access color is red.</p><p>Fixture source: Piccolo local integration test.</p>",
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const env = { ...process.env, PICCOLO_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app, page, audit;
const results = [],
  errors = [];
const measurements = [];
const cmd = (c) => page.evaluate((c) => window.piccolo.command(c), c);
async function check(name, fn) {
  await fn();
  results.push({ name, status: "Passed" });
  console.log("PASS " + name);
}
async function state() {
  return cmd({ type: "agent", action: "status" });
}
async function waitTask(id) {
  for (let i = 0; i < 180; i++) {
    const snapshot = await state();
    const task = snapshot.tasks.find((t) => t.id === id);
    if (
      task &&
      ["completed", "failed", "canceled", "interrupted"].includes(
        task.status,
      ) &&
      !snapshot.cleaningUp
    )
      return task;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error("Agent task exceeded test deadline");
}
try {
  app = await electron.launch({
    ...(process.env.PICCOLO_EXE
      ? { executablePath: process.env.PICCOLO_EXE, args: [] }
      : { args: ["."] }),
    env,
  });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForFunction(() => window.piccolo);
  await check(
    "Ordinary browser does not load agent runtime or start provider processes",
    async () => {
      assert.equal(
        await app.evaluate(({ app }) => {
          const r = process
            .getBuiltinModule("module")
            .createRequire(
              process
                .getBuiltinModule("path")
                .join(app.getAppPath(), "package.json"),
            );
          return !!r.cache[
            process
              .getBuiltinModule("path")
              .join(app.getAppPath(), "dist/agent.cjs")
          ];
        }),
        false,
      );
    },
  );
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_w, options) => ({
      response: options.buttons?.includes("Trust browser control")
        ? options.buttons.indexOf("Trust browser control")
        : 1,
      checkboxChecked: false,
    });
  });
  await cmd({ type: "navigate", input: base });
  await page.waitForFunction(() =>
    window.piccolo
      .state()
      .then((s) =>
        s.tabs.some((t) => t.title === "Piccolo agent fixture" && !t.loading),
      ),
  );
  const tab = (await page.evaluate(() => window.piccolo.state())).activeId;
  await cmd({ type: "new-tab", url: "piccolo://agents" });
  await page
    .getByRole("heading", { name: "Piccolo Agent", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(profile, "setup.png") });
  await check(
    "Actual application pairs its dedicated authenticated MCP client",
    async () => {
      await cmd({ type: "agent", action: "connect" });
      assert.equal((await state()).connected, true);
    },
  );
  await check(
    "Real AdaL plans and executes selected-tab research with MCP observations and verified artifact",
    async () => {
      const started = await cmd({
        type: "agent",
        action: "start",
        value: {
          instruction:
            "Read the attached local page. Create concise research notes with the heading, launch number and access color, and the actual source URL. Use artifact.note with the attached tab source id, independently verify the saved artifact using verify.artifact, then finish. Do not navigate or interact with page controls.",
          tabs: [tab],
          maxCalls: 8,
        },
      });
      const task = await waitTask(started.taskId);
      await writeFile(
        path.join(profile, "research-task.json"),
        JSON.stringify(task, null, 2),
      );
      assert.equal(
        task.status,
        "completed",
        JSON.stringify(task.steps) + " " + task.error,
      );
      assert.ok(
        task.steps.some(
          (s) => s.capability === "browser.observe" && s.status === "succeeded",
        ),
      );
      assert.ok(
        task.steps.some(
          (s) => s.capability === "verify.artifact" && s.verified,
        ),
      );
      const note = task.artifacts.find((a) => a.title !== "Completion report");
      assert.ok(note);
      const full = await cmd({
        type: "agent",
        action: "artifact",
        value: note.id,
      });
      assert.match(full.data, /731/);
      assert.match(full.data, /red/i);
      assert.ok(full.data.includes(base));
    },
  );
  await cmd({
    type: "tab",
    action: "activate",
    id: (await page.evaluate(() => window.piccolo.state())).tabs.find(
      (t) => t.url === "piccolo://agents",
    ).id,
  });
  await page
    .getByRole("heading", { name: "Piccolo Agent", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(profile, "completed.png") });
  await check(
    "Browser-control pairing cannot read agent context or operate provider approval controls",
    async () => {
      audit = new Client({ name: "agent-boundary-audit", version: "1" });
      const exe = process.env.PICCOLO_EXE || process.execPath;
      const entry = process.env.PICCOLO_EXE
        ? path.join(
            path.dirname(exe),
            "resources/app.asar/dist/mcp-stdio-entry.cjs",
          )
        : path.resolve("dist/mcp-stdio-entry.cjs");
      await audit.connect(
        new StdioClientTransport({
          command: exe,
          args: [entry, "--client=agent-boundary-audit"],
          env: {
            PICCOLO_PROFILE: profile,
            ...(process.env.PICCOLO_EXE ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
          },
          stderr: "pipe",
        }),
        { timeout: 40000 },
      );
      const response = await audit.callTool({
        name: "piccolo_ui",
        arguments: { action: "read" },
      });
      assert.equal(response.isError, true);
      assert.match(JSON.stringify(response.content), /direct user interaction/);
      const settings = await audit.callTool({
        name: "piccolo_settings",
        arguments: {
          action: "update",
          settings: { agentProvider: "adal", agentGrant: true },
        },
      });
      assert.equal(settings.isError, true);
    },
  );
  await check(
    "Real attached-image analysis produces source-linked findings after native user review",
    async () => {
      const imagePath = path.join(profile, "vision.png");
      await sharp(
        Buffer.from(
          '<svg width="360" height="160"><rect width="360" height="160" fill="white"/><rect x="12" y="12" width="100" height="100" fill="red"/><text x="140" y="65" font-size="34" fill="black">PICCOLO</text><text x="140" y="110" font-size="30" fill="black">731</text></svg>',
        ),
      )
        .png()
        .toFile(imagePath);
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          filePaths: [file],
          canceled: false,
        });
      }, imagePath);
      const image = await cmd({ type: "agent", action: "attach-image" });
      const { taskId } = await cmd({
        type: "agent",
        action: "start",
        value: {
          instruction:
            "Analyze only the attached image. Identify its visible word, three-digit number and the solid shape color. Use image.findings with the attached image id; report limitations. After user review, independently verify the findings artifact using verify.artifact, then finish. Do not use artifact.note or take follow-up actions.",
          images: [image.id],
          maxCalls: 6,
        },
      });
      measurements.push(
        await measureAgent("Explicitly attached image task", app),
      );
      const task = await waitTask(taskId);
      measurements.push(await measureAgent("After image task completion", app));
      await writeFile(
        path.join(profile, "vision-task.json"),
        JSON.stringify(task, null, 2),
      );
      assert.equal(task.status, "completed", task.error);
      assert.ok(
        task.steps.some(
          (s) => s.capability === "image.findings" && s.status === "succeeded",
        ),
      );
      const findings = task.artifacts.find((a) => a.title === "Image findings");
      const data = await cmd({
        type: "agent",
        action: "artifact",
        value: findings.id,
      });
      assert.match(data.data, /PICCOLO/);
      assert.match(data.data, /731/);
      assert.match(data.data, /red/i);
      assert.equal(data.sources[0].id, image.id);
    },
  );
  await check(
    "Unattached tabs/files and denied provider transmission never start a task",
    async () => {
      const count = (await state()).tasks.length;
      await assert.rejects(
        cmd({
          type: "agent",
          action: "start",
          value: {
            instruction: "No authority fixture",
            tabs: ["not-attached-private-tab"],
          },
        }),
        /Select only/,
      );
      await assert.rejects(
        cmd({
          type: "agent",
          action: "start",
          value: {
            instruction: "Unauthorized project read fixture",
            files: ["secret.txt"],
          },
        }),
        /workspace permission/,
      );
      await app.evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 0 });
      });
      await assert.rejects(
        cmd({
          type: "agent",
          action: "start",
          value: { instruction: "Do not transmit denied fixture" },
        }),
        /Permission denied/,
      );
      assert.equal((await state()).tasks.length, count);
      assert.equal((await state()).tasks.at(-1).status, "completed");
      await app.evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 });
      });
    },
  );
  await check(
    "Real model uses page structure and approved input, recovers a controlled form error and verifies final state",
    async () => {
      await cmd({ type: "new-tab", url: base + "/form" });
      let form;
      for (let i = 0; i < 60; i++) {
        form = (await page.evaluate(() => window.piccolo.state())).tabs.find(
          (t) => t.url === base + "/form" && !t.loading,
        );
        if (form) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(form);
      const { taskId } = await cmd({
        type: "agent",
        action: "start",
        value: {
          instruction:
            "Observe this local form. Fill the Name input with Piccolo, click Save, observe the controlled error and retry Save once. Independently verify.page that Saved Piccolo is visibly displayed, then finish. Do not navigate or create artifacts beyond the completion report.",
          tabs: [form.id],
          maxCalls: 12,
        },
      });
      const task = await waitTask(taskId);
      await writeFile(
        path.join(profile, "form-task.json"),
        JSON.stringify(task, null, 2),
      );
      assert.equal(task.status, "completed", task.error);
      assert.ok(
        task.steps.some(
          (s) =>
            s.capability === "browser.observe" &&
            s.result?.text?.includes("Controlled error"),
        ),
      );
      assert.ok(
        task.steps.some((s) => s.capability === "verify.page" && s.verified),
      );
    },
  );
  await check(
    "Pause cancels a real condition wait, manual state changes are observed, resume verifies fresh state",
    async () => {
      const { taskId } = await cmd({
        type: "agent",
        action: "start",
        value: {
          instruction:
            "Observe the attached page, then use browser.wait for selector #manual-success. When it appears verify.page with exact expected text Manual success and finish. Do not navigate, create notes or interact. The user may pause and add that marker manually.",
          tabs: [tab],
          maxCalls: 9,
        },
      });
      for (let i = 0; i < 180; i++) {
        const t = (await state()).tasks.find((t) => t.id === taskId);
        if (
          t?.steps.some(
            (s) => s.capability === "browser.wait" && s.status === "running",
          )
        )
          break;
        if (["failed", "completed"].includes(t?.status))
          throw Error("Wait task ended before pause: " + t.error);
        await new Promise((r) => setTimeout(r, 250));
      }
      await cmd({ type: "agent", action: "pause" });
      assert.equal(
        (await state()).tasks.find((t) => t.id === taskId).status,
        "paused",
      );
      const fixture = app
        .context()
        .pages()
        .find((p) => p.url().startsWith(base));
      assert.ok(fixture);
      await fixture.evaluate(() => {
        const marker = document.createElement("p");
        marker.id = "manual-success";
        marker.textContent = "Manual success";
        document.body.append(marker);
      });
      await cmd({ type: "agent", action: "resume" });
      const task = await waitTask(taskId);
      await writeFile(
        path.join(profile, "pause-task.json"),
        JSON.stringify(task, null, 2),
      );
      assert.equal(task.status, "completed", task.error);
      assert.ok(task.steps.some((s) => s.status === "canceled"));
      assert.ok(
        task.steps.some((s) => s.capability === "verify.page" && s.verified),
      );
    },
  );
  await check(
    "Cancel interrupts an active provider and releases task resources",
    async () => {
      const { taskId } = await cmd({
        type: "agent",
        action: "start",
        value: {
          instruction:
            "Observe attached page then verify its heading Beacon research.",
          tabs: [tab],
          maxCalls: 6,
        },
      });
      let providerProcesses = [];
      for (let i = 0; i < 30; i++) {
        providerProcesses = (await processTree(app)).filter((p) =>
          /bun/i.test(p.name),
        );
        if (providerProcesses.length) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(
        providerProcesses.length,
        "Actual AdaL process started before cancellation",
      );
      measurements.push(
        await measureAgent("Active provider before cancel", app),
      );
      await cmd({ type: "agent", action: "cancel" });
      assert.equal((await waitTask(taskId)).status, "canceled");
      assert.deepEqual(
        await remainingProcesses(providerProcesses),
        [],
        "Canceled AdaL process exited",
      );
      measurements.push(await measureAgent("After provider cleanup", app));
      for (let i = 0; i < 50; i++) {
        if (
          await app.evaluate(
            () =>
              [...globalThis[Symbol.for("piccolo.browser-registry")]][0]
                .agentTasks === 0,
          )
        )
          return;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw Error("Agent task resource counter remained active");
    },
  );
  await check(
    "Light, Dark and System Agent UI, native view task bar and redacted export are usable",
    async () => {
      const s = await page.evaluate(() => window.piccolo.state());
      await cmd({
        type: "tab",
        action: "activate",
        id: s.tabs.find((t) => t.url === "piccolo://agents").id,
      });
      for (const theme of ["light", "dark", "system"]) {
        const s = await page.evaluate(() => window.piccolo.state());
        await cmd({ type: "settings", value: { ...s.settings, theme } });
        await page.waitForFunction(
          (theme) => document.documentElement.dataset.theme === theme,
          theme === "system"
            ? (await page.evaluate(() => window.piccolo.state())).appearance
            : theme,
        );
        await page.screenshot({
          path: path.join(profile, theme + "-agent.png"),
        });
      }
      await cmd({ type: "tab", action: "activate", id: tab });
      const bound = await app.evaluate(() => {
        const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0];
        return b.views.get(b.state.activeId).getBounds();
      });
      const bar = await page.locator(".agent-taskbar").boundingBox();
      assert.ok(bar && bound.y >= Math.floor(bar.y + bar.height));
      await cmd({ type: "agent", action: "hide" });
      assert.equal(
        (await page.evaluate(() => window.piccolo.state())).agentTask,
        undefined,
      );
      await cmd({ type: "agent", action: "show" });
      const last = (await state()).tasks.at(-1),
        file = path.join(profile, "redacted-summary.json");
      await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({
          filePath: file,
          canceled: false,
        });
      }, file);
      await cmd({ type: "agent", action: "export-summary", value: last.id });
      const summary = await readFile(file, "utf8");
      assert.ok(!summary.includes("Beacon research"));
      assert.ok(!summary.includes(base));
      assert.equal(JSON.parse(summary).id, last.id);
    },
  );
  await check(
    "Task records are OS-encrypted, not plaintext or renderer storage",
    async () => {
      const file = await readFile(path.join(profile, "agent/tasks.bin"));
      assert.ok(!file.includes(Buffer.from("Beacon research")));
      assert.equal(await page.evaluate(() => localStorage.length), 0);
    },
  );
  await check(
    "Completed-task history remains reviewable while the last engine is idle",
    async () => {
      const snapshot = await state(),
        oldest = snapshot.tasks[0];
      const s = await page.evaluate(() => window.piccolo.state());
      await cmd({
        type: "tab",
        action: "activate",
        id: s.tabs.find((tab) => tab.url === "piccolo://agents").id,
      });
      await page.locator(".agent-history > summary").click();
      await page
        .getByRole("button", { name: "Review task", exact: true })
        .first()
        .click();
      await page
        .getByLabel("Execution timeline")
        .getByText(oldest.instruction, { exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Review task", exact: true })
          .first()
          .isEnabled(),
        true,
      );
    },
  );
} catch (error) {
  results.push({
    name: "Agent workflow",
    status: "Failed",
    error: String(error),
    stack: error.stack,
  });
  console.error(error);
  process.exitCode = 1;
} finally {
  await audit?.close().catch(() => {});
  await app?.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await writeFile(
    path.join(profile, "report.json"),
    JSON.stringify({ profile, results, errors, measurements }, null, 2),
  );
  await writeFile(
    "test-results/agent-latest.json",
    JSON.stringify({ profile, results }, null, 2),
  );
  console.log("Evidence", profile);
}
