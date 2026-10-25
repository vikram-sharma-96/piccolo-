import { _electron as electron } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import assert from "node:assert/strict";
const profile = path.resolve("test-results/agent-coding-" + Date.now()),
  project = path.join(profile, "project");
await mkdir(project, { recursive: true });
const reservation = createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
await writeFile(
  path.join(project, "index.html"),
  "<title>Agent coding fixture</title><h1>Answer 42</h1>",
);
await writeFile(
  path.join(project, "check.cjs"),
  "const fs=require('node:fs');if(!fs.readFileSync('index.html','utf8').includes('Answer 43'))throw Error('Wrong answer');console.log('CHECK_PASSED');",
);
await writeFile(
  path.join(project, "preview.cjs"),
  `require('node:http').createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(require('node:fs').readFileSync('index.html'))}).listen(${port},'127.0.0.1',()=>console.log('PREVIEW_READY'));`,
);
execFileSync("git", ["init"], { cwd: project, stdio: "ignore" });
execFileSync("git", ["config", "user.name", "Piccolo test"], { cwd: project });
execFileSync("git", ["config", "user.email", "fixture@example.invalid"], {
  cwd: project,
});
execFileSync("git", ["add", "."], { cwd: project });
execFileSync("git", ["commit", "-m", "Initial fixture"], {
  cwd: project,
  stdio: "ignore",
});
const env = { ...process.env, PICCOLO_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const results = [];
const cmd = (c) => page.evaluate((c) => window.piccolo.command(c), c);
try {
  app = await electron.launch({
    ...(process.env.PICCOLO_EXE
      ? { executablePath: process.env.PICCOLO_EXE, args: [] }
      : { args: ["."] }),
    env,
  });
  page = await app.firstWindow();
  await page.waitForFunction(() => window.piccolo);
  await app.evaluate(({ dialog }, project) => {
    dialog.showMessageBox = async (_w, o) => ({
      response: o.buttons?.includes("Trust browser control")
        ? o.buttons.indexOf("Trust browser control")
        : 1,
    });
    dialog.showOpenDialog = async () => ({
      filePaths: [project],
      canceled: false,
    });
  }, project);
  await cmd({ type: "workspace", action: "pick" });
  let code;
  for (let i = 0; i < 100; i++) {
    code = app
      .context()
      .pages()
      .find((p) => p.url().startsWith("piccolo-code:"));
    if (code) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await code.waitForFunction(() => window.piccoloWorkbench?.ready, undefined, {
    timeout: 60000,
  });
  const reloaded = code.waitForEvent("domcontentloaded");
  await cmd({ type: "workspace", action: "trust" });
  await reloaded;
  await code.waitForFunction(() => window.piccoloWorkbench?.ready, undefined, {
    timeout: 60000,
  });
  await cmd({ type: "new-tab", url: "piccolo://agents" });
  await cmd({ type: "agent", action: "connect" });
  const status = await cmd({
      type: "optional",
      service: "mcp",
      action: "status",
    }),
    client = status.clients.find((c) => c.name === "piccolo-agent");
  await cmd({ type: "workspace", action: "grant-client", value: client.id });
  const instruction = `In the attached index.html change only the visible heading Answer 42 to Answer 43. Read current revision first; use file.write and inspect git.diff. Start the approved task terminal and run exactly node check.cjs, inspect terminal.read for CHECK_PASSED. Then run node preview.cjs in the same terminal and inspect output for PREVIEW_READY. Open http://127.0.0.1:${port}/ with preview.open. Observe/wait for the preview and independently verify.page expected Answer 43. Finish with actual changes, validation observations and limits. Do not commit, push, install, deploy or edit the check/server scripts.`;
  const { taskId } = await cmd({
    type: "agent",
    action: "start",
    value: {
      instruction:
        instruction +
        " Before finishing, capture the authorized preview using browser.screenshot, analyze that actual image with image.findings (source imageId returned by the screenshot) and record the visible heading and layout limitations. The user reviews the findings. Independently verify the findings artifact with verify.artifact, then finish. This screenshot is explicitly authorized for AdaL vision.",
      files: ["index.html", "check.cjs", "preview.cjs"],
      edit: true,
      terminal: true,
      screenshots: true,
      maxCalls: 22,
    },
  });
  let task;
  for (let i = 0; i < 420; i++) {
    task = (await cmd({ type: "agent", action: "status" })).tasks.find(
      (t) => t.id === taskId,
    );
    if (
      ["completed", "failed", "canceled", "interrupted"].includes(task?.status)
    )
      break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  await writeFile(
    path.join(profile, "task.json"),
    JSON.stringify(task, null, 2),
  );
  assert.equal(
    task?.status,
    "completed",
    task?.error + " " + JSON.stringify(task?.steps),
  );
  assert.match(
    await readFile(path.join(project, "index.html"), "utf8"),
    /Answer 43/,
  );
  assert.ok(
    task.steps.some(
      (s) => s.capability === "git.diff" && s.status === "succeeded",
    ),
  );
  assert.ok(
    task.steps.some(
      (s) =>
        s.capability === "terminal.read" &&
        String(s.result?.text).includes("CHECK_PASSED"),
    ),
  );
  assert.ok(
    task.steps.some((s) => s.capability === "verify.page" && s.verified),
  );
  assert.ok(
    task.steps.some(
      (s) => s.capability === "browser.screenshot" && s.status === "succeeded",
    ),
  );
  assert.ok(
    task.steps.some(
      (s) => s.capability === "image.findings" && s.status === "succeeded",
    ),
  );
  execFileSync("node", ["check.cjs"], { cwd: project });
  assert.equal(
    execFileSync("git", ["rev-list", "--count", "HEAD"], {
      cwd: project,
      encoding: "utf8",
    }).trim(),
    "1",
  );
  for (let i = 0; i < 50; i++) {
    try {
      await fetch("http://127.0.0.1:" + port);
      await new Promise((r) => setTimeout(r, 100));
    } catch {
      results.push({
        name: "Real AdaL file edit → Git diff → approved validation → local preview → browser verification → shell cleanup, without commit",
        status: "Passed",
      });
      console.log("PASS complete coding agent workflow");
      break;
    }
  }
  assert.equal(results.length, 1, "Preview process survived task completion");
  await cmd({ type: "new-tab", url: "piccolo://agents" });
  await page.screenshot({ path: path.join(profile, "coding-completed.png") });
} catch (error) {
  results.push({
    name: "Coding agent workflow",
    status: "Failed",
    error: String(error),
    stack: error.stack,
  });
  console.error(error);
  process.exitCode = 1;
} finally {
  await app
    ?.evaluate(({ app }) => {
      const r = process
        .getBuiltinModule("module")
        .createRequire(
          process
            .getBuiltinModule("path")
            .join(app.getAppPath(), "package.json"),
        );
      const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0];
      return r(
        process
          .getBuiltinModule("path")
          .join(app.getAppPath(), "dist/coding.cjs"),
      ).closeWorkspace(b, true);
    })
    .catch(() => {});
  await app?.close().catch(() => {});
  await writeFile(
    path.join(profile, "report.json"),
    JSON.stringify({ profile, results }, null, 2),
  );
  await writeFile(
    "test-results/agent-coding-latest.json",
    JSON.stringify({ profile, results }, null, 2),
  );
  console.log("Evidence", profile);
}
