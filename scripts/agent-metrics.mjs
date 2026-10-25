import { execFileSync } from "node:child_process";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function processTree(app) {
  const rootPid = Number(app.process().pid);
  if (!Number.isSafeInteger(rootPid) || rootPid < 1)
    throw Error("Invalid app process ID.");
  const command = `$inventory=Get-CimInstance Win32_Process; $ownedIds=@(${rootPid}); do { $nextIds=@($inventory | Where-Object { $_.ParentProcessId -in $ownedIds -and $_.ProcessId -notin $ownedIds } | ForEach-Object { [int]$_.ProcessId }); $ownedIds += $nextIds } while($nextIds.Count); @($inventory | Where-Object { $_.ProcessId -in $ownedIds } | ForEach-Object { try { $observedProcess=Get-Process -Id $_.ProcessId -ErrorAction Stop; [pscustomobject]@{id=$observedProcess.Id;parent=$_.ParentProcessId;name=$observedProcess.ProcessName;workingSetBytes=$observedProcess.WorkingSet64;cpuMilliseconds=$observedProcess.TotalProcessorTime.TotalMilliseconds;started=$observedProcess.StartTime.ToUniversalTime().ToString('o')} } catch {} }) | ConvertTo-Json -Compress`;
  const text = execFileSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-Command", command],
    { encoding: "utf8", windowsHide: true, timeout: 15000 },
  );
  const records = JSON.parse(text || "[]");
  return Array.isArray(records) ? records : [records];
}
export function descendants(records, roots) {
  const ids = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of records)
      if (ids.has(record.parent) && !ids.has(record.id)) {
        ids.add(record.id);
        changed = true;
      }
  }
  return records.filter((record) => ids.has(record.id));
}
export async function remainingProcesses(original) {
  if (!original.length) return [];
  const ids = original.map((p) => Number(p.id));
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1))
    throw Error("Invalid observed process ID.");
  const command = `@(@(${ids.join(",")}) | ForEach-Object { try { $observedProcess=Get-Process -Id $_ -ErrorAction Stop; [pscustomobject]@{id=$observedProcess.Id;started=$observedProcess.StartTime.ToUniversalTime().ToString('o')} } catch {} }) | ConvertTo-Json -Compress`;
  const text = execFileSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-Command", command],
    { encoding: "utf8", windowsHide: true, timeout: 10000 },
  );
  const parsed = JSON.parse(text || "[]"),
    records = Array.isArray(parsed) ? parsed : [parsed];
  return records.filter((record) =>
    original.some(
      (prior) => prior.id === record.id && prior.started === record.started,
    ),
  );
}
export async function measureAgent(name, app) {
  const samples = [];
  for (let i = 0; i < 3; i++) {
    await delay(1000);
    const metrics = await app.evaluate(({ app }) => app.getAppMetrics());
    samples.push({
      time: Date.now(),
      phase: await app.evaluate(
        () =>
          [...globalThis[Symbol.for("piccolo.browser-registry")]][0]?.state
            .agentTask,
      ),
      electronWorkingSetKiB: metrics.reduce(
        (sum, p) => sum + p.memory.workingSetSize,
        0,
      ),
      electronCpuPercent: metrics.reduce(
        (sum, p) => sum + p.cpu.percentCPUUsage,
        0,
      ),
      processes: await processTree(app),
    });
  }
  return { name, samples };
}
