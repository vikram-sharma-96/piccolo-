import { readFile, writeFile, stat, readdir } from "node:fs/promises";
import path from "node:path";
const p = JSON.parse(await readFile("test-results/performance.json", "utf8"));
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const table = p.records
  .filter((r) => r.samples)
  .map(
    (r) =>
      `| ${r.name} | ${median(r.samples.map((s) => s.workingSetKiB / 1024)).toFixed(1)} | ${Math.min(...r.samples.map((s) => s.workingSetKiB / 1024)).toFixed(1)}–${Math.max(...r.samples.map((s) => s.workingSetKiB / 1024)).toFixed(1)} | ${median(r.samples.map((s) => s.cpuPercent)).toFixed(2)} |`,
  )
  .join("\n");
let baseline;
try {
  baseline = JSON.parse(
    await readFile("test-results/baseline-mcp.json", "utf8"),
  );
} catch {}
const common = (baseline?.records || []).filter(
  (r) => r.samples && p.records.some((n) => n.name === r.name && n.samples),
);
const comparison = common
  .map((before) => {
    const after = p.records.find((r) => r.name === before.name);
    return `| ${before.name} | ${median(before.samples.map((s) => s.workingSetKiB / 1024)).toFixed(1)} | ${median(after.samples.map((s) => s.workingSetKiB / 1024)).toFixed(1)} | ${median(before.samples.map((s) => s.cpuPercent)).toFixed(2)} | ${median(after.samples.map((s) => s.cpuPercent)).toFixed(2)} |`;
  })
  .join("\n");
const types = ["Browser", "Tab", "GPU"];
const breakdown = p.records
  .filter((r) => r.samples)
  .map((r) => {
    const memory = (type) =>
      median(
        r.samples.map(
          (s) =>
            s.processes
              .filter((pr) =>
                type ? pr.type === type : !types.includes(pr.type),
              )
              .reduce((n, pr) => n + pr.memory.workingSetSize, 0) / 1024,
        ),
      ).toFixed(1);
    return `| ${r.name} | ${memory("Browser")} | ${memory("Tab")} | ${memory("GPU")} | ${memory(null)} | ${median(r.samples.map((s) => s.processes.length))} | ${r.samples[0].webContentsCount ?? "not recorded"} |`;
  })
  .join("\n");
const installer = await stat(
  path.resolve(path.dirname(p.exe), "..", `Piccolo Setup ${p.app}.exe`),
);
let browserComparison;
try {
  browserComparison = JSON.parse(
    await readFile("test-results/browser-comparison.json", "utf8"),
  );
} catch {}
const browserRows =
  browserComparison?.records
    .flatMap((browser) =>
      browser.scenarios.map(
        (scenario) =>
          `| ${browser.browser} ${browser.version} | ${scenario.name} | ${median(scenario.samples.map((s) => s.workingSetMiB)).toFixed(1)} | ${median(scenario.samples.map((s) => s.cpuOneCorePercent)).toFixed(2)} | ${median(scenario.samples.map((s) => s.processCount))} |`,
      ),
    )
    .join("\n") || "Comparison not available.";
