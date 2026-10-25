# Agent and regression audit · 0.7

All application tests use isolated temporary profiles, harmless local pages/projects and programmatically answered native dialogs. Integration tasks use the installed authenticated AdaL service. These results do not constitute proof of all internal security properties or real-world compatibility with every website. [Existing browser/Settings inventory](APPLICATION_AUDIT.md) and [coding compatibility](CODING_EXTENSION_COMPATIBILITY.md) remain applicable.

| Item | Status | Evidence / boundary |
|---|---|---|
| Fresh browser starts no AdaL or coding host | Passed | Agent and coding smoke, lazy module/process checks |
| Dedicated authenticated client and persistent pairing | Passed | Actual `piccolo-agent` native pairing; existing 17-case MCP suite exercises reconnect/revoke/restore |
| Attached-tab research → observation → note → independent read-back check | Passed | Actual model decisions and artifact inspection in agent smoke |
| Unattached tab/file refusal and denied transmission | Passed | No task starts for rejected scope or denied native consent |
| Browser MCP cannot operate Agent approval/context UI | Passed | Separate trusted client gets tool errors for Agent/UI escalation |
| Revision-aware form input, controlled failure and recovery | Passed | Local first-save failure, actual second-save result and page verification |
| Actual image interpretation and reviewed source-linked findings | Passed | Image contents absent from instruction; word/number/color checked against generated PNG |
| Browser → code → validation → preview → screenshot analysis | Passed | `docs/evidence/0.7/combined-task.json` and screenshot; real file revision, diff, Node output, HTTP page and vision findings |
| File conflict/dirty-buffer preservation | Passed | Existing coding suite exercises concurrent disk changes and unsaved editor buffers |
| Shell ownership and user takeover | Passed | Real validation/preview shell; other-client/user-shell refusal; coding suite takeover kills owned process tree |
| Pause, manual state change and fresh resume | Passed | Cancels real MCP condition wait, manual page change, fresh verified observation |
| Cancel provider and release actual process | Passed | Previously observed owned AdaL PID no longer exists after cancellation; task counter also clears |
| Checkpoint restart | Passed | Seeded OS-encrypted active checkpoint becomes interrupted; old grants revoked, artifact retained, no automatic provider start |
| History deletion and ownership-safe cleanup | Passed | Clear removes owned records/blobs while unrelated fixture survives; unit tests cover hash corruption and failed atomic writes |
| Light/Dark/System Agent UI and task-bar native bounds | Passed | Three screenshots, OS theme events covered by appearance suite, browser view below task bar |
| Older task review, artifact modal keyboard focus and compact layout | Passed | Final package: idle engine does not block history selection, actual artifact bytes/hash display, focus trap/Escape and one-column reduced-motion layout |
| Metadata-only export and OS encryption | Passed | No task contents/URLs in export; records not plaintext or localStorage; real encrypted read-back |
| Unknown capabilities, malformed JSON, retries, budgets, repeated failures | Passed | Unit tests reject unauthorized proposals before effects; skipped unknown actions have an explanation |
| Completion with unresolved failure | Passed | Independent verification cannot hide an unresolved failed capability; unit fixture checks retained failure |
| Downloads/approval/private/flood/cancel/restart | Passed | Existing 18-case central-policy fixtures rerun on packaged 0.7 |
| Settings inventory, controls, themes, reduced motion | Passed | Existing 26-case authenticated-MCP appearance/Settings audit rerun |
| Tabs, session/cookies, history/bookmarks, navigation, proxy and browser extensions | Passed | Existing 19 browser, 17 upgrade and 17 MCP packaged checks rerun |
| Renderer crash, discard, close, DB and session lifecycle | Passed | Seven no-debugger lifecycle checks; this harness uses the built source runtime |
| Code workbench, editor, Git, terminal and extension activation | Passed | Existing 24-case packaged coding suite rerun |
| Windows package assets, native PTY and MCP setup | Passed | Ten bundled main/preload/service entries, UI/code/license assets and checksums compared to build |
| Interactive Windows installation / signing | Not applicable | Unsigned installer produced; automated tests launch unpacked app and do not install into personal OS locations |
| Abrupt OS crash cleanup, long soak, battery and other hardware | Blocked | Not established by current harness; restart checkpoint tests do not prove orphan cleanup after OS termination |
| Concurrent agents, private-window agents, audio/video and other providers | Not applicable | Unavailable and not exposed as working capabilities |
| Autonomous generic dialogs/download actions and broad window management | Not applicable | Outside the bounded Agent registry; existing direct MCP tools retain their own permissions |

Raw serial-run logs and pass/fail statuses: `test-results/agent-release-checks.json`, `test-results/0.7-*.log`. Unit results: `test-results/0.7-unit.log`. Non-sensitive fixture results and performance summaries are retained under `docs/evidence/0.7/`. See [operation and limitations](AGENT_USAGE.md) and [performance method](PERFORMANCE.md).
