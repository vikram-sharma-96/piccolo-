# Performance observations · 0.4 maintenance run

## Agent workspace 0.7 · 25 October 2026

Fresh pre-change 0.6 baseline: `test-results/agent-before-0.6.0.json`, Windows 11, Ryzen 7 6800H, 16 logical CPUs, approximately 7.2 GiB physical RAM available to the host. The baseline warm, debugger-attached startup was 958 ms; idle gradient new tab averaged 411 MiB summed Electron working set, one static local page 513 MiB and five static pages 908 MiB. This is not a cold-boot or low-spec certification.

The same packaged-browser harness after the change (`test-results/agent-after-0.7.0.json`) observed:

| Browser-only state | 0.6 baseline | 0.7 |
|---|---:|---:|
| Idle gradient new tab | 411 MiB | 418 MiB |
| One static page | 513 MiB | 516 MiB |
| Five static pages | 908 MiB | 905 MiB |
| After closing four tabs | 523 MiB | 519 MiB |
| After ten tab cycles | 522 MiB | 528 MiB |

The single instrumented startup observation rose from 958 to 1,249 ms. This is a measured increase, not evidence of a causal regression or an improvement; repeated controlled startup trials are still needed. Short 0.7 Electron CPU averages were 0.051%, 0.119%, 0.081%, 0.064% and 0.828% respectively. Wallpaper pause/hidden/minimized/low-power checks passed. These are observations on this active development host, not hard resource guarantees.

Actual packaged 0.7 AdaL observations (`docs/evidence/0.7/first-round-performance.json`, three short samples each; the separate final verification records its own samples):

| State | Electron working set | Owned Windows process-tree working set | Electron reported CPU |
|---|---:|---:|---:|
| Attached-image task, actual vision query planning | 629 MiB | 963 MiB | 0.011% |
| After image task completion | 570 MiB | 672 MiB | 0.095% |
| Active text provider before cancel | 654 MiB | 1,016 MiB | 0.109% |
| After provider cancellation/cleanup | 660 MiB | 759 MiB | 0.075% |

The owned-tree column includes AdaL/runtime/shell descendants that Electron's counters omit. Working sets may double-count shared pages. CPU percentages use Electron's normalization, exclude external AdaL CPU and are short samples; the evidence also records a rough matched-PID single-core OS CPU estimate. PowerShell inventory itself adds instrumentation pressure outside the measured tree. The post-task states retain different tabs, MCP and history and are not equivalent to fresh startup. The test verifies the observed AdaL PID has actually exited after cancellation. Coding smoke separately measures the real workbench, terminal/preview and cleanup; concurrent tasks are not supported.

Including external descendants, the approximate OS CPU samples were **83% of one core during vision planning** and **91% during the active text query**, falling to about 1.1% and 2.2% after their respective cleanup states. On this 16-logical-CPU host these are not 83–91% of total machine capacity. They do show that Electron's near-zero counters alone would substantially understate active AdaL work. No claim of low active-provider CPU is made.

Ordinary browsing starts no AdaL subprocess or Code host. Opening Agent lazily loads its adapter; actual provider work starts only after task consent. There is no periodic screenshot capture or permanent animation loop. Task concurrency, image/context/output sizes, event count and retained tasks are bounded. Encrypted artifact blobs are written once instead of re-encrypting screenshots at every step. Active Code plus AdaL has a material RAM cost; close Code and stop/disconnect Agent when finished. Long-duration idle, battery usage, repeated provider/crash soak and other hardware remain unmeasured.

Measured 25 October 2026 IST using the final packaged application, with fresh profiles on the same Windows 11 / Ryzen 7 6800H host (16 logical CPUs; 7.19 GiB physical RAM reported). No other Piccolo test suites ran during this measurement. Raw evidence: <code>test-results/baseline-0.4.0.json</code> (preserved 0.3 package) and <code>test-results/after-0.4.0.json</code> (0.4).

The existing method is unchanged: warm file caches, Playwright/debugger overhead, two-second settle and three one-second process snapshots per scenario. Memory is the sum of per-process working sets, which can double-count shared pages. CPU is the sum of Electron-reported process percentages. These are short observations, not battery tests or low-spec hardware guarantees.

