# Architecture

## 0.4 download and appearance changes

`src/main/downloads.ts` now owns the transfer map, staging, approval queue, bounded flood accounting and terminal-state guards for every browsing session. `Browser.configureSession` routes owned downloads to it; React only submits validated commands. Approval never depends on a remote renderer or HTTPS trust. Startup cleanup and shutdown are coordinated in `main.ts`. The detailed state/transfer limits and filesystem/network limitations are in DOWNLOAD_PROTECTION.md.

Main-owned state includes resolved `appearance`. Explicit preferences are independent of Electron's global webpage color-scheme setting; OS updates resolve System mode and broadcast it. Window background/title controls are set before load. The trusted preload receives the initial palette through an additional argument, applies it before stylesheet paint, and the window waits for ready-to-show. Renderer semantic tokens cover browser-owned UI. Native OS dialogs follow OS appearance.

Animation is confined to DOM chrome. Reorder uses short interruptible FLIP effects; closed-tab snapshots are inert and immediately removed after their exit effect. The actual close/navigation command is never delayed. No native website view is animated, and low-power/reduced motion suppresses nonessential effects. Error feedback stays inside the reserved chrome area so it cannot be covered by a WebContentsView.

The existing MCP transport/pairing architecture remains. The same tool count now includes expanded scoped UI section/menu/control inspection and download approval/history actions; no arbitrary privileged evaluation or trust controls were exposed. See APPLICATION_AUDIT.md.

## Trust boundaries

`src/main/main.ts` creates sessions, registers trusted protocols, validates IPC sender identity and coordinates startup/shutdown. `src/main/browser.ts` owns window state, tabs, native views, permissions, navigation, downloads and persistence. React components never own website WebContents.

Each BrowserWindow renders a bundled React UI from `piccolo-ui://app/index.html`, in the separate `piccolo-ui` session. It is sandboxed and context isolated. A bundled CommonJS preload exposes only `state`, a schema-validated command dispatcher, and disposable event subscriptions. IPC requires the exact registered BrowserWindow sender, its top frame, and its exact UI URL. Renderer subframes cannot issue commands.

Logical internal pages use `piccolo://newtab`, `history`, `bookmarks`, `downloads`, `settings`, `performance` and `workspaces`. These identifiers never get loaded into remote WebContents. The actual trusted protocol is registered only on the UI session. The wallpaper protocol resolves restricted opaque asset names in the profile's wallpaper directory and is also UI-only.

Remote tabs are `WebContentsView` objects with sandboxing, context isolation, web security and background throttling, Node disabled, and no preload. Only HTTP/HTTPS document navigation is allowed. Sensitive capabilities are controlled by main-process session handlers. No remote page receives a privileged browser/agent API.

## Native view layout

Views are attached to the window content view when created. Their bounds reserve 94 device-independent pixels for tabs/navigation, the effective sidebar width (zero by default; four pixels for collapsed Auto-hide), an optional 28-pixel bookmarks bar, and an optional 42-pixel find bar. Native resizing recomputes bounds. HTML fullscreen uses the whole content area; switching/destroying its tab resets the layout state.

Only the active website view is visible. Trusted address suggestions, menus and bookmark dialogs send an explicit overlay command that hides native website views. DOM overlays are never assumed to cover a native view. Native context menus and Electron dialogs are used where appropriate. Internal pages have no website view on top of them.

## Persistence and recovery

A worker thread runs the runtime's built-in `node:sqlite` API. SQL is parameterized. WAL mode, busy timeout, and a migration-version table are initialized on startup. History is normalized into a table with a time index. Schema-validated settings and browser collections are stored as structured JSON values in a key/value table. SQLite work stays outside the main event loop.

Session snapshots capture normal tab URLs/pins synchronously and write one atomic value, including on last-window close. Shutdown flushes queued writes, checkpoints the WAL, closes the database and terminates the worker. A clean-exit marker distinguishes interrupted runs. No forms or cookies are copied into session snapshots. Private snapshots are excluded.

Settings defaults migrate missing fields. Invalid JSON falls back per key; invalid collection entries are filtered. Corrupt SQLite files themselves do not currently have an automated repair UI. One application instance owns a profile; second launches focus it. BrowserWindow ownership closes views and clears timers. Private windows cancel their active downloads and clear their nonpersistent storage/cache when closed.

Normal windows broadcast shared bookmark/download/permission changes and settings updates. Private window modifications stay local to that window. A camera/microphone grant conservatively excludes a tab from sleeping for its remaining lifetime.

## Build and extension points

esbuild produces separate main/preload/worker bundles. Vite produces static React assets and a lazy internal-tools chunk. No development server is part of application startup. electron-builder packages the supplied icon assets and an ASAR archive for Windows.

`src/shared/workspace.ts` defines Workspace, Tool, Agent, Task, Artifact, PermissionRequest, ExecutionEvent and VerificationResult contracts. These are contracts, not capabilities. No implementation can infer authorization from website text. Future tool execution belongs behind the main-process permission boundary and must include artifact read-back verification.

