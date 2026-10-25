You are the lead architect and implementation engineer for Piccolo, an existing Electron, React, and TypeScript browser.

Build Piccolo into a unified AI-native workspace combining real browsing, autonomous browser control, multimodal intelligence, coding tools, and verified multi-step agent execution.

AdaL is mandatory for development and capability orchestration. Demonstrate genuine usage with reproducible evidence.

This is an implementation task. Work incrementally, preserve existing functionality, test the real desktop application, and deliver working results.

## 1. Establish the current state

Project:
`C:\Github Projects\Piccolo`

Before editing:

1. Read applicable repository instructions and `prompt/prompt.md`.
2. Inspect source, dependencies, tests, packaging, and documentation.
3. Inspect existing browser, MCP, coding workspace, and agent implementations.
4. Run available baseline checks.
5. Launch Piccolo and inspect actual behavior.
6. Record existing failures separately from new regressions.

Create a concise capability matrix:

- Implemented and verified.
- Implemented but unverified.
- Partially implemented.
- Missing.
- Blocked by an external dependency.

Preserve previous requirements concerning downloads, privacy, menus, themes, motion, customization, and low-spec performance.

Do not replace useful existing code merely to introduce a new architecture.

## 2. Establish mandatory AdaL usage

Discover the actual AdaL tools, supported interfaces, authentication requirements, and available orchestration capabilities.

Do not invent tool names or assume that an MCP server exists.

If AdaL MCP is available:

1. Inspect the exposed operations.
2. Perform a real development or diagnostic task.
3. Use relevant operations during implementation.
4. Integrate supported orchestration capabilities into the agent workflow.
5. Verify results independently.

If MCP is unavailable, investigate the supported AdaL CLI or desktop workflow.

If AdaL is entirely unavailable, continue independent preparation and implementation, but clearly report the blocker. Do not claim the mandatory AdaL requirement is satisfied.

Maintain `ADAL_USAGE.md` with:

- Date and development phase.
- Actual interface and operation used.
- Purpose and non-sensitive inputs.
- Observed output.
- How that output influenced implementation.
- Verification performed.
- Evidence location.
- Limitations.

Keep genuine logs or screenshots where appropriate, with credentials and personal data redacted.

Distinguish AdaL-assisted development from AdaL-powered runtime behavior. Evidence of one does not prove the other.

## 3. Define the unified architecture

Separate these trust and execution boundaries:

1. Electron main process: browser lifecycle, sessions, permissions, downloads, persistence.
2. Trusted browser renderer: chrome and internal pages.
3. Remote content: isolated websites.
4. Agent coordinator: task planning, capability routing, execution, cancellation, verification.
5. Provider adapters: configured model and multimodal services.
6. Coding workbench: editor and project UI.
7. Extension host and terminal processes.
8. MCP transport and capability adapters.
9. Artifact storage and execution records.

Define typed interfaces for:

- Workspace.
- Agent.
- Model/provider.
- Capability.
- Task and task step.
- Permission grant and approval request.
- Tool invocation and result.
- Artifact and source reference.
- Execution event.
- Verification result.
- Checkpoint and recovery state.

Use a capability registry with explicit schemas, permissions, availability, and execution limits.

Keep AdaL integration behind an adapter so supported operations can be routed through it without spreading provider-specific logic throughout the application.

Do not make remote webpages privileged orchestration surfaces.

## 4. Build one coherent workspace UI

Provide three connected working areas:

- Browser: real tabs and webpages.
- Code: project files, editor, terminal, Git, and preview.
- Agent: instructions, plan, execution timeline, approvals, and artifacts.

Make their relationship clear without permanent visual clutter. Use collapsible panels and compact navigation.

The agent panel should show:

- Selected agent and model.
- Available context and capabilities.
- Current task and step.
- What the agent is doing.
- Whether it is planning, acting, waiting, verifying, or blocked.
- Pending approval.
- Produced artifacts.
- Pause, cancel, and manual takeover.

Allow the user to select which tabs, files, images, or artifacts are attached to a task.

Never imply that every open tab or local file is automatically available to an agent.

Support Light, Dark, and System themes, accessible keyboard navigation, reduced motion, and low-power mode.

Apply installed Taste and Vercel interface guidelines where relevant. Keep Piccolo’s identity and browsing space.

## 5. Implement real model and multimodal providers

Create a provider interface for configured services, including supported capabilities such as:

