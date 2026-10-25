# Piccolo 0.6

A personal Windows browser using React, Electron 45 and strict TypeScript. Websites run in sandboxed WebContentsViews without Node or a privileged preload. Browsing records remain local in SQLite.

Version 0.6 builds on the restored 0.4 browser and adds an on-demand Code OSS coding workspace with a real web extension host, local project editing, Git, an approved native terminal and local browser preview. Start from **Workspaces → Open project folder**. See [coding setup and security boundaries](CODING_WORKSPACE.md), [extension compatibility and registry findings](CODING_EXTENSION_COMPATIBILITY.md), and [delivery evidence](RELEASE_0_6.md). This supports web extensions and declarative contributions; desktop Node extensions are unavailable.

This update adds central website-download approval and flood limits, correct cancellation/history, complete semantic Light/Dark/System palettes for browser-owned UI, lightweight motion and broader MCP-driven Settings verification. Existing persistent client pairing, private isolation, cookies, menus and integrations remain. Native OS dialogs retain OS appearance; website colors are not forced. [Download behavior and limitations](DOWNLOAD_PROTECTION.md), [application/Settings audit](APPLICATION_AUDIT.md), [extension compatibility](EXTENSION_COMPATIBILITY.md), [Reddit research](BROWSER_RESEARCH.md) and [design sources](DESIGN_SOURCES.md) record the actual scope.

**Configure once:** [MCP_SETUP.md](MCP_SETUP.md) contains ready-to-copy Codex TOML and Antigravity JSON with actual Windows build paths, official documentation links, permission/revocation behavior and tool limitations. Pair each client once through Piccolo's native dialog; routine trusted calls do not ask again. No client configuration or user profile is modified by the tests.

## Build and run

Requires Node.js 24 and npm:

```powershell
npm ci
npm ci --prefix coding
npm run icons
npm run dev
```

Development builds static assets and launches Electron. Restart after edits. `npm start` runs an existing build.

```powershell
npm test                 # URL/search, migration, SQLite, bookmarks, speed calculations
npm run build            # strict checking + production bundles
npm run smoke            # everyday browser and isolation
npm run upgrade-smoke    # menu, integrations and failure paths
npm run mcp-smoke        # paired clients, browser control, restart, revocation and auto-launch
npm run lifecycle        # discard, crash and cleanup without a debugger
npm run download-policy  # harmless local approval/cancel/popup/flood fixtures
npm run appearance-audit # real local MCP, all three themes, Settings and menus
npm run coding-smoke     # real workspace MCP, editor, Git, web extensions, native terminal and preview
node scripts/coding-ui-smoke.mjs # visible Explorer and editor keyboard workflow
npm run installer        # NSIS installer + unpacked Windows application
```

Build locations: `release/0.6.0/Piccolo Setup 0.6.0.exe` and `release/0.6.0/win-unpacked/Piccolo.exe`. Keep the whole unpacked folder together. Builds are unsigned; OS installation is not part of the automated tests. Previous release folders, including 0.4 and the historical 0.5 build, are preserved.

```powershell
$env:PICCOLO_EXE = (Resolve-Path 'release/0.6.0/win-unpacked/Piccolo.exe').Path
npm run mcp-smoke
npm run smoke
npm run upgrade-smoke
npm run download-policy
npm run appearance-audit
$env:PERF_REPORT = "after-0.6.0.json"
npm run measure
node scripts/report-maintenance.mjs
node scripts/check-release.mjs
```

Tests save fresh profiles, JSON evidence and screenshots under `test-results/`. The normal profile is `%APPDATA%/Piccolo`; `PICCOLO_PROFILE` overrides it for a launch. Back up important profiles before changing application versions.

## Browser changes

- The sidebar defaults to Off. The top-right menu groups browsing managers, zoom, print, find, saving/sharing, tools, integrations, performance, settings and Exit. Keyboard navigation, submenus, checked states, Escape and outside dismissal are implemented. Optional modes are Off, Auto-hide and On. Auto-hide reserves a four-pixel trusted activation gutter and resizes the page while revealed.
- The new-tab default layout fits 1280×720; clock styling no longer overlaps its title/date. Low-power defaults on: minute clock ticks, hidden seconds, static wallpaper. Live wallpaper requires explicit playback opt-in; hidden/minimized/reduced-motion video elements are removed.
- Session writes are scheduled when tab URLs/pins change rather than on every download/UI update. Download broadcasts are coalesced, and speed sampling stops when transfers stop. Optional SDKs load on demand.
- Downloads show smoothed speed, bytes, ETA, unknown sizes and stalls. Pause/resume, cancel, retry from the beginning, destination choice, reveal and confirmed opening are real. Restart-resume is not implemented.
- F12 and Ctrl+Shift+I toggle the active webpage's detached tools. Browser-chrome debugging is separate. Page context menus provide Inspect Element. Ctrl+P opens native printing; Ctrl+S writes MHTML.
- Search engines support names, unique keywords, a default and validated HTTP(S) templates containing one `{searchTerms}`. Queries are URL encoded. Normal cookies and site storage survive restart; private sessions remain isolated.