Official API references checked during development: [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [WebContents](https://www.electronjs.org/docs/latest/api/web-contents), [Session](https://www.electronjs.org/docs/latest/api/session), [security](https://www.electronjs.org/docs/latest/tutorial/security), [stable releases](https://releases.electronjs.org/release?channel=stable). Electron 45.0.0 was the stable npm release when selected on 2026-10-24.

## Version 0.2 optional services

The compact DOM browser menu uses the trusted overlay protocol, hides native website views and provides keyboard navigation/focus restoration. Auto-hide uses a narrow trusted gutter rather than placing invisible controls over a website. Default new-tab widgets fit a laptop viewport; clock-value styles are isolated from the rest of the widget.

Session persistence compares URL/pin snapshots before scheduling a worker write. Low-power clock ticks are per-minute. Video elements exist only during opted-in, visible playback; reduced motion/minimization remove them. Speed/ETA sampling is limited to active downloads.

optional.cjs and mcp.cjs are separate lazy main-process bundles. MCP and its SDK/Ajv dependencies load only when a capability is enabled or a client connects, not when a setup page opens. The small bundled stdio adapter uses Electron's Node runtime and a per-profile named pipe/Unix socket, starting the browser if needed. The profile's single-instance lock prevents duplicate browsers. Window registries use one main-process Symbol registry across integration bundles. HTTP remains loopback-only for compatibility. Explicitly installed/enabled extensions restore from metadata.

Extensions use reviewed managed profile copies. All contents are fingerprinted; symlinks, unsupported privileges, excessive size/file count/depth are rejected. Loading is confined to the persistent browsing session, excluding UI/private partitions.

Normal browsing proxy routing also covers bounded same-origin favicon requests. UI receives data URLs and cannot request remote favicons directly. Private sessions and NASA's direct provider connection are explicitly outside this scope. Failed changes preserve the previous proxy; an initial failure pauses website networking until disconnect.

NASA APOD requires native replacement/network consent, checks at startup or visible new tabs, caches one eligible image, and preserves the background on unsupported media/failure. Optional provider keys use Electron 45 asynchronous Windows safeStorage in a separate encrypted file. Settings imports cannot enable the consent flag.

## Version 0.3 MCP continuation

MCP uses SDK v2 `createMcpHandler`/`toNodeHandler` for stateless compatibility HTTP and `serveStdio` for authenticated IPC. Each adapter label has an Ed25519 identity in an OS-restricted profile directory. A fresh random challenge authenticates key possession before any MCP request is accepted. Native first-pairing consent persists the key fingerprint and per-client full/private grants in SQLite. Client names never authorize access. HTTP uses a separately rotated, mandatory OS-encrypted credential and always prompts per call.

The stdio proxy contains no MCP SDK and creates no Chromium renderer. It bounds frames/queues, serializes reconnect, restores legacy initialization when necessary, and reconnects on the next request after a restart. It errors interrupted operations instead of replaying them. EOF, SIGTERM, stdout failure and socket closure clean up its resources. Browser start/stop transitions are serialized and partial starts roll back. Shutdown closes MCP before the database.

The tool factory captures the authenticated principal and selected window for each connection. It checks revocation and separate private-window grants, bounds concurrency/time/results, combines client cancellation with server shutdown, protects active tasks from sleeping, and records redacted tool/status/key-fingerprint activity. Settings writes are allowlisted; MCP grants, provider flags, paths and assets cannot be self-authorized or imported. Settings broadcasts reach the originating UI as well as other normal windows.

`mcp-browser-tools.ts` adds window/input/structure/records/site-data/devtools/UI tools. Page interactions use fixed main-owned functions with JSON-encoded data. No caller supplies code. JavaScript dialog handling temporarily attaches a private main-owned debugger session with only fixed Page dialog commands; it does not publish CDP or expose a command passthrough. Native security/authentication dialogs remain user-operated. Read [MCP_SETUP.md](MCP_SETUP.md) for configuration, exact limits and unsupported cases.
# Coding workbench addition (0.6)

`coding/` is a separately locked/buildable Code OSS workbench renderer using CodinGame 38.0.4 / Code OSS 1.142.0. It is loaded only after native folder selection. `src/main/coding.ts` owns one project per profile and its sandboxed WebContentsView; `coding-preload.ts` exposes validated requests only to that view's main frame. `workspace-files.ts` owns canonical filesystem access and revision writes. `coding-extensions.ts` owns Open VSX fetches, bounded VSIX extraction, compatibility/consent, integrity and managed lifecycle. Third-party browser extensions here mean Code OSS web extensions, distinct from the existing Chromium content-script browser extensions.

`coding-terminal.ts` is a lazy Electron utility process using Windows ConPTY and xterm.js; no terminal exists during ordinary browsing. Main-process narrow Git operations run only when requested. `mcp-coding-tools.ts` adds seven separately authorized workspace tools to existing authenticated pairing. The renderer/editor, extension worker, shell and remote preview retain separate privilege boundaries. See CODING_WORKSPACE.md for trust, persistence, cancellation, CSP and limitations. Build installs both root and coding lockfiles; the pinned static build adaptation rejects changes to its upstream source hash.