async function size(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    total += entry.isDirectory() ? await size(file) : (await stat(file)).size;
  }
  return total;
}
const text = `# Performance observations

Measured ${new Date(p.date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST. These are actual observations from a short local run, not memory promises or production benchmarks.

## Environment and method

- OS: ${p.os}, build ${p.release}, ${p.arch}.
- CPU: ${p.cpu.trim()}, ${p.logicalCPUs} logical processors.
- Available physical RAM reported by the OS: ${(p.ram / 1073741824).toFixed(2)} GiB.
- Application: Piccolo ${p.app}, Windows x64 packaged build, Electron 45.0.0.
- Packaged app.asar SHA-256: \`${p.asarSHA256}\`.
- Fresh-profile first visible new-tab UI: **${Math.round(p.startupMs)} ms**, including Playwright launch/debugger setup. This is a fresh application launch with warm OS file caches, **not** a machine-cold startup measurement. A reboot-controlled cold-start study remains outstanding. Smoke reports also preserve their separate launch timings.
- Test pages: one or five static local HTTP pages with a title, heading and paragraph; no external scripts, images or advertising. A public example.com HTTPS page was separately checked in the smoke suite. These simple pages do not model a heavy web application.
- Each scenario settles for 2 seconds, then records 3 process snapshots 1 second apart. An extra metrics call establishes a CPU interval first. The table reports median and memory range; raw process records are in test-results/performance.json.
- Memory sums Electron's per-process working sets. Shared pages can be counted more than once; this is not exclusive/private memory or whole-machine RAM use. CPU is the sum of Electron's reported process percentages. Sampling and debugger overhead are present, and three short samples are insufficient for battery or sustained-idle conclusions.
- Fresh profiles keep MCP, extensions and daily wallpaper disabled by default. External AI clients and their stdio adapter processes are excluded from these browser-only figures. Their additional cost in an agent-enabled session has not been measured here.

## Observed scenarios

| Scenario | Median working set (MiB) | Range (MiB) | Median summed CPU (%) |
| --- | ---: | ---: | ---: |
${table}

## Before/after and process contributions

Baseline: Piccolo ${baseline?.app || "0.2.0"}, saved before repackaging in test-results/baseline-mcp.json, on the same Windows host using the identical static fixture/video bytes and short sampling method. Runs are separated in time and subject to GPU/cache/OS noise. These are observations, not controlled evidence that every change reduces memory. Brave's reported ~200 MB homepage was a user observation; a separate comparison below uses the same Windows measurement method for both applications.

| Scenario | Before MiB | After MiB | Before CPU % | After CPU % |
| --- | ---: | ---: | ---: | ---: |
${comparison}

First visible UI, fresh profile/warm OS caches: before ${Math.round(baseline?.startupMs || 0)} ms; after ${Math.round(p.startupMs)} ms. Neither value is a reboot-controlled cold-machine result.

| Scenario | Main MiB | Renderer MiB | GPU MiB | Other MiB | Processes | WebContents |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${breakdown}

Both raw reports include process and WebContents counts, repeated tab cycles and hidden/minimized scenarios. Renderer-process reuse and delayed GPU/allocator release can retain working sets after views are destroyed; a separate lifecycle test checks actual destruction. No GPU, sandbox, accessibility or web-security features were disabled to obtain these results.

Video used the same deterministic 320×180 VP8 WebM fixture, about 12 frames/second, muted and looped. The file in tests/fixtures/performance-wallpaper.webm is a geometric canvas recording retained from the earlier verified run. Initial reruns generated a 110-byte header with no frames when recording in the background; those attempts failed rather than being counted as live-wallpaper measurements, and failed reports are retained. Reduced motion is consistently emulated off for opt-in playback. Different codecs, GPU drivers, resolution and display scaling can change the result substantially.

The minimized-window check observed the video element paused: **${p.records.find((r) => r.name === "wallpaper paused when minimized")?.passed ? "PASS" : "FAIL"}**. Low-power mode was separately asserted to pause playback; disabling video does not immediately release every decoder/GPU allocation. Navigating away unmounts the single trusted new-tab video element rather than maintaining a decoder for each logical internal tab. No remote wallpaper is downloaded automatically.

The closing-tab scenario records resource usage after closing four views, rather than assuming memory returns immediately to baseline. A separate non-debugger lifecycle test verifies actual WebContents destruction on discard/close, renderer crash recovery and restoring a discarded tab. CDP attaches a capturer to pages, so the Playwright suite instead verifies that captured tabs are protected from sleeping. The capture guard was not disabled to make a test pass.

## Build sizes and reproducibility

- Windows NSIS installer: ${(installer.size / 1048576).toFixed(1)} MiB.
- Unpacked application folder: ${((await size(path.dirname(p.exe))) / 1048576).toFixed(1)} MiB.
- Executable alone: ${(p.exeBytes / 1048576).toFixed(1)} MiB; it requires the accompanying files.

Run \`npm run installer\`, set PICCOLO_EXE to release/0.3.0/win-unpacked/Piccolo.exe, then run \`npm run smoke\`, \`npm run lifecycle\`, \`npm run measure\`, \`node scripts/compare-browsers.mjs\` and \`node scripts/report-performance.mjs\`. Measurements create fresh isolated profiles. Repeat on the intended hardware, with realistic sites and without debugger overhead before drawing comparative conclusions.

## Fresh-profile Brave comparison

${browserComparison?.method || "No completed comparison run is available."}

| Browser / engine version | Scenario | Median Windows working set MiB | Median CPU % of one logical core | Processes |
| --- | --- | ---: | ---: | ---: |
${browserRows}

Startup to first UI: ${(browserComparison?.records || []).map((b) => `${b.browser}: ${Math.round(b.startupMs)} ms`).join("; ")}. Windows CPU here is computed from process CPU-time deltas and is not directly interchangeable with the Electron API percentages above. The homepage content and video host layouts differ; identical static-page rows are the closest content comparison. One sequential sample run is insufficient for a causal performance claim, a battery prediction or an arbitrary RAM target. Raw process evidence and paths are in test-results/browser-comparison.json.

The matched-content rows still show Piccolo using more memory than Brave, especially with several tabs. Different homepage content and startup services make homepage numbers less comparable. This update chiefly improves MCP correctness and keeps the existing low-power/static defaults; its modest before/after memory differences do not establish a general memory advantage. Longer steady-state trials, realistic workloads and enabled-agent overhead remain necessary.

## Implemented strategy and open work

The UI is bundled locally; internal tools are lazy loaded. Database operations run in a worker. History results are bounded and suggestions debounce. Only the active native website view is visible; inactive pages retain their renderer until actually discarded. Clock timers stop while the new-tab UI is hidden/minimized, and low-power mode uses minute ticks with hidden seconds. Process metrics refresh on request rather than polling. Download UI events are coalesced and record writes are bounded during progress.

Tab sleeping is configurable (0 disables it), excludes selected hosts, and protects active/pinned/loading/audible/captured/media-approved tabs. Active downloads and approved MCP tasks suspend automatic sleeping for their window. A media-approved tab is conservatively kept awake until closed, even if a media stream subsequently stops. MCP and optional managers are lazily loaded and disabled by default. The stdio adapter has no renderer, SDK or idle polling, and all agents reuse one browser. Session writes compare URL/pin snapshots instead of following every UI emit. Returning to a discarded tab reloads it and can lose forms, scroll and navigation history.

Still required for a mature performance assessment: reboot-controlled cold launches, longer idle/battery sampling, high-resolution video, real work sites, background tasks, hundreds of tab cycles, sleep/resume, different GPUs, multiple displays and longer resource-leak analysis. Electron is not claimed to guarantee a small installer or low RAM use.
`;
await writeFile("PERFORMANCE.md", text);
console.log(table);
