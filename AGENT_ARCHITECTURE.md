# Agent workspace implementation log

## Phase A · 2026-10-25

Baseline: Piccolo 0.6 commit `de14be7`, Electron 45, React 19 and strict TypeScript. New requirements: `prompt/prompt3.md`; original `prompt/prompt.md` and existing trust, download, appearance, resource and coding requirements remain applicable. No repository AGENTS.md was present. Test profiles are isolated; the personal browser is left alone.

| Capability at the start of this phase | Status | Evidence / boundary |
|---|---|---|
| Browsing, downloads, persistent paired MCP, tabs and private isolation | Implemented and verified | Fresh 19-unit baseline, packaged browser and MCP suites rerun; `test-results/agent-baseline-*.log` |
| Code OSS workbench, web extension host, Git, native terminal and preview | Implemented and verified in 0.6 | Existing 24-case packaged coding and four-case visible UI evidence in RELEASE_0_6.md; new agent integration needs separate tests |
| Autonomous coordinator, agent timeline, scoped context and artifacts | Missing at baseline | Existing `workspace.ts` was contracts only |
| Multimodal/model runtime | Missing at baseline | No configured Piccolo model adapter or image workflow |
| AdaL development assistance | Implemented and verified | Actual MCP status and read-only diagnostic recorded in `docs/evidence/adal-phase-a.md` |
| AdaL runtime text/image input | Adapter probe verified; application integration in progress | `test-results/agent-adal-probe-1792910182338/report.json`: actual arithmetic JSON and correctly identified PICCOLO / 731 / red from generated image |
| Other provider adapters/audio/video | Missing | No capability claims |

AdaL 1.11.0 is actually installed. Discovered MCP tools: `adal_get_status`, `adal_list_sessions`, `adal_run_task`, `adal_resume_task`. Its local CLI advertises `--sdk-runtime`. Official SDK source inspected at commit `8fc658151e7ffebbe3fdd0b915dc01dbe2ee44be`, protocol 1, from https://github.com/SylphAI-Inc/adal-sdk. The TypeScript adapter implements the observed documented SDK message subset: initialize, ready, query with image data URIs, assistant.message.completed, command.completed/failed, cancellation/shutdown and tool-permission control responses. No SDK code is copied. See https://docs.sylph.ai/integration/sdk/quickstart/ and https://docs.sylph.ai/integration/sdk/permissions/.

The runtime adapter launches AdaL only for an explicitly started task, in a new owned directory containing a fixed product system prompt. All default tool groups are disabled and every tool callback is denied, including otherwise configured MCP/custom tools. It never uses the selected project as AdaL's working directory. Piccolo sends only user-attached context, validates structured proposals, and executes capabilities through its own permission checks. AdaL's cached authentication remains owned by AdaL; Piccolo does not read, copy, export or expose it. Task transmission still needs native consent.

Trust boundaries: browser main/session/download services; trusted browser renderer; isolated remote pages; lazy coordinator; provider adapter process; separate coding view; extension host and terminal; paired MCP transport; private task/artifact storage. No remote page becomes an orchestration surface. The coordinator uses a dedicated named paired MCP client, explicit selected-tab/file filters, a single active task, bounded calls/outputs/time and revocable task context. Browser grant does not grant workspace/terminal access. No automatic commit, push, deploy, dependency install or arbitrary privileged command capability is offered.

The AdaL diagnostic highlighted shared terminal authority and partially cancelable operations. The implementation now assigns a shell to its requesting MCP client, refuses access to user/other-client shells and stops the task-owned shell on pause/end. Native typing requires project takeover first. Delete dialogs honor cancellation, and the workspace grant describes file/editor/Git/preview/extension powers and terminal boundaries. Consequential interrupted effects are uncertain and are never silently replayed.

## Runtime and storage

`agent.cjs` is lazy-loaded only when Agent is opened. A dedicated authenticated `piccolo-agent` MCP transport executes a bounded typed capability registry; it cannot control Agent's own approval UI through `piccolo_ui`. Context is frozen per task. Tab ids, navigation revisions, origin approval and explicit tab targeting prevent accidental use of another active page. Files require exact attachment, a selected trusted project, independent workspace grants, dirty-editor checks and disk revision checks. All capability results are treated as untrusted observations.

The real AdaL subprocess receives a fixed product prompt, sanitized observations and only explicitly attached images. Default tool groups are disabled, and all tool-permission callbacks are denied. Piccolo executes proposals; AdaL does not receive a privileged browser API. Native thought/tool streams are discarded. The timeline records short operational plans, not private reasoning. The adapter has separate initialization/query timeouts and closes its owned process tree when canceled.

The state machine records pending/running/approval/success/failure/cancellation and checkpoints. A completion needs a successful independent verification; unresolved failed capabilities prevent completion. Unknown capabilities and invalid schemas fail closed. Provider retries, repeated unchanged actions, call count and elapsed task time are bounded. Cancellation can interrupt transfers/processes/waits but cannot promise to undo a JS action or disk effect that already completed.

History uses Windows `safeStorage` encryption in the main process. Artifact blobs are encrypted separately and written once, avoiding repeated image encryption for every event. Atomic metadata replacement has a bounded retry for transient Windows locks. The last five task records are retained; dropping/deleting records removes unreferenced owned blobs. Startup marks active checkpoints interrupted, revokes old task grants and never replays actions. The user may review artifacts and start a new explicitly scoped task.

UI direction reuses `.taste-skill/piccolo/direction.json`, Piccolo's semantic theme tokens, compact navigation and native-view overlay handling. The screen's main question is “What is this task doing, using which context, and what evidence supports its result?” Its distinctive element is the task's source → operation → verification record. No invented usage metrics or placeholder success timelines.
