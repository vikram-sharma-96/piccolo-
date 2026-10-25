# Piccolo Agent workspace

Open **Agent workspace** from the browser menu or **Agent** from Code. Browser, Code and Agent share one normal-window workspace; private windows cannot start agents.

## Setup and first task

1. Install AdaL from its official distribution, complete its sign-in and confirm `adal --version`. This release discovers the standard Windows install in `%USERPROFILE%\.adal`. AdaL is a separately installed, trusted dependency; it is not bundled in Piccolo.
2. Choose **Connect** in Agent. Approve the native pairing prompt for `piccolo-agent` with browser control. Pairing persists; **Disconnect** stops this connection without deleting the trusted-client record. Revoke the client from MCP settings to remove access.
3. Enter a task, explicitly attach ordinary webpage tabs, relative project filenames or images, and review the capability list. No open tabs or local files are attached by default. A model name selects an AdaL model registry entry; it is not an API key. Leaving it empty uses AdaL's configured default.
4. Start and review the native provider-transmission consent. Attached contents leave this computer through AdaL's configured provider. Screenshots require an additional task opt-in; image findings require native review before follow-up.
5. Inspect the operational plan, actions, observations and artifacts. Pause interrupts active work; resume observes current state. Take over or Cancel ends the task. Already completed effects are retained and are not rolled back.

For code work, first select and trust a temporary project in Code, then grant `piccolo-agent` separate project access from Project controls. Attach exact relative files and opt into edits and/or terminal use. An edit shows before/after text and requires native approval; unsaved editor changes or changed disk revisions block replacement. Every terminal input has a native approval showing the complete proposed command. Do not approve commands you do not understand: this is your Windows account, not an OS sandbox. Stop an existing user terminal before starting an agent-owned shell. Use Project **Take over** before typing into an automation-owned terminal.

## Boundaries and controls

| Area | Implemented behavior | Limit |
|---|---|---|
| Provider | Real AdaL SDK text and image queries; locally validated structured capability decisions | No native streaming, audio/video adapter, native schema guarantee or monetary/token accounting |
| Browser | Attached-tab structure/text, navigation, fresh-revision input, waits, screenshots and expected-text verification | Own normal window only; creating arbitrary windows, generic dialogs and download approval are not autonomous capabilities |
| Code | Exact-file read/write, diff, file verification, separately approved shell and loopback preview | No autonomous commit/push/deploy/install capability; user-approved shell commands retain user-account powers |
| Permissions | Frozen per-task scopes, native consequential-action review, MCP and project revocation, new-origin consent | A webpage, repository file or model suggestion cannot grant permissions |
| Execution | One active task; 1–24 provider calls; eight-minute task limit; bounded outputs/retries and repeated-action detection | Call count is a work limit, not a billing limit; approval dialogs/remote providers may fail or time out |
| Artifacts | Source-linked notes, screenshots, image findings, step/diff/check evidence and completion reports | Hash/provenance verification does not establish factual correctness or security |
| Recovery | Encrypted checkpoints and last five tasks; review interrupted work, no automatic replay | No automatic continuation of uncertain file, JS, terminal or external effects |
| Privacy | Windows account encryption, separate encrypted blobs, bounded image/task storage, metadata-only default export | Known-pattern redaction can miss secrets; screenshots have no automatic visual secret detector |

Tasks retain up to ten artifacts / 4 MB of artifact data; attached images are resized and bounded. Use **Review task** in history to inspect previous evidence, **Delete task** for one record or **Clear history and image attachments** for all Piccolo task records. Exported summaries intentionally omit task instructions, page/file/image contents, URLs, paths, command text and detailed errors. Exports are user-selected files and are not deleted with history. AdaL and its provider may retain their own sessions; deleting Piccolo history does not delete external records or completed outputs in a project.

Native browser downloads remain governed by Piccolo's central download approval policy. Existing direct MCP tools still expose browser/window/download operations under their own checks; their existence does not imply that the autonomous capability registry supports them.

## Repeatable verification

```powershell
npm ci
npm --prefix coding ci
npm test
npm run build
node scripts/agent-smoke.mjs
node scripts/agent-coding-smoke.mjs
node scripts/agent-recovery-smoke.mjs
npm run installer
$env:PICCOLO_EXE = (Resolve-Path 'release/0.7.0/win-unpacked/Piccolo.exe').Path
node scripts/agent-smoke.mjs
node scripts/agent-coding-smoke.mjs
node scripts/agent-recovery-smoke.mjs
node scripts/agent-ui-smoke.mjs
node scripts/check-release.mjs
```

Run Electron suites serially. They create isolated profiles and harmless local fixture pages/projects; native dialogs are programmatically answered in the test process. AdaL integration suites use a real authenticated provider and may incur provider usage. Unit tests use explicitly identified fixtures and are not evidence of model capability. Restart tests seed an interrupted encrypted checkpoint; they do not establish cleanup after an OS crash.
