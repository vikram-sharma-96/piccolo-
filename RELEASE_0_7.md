# Piccolo 0.7 delivery · 25 October 2026

Implemented incrementally on the preserved 0.6 browser. The new Browser/Code/Agent workflow uses actual AdaL decisions, explicit context and typed local MCP capabilities, native approvals, source-linked artifacts and independent observable verification. No project restart, migration away from Electron, fabricated model outputs or automatic commit/push/deploy/install was performed.

## Windows delivery

- Installer: `C:\Github Projects\Piccolo\release\0.7.0\Piccolo Setup 0.7.0.exe` (131,427,326 bytes).
- Unpacked launch: `C:\Github Projects\Piccolo\release\0.7.0\win-unpacked\Piccolo.exe`; retain the entire folder.
- Installer SHA-256: `db201e8531eb8c4fe7e1de7bfb161ca649144d08d5f878aade17f162d2518cda`.
- `app.asar` SHA-256: `064ac40cc31a08058fb26170f2909603494e6e44579eb9479f392ada9954e946`.
- Unsigned; packaged launch tested, interactive Windows installation not performed. AdaL is separately installed/authenticated and not bundled.

The original 0.4 and 0.6 archives retain their prior SHA-256 values, respectively `1b67ec7179c9776c375d422dd248c73f27579dc5543c0d3451e8502218e82be4` and `b95dabce048e725db869f26fc36da57953bc2b8464d14a633598f2ae1f21f9f7`. Personal browser data was not reset. New source changes remain local and uncommitted.

## Actual checks

| Check | Result |
|---|---|
| Strict browser/Code TypeScript and production build | Passed |
| Unit suite: scope/schema rejection, state, cancellation, storage corruption, atomic failure and unresolved completion | 36 passed |
| Actual AdaL browser/image integration, form recovery, pause/resume, cancel, themes, export, encryption and idle-history review | 12 passed on final package; zero renderer errors |
| AdaL authorized file edit → diff → approved validation → preview → screenshot/vision → completion | Passed on final package; 15 real model decisions, 14 successful capability steps, zero failed steps |
| Restart and owned-history deletion | 2 passed on final package; seeded interrupted checkpoint, not an OS-crash test |
| Retained artifact bytes/hash, modal keyboard focus/Escape and compact reduced-motion layout | 2 passed on final package |
| Existing packaged Code, browser, upgrade, MCP, download and appearance/Settings suites | 24 / 19 / 17 / 17 / 18 / 26 passed |
| No-debugger source lifecycle checks | 7 passed |
| Browser-only performance scenarios and wallpaper pause | Passed; observations in PERFORMANCE.md |
| Final packaged/source comparison | Ten bundles, 132 UI/code/license assets, native PTY, parsed MCP setup and artifact checksums passed |

The full regression sequence passed before the final task-history/skipped-step polish. The affected Agent, coding/vision and recovery workflows were repeated on the final package, followed by the artifact/layout checks and final package/source comparison. See [audit matrix](AGENT_AUDIT.md), [retained fixture results](docs/evidence/0.7/agent-verification.json), [full regression statuses](docs/evidence/0.7/regression-results.json), [final exit codes](docs/evidence/0.7/final-checks.json), [UI evidence](docs/evidence/0.7/ui-checks.json) and [manifest](docs/evidence/0.7/release-manifest.json).

## Reproduce and operate

[AGENT_USAGE.md](AGENT_USAGE.md) contains setup, build and test commands. `node scripts/agent-release-checks.mjs` runs the full packaged sequence serially after building 0.7. Real provider tests require an authenticated AdaL installation and may incur provider usage. Tests use temporary profiles/local fixtures and programmatically answer native dialogs.

The final real demonstration is retained in [combined-task.json](docs/evidence/0.7/combined-task.json) and [its screenshot](docs/evidence/0.7/combined-completed.png). It reads only attached fixture files, changes Answer 42 to Answer 43 after native review, inspects Git diff, runs approved `node check.cjs`, verifies actual output, runs a loopback preview, checks its page, captures the authorized screenshot and records real image findings after review. Independent validation confirms saved bytes, unchanged Git commit count and stopped preview process.

## Boundaries and deferred work

One active task/owning normal window; frozen tab/file/image scopes; no private-window agent, parallel delegation, audio/video or alternate provider. Model proposals use validated JSON rather than a claimed native schema/streaming API. Native dialogs/download actions and broad window management remain outside the autonomous registry; existing direct MCP/browser controls remain available. Selected prior-artifact attachments are deferred. No monetary hard cap is available; task time and provider calls are bounded.

Artifacts verify storage/provenance or recorded page/file assertions, not general factual correctness or security. Known-pattern credential redaction can miss secrets; screenshots require user review. Approved terminal input runs with Windows user privileges and is not sandboxed to the selected project. Cancellation stops owned work but cannot roll back completed effects. Checkpoints are retained for review and never replay automatically. AdaL/provider retention and user exports are separate from Piccolo history deletion.

Browser-only working sets remained close to the baseline in the short samples (idle 411 → 418 MiB), while a single instrumented startup increased 958 → 1,249 ms. Active provider work measured roughly 963–1,016 MiB owned working set and 0.8–0.9 of one CPU core; cleanup removed the observed AdaL/backend descendants. These are warm instrumented observations, not a low-spec guarantee. Long soak, battery, abrupt OS termination and other hardware still need testing. See [PERFORMANCE.md](PERFORMANCE.md), [SECURITY.md](SECURITY.md), [ADAL_USAGE.md](ADAL_USAGE.md) and [ROADMAP.md](ROADMAP.md).
