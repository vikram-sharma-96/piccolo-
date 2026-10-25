import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";

// Builds and runs the main-process lifecycle test (no CDP, so
// isBeingCaptured() stays false). Fails unless the runner itself wrote a
// passing test-results/lifecycle.json.
const result = "test-results/lifecycle.json";
rmSync(result, { force: true });
const build = spawnSync(
  process.execPath,
  [
    "node_modules/esbuild/bin/esbuild",
    "scripts/lifecycle.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--external:electron",
    "--outfile=dist/lifecycle.cjs",
    "--log-level=warning",
  ],
  { stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status ?? 1);
const run = spawnSync(
  process.execPath,
  ["scripts/start.mjs", "dist/lifecycle.cjs"],
  { stdio: "inherit", timeout: 120000 },
);
if (!existsSync(result)) {
  console.error(
    `Lifecycle run produced no ${result} (exit ${run.status}, signal ${run.signal}).`,
  );
  process.exit(1);
}
const report = JSON.parse(readFileSync(result, "utf8"));
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed === true && run.status === 0 ? 0 : 1);
