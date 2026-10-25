# Application and Settings audit · 0.4

## Settings inventory

| Actual section/screen | Result | Exercise/evidence |
| --- | --- | --- |
| Appearance | Passed | Light/Dark/System, explicit restart persistence, simulated OS changes, accent/density/sidebar/bookmarks/transparency/motion settings; UI checkbox/select changes; settings file export/import and reset with retained pairing identity. |
| New tab | Passed | Greeting, wallpaper kind/fit/position/ranges, real copied image/video fixtures, quick-link editing/add/remove. Widget layout/notes and media lifecycle are covered by browser/performance suites. |
| Search | Passed | Real custom template/keyword navigation in upgrade suite; engine selection and main validation. Add/edit/cancel/delete and invalid draft retention are exercised through the UI. |
| Startup | Passed | Blank/restore selection, clean restart and abrupt-exit tab snapshots; private tabs excluded. |
| Privacy | Passed | Fixture cookies and history were seeded, cleared through UI, and queried; cache cleared and measured at zero in the isolated profile. Private-session isolation separately tested. |
| Permissions | Passed | Decisions enumerated; multiple-download grant and revocation tested; media/capture/unknown permission paths remain constrained by the main process. No live camera/microphone data was collected. |
| Downloads | Passed | Ask/destination controls, real policy/lifecycle tests and MCP approval/cancel/removal. See DOWNLOAD_PROTECTION.md. |
| Performance | Passed | Actual sleeping/capture/task exclusion tests, low-power effects, process snapshots and hidden/minimized wallpaper decoder checks. |
| MCP | Passed | Native-paired clients, revoke/restore, disabled-server changes, separate private access, reconnect and restart. No UI tool can self-grant trust. |
| Shortcuts | Passed | Existing navigation/find/zoom/devtools and tab lifecycle suites; actual Electron input injection for Ctrl+J and Ctrl+Shift+PageUp/PageDown. CDP keyboard injection bypasses Electron's native input hook. |
| About | Passed | Runtime version and truthful limitations visible in all three modes. |
| Extensions (linked screen) | Passed / Not applicable | Real supported content-script/storage fixture, enable/disable/restart/removal, integrity failures and UI/private isolation. XPI/CRX/background/native messaging installation is not applicable to the supported subset. |
| Passwords & autofill (linked screen) | Not applicable | Truthful unavailable state inspected in each mode; there is no functional password vault/autofill toggle. |
| VPN & proxy (linked screen) | Passed / Blocked | Real local proxy and HTTPS route/failure/disconnect tested. A system VPN and authenticated branded providers are unsupported, not decorative toggles. |
| Daily-wallpaper provider controls | Passed / Blocked | Explicit opt-in, secure key/fallback paths and no fabricated image delivery in upgrade suite. Successful current licensed NASA image delivery depends on provider response; no personal key was used. |

## Browser inventory and interactions

| Area | Result | Evidence scope |
| --- | --- | --- |
| Create/activate/reorder/pin/duplicate/close/reopen tabs | Passed | Browser, MCP, keyboard and lifecycle tests. |
| Address/search, back/forward/reload/stop | Passed | Real HTTP fixture navigation and native navigation state. |
| History/bookmarks | Passed | Real SQLite records, search/delete/ranges, HTML import/export, MCP mutations. Bookmark dialog is captured in all modes with focus trapping and Escape dismissal. |
| Downloads | Passed | Harmless local drive-by/popup/flood/redirect/blob fixtures; cancellation, terminal guards and restart. |
| Private windows, normal cookies/session | Passed | Distinct partitions and restart checks; private tabs/data are excluded from normal persisted records. |
| Wallpaper/widgets | Passed | Visible video decoding, hidden/minimized removal, low-power/reduced-motion fallback, local widget autosave/layout. |
| Browser menu and four submenus | Passed | MCP inventory/screenshots in all modes; keyboard, outside dismissal and native-view overlay regression tests. |
| Find/zoom/fullscreen/devtools | Passed / Blocked | Runtime command/input and view-bounds tests. Physical multi-monitor fullscreen transitions need manual coverage. |
| MCP security/reconnection | Passed | Real Ed25519 authentication, failed/unauthenticated pairing, per-client grants, cancellation, revocation and same-adapter multi-restart tests. |
| Resizing/scaling | Passed / Blocked | 820×600 at 125% UI zoom plus 1100/1365 layouts. UI zoom supplements testing; actual OS display scaling and multi-display changes remain manual. |
| Renderer failure/recovery | Passed | Non-debugger lifecycle suite crashes an actual remote renderer and verifies reload recovery. |
| Packaged launch | Passed | The documented suites run with PICCOLO_EXE targeting 0.4.0; release checker verifies packaged bundles/checksums. Installer UI/OS installation is not automated. |
| OS dialogs/physical peripherals/assistive tech | Blocked | Native chooser responses are test substitutes. Physical printing, live device permissions and a full screen-reader audit are not claimed. |

## Appearance and motion boundary

All browser-owned chrome/pages, menus, bookmark dialogs, notices, widgets and download interfaces use the same semantic palette. Startup passes the resolved mode to the trusted preload before paint and shows the window on ready-to-show. System follows native OS appearance signals; explicit choices persist independently. Tests simulate those signals through Electron and verify the UI without changing the chosen explicit preference.

`nativeTheme.themeSource` is deliberately left at System in production. Electron's global theme override also changes remote webpages' preferred color scheme; using it would violate the requirement to keep webpage appearance separate. Native OS menus, security prompts and file choosers therefore retain **OS-controlled appearance**, even when Piccolo's explicit UI preference differs. This is a remaining platform limitation, not a claim of complete per-dialog custom theming.

Motion is interruptible, short and browser-owned; navigation and close actions execute immediately. CSS transition/animation and chrome-only tab FLIP/removal feedback have no permanent animation loop. Reduced motion and low-power disable nonessential effects. Native browsing views never animate or change hit testing for motion. Baseline/after CPU and working-set observations are in PERFORMANCE.md.
# Coding workspace and 0.6 regression audit

The added workspace has a separate inventory and evidence matrix in [RELEASE_0_6.md](RELEASE_0_6.md): 24 packaged MCP coding checks plus four visible Explorer/editor keyboard checks. The existing browser/Settings matrix below is retained; its 26-case appearance suite, 18 download cases, 19 browser cases and 17 MCP cases were rerun against the new Windows package. Restricted startup, extension worker isolation, explicit terminal consent, takeover, native System theme changes, dirty-close behavior and restart persistence were tested with temporary data. Unsupported desktop extension/runtime capabilities are documented rather than represented by inactive switches.