- Text reasoning.
- Tool calls.
- Image understanding.
- Structured output.
- Streaming.
- Audio transcription or speech where actually supported.

Show an honest setup state when credentials or capabilities are unavailable.

Store secrets in an appropriate main-process credential facility. Do not expose them to webpages, renderer storage, logs, exports, or MCP configuration unnecessarily.

Expose provider errors, rate limits, unsupported inputs, and cancellation clearly.

Do not send screenshots, files, page contents, or audio to a provider without the user’s applicable permission.

## 6. Implement autonomous browser control

Build on Piccolo’s existing local MCP integration.

Support:

- Tab and window discovery.
- Navigation and tab management.
- Page structure and visible text extraction.
- Screenshots.
- Click, type, selection, scrolling, and keyboard input.
- Meaningful condition-based waits.
- Supported dialogs.
- Download inspection and approved download actions.
- Error and crash recovery.

Use stable target identifiers and detect stale page state.

Prefer structured page information and reliable locators where available. Use visual interaction when needed, with verification after actions.

Do not use arbitrary fixed delays as the primary synchronization strategy.

Maintain authenticated local access, persistent pairing, configure-once client setup, revocation, and restart reconnection.

## 7. Build the agent execution loop

Implement a real loop:

User instruction → scoped context → plan → capability selection → action → observation → plan adjustment → verification → artifact.

Represent steps as an explicit state machine, including:

- Pending.
- Running.
- Waiting for approval.
- Succeeded.
- Failed.
- Canceled.
- Skipped with explanation.

For each step, record:

- Objective.
- Selected capability.
- Input summary.
- Permission used.
- Result.
- Evidence.
- Verification status.

Do not store or expose private chain-of-thought. Display concise operational plans, decisions, tool activity, and observable evidence.

Implement:

- Step and task timeouts.
- Bounded retries with backoff.
- Detection of repeated ineffective actions.
- Cancellation propagated to active operations.
- Clear partial-completion reporting.
- Checkpoints for recoverable state.
- Safe recovery after interruption.
- Execution and provider cost limits where available.

Do not replay consequential actions automatically after a crash or uncertain response.

## 8. Use AdaL for capability orchestration

Identify which orchestration operations AdaL actually supports, then integrate them explicitly.

Where supported, use AdaL for:

- Selecting or coordinating capabilities.
- Breaking a task into executable steps.
- Delegating independent work.
- Gathering results.
- Tracking workflow progress.
- Debugging failed steps.

Keep Piccolo responsible for local authorization, browser isolation, lifecycle management, and verification.

AdaL output must not bypass user permissions or convert webpage instructions into trusted commands.

Demonstrate a multi-step workflow in which AdaL materially participates. Record the actual calls and observable outcomes.

If AdaL lacks a requested runtime capability, document the boundary and implement the surrounding coordination honestly. Do not label ordinary application code as AdaL orchestration.

## 9. Add multimodal workflows

Implement at least one real image-understanding workflow:

1. User attaches an image or authorizes a tab screenshot.
2. A configured vision-capable provider analyzes it.
3. The agent produces structured findings.
4. Findings link to the relevant image or screenshot.
5. The user can review the output before follow-up actions.

Example: inspect a Settings screenshot, identify layout issues, locate the relevant UI, and verify a proposed fix.

If audio is implemented, require explicit recording controls, a visible recording indicator, and clear retention behavior.

Do not claim video, speech, or image understanding based on file upload controls alone.

## 10. Integrate the coding workspace

Inspect the existing implementation first.

Provide real:

- User-selected project access.
- File explorer.
- Editor tabs and unsaved-change handling.
- Project search.
- Diagnostics.
- Integrated terminal.
- Git status and diffs.
- Local preview.
- Workspace restoration.

For VS Code extension support, evaluate an appropriate maintained workbench and extension host. Monaco alone does not establish general extension compatibility.

Verify distribution licenses and registry terms. Evaluate Open VSX and permitted VSIX installation rather than assuming Microsoft Marketplace access.

Run extension code separately from browser chrome and remote pages. Explain actual extension-host privileges.

Require explicit workspace trust before running project-defined tasks or unfamiliar executable components.

## 11. Connect browser, code, and verification

Implement a narrow end-to-end coding workflow:

