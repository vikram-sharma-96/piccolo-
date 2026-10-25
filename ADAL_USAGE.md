# Actual AdaL usage

## GTM continuation · 25 October 2026

`adal_get_status` succeeded (1.11.0). A real query through the existing `AdalProvider` confirmed model authentication; no credential values were exposed or copied. The non-secret local model catalog advertised `gpt-image-2.5-flare`. The in-app task then used the real authenticated MCP connection, explicitly attached Comet/Neon/Dia pages, and seven AdaL planning decisions. A separately approved instance of that existing adapter enabled exactly one `generate_image` call. It produced a real 1088 × 608 banner; actual file bytes were decoded and verified, not substituted with a fixture or placeholder.

The six successful capability steps were `generate_launch_banner`, three `browser.observe` calls, `write_gtm`, and `verify_gtm`. Three linked Markdown drafts and the real image passed disk checks; nine competitor fields were linked and four marked unknown. The test harness supplied native approval responses in its isolated profile. Nothing was sent or published. Non-sensitive outputs, source records, approvals and verification are under `docs/evidence/gtm/`; raw local traces remain under `test-results/gtm-live-1792936046131/`. This runtime evidence is separate from development assistance and does not claim broader AdaL delegation or general tool access.

## Spreadsheet continuation · 25 October 2026

Actual runtime AdaL queries researched the attached live ElevenLabs, Otter and Fireflies pricing pages plus a deliberately unreachable `.invalid` URL through authenticated Piccolo MCP observations. The provider then selected real `write_sheet` and `verify_sheet` capabilities; filesystem writes and cell comparison ran in Piccolo main under file-edit/native consent. Final non-sensitive CSV, per-cell record, screenshot and source-check summary are under `docs/evidence/sheets/`.

Two early attempts stopped at the repetition guard: large page structures caused the existing serialized-context slice to hide the latest result. The fix bounds whole observations and retains valid JSON; a unit test reproduces the large-context case. An initial completed run also exposed a test-harness tab-selection issue before its artifact screenshot. Source review of a later run caught an unsupported Otter “forever” qualifier; it was excluded from the delivered rerun. No successful factual/source review is claimed for those earlier outputs. AdaL performs planning/extraction; Piccolo's deterministic verification proves disk/extraction agreement, not semantic truth.

## Unified Agent workspace · 25 October 2026

Development and runtime usage are separate evidence:

An initial review invocation supplied mutually exclusive enabled/disabled tool lists and was rejected before review; it produced no findings. The corrected read-only invocation below completed. A later follow-up timed out and is recorded separately.

| Interface / operation | Purpose and observed result | Effect / verification |
|---|---|---|
| AdaL MCP `adal_get_status` | Confirmed actual AdaL 1.11.0 installation | Standard runtime discovery; no credential files read |
| AdaL MCP `adal_run_task`, read-only self-review, Read/Search only | Reviewed source boundaries; returned terminal ownership, incomplete cancellation and understated workspace-grant findings | Client-owned shell guard, cancelable delete prompt, truthful grant wording and explicit local coordinator; full response in `docs/evidence/adal-phase-a.md` |
| Follow-up `adal_run_task` review | Timed out after 180 seconds | No findings or successful review claimed for this attempt |
| Direct SDK probe, actual local authenticated AdaL | Returned arithmetic JSON and identified PICCOLO / 731 / red from a generated image without those contents in its instruction | `scripts/agent-adal-probe.mjs`, `test-results/agent-adal-probe-1792910182338/report.json` |
| Application SDK queries through Piccolo's coordinator | Real selected-tab research, source notes and actual encrypted artifact read-back; actual image findings with native review; form-error recovery; pause/resume and cancellation | Eleven real integration checks in `test-results/agent-1792917372461/report.json`; observed OS AdaL process exit, not only a UI counter |
| Application SDK coding/vision workflow | Sixteen model decisions: scoped file read/edit, Git diff, approved Node check, loopback server/preview, actual page verification, authorized screenshot and reviewed image findings | Fourteen recorded capability steps in `test-results/agent-coding-1792917574865/task.json`; check independently rerun, Git commit count unchanged, preview server stopped |

