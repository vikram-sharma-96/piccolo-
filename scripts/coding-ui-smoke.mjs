import { _electron as electron } from "playwright";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const profile = path.resolve("test-results/coding-ui-" + Date.now()),
  project = path.join(profile, "project");
await mkdir(project, { recursive: true });
await writeFile(path.join(project, "hello.js"), "const answer = 42;\n");
const env = { ...process.env, PICCOLO_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath:
    process.env.PICCOLO_EXE ||
    path.resolve("release/0.6.0/win-unpacked/Piccolo.exe"),
  args: [],
  env,
});
const results = [];
let code;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function check(name, fn) {
  await fn();
  results.push({ name, status: "Passed" });
  console.log("PASS " + name);
}
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.piccolo);
  await app.evaluate(({ dialog }, project) => {
    dialog.showOpenDialog = async () => ({
      filePaths: [project],
      canceled: false,
    });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, project);
  await page.evaluate(() =>
    window.piccolo.command({ type: "workspace", action: "pick" }),
  );
  for (let i = 0; i < 100; i++) {
    code = app
      .context()
      .pages()
      .find((p) => p.url().startsWith("piccolo-code:"));
    if (code) break;
    await wait(100);
  }
  await code.waitForFunction(() => window.piccoloWorkbench?.ready);
  await code.bringToFront();
  await check(
    "Explorer creates a real file through its visible New File action",
    async () => {
      await code.locator(".codicon-new-file").first().click();
      const input = code.locator(".explorer-folders-view input").first();
      await input.fill("created.txt");
      await input.press("Enter");
      for (let i = 0; i < 50; i++) {
        try {
          await access(path.join(project, "created.txt"));
          return;
        } catch {}
        await wait(100);
      }
      throw Error("Explorer did not create file");
    },
  );
  await check(
    "Editor keyboard typing and Ctrl+S save actual file bytes",
    async () => {
      await code.waitForFunction(() =>
        window.piccoloWorkbench
          .inspect()
          .documents.some((d) => d.path === "created.txt"),
      );
      await code.locator(".monaco-editor .view-lines").first().click();
      await code.keyboard.type("hello explorer");
      await code.keyboard.press("Control+s");
      for (let i = 0; i < 50; i++) {
        if (
          (await readFile(path.join(project, "created.txt"), "utf8")).includes(
            "hello explorer",
          )
        )
          return;
        await wait(100);
      }
      throw Error("Keyboard save did not reach disk");
    },
  );
  await check("Explorer F2 rename changes the actual filesystem", async () => {
    await code
      .locator(".explorer-folders-view .monaco-list-row")
      .filter({ hasText: "created.txt" })
      .first()
      .click();
    await code.keyboard.press("F2");
    const input = code.locator(".explorer-folders-view input").first();
    await input.fill("renamed.txt");
    await input.press("Enter");
    for (let i = 0; i < 50; i++) {
      try {
        await access(path.join(project, "renamed.txt"));
        await assert.rejects(access(path.join(project, "created.txt")));
        return;
      } catch {}
      await wait(100);
    }
    throw Error("Explorer rename did not reach disk");
  });
  await check(
    "Keyboard find and replace opens the real editor search widget",
    async () => {
      await code.locator(".monaco-editor textarea").first().focus();
      await code.keyboard.press("Control+h");
      await code.locator(".find-widget.visible").waitFor();
      await code.keyboard.press("Escape");
    },
  );
  await code.screenshot({ path: path.join(profile, "explorer-editor.png") });
} catch (error) {
  results.push({
    name: "Explorer/editor UI workflow",
    status: "Failed",
    error: String(error),
    stack: error.stack,
  });
  console.error(error);
  if (code)
    await writeFile(path.join(profile, "dom.html"), await code.content());
  process.exitCode = 1;
} finally {
  await app
    .evaluate(({ app }) => {
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
  await app.close();
  await writeFile(
    path.join(profile, "report.json"),
    JSON.stringify({ profile, results }, null, 2),
  );
  console.log("Evidence: " + profile);
}
