import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const env = {
  ...process.env,
  PICCOLO_EXE: path.resolve("release/0.7.0/win-unpacked/Piccolo.exe"),
};
delete env.ELECTRON_RUN_AS_NODE;
await mkdir("test-results", { recursive: true });
const results = [];
for (const name of [
  "agent-coding-smoke",
  "agent-smoke",
  "agent-recovery-smoke",
  "coding-smoke",
  "smoke",
  "upgrade-smoke",
  "mcp-smoke",
  "download-policy-smoke",
  "appearance-audit",
  "run-lifecycle",
  "performance",
  "check-release",
]) {
  const log = path.resolve("test-results/0.7-" + name + ".log"),
    output = createWriteStream(log);
  console.log("RUN " + name);
  const started = Date.now();
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/" + name + ".mjs"], {
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(output, { end: false });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  await new Promise((resolve) => output.end(resolve));
  results.push({
    name,
    status: code === 0 ? "Passed" : "Failed",
    exitCode: code,
    elapsedMs: Date.now() - started,
    log,
  });
  await writeFile(
    "test-results/agent-release-checks.json",
    JSON.stringify(
      { date: new Date().toISOString(), executable: env.PICCOLO_EXE, results },
      null,
      2,
    ),
  );
  console.log((code === 0 ? "PASS " : "FAIL ") + name);
}
process.exitCode = results.some((result) => result.status === "Failed") ? 1 : 0;
