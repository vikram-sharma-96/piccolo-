# Roadmap after prompt1

## Implemented in 0.4

Main-process download approval and flood bounds, explicit multiple-download permission, risky-name caution, correct cancellation/terminal history, separate Active/History lists and record clearing. Light/Dark/System semantic palettes, first-paint initialization, OS-following System mode and separate website color preferences. Lightweight chrome motion, reduced-motion/low-power suppression, keyboard tab reordering and Downloads access. Scoped MCP section/menu/control inventory and three-mode application audit, plus extension/catalog compatibility and Reddit research documents.

Remaining: native OS dialogs cannot independently follow an explicit Piccolo theme without altering Electron's global website scheme; they retain OS appearance. Transactional cross-volume download publication, restart resume, native-dialog/screen-reader/physical-printer/multi-display testing, supported password adapters and general Firefox/Chrome extension APIs remain deferred. Broader provider availability is not implied by setup screens. See APPLICATION_AUDIT.md for Passed/Blocked/Not applicable evidence.

## Implemented browser update

Default-off sidebar, compact keyboard-accessible browser menu, Auto-hide/On modes, laptop new-tab cleanup, low-power minute clock/static defaults and visibility-based video removal. Downloads add measured smoothed speed, ETA, stalls and retry from the start. Search engines support keywords/templates and edits. Webpage tools support F12/Ctrl+Shift+I, Inspect Element and separate chrome debugging. Native printing and MHTML saving are wired to the active page. Normal cookies/storage and session snapshots persist.

Optional integrations have real bounded implementations: normal-session browser proxies, reviewed unpacked content-only extensions, opt-in NASA daily wallpaper with encrypted optional API key, loopback MCP client and authenticated approved-tool server. These are not claims of system VPN, full Chrome parity or autonomous AI agents.

## Limited and blocked

- Live NASA APOD requests returned HTTP 500 earlier and HTTP 429 in the final packaged run. Offline/error fallback and optional key encryption are verified; successful live image delivery, copyright-filter/cache-image paths need a successful provider response or dedicated fixture tests. No third-party photo rights are inferred from an API response lacking a copyright field. The adapter follows NASA's published policy and conservatively excludes marked/external material.
- Password saving/autofill is unavailable. A maintained, reviewed adapter with origin/frame matching and explicit sensitive fill consent is needed. Current limited extensions cannot supply a general Chrome/native-messaging password-manager stack. No custom vault or password storage is planned for this release.
- System VPN drivers, subscriptions, provider account authentication and OS networking changes are unavailable. HTTP CONNECT is verified; HTTPS/SOCKS syntax still needs provider-specific transport tests. Proxy configuration is normal-session-only; private browsing and NASA are direct.
- MCP 0.3 adds configure-once authenticated per-client stdio, automatic browser launch, multiple clients, three-restart reconnection tests, individual revoke/restore, separate private grants, cancellation and 21 browser tools. Codex TOML and Antigravity JSON follow official client documentation and use actual build paths. Client GUI installation, cross-platform packaging/ACL validation, cross-origin-frame/shadow-root automation and broader native dialog support remain open. Main-frame DOM actions cannot guarantee compatibility with every website's trusted-input requirements.
- Extensions support a constrained content-script/storage subset. No Web Store, CRX, native messaging, background workers/scripts, privileged APIs or private-window support. All enabled content is fingerprinted and reviewed; arbitrary same-user profile/application compromise remains outside this model.

## Reliability work

Keep Electron current, sign releases, harden fuses and design automatic updates. Complete manual assistive-technology, fullscreen/multi-monitor, physical printing, real-world auth/payment/popups, long-running download and resource-leak tests. Preserve security and GPU acceleration while investigating resource use. Short debugger-attached working-set samples are not a 200 MB guarantee or a cold-machine benchmark.

Improve history indexing for large profiles, profile/database repair, page-state/session restoration, separate camera/microphone decisions, true restart-resumable downloads, wallpaper local-asset cleanup, richer widget data isolation and Chrome origin-zoom limitations.

## Future workspaces and agents

Workspace/Tool/Agent/Task/Artifact/PermissionRequest/ExecutionEvent/VerificationResult contracts remain in source. Office editors, terminals, Git tools, autonomous provider execution and multiagent scheduling remain deferred. The new MCP browser tools are explicitly human-approved capabilities, not an autonomous agent workflow. Any future workflow must treat page text as untrusted, scope grants, approve consequential actions and verify artifacts by reading them back.
# Coding workspace update (0.6)

Delivered on demand: selected-folder Code OSS web workbench, Explorer editing/CRUD/search/save, native approved ConPTY terminal, real Git panel, loopback browser preview, stable web extension host/VSIX manager and separately granted MCP tools. See CODING_WORKSPACE.md and the release audit for tested behavior.

Deferred: desktop Node extension host, broad VS Code extension compatibility, TypeScript/ESLint server processes, debugger, remote repositories/development, cloud accounts, automatic tasks/dependency install, live external filesystem watcher, terminal/session resurrection, arbitrary workbench command automation, and comprehensive long-duration low-spec performance testing. Ordinary browser security and low idle overhead remain constraints; the active workbench's measured memory cost is documented.