| Scenario | 0.3 median MiB | 0.4 median MiB | 0.3 CPU % | 0.4 CPU % |
| --- | ---: | ---: | ---: | ---: |
| new-tab idle, gradient | 389.8 | 397.4 | 0.037 | 0.026 |
| one active static local page | 486.2 | 497.3 | 0.029 | 0.027 |
| five loaded static local pages | 880.2 | 882.8 | 0.053 | 0.056 |
| after closing four tabs | 502.7 | 507.0 | 0.019 | 0.017 |
| after ten open/close cycles | 500.1 | 504.8 | 0.028 | 0.027 |
| video wallpaper enabled (320x180 VP8, muted) | 475.9 | 481.8 | 0.362 | 0.406 |
| video wallpaper hidden by webpage | 577.4 | 589.3 | 0.048 | 0.048 |
| video wallpaper minimized | 478.9 | 488.0 | 0.021 | 0.062 |
| video wallpaper window hidden | 471.1 | 480.2 | 0.017 | 0.017 |
| video wallpaper disabled by low-power mode | 481.9 | 491.0 | 0.045 | 0.027 |

First visible new-tab launch: 735 ms before, 661 ms after. This is not a cold-machine benchmark; the difference cannot be attributed to a specific code change.

Default static new-tab working set changed by 7.5 MiB (1.9%). There is no claim of a memory reduction in this update. Idle CPU remains small in these samples; opt-in video costs more. Short-run CPU variation is insufficient to establish a sustained improvement or regression. Hidden/minimized and low-power video decoder-removal assertions passed. Longer battery and low-spec-machine sampling remains outstanding.

Final measured app.asar SHA-256: <code>1b67ec7179c9776c375d422dd248c73f27579dc5543c0d3451e8502218e82be4</code>.

Motion adds no dependency or renderer: CSS and short chrome-only WAAPI effects run on interactions; low-power is on by default and disables nonessential motion. There are no new continuous animation loops. The standard scenarios cover tabs and wallpaper; they do not quantify CPU during a long series of menu/reorder interactions or a hostile download flood. Regenerate this section with <code>node scripts/report-maintenance.mjs</code> after measuring.

---

## Historical 0.3 observations

# Performance observations

Measured 24/10/2026, 11:58:14 pm IST. These are actual observations from a short local run, not memory promises or production benchmarks.

## Environment and method

- OS: Windows 11 Home Single Language, build 10.0.26200, x64.
- CPU: AMD Ryzen 7 6800H with Radeon Graphics, 16 logical processors.
- Available physical RAM reported by the OS: 7.19 GiB.
- Application: Piccolo 0.3.0, Windows x64 packaged build, Electron 45.0.0.
- Packaged app.asar SHA-256: `9fadeaed5f4754c00fda0a03655102590028912adead3cdf025b0ee9cd939e85`.
- Fresh-profile first visible new-tab UI: **652 ms**, including Playwright launch/debugger setup. This is a fresh application launch with warm OS file caches, **not** a machine-cold startup measurement. A reboot-controlled cold-start study remains outstanding. Smoke reports also preserve their separate launch timings.
- Test pages: one or five static local HTTP pages with a title, heading and paragraph; no external scripts, images or advertising. A public example.com HTTPS page was separately checked in the smoke suite. These simple pages do not model a heavy web application.
- Each scenario settles for 2 seconds, then records 3 process snapshots 1 second apart. An extra metrics call establishes a CPU interval first. The table reports median and memory range; raw process records are in test-results/performance.json.
- Memory sums Electron's per-process working sets. Shared pages can be counted more than once; this is not exclusive/private memory or whole-machine RAM use. CPU is the sum of Electron's reported process percentages. Sampling and debugger overhead are present, and three short samples are insufficient for battery or sustained-idle conclusions.
- Fresh profiles keep MCP, extensions and daily wallpaper disabled by default. External AI clients and their stdio adapter processes are excluded from these browser-only figures. Their additional cost in an agent-enabled session has not been measured here.

## Observed scenarios

