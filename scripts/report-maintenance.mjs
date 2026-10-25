import { readFile, writeFile } from "node:fs/promises";
const before = JSON.parse(
  await readFile("test-results/baseline-0.4.0.json", "utf8"),
);
const after = JSON.parse(
  await readFile("test-results/after-0.4.0.json", "utf8"),
);
const median = (values) =>
  values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const stats = (r) => ({
  memory: median(r.samples.map((s) => s.workingSetKiB)) / 1024,
  cpu: median(r.samples.map((s) => s.cpuPercent)),
});
const previous = await readFile("PERFORMANCE.md", "utf8");
const historical = previous.includes("## Historical 0.3 observations")
  ? previous.split("## Historical 0.3 observations")[1].trimStart()
  : previous;
const rows = before.records
  .filter((r) => r.samples)
  .map((old) => {
    const current = after.records.find((r) => r.name === old.name),
      a = stats(old),
      b = stats(current);
    return `| ${old.name} | ${a.memory.toFixed(1)} | ${b.memory.toFixed(1)} | ${a.cpu.toFixed(3)} | ${b.cpu.toFixed(3)} |`;
  });
const oldIdle = stats(before.records[0]).memory,
  newIdle = stats(after.records[0]).memory;
await writeFile(
  "PERFORMANCE.md",
  `# Performance observations · 0.4 maintenance run

Measured 25 October 2026 IST using the final packaged application, with fresh profiles on the same Windows 11 / Ryzen 7 6800H host (16 logical CPUs; 7.19 GiB physical RAM reported). No other Piccolo test suites ran during this measurement. Raw evidence: <code>test-results/baseline-0.4.0.json</code> (preserved 0.3 package) and <code>test-results/after-0.4.0.json</code> (0.4).

The existing method is unchanged: warm file caches, Playwright/debugger overhead, two-second settle and three one-second process snapshots per scenario. Memory is the sum of per-process working sets, which can double-count shared pages. CPU is the sum of Electron-reported process percentages. These are short observations, not battery tests or low-spec hardware guarantees.

| Scenario | 0.3 median MiB | 0.4 median MiB | 0.3 CPU % | 0.4 CPU % |
| --- | ---: | ---: | ---: | ---: |
${rows.join("\n")}

First visible new-tab launch: ${before.startupMs.toFixed(0)} ms before, ${after.startupMs.toFixed(0)} ms after. This is not a cold-machine benchmark; the difference cannot be attributed to a specific code change.

Default static new-tab working set changed by ${(newIdle - oldIdle).toFixed(1)} MiB (${((newIdle / oldIdle - 1) * 100).toFixed(1)}%). There is no claim of a memory reduction in this update. Idle CPU remains small in these samples; opt-in video costs more. Short-run CPU variation is insufficient to establish a sustained improvement or regression. Hidden/minimized and low-power video decoder-removal assertions passed. Longer battery and low-spec-machine sampling remains outstanding.

Final measured app.asar SHA-256: <code>${after.asarSHA256}</code>.

Motion adds no dependency or renderer: CSS and short chrome-only WAAPI effects run on interactions; low-power is on by default and disables nonessential motion. There are no new continuous animation loops. The standard scenarios cover tabs and wallpaper; they do not quantify CPU during a long series of menu/reorder interactions or a hostile download flood. Regenerate this section with <code>node scripts/report-maintenance.mjs</code> after measuring.

---

## Historical 0.3 observations

${historical}`,
);
const delivery=await readFile('RELEASE_0_4.md','utf8');
await writeFile('RELEASE_0_4.md',delivery.replace(/PERFORMANCE\.md compares[^\n]+/,`PERFORMANCE.md compares fresh-profile packaged runs on the same host. The latest short run measured ${newIdle.toFixed(1)} MiB for the new-tab UI versus ${oldIdle.toFixed(1)} MiB before, with ${stats(after.records[0]).cpu.toFixed(3)}% summed idle CPU. This is a memory increase, not a claimed optimization or low-spec hardware guarantee. The report preserves the exact values, method, video/hidden/minimized scenarios and measured application hash.`));
console.log(
  JSON.stringify({
    beforeMiB: oldIdle,
    afterMiB: newIdle,
    afterCPU: stats(after.records[0]).cpu,
    startupMs: after.startupMs,
  }),
);