The TypeScript adapter implements protocol 1 as inspected in the official MIT-licensed AdaL SDK at commit `8fc658151e7ffebbe3fdd0b915dc01dbe2ee44be`. Sources: [SDK repository](https://github.com/SylphAI-Inc/adal-sdk), [quickstart](https://docs.sylph.ai/integration/sdk/quickstart/), [permissions](https://docs.sylph.ai/integration/sdk/permissions/). License retained in `assets/licenses/AdaL-SDK-LICENSE.txt`. The adapter exchanges initialize/ready/query/assistant-message/command-result and permission-control frames; no SDK source is copied into product code.

AdaL materially proposes operational plans and selects each capability from actual observations. Piccolo performs scheduling, JSON/schema validation, authorization, lifecycle management, state persistence and independent checks. No delegation, native streaming, private reasoning display, audio/video, model-native function calling or exact monetary accounting is claimed. Default runtime tools are disabled and all tool callbacks denied; the installed CLI/global configuration remains a trusted dependency. Tests use isolated harmless fixtures and programmatically answer native dialogs. Provider authentication/retention belongs to AdaL; Piccolo neither copies keys nor promises deletion of provider-side sessions.

## 0.4 continuation · 25 October 2026

`adal_get_status` confirmed the installed AdaL 1.11.0 MCP integration. `adal_run_task` completed a read-only `self-review` with `Read,Search` tools, a 180-second limit, and explicit instructions not to edit, execute code, inspect profiles/credentials or spawn agents. It read the download/main/shared sources and returned concrete lifecycle findings. No autonomous product implementation or tests are attributed to that review.

Reviewed findings led to per-window approval locks, guards against pausing/resuming finished transfers, awaited shutdown/staging cleanup, stronger risky-name coverage, bounded blocked-record retention and batched flood persistence. The save chooser's suggested AbortSignal was rejected after checking Electron 45's actual SaveDialogOptions: that API has no signal. A late chooser result is instead ignored after the terminal/source checks. Existing shared normal-window record broadcasts were retained; a speculative overwrite finding was checked with a real two-window transfer/cancellation fixture, which passed. Filesystem copy/crash limitations are documented rather than described as atomic publication.

All verification results in this release come from the repository/Electron/MCP harnesses, not AdaL assertions.

Development date: 2026-10-24, Windows host. The AdaL MCP server exposed `adal_get_status`, `adal_list_sessions`, `adal_run_task` and `adal_resume_task`. Status reported AdaL 1.11.0, installed at the user's local AdaL directory. Credentials/settings contents were not read or copied into this repository.

## Activity log

1. `adal_get_status` succeeded and confirmed the installation.
2. A read-only architecture/security review was requested using `adal_run_task`, self-review mode, `acceptEdits`. It stopped before its first shell read because that mode required unattended approval. It did not execute the review. No evidence is claimed for that attempt.
3. The review was rerun in self-review mode with `yolo`, explicitly restricted to source inspection/build and no credential access. AdaL read main/shared sources, checked renderer usages, and ran `npm.cmd run build`. It returned concrete findings about session shutdown races, popup floods, external prompts, single-instance ownership, private favicon requests, shared state, worker shutdown, import parsing and callback event exposure.
4. Findings informed implementation changes: atomic session snapshot, single-instance lock, SQLite busy timeout/checkpoint, runtime collection validation, shared-state broadcasts, captured/media tab exclusions, private favicon suppression, rate/interaction gating, bounded popup creation, safe preload wrappers, and non-executing HTML bookmark parsing. AdaL findings were reviewed against the source rather than treated as unquestioned authority.
5. A lifecycle debugging task was attempted in AdaL engineer mode. The tool reported that this mode requires tmux/WSL and is not natively supported on Windows. No task execution is claimed for that attempt.
6. The lifecycle debugging task was retried in supported coding mode, scoped to the test runner. The call timed out after 240 seconds, but it left a real change to the lifecycle runner and added scripts/run-lifecycle.mjs. AdaL identified premature process exit on the last-window close. Codex then corrected a protocol-registration timing error in that runner, ran it successfully without CDP, and preserved test-results/lifecycle.json. The verified checks destroy/restore an inactive view, force a real renderer crash/reload, close tab resources, persist the final-window snapshot and reject database operations after close. The timed-out task is not claimed as a completed AdaL execution.

Codex authored the browser and integration tests. AdaL's completed initial contribution was an actual code/build review; it did not run the Playwright browser smoke suite during that review. No demo recording was created by that review. Failed tool attempts are included for traceability rather than represented as completed work.

## Capture a genuine demo

1. Run `npm run build`, `npm test`, and `npm run smoke`; preserve their output plus `test-results/smoke.json`.
2. Build with `npm run package`. Set `PICCOLO_EXE` to the packaged executable and run `npm run smoke` again; preserve `packaged-smoke.json`.
3. Launch Piccolo and record the desktop window using a user-selected recording tool. Show a public website, tab switching/reorder, local bookmark/history, an actual download, a private window and cookie separation, and a new-tab widget edit that survives a relaunch.
4. Show the process metrics page and record the operating system, build and test conditions. Run `node scripts/performance.mjs` for reproducible measured snapshots.
5. Save recordings beside the JSON reports with dates and clear labels. Screenshots generated by the harness show the trusted renderer; they do not alone demonstrate native website compositing or taskbar/dock behavior. Use a desktop recording for those checks.

Never substitute animations, fabricated terminal output or generated screenshots for execution evidence. Test-only `executeJavaScript` calls and native-dialog stubs in the harness are not exposed by the product's preload bridge.

## prompt1 update: genuine activity

Two further AdaL MCP self-review tasks ran with yolo permissions and read-only scope. The first inspected the baseline, persistence/timers and password integration feasibility, and ran npm test (8 tests at that point). It identified redundant session writes and clock/state activity; code and raw measurements were checked independently before changes.

The second reviewed optional.ts, mcp.ts, browser/model/IPC checks and the actual upgrade-smoke evidence, and ran npm test (11 passed). No profiles, key files, credentials or account settings were read; no files were edited and no browser/performance runs were performed by AdaL in those tasks.

Its concrete security findings led to reviewed managed extension copies and full-file integrity, no-truncation MCP argument approval limits, cancellation-aware dialogs, safe title rendering, proxy failure retention/network pause, and explicit daily wallpaper replacement/direct-network consent. Codex authored and executed the actual Electron browser, extension, proxy, MCP and OS-encryption tests. The NASA request genuinely returned HTTP 500; this was recorded as fallback coverage, not successful wallpaper delivery.

The screenshot reference files mentioned in prompt1 were not present in the prompt directory. The existing Piccolo interface and the brief's compact-menu direction were used; no external screenshot evidence or demo recording was fabricated.

## Continuation: 2026-10-24

The earlier partial continuation already contained a stdio adapter and broader browser schemas. Source inspection in this request found that the adapter only connected to a running browser, the pipe lacked authentication, and trust was global; the earlier upgrade suite's tool-list check did not establish restart or browser-control correctness. These are not presented as newly implemented working features.

Two genuine AdaL MCP `adal_run_task` self-review calls ran in this continuation, with supported self-review/yolo mode and explicit read-only scope. `adal_get_status` confirmed AdaL 1.11.0. Neither review accessed profiles, identity files or user secrets, edited files, launched browsers, or ran another agent. Both returned source findings; browser tests and measurements were authored/run separately by Codex.

The first review identified unauthenticated IPC, global trust, settings self-escalation, missing individual revocation, plaintext fallback, missing adapter lifecycle handling and insufficient tool bounds. The fixes were checked against the actual source. Some review concerns (such as unsafe URL support) were explicitly unverified and were not recorded as established exploits.

The second review examined the new Ed25519 pairing/reconnect code. Its concrete findings led to persistence through the UI window's Store while the server is disabled, persist-before-publish grants, fail-closed registry parsing, cancellable/rate-limited pairing, explicit per-principal and per-connection abort signals, restoration to per-call access, correct adapter line framing/pending-request tracking, and rejection of failed reconnect initialization. Tests include disabled-state revocation across restart and revocation of an in-flight wait. Recommendations to prompt on every trusted settings change were not adopted: the user explicitly requested persistent browser settings control, and the allowlist blocks permission/provider/path escalation.

No demo recording or third-party GUI client installation is claimed. Native approvals are substituted only in fresh isolated test instances, never in the shipping application or the user's live browser. MCP authentication, interactions, restarts and OS credential encryption execute for real.
# Coding workspace continuation (2026-10-25)

No AdaL execution is claimed for this continuation. Codex inspected the restored 0.4 source and new `prompt/prompt2.md`, researched upstream architecture/licenses, implemented the Code OSS web workbench and narrow services, and ran real paired-MCP/Electron/Windows terminal tests in isolated profiles. Native chooser/consent responses were substituted only inside test instances. No personal profile, Git identity or client configuration was changed. Earlier AdaL records below refer to their original work only.

# Agent workspace development and runtime · 2026-10-25

Phase A used the configured AdaL MCP's actual `adal_get_status` and `adal_run_task` operations. Status confirmed local CLI 1.11.0. The first diagnostic failed because both positive and negative tool lists were specified; the corrected Read/Search-only self-review inspected the listed source files and returned concrete privilege/cancellation findings. The full non-sensitive output is preserved in `docs/evidence/adal-phase-a.md`. It led to per-client terminal ownership checks, cancelable delete dialogs, separate scoped coordinator permissions, and a single active agent/owning window. Independent TypeScript, unit and actual Electron checks validate the changes; a review's claims alone are not test evidence.

Runtime integration is separate and also real: the adapter uses AdaL's advertised `--sdk-runtime`, protocol 1, following official SDK source commit `8fc658151e7ffebbe3fdd0b915dc01dbe2ee44be`. All default tool groups are disabled; every tool-permission callback is denied. Piccolo executes validated proposals through a dedicated authenticated `piccolo-agent` MCP client, retaining local authorization. AdaL's cached credentials are neither read nor copied. No private reasoning events, raw stderr or tool arguments from the provider are stored.

The direct SDK probe at `test-results/agent-adal-probe-1792910182338/report.json` genuinely answered the arithmetic query and identified PICCOLO, 731 and red from an attached generated image. The application test at `test-results/agent-1792912189669/report.json` passed actual selected-tab research through MCP, source-linked image findings with user review, encrypted task storage, permission denials, pause/manual-change/resume and active provider cancellation. The researcher performed four actual model decisions, using page observation, note creation, artifact verification and completion; no prerecorded decisions or fake provider responses were used. The vision instruction did not disclose the expected image contents. Native responses were substituted only in fresh isolated test instances using harmless local data.

Sources: https://docs.sylph.ai/integration/sdk/quickstart/, https://docs.sylph.ai/integration/sdk/permissions/, and https://github.com/SylphAI-Inc/adal-sdk. API/provider quotas and model selection remain AdaL's responsibility. Application-native model calls, explicit image transmission, paired MCP execution and cancellation are distinct from the earlier development diagnostic. Current packaging and broader demonstration results will be recorded after they run.

## Outcome-evidence strengthening · 25 October 2026

**Inspected before edits:** `src/main/agent.ts` (`verify.page`, `artifact.note`, `write_sheet`, `verify_sheet`, GTM writers/verification and completion validation), `src/main/agent-engine.ts`, shared artifact/sheet/GTM types, and existing engine/sheet/GTM tests. The initial report identified unpinned `text.includes(expected)` retries, numeric substring matches, storage-only artifact checks and free-form completion summaries as gaps.

**Actual AdaL coding workflow:** `adal_get_status` reported 1.11.0. `adal_run_task` was invoked in coding mode with Read/Search/Edit/Bash, explicit source/test-only scope and no delegates, commits, installs, profile access or app control. The MCP call timed out after 300 seconds; its CLI process continued, wrote the initial patch/tests, ran tests and eventually reached its 600-second limit. That incomplete run is not reported as successful. Two direct local CLI continuations resumed the same session, `b5b1f001-d56a-474e-9c1c-4e2e3b244da7`, avoiding the MCP transport timeout. AdaL read/edited source and tests, fixed the initial error-diagnostic assertion failure, and reported 64 then 67 passing tests with clean TypeScript checks. No private reasoning or credential values were copied into the retained evidence.

**Files changed by AdaL:** new `src/shared/agent-evidence.ts` and `tests/agent-evidence.test.ts`; extended `src/main/agent.ts`, `src/main/agent-engine.ts`, `src/main/agent-gtm.ts`, `src/shared/agent.ts`, `src/shared/agent-gtm.ts`. These reuse existing snapshots, writers, task/artifact records and completion hooks. They add source-bound numeric/price evidence, exact amount/currency boundaries, English number-word/free-price phrases, immutable unresolved retry expectations, target-aware failure recovery, complete retained per-value evidence, visible unknown flags and deterministic completion summaries. Root review added the final bare-Free guard/regression test, live/evidence scripts and documentation; those edits are not attributed to AdaL.

**Tests and real results:** root independently ran the full unit suite: **68 passed, 0 failed**, from the previous 50-test baseline. The new tests cover observed/absent values, changed or dropped retry amounts, an extra unsupported second-product price, source-specific sheet cells, currencies/boundaries, GTM free text, unresolved targets, summary laundering, retained records, unknown flags, word amounts and free-price promises. Strict TypeScript and the production build succeeded. The real in-app AdaL task used the authenticated Piccolo MCP connection and attached `https://elevenlabs.io/pricing`; it observed the page, wrote `Observed quote: "Pro $99 per month"`, independently verified the page and note, and completed. Its supported `$99` records contain the actual source URL and page snippet. Provider decisions and observations were real; native consent responses were programmatically supplied only in the isolated test process. The already-open user app was not stopped or modified by the tests.

**Evidence:** [coding session results](docs/evidence/evidence-support/adal-coding.json), [live report](docs/evidence/evidence-support/live-report.json), [per-value verification](docs/evidence/evidence-support/verification.json), [written note](docs/evidence/evidence-support/note.txt), and [implementation/inspection details](EVIDENCE_VERIFICATION.md). Raw ignored logs are `test-results/adal-evidence-*-result.json`, `test-results/evidence-support-unit-final.log`, `test-results/evidence-support-build.log`, and the isolated live profile recorded in the report.

**Limitations:** this is lexical evidence support, not a semantic truth or product/plan-association checker. Non-numeric claims retain existing exact-excerpt GTM checks and human review; arbitrary prose is not generally proven. Matching uses bounded current observations and a finite English number-word/free-phrase vocabulary, without automatic word/digit conversion or every currency/locale alias. Recorded file/code evidence and deterministic operational metadata are distinct from webpage facts. Unsupported notes may be kept only with explicit visible unknown flags and never receive fully-supported verification. Full per-value records are retained within an explicit budget; oversized outputs are rejected and tool previews disclose truncation. No new installer or submission video was produced in this task.