| Scenario | Median working set (MiB) | Range (MiB) | Median summed CPU (%) |
| --- | ---: | ---: | ---: |
| new-tab idle, gradient | 393.3 | 393.2–394.1 | 0.05 |
| one active static local page | 496.9 | 496.8–497.5 | 0.04 |
| five loaded static local pages | 885.9 | 878.3–886.3 | 0.05 |
| after closing four tabs | 506.5 | 506.5–506.5 | 0.02 |
| after ten open/close cycles | 503.3 | 500.4–511.3 | 0.03 |
| video wallpaper enabled (320x180 VP8, muted) | 476.9 | 476.6–477.4 | 0.42 |
| video wallpaper hidden by webpage | 581.5 | 579.7–582.2 | 0.05 |
| video wallpaper minimized | 481.6 | 481.4–481.8 | 0.02 |
| video wallpaper window hidden | 473.8 | 473.8–473.8 | 0.02 |
| video wallpaper disabled by low-power mode | 484.7 | 484.7–484.7 | 0.03 |

## Before/after and process contributions

Baseline: Piccolo 0.2.0, saved before repackaging in test-results/baseline-mcp.json, on the same Windows host using the identical static fixture/video bytes and short sampling method. Runs are separated in time and subject to GPU/cache/OS noise. These are observations, not controlled evidence that every change reduces memory. Brave's reported ~200 MB homepage was a user observation; a separate comparison below uses the same Windows measurement method for both applications.

| Scenario | Before MiB | After MiB | Before CPU % | After CPU % |
| --- | ---: | ---: | ---: | ---: |
| new-tab idle, gradient | 399.3 | 393.3 | 0.05 | 0.05 |
| one active static local page | 507.3 | 496.9 | 0.05 | 0.04 |
| five loaded static local pages | 903.9 | 885.9 | 0.07 | 0.05 |
| after closing four tabs | 514.7 | 506.5 | 0.02 | 0.02 |
| after ten open/close cycles | 512.8 | 503.3 | 0.04 | 0.03 |
| video wallpaper enabled (320x180 VP8, muted) | 486.6 | 476.9 | 0.50 | 0.42 |
| video wallpaper hidden by webpage | 589.2 | 581.5 | 0.06 | 0.05 |
| video wallpaper minimized | 490.3 | 481.6 | 0.02 | 0.02 |
| video wallpaper window hidden | 482.6 | 473.8 | 0.02 | 0.02 |
| video wallpaper disabled by low-power mode | 493.2 | 484.7 | 0.04 | 0.03 |

First visible UI, fresh profile/warm OS caches: before 946 ms; after 652 ms. Neither value is a reboot-controlled cold-machine result.

| Scenario | Main MiB | Renderer MiB | GPU MiB | Other MiB | Processes | WebContents |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| new-tab idle, gradient | 128.6 | 91.4 | 125.6 | 47.7 | 4 | 1 |
| one active static local page | 131.9 | 187.6 | 127.6 | 49.8 | 5 | 2 |
| five loaded static local pages | 136.6 | 569.7 | 129.7 | 50.2 | 9 | 6 |
| after closing four tabs | 135.9 | 190.5 | 129.7 | 50.3 | 5 | 2 |
| after ten open/close cycles | 135.8 | 192.7 | 124.5 | 50.3 | 5 | 2 |
| video wallpaper enabled (320x180 VP8, muted) | 131.3 | 107.2 | 187.8 | 50.3 | 4 | 1 |
| video wallpaper hidden by webpage | 131.1 | 210.7 | 189.4 | 50.3 | 5 | 2 |
| video wallpaper minimized | 131.4 | 112.1 | 187.7 | 50.3 | 4 | 1 |
| video wallpaper window hidden | 131.5 | 112.4 | 179.6 | 50.3 | 4 | 1 |
| video wallpaper disabled by low-power mode | 131.5 | 115.1 | 187.7 | 50.3 | 4 | 1 |

Both raw reports include process and WebContents counts, repeated tab cycles and hidden/minimized scenarios. Renderer-process reuse and delayed GPU/allocator release can retain working sets after views are destroyed; a separate lifecycle test checks actual destruction. No GPU, sandbox, accessibility or web-security features were disabled to obtain these results.

