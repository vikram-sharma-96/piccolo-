import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import assert from 'node:assert/strict';
import {descendants} from './agent-metrics.mjs';
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const average = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const agent = await read("test-results/agent-latest.json"),
  coding = await read("test-results/agent-coding-latest.json");
const report = await read(path.join(agent.profile, "report.json"));
const activeProvider=report.measurements.find(item=>item.name==='Active provider before cancel').samples.at(-1).processes;
const providerTree=descendants(activeProvider,activeProvider.filter(process=>/bun/i.test(process.name)).map(process=>process.id));
const cleanedSamples=report.measurements.find(item=>item.name==='After provider cleanup').samples;
assert.ok(providerTree.length>0);
assert.ok(cleanedSamples.every(sample=>providerTree.every(prior=>!sample.processes.some(process=>process.id===prior.id&&process.started===prior.started))),'An observed AdaL descendant survived cleanup');
const workbench = await read(path.join((await read('test-results/coding-latest.json')).profile,'report.json'));
const codingMeasurements=workbench.measurements.map(item=>({name:item.name,electronMiB:average(item.samples.map(s=>s.workingSetKiB/1024)),ownedProcessMiB:average(item.samples.map(s=>s.subtree.reduce((sum,p)=>sum+p.workingSetBytes,0)/1048576)),electronCpuPercent:average(item.samples.map(s=>s.cpuPercent))}));
const measurements = report.measurements.map((item) => {
  const first = item.samples[0],
    last = item.samples.at(-1);
  const cpuMs = last.processes.reduce((sum, p) => {
    const before = first.processes.find(
      (old) => old.id === p.id && old.started === p.started,
    );
    return (
      sum +
      (before ? Math.max(0, p.cpuMilliseconds - before.cpuMilliseconds) : 0)
    );
  }, 0);
  return {
    name: item.name,
    electronMiB: average(
      item.samples.map((s) => s.electronWorkingSetKiB / 1024),
    ),
    ownedProcessMiB: average(
      item.samples.map(
        (s) =>
          s.processes.reduce((sum, p) => sum + p.workingSetBytes, 0) / 1048576,
      ),
    ),
    electronCpuPercent: average(item.samples.map((s) => s.electronCpuPercent)),
    approximateOwnedSingleCoreCpuPercent:
      (cpuMs / (last.time - first.time)) * 100,
    phases: item.samples.map((s) => s.phase?.status),
  };
});
const root = "docs/evidence/0.7";
await mkdir(root, { recursive: true });
await copyFile(
  path.join(coding.profile, "task.json"),
  path.join(root, "combined-task.json"),
);
await copyFile(
  path.join(coding.profile, "coding-completed.png"),
  path.join(root, "combined-completed.png"),
);
for (const theme of ["light", "dark", "system"])
  await copyFile(
    path.join(agent.profile, theme + "-agent.png"),
    path.join(root, theme + "-agent.png"),
  );
await writeFile(
  path.join(root, "agent-verification.json"),
  JSON.stringify(
    {
      date: new Date().toISOString(),
      agent: report.results,
      coding: coding.results,
      measurements,
      codingMeasurements,
      providerDescendantsAbsentAfterCleanup:providerTree.map(process=>process.name),
      method:
        "Three short instrumented samples per state. Electron working sets and Windows descendant working sets can double-count shared pages. OS CPU estimate includes only matched surviving PIDs and is single-core normalized; not a power/soak benchmark. Native dialogs answered by isolated test harness; actual AdaL provider used.",
    },
    null,
    2,
  ),
);
console.log("Updated non-sensitive fixture evidence in " + root);
