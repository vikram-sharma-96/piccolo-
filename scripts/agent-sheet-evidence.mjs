import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const latest = JSON.parse(
  await readFile("test-results/sheet-live-latest.json", "utf8"),
);
assert.ok(
  latest.results.every((result) => result.status === "Passed"),
  "Live test must actually pass",
);
const task = JSON.parse(
  await readFile(path.join(latest.profile, "task.json"), "utf8"),
);
const check = JSON.parse(
  await readFile(path.join(latest.profile, "verification.json"), "utf8"),
);
const observations = JSON.parse(
  await readFile(path.join(latest.profile, "observations.json"), "utf8"),
);
assert.equal(task.status, "completed");
assert.equal(check.matched, 25);
assert.equal(check.verified, true);
assert.match(observations[0].text, /Pro\s+\$99\s+per month/);
assert.match(observations[1].text, /Basic[\s\S]*?Free/);
assert.match(
  observations[2].text,
  /Pro[\s\S]*?\$10[\s\S]*?per seat\s*\/\s*month, billed annually/,
);
const otter = check.cells.find(
  (cell) => cell.row === 3 && cell.column === "pricing",
).actual;
assert.ok(
  !/forever/i.test(otter),
  "Unobserved forever guarantee must not appear",
);
const root = path.resolve("docs/evidence/sheets");
await mkdir(root, { recursive: true });
for (const file of ["startups.csv", "verification.json", "sheet-artifact.png"])
  await copyFile(path.join(latest.profile, file), path.join(root, file));
await writeFile(
  path.join(root, "live-report.json"),
  JSON.stringify(
    {
      date: new Date().toISOString(),
      profile: latest.profile,
      taskId: task.id,
      status: task.status,
      calls: task.calls,
      results: latest.results,
      steps: task.steps.map((step) => ({
        capability: step.capability,
        status: step.status,
        verified: step.verified,
        ...(step.error ? { error: step.error } : {}),
      })),
      sources: task.sources,
      unknownEvents: task.events.filter((event) =>
        /unknown|unreachable/i.test(event.detail),
      ),
      verification: {
        verified: check.verified,
        matched: check.matched,
        mismatched: check.mismatched,
        missing: check.missing,
      },
      sourceSpotChecks:
        "ElevenLabs Pro $99 per month; Otter Basic Free (no forever guarantee); Fireflies Pro $10 per seat/month billed annually. These strings/billing qualifiers were independently checked against the actual page observations. Other billing modes were not inferred.",
      limitations:
        "CSV verification establishes agreement with extracted data, not general factual correctness. Real native prompts were approved by the isolated test harness. Existing packaged 0.7 installer is unchanged.",
    },
    null,
    2,
  ),
);
console.log(
  "Retained actual CSV, cell verification, artifact screenshot and source-check summary: " +
    root,
);