Video used the same deterministic 320×180 VP8 WebM fixture, about 12 frames/second, muted and looped. The file in tests/fixtures/performance-wallpaper.webm is a geometric canvas recording retained from the earlier verified run. Initial reruns generated a 110-byte header with no frames when recording in the background; those attempts failed rather than being counted as live-wallpaper measurements, and failed reports are retained. Reduced motion is consistently emulated off for opt-in playback. Different codecs, GPU drivers, resolution and display scaling can change the result substantially.

The minimized-window check observed the video element paused: **PASS**. Low-power mode was separately asserted to pause playback; disabling video does not immediately release every decoder/GPU allocation. Navigating away unmounts the single trusted new-tab video element rather than maintaining a decoder for each logical internal tab. No remote wallpaper is downloaded automatically.

The closing-tab scenario records resource usage after closing four views, rather than assuming memory returns immediately to baseline. A separate non-debugger lifecycle test verifies actual WebContents destruction on discard/close, renderer crash recovery and restoring a discarded tab. CDP attaches a capturer to pages, so the Playwright suite instead verifies that captured tabs are protected from sleeping. The capture guard was not disabled to make a test pass.

## Build sizes and reproducibility

- Windows NSIS installer: 120.7 MiB.
- Unpacked application folder: 395.2 MiB.
- Executable alone: 238.5 MiB; it requires the accompanying files.

Run `npm run installer`, set PICCOLO_EXE to release/0.3.0/win-unpacked/Piccolo.exe, then run `npm run smoke`, `npm run lifecycle`, `npm run measure`, `node scripts/compare-browsers.mjs` and `node scripts/report-performance.mjs`. Measurements create fresh isolated profiles. Repeat on the intended hardware, with realistic sites and without debugger overhead before drawing comparative conclusions.

## Fresh-profile Brave comparison

Fresh isolated profiles, visible Windows applications, GPU/security defaults retained, CDP attached to both and Node inspector additionally attached to Piccolo. Same local static fixture and deterministic 320x180 VP8 video. Two-second settling, three one-second-plus-CIM samples, summed Windows working sets (shared pages double counted); CPU is percent of one logical core. Sequential single runs, warm OS cache, no causal or battery-life claim. Default homepages and video host UIs differ.

| Browser / engine version | Scenario | Median Windows working set MiB | Median CPU % of one logical core | Processes |
| --- | --- | ---: | ---: | ---: |
| Piccolo 0.3.0 | default homepage (different content) | 407.8 | 0.00 | 5 |
| Piccolo 0.3.0 | one identical static webpage | 509.5 | 0.00 | 6 |
| Piccolo 0.3.0 | five identical static webpages | 897.7 | 0.98 | 10 |
| Piccolo 0.3.0 | after closing four tabs | 517.1 | 0.00 | 6 |
| Piccolo 0.3.0 | after ten tab cycles | 514.4 | 0.00 | 6 |
| Piccolo 0.3.0 | same video, different host UI | 491.5 | 4.96 | 5 |
| Piccolo 0.3.0 | video window minimized | 492.0 | 0.00 | 5 |
| Brave 156.1.98.60 (Chromium 156.0.8078.48) | default homepage (different content) | 530.2 | 25.65 | 7 |
| Brave 156.1.98.60 (Chromium 156.0.8078.48) | one identical static webpage | 491.1 | 6.64 | 7 |
| Brave 156.1.98.60 (Chromium 156.0.8078.48) | five identical static webpages | 740.7 | 0.00 | 11 |
| Brave 156.1.98.60 (Chromium 156.0.8078.48) | after closing four tabs | 503.4 | 0.00 | 7 |
| Brave 156.1.98.60 (Chromium 156.0.8078.48) | after ten tab cycles | 505.6 | 0.00 | 7 |
| Brave 156.1.98.60 (Chromium 156.0.8078.48) | same video, different host UI | 604.3 | 5.66 | 7 |
| Brave 156.1.98.60 (Chromium 156.0.8078.48) | video window minimized | 608.4 | 4.72 | 7 |

Startup to first UI: Piccolo: 633 ms; Brave: 999 ms. Windows CPU here is computed from process CPU-time deltas and is not directly interchangeable with the Electron API percentages above. The homepage content and video host layouts differ; identical static-page rows are the closest content comparison. One sequential sample run is insufficient for a causal performance claim, a battery prediction or an arbitrary RAM target. Raw process evidence and paths are in test-results/browser-comparison.json.

The matched-content rows still show Piccolo using more memory than Brave, especially with several tabs. Different homepage content and startup services make homepage numbers less comparable. This update chiefly improves MCP correctness and keeps the existing low-power/static defaults; its modest before/after memory differences do not establish a general memory advantage. Longer steady-state trials, realistic workloads and enabled-agent overhead remain necessary.

## Implemented strategy and open work

The UI is bundled locally; internal tools are lazy loaded. Database operations run in a worker. History results are bounded and suggestions debounce. Only the active native website view is visible; inactive pages retain their renderer until actually discarded. Clock timers stop while the new-tab UI is hidden/minimized, and low-power mode uses minute ticks with hidden seconds. Process metrics refresh on request rather than polling. Download UI events are coalesced and record writes are bounded during progress.

Tab sleeping is configurable (0 disables it), excludes selected hosts, and protects active/pinned/loading/audible/captured/media-approved tabs. Active downloads and approved MCP tasks suspend automatic sleeping for their window. A media-approved tab is conservatively kept awake until closed, even if a media stream subsequently stops. MCP and optional managers are lazily loaded and disabled by default. The stdio adapter has no renderer, SDK or idle polling, and all agents reuse one browser. Session writes compare URL/pin snapshots instead of following every UI emit. Returning to a discarded tab reloads it and can lose forms, scroll and navigation history.

Still required for a mature performance assessment: reboot-controlled cold launches, longer idle/battery sampling, high-resolution video, real work sites, background tasks, hundreds of tab cycles, sleep/resume, different GPUs, multiple displays and longer resource-leak analysis. Electron is not claimed to guarantee a small installer or low RAM use.
# Coding workspace observations (0.6)

2026-10-25, Windows 11 x64, Ryzen 7 6800H, 16 logical CPUs, about 7.2 GiB usable RAM. A personal 0.4 browser and the Codex desktop app remained open; these are warm, instrumented observations rather than controlled low-spec benchmarks. Fresh isolated profiles were used.

The preserved 0.4 baseline `test-results/coding-before.json` measured about **435 MiB** summed Electron working set at an idle gradient new tab. Initial packaged 0.6 workflow measurements (`test-results/coding-1792907929266/report.json`) observed:

| State | Summed Electron working set | Owned OS process-tree working set |
|---|---:|---:|
| Fresh ordinary browser | 432 MiB | 430 MiB |
| Trusted workbench and JSON worker | 1,288 MiB | 1,285 MiB |
| Workbench, terminal and local Node preview | 1,332 MiB | 1,415 MiB |
| Workspace closed; preview browser tab and MCP remain | 716 MiB | 723 MiB |

These are three samples after two seconds settling, not a resident-memory guarantee. Working sets can double-count shared pages. Electron metrics omit PowerShell/Node children; the additional Windows descendant-tree measurements include them. Instrumentation spawns PowerShell outside the measured app tree and affects CPU/cache pressure. Electron's average reported CPU percentages were roughly 0.03%, 1.22%, 0.76% and 0.11% respectively; these use Electron's normalization and are not directly comparable to summed OS core-time percentages. This short interval includes worker settling, not a long idle/power measurement.

The active workbench has a material memory cost and large lazy chunks. This is not a 200 MB IDE or proof of suitability on every low-spec computer. Ordinary browsing starts no coding host, shell or watcher. Close destroys the coding view/workers and kills the owned terminal tree; the remaining preview tab/MCP explain why the final sample is not equivalent to fresh startup. No permanent animation loop or extra animation renderer was introduced. Full raw samples are in coding smoke reports, including final packaged verification. Long-duration idle, battery, repeated multi-project stress and other hardware remain unmeasured.