## Optional integrations

| Feature            | Implemented / limited status                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Daily wallpaper    | Opt-in NASA APOD adapter, one cached static image up to 10 MB, attribution, direct API/image requests, no location or polling service. Videos, copyright-marked images and outside hosts are skipped. Live tests returned HTTP 500/429: fallback was verified, not successful live image delivery. Optional NASA keys use asynchronous Windows OS encryption outside settings/exports.           |
| Browser proxy      | Manual HTTP/HTTPS/SOCKS5 configuration for normal website sessions. HTTP CONNECT was verified with real HTTPS traffic. This is not a system VPN; private windows and NASA requests are direct. Failure preserves a prior proxy or pauses normal website networking until explicit disconnect. Connections are session-only; authentication and branded provider/driver adapters are unavailable. |
| Extensions         | Explicit unpacked content-script extensions in normal browsing only. Managed reviewed copies, full-file integrity checks, enable/disable/remove and restart metadata. MV3 content scripts were tested. No private/UI/MCP access, background workers/scripts, native messaging, store/CRX installation or general Chrome compatibility. See SECURITY.md.                                          |
| MCP connections    | Configure-once stdio adapter starts/reuses the profile's one browser, authenticates its client key, reconnects after restart and cleans up on client exit. Codex TOML and Antigravity JSON are generated with actual paths. Optional outbound loopback HTTP remains per-call-approved.                                                                                                           |
| Piccolo MCP server | Individually paired keys, persistent full-control grants, separate private access, connected-client list, per-client revoke/restore, 21 bounded tools, cancellation and redacted diagnostics. Compatibility HTTP uses a persistent OS-encrypted credential and per-call approval; rotation cancels its requests. No shell, arbitrary files, credential-store access or privileged evaluation.    |
| Passwords/autofill | Unavailable with a clear explanation. No reviewed compatible password-manager adapter is configured; broad extension/native-messaging APIs are missing. No passwords are collected and no custom vault exists. A maintained desktop manager may be used separately.                                                                                                                              |

## Everyday features and limitations

Tabs support pins, ordering, duplicate and reopen. History offers date grouping, search, deletion and time-range clearing, bounded to 300 results. Bookmarks provide folder labels, ordering and standard HTML import/export. Widgets include local notes, tasks, links and clock/date with layout editing. Validated settings imports cannot redirect download destinations, enable daily-wallpaper consent or replace local asset references.

Normal URLs/pins restore after clean and unexpected exits. Forms, scroll and complete back/forward stacks do not; multiple normal windows restore into one, up to 100 tabs. Private windows use independent in-memory partitions and do not persist history/settings/bookmarks/permissions. Saved downloads and exported files remain on disk.

Sleeping destroys inactive website renderers; returning reloads them and may lose unsaved state. Active, pinned, loading, audible, captured, media-approved, downloading and excluded tabs are protected. Background throttling alone is not called sleeping.

Popups require recent input and are bounded. POST/opener-dependent authentication/payment flows are unsupported. Zoom follows Chromium's origin policy. Internal pages do not join website back/forward history. There is no DRM guarantee, sync, default-browser registration or updater. Physical printer output, full accessibility and multi-display/fullscreen behavior need broader manual testing.

## Evidence

The source includes 19 unit tests and 24 packaged coding workflow checks, alongside the 19-check browser suite, 16 upgrade checks, 17 MCP integration checks, seven non-debugger lifecycle checks, 18 download-policy cases and the three-mode Settings/application audit. Evidence is saved as JSON under `test-results/`; MCP runs also save real settings screenshots. Integration tests substitute native chooser/approval responses only inside isolated test instances; actual browsing, downloads, tunnels, extensions, signatures, MCP messages, persistence and OS encryption execute. Shortcut tests use Electron input injection because CDP bypasses Electron's native input hook.

Keyboard additions: `Ctrl+J` opens/reuses Downloads without replacing the initiating tab; `Ctrl+Shift+PageUp/PageDown` reorders the active tab. Canceled downloads leave the default active view and remain explicitly labeled in removable history.

Read [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [PERFORMANCE.md](PERFORMANCE.md), [ADAL_USAGE.md](ADAL_USAGE.md) and [ROADMAP.md](ROADMAP.md). The coding workspace is implemented; office workspaces and autonomous AI agents remain deferred contracts.

See [PERFORMANCE.md](PERFORMANCE.md) for measured before/after results and the separate fresh-profile Brave comparison, including regressions and limitations. The installer is produced but not installed into the OS. Successful live NASA image delivery remains limited by its tested provider response. Client protocol/configuration formats are verified; Codex/Antigravity GUI installation is not claimed.