1. User selects a project and gives an instruction.
2. Agent inspects authorized files.
3. Agent proposes a short implementation plan.
4. Agent edits relevant files.
5. Changes appear as a reviewable diff.
6. Agent runs authorized validation.
7. Agent opens the local preview.
8. Agent inspects the result through browser tools.
9. Agent fixes observed failures.
10. Agent produces a completion artifact with changes, checks, and limitations.

Detect concurrent file edits and avoid overwriting user changes.

Do not automatically commit, push, deploy, or install dependencies unless authorized.

## 12. Implement scoped permissions

Provide understandable, revocable grants for:

- Selected tabs.
- Browser control.
- Private-window access.
- Selected project folders.
- File editing.
- Terminal commands.
- Provider data transmission.
- Extension installation.
- External actions.

Trusted browser-control permission should allow routine navigation without repeated confirmation. It must not silently grant filesystem or terminal access.

Require appropriate approval before consequential actions such as sending messages, purchasing, publishing, changing account security, or destructive operations.

Treat webpages, repository files, extensions, and tool outputs as untrusted data.

## 13. Build useful artifacts and evidence

Store task outputs as inspectable artifacts:

- Research notes with source links.
- Structured extraction results.
- Screenshots.
- Code diffs.
- Test summaries.
- Download records.
- Verification reports.

Associate each artifact with its task, inputs, creation time, and verification state.

Keep sensitive data out of default exports. Provide deletion and retention controls.

Completion requires evidence that matches the task, not merely a successful model response.

## 14. Protect low-spec performance

Measure a baseline before adding agent and coding services.

Lazy-load model adapters, coding tools, extension hosts, and multimodal components. Ordinary browsing must not automatically start these services.

Avoid continuous screenshot capture, polling, unnecessary video decoding, and hidden animation loops.

Bound context size, tool output, logs, caches, and concurrency.

Provide explicit controls to stop agents and close coding workspaces, releasing their resources.

Measure:

- Browser-only idle.
- One active agent.
- Coding workspace open.
- Multimodal task.
- Concurrent tasks if supported.
- Cleanup after completion and cancellation.

Report actual memory, CPU, startup, hardware, build, and measurement method.

## 15. Implement in verified phases

### Phase A: Baseline and AdaL
Inspect, measure, discover AdaL, demonstrate a genuine operation, and document the architecture.

### Phase B: Browser automation
Verify secure MCP pairing, browser tools, scoped permissions, reconnect, and manual takeover.

### Phase C: Agent execution
Implement planning, step execution, observation, retries, cancellation, timeline, and verification.

### Phase D: Multimodal intelligence
Deliver one real image-understanding workflow using a configured provider.

### Phase E: Coding workspace
Deliver editing, terminal, Git, preview, and tested extension support.

### Phase F: Unified workflow
Complete a real browser-to-code-to-preview task with AdaL participation and evidence.

### Phase G: Reliability and packaging
Fix regressions, measure resource usage, verify cleanup, and test the packaged Windows application.

Build and validate each phase before expanding.

## 16. Demonstration scenarios

Use safe local fixtures and non-sensitive public pages.

Demonstrate:

1. Browser research: inspect several sources and produce a linked artifact.
2. Multi-step interaction: complete a local form workflow, recover from a controlled error, and verify final state.
3. Multimodal task: analyze an authorized image and produce grounded findings.
4. Coding task: edit a sample project, run checks, inspect its preview, and report the verified change.
5. User takeover: pause execution, modify state manually, and resume safely.
6. Cancellation: stop an active task and verify resource cleanup.
7. Permission denial: confirm that unauthorized files, private tabs, or external actions remain inaccessible.
8. AdaL orchestration: show its actual role in a completed multi-step workflow.

Never use fake tool results, fabricated screenshots, or prerecorded success as proof of a live capability.

## 17. Final deliverables

Provide:

- Working source and packaged Windows build, or an exact packaging blocker.
- Repeatable development, test, build, and packaging commands.
- Provider and MCP setup instructions.
- Capability and extension compatibility matrices.
- Architecture and permission documentation.
- Genuine AdaL usage evidence.
- Demonstration steps and non-sensitive artifacts.
- Automated and application-level test results.
- Performance measurements.
- Implemented, verified, limited, and deferred feature status.

Update README, ARCHITECTURE, SECURITY, PERFORMANCE, ADAL_USAGE, and ROADMAP.

Success means Piccolo can complete a real multi-step task across browsing, multimodal understanding, and coding, with AdaL demonstrably involved, visible user control, and verifiable results.