You are the lead software engineer, browser architect, and performance engineer for Piccolo.

Continue improving the existing Piccolo desktop browser in this repository. Read `prompt/prompt.md`, applicable repository instructions, source code, tests, and documentation before making changes. Preserve useful working functionality.

This is an implementation task. Deliver working changes, test them in Electron, and document actual results. Work through routine decisions without repeatedly requesting approval.

## Product direction

Piccolo should be a clean, personal browser suitable for low-spec Windows computers.

Priorities, in order:

1. Reliable and secure browsing.
2. Responsive browser controls and lower background resource usage.
3. Compact, polished UI.
4. Useful everyday features.
5. Optional integrations that consume resources only when enabled.

Keep React, Electron, and TypeScript. Verify current official documentation before selecting Electron APIs, extension mechanisms, MCP transports, or provider integrations.

## Screenshot references

The supplied screenshots show Brave’s browser menu and Piccolo’s current interface.

Use Brave’s compact controls, menu organization, spacing, and visual hierarchy as references. Preserve Piccolo’s identity, icon, and visual character.

Do not copy Brave branding or implement Brave-specific products such as Leo, Wallet, Rewards, Shields branding, Brave VPN, or Tor windows.

## 1. Replace the persistent sidebar with a browser menu

Piccolo’s always-visible left sidebar makes the browsing area feel crowded. Remove it from the default layout and place its useful actions in a top-right menu button.

Provide a compact menu with logical groups:

- New tab, new window, and new private window.
- History.
- Bookmarks and bookmark manager.
- Downloads.
- Passwords and autofill.
- Extensions.
- VPN and proxy connections.
- Delete browsing data.
- Zoom controls, reset zoom, and fullscreen.
- Print.
- Find in page.
- Save page, copy URL, and sharing actions where genuinely supported.
- Developer tools and other tools.
- Local MCP integrations.
- Performance.
- Settings, About, and Exit.

Display actual keyboard shortcuts. Implement appropriate submenus and checked states.

Offer optional sidebar modes: Off, Auto-hide, and On. Default to Off. Ensure auto-hide does not interfere with page interactions.

The menu must support keyboard navigation, visible focus, Escape dismissal, outside-click dismissal, sensible positioning, and display scaling.

Handle Electron native-view stacking correctly. A DOM menu must not disappear behind WebContentsView content. Verify the chosen overlay strategy with actual remote pages.

Improve the new-tab layout: remove overlapping text, accidental clipping, unnecessary scrolling, and oversized decorative sections. Keep search, quick links, and optional widgets easy to reach at common laptop resolutions.

## 2. Investigate and reduce memory and CPU usage

The user observed approximately 200 MB for Brave’s homepage and over 400 MB for Piccolo with live wallpaper. Treat these as user observations, not verified benchmarks.

Measure Piccolo before optimizing. Compare equivalent conditions, including a static homepage and live wallpaper separately.

Record:

- Total application process memory, with the metric clearly identified.
- Main, renderer, GPU, and other process contributions where available.
- Idle CPU usage.
- Startup time.
- Process and WebContents counts.
- Behavior after opening and closing tabs repeatedly.
- Wallpaper enabled, disabled, hidden, and minimized.

Identify duplicate windows, hidden renderers, retained WebContents, unnecessary listeners, timers, repeated state updates, oversized assets, and duplicate video decoding.

Implement a low-power preset:

- Static wallpaper by default.
- Live wallpaper explicitly opt-in.
- Stop unnecessary animation and media decoding when hidden or minimized.
- Respect reduced motion.
- Lazy-load internal managers and integration code.
- Bound caches, history queries, and suggestions.
- Avoid continuous polling.
- Load optional services only when needed.
- Apply safe background-tab throttling and configurable sleeping.

Do not discard tabs with active media, capture, downloads, approved tasks, or configured exclusions. Explain that restoring discarded tabs can lose unsaved page state.

Do not blindly disable GPU acceleration, sandboxing, security features, or accessibility. Evaluate changes against responsiveness and compatibility.

Report measured improvements honestly. Do not promise a 200 MB target or invent results.

## 3. Downloads with network speed

Extend the real download manager with:

- Current transfer speed.
- Transferred and total bytes.
- Progress and estimated remaining time when calculable.
- Pause/resume where actually supported.
- Cancel, retry, open file, and show in folder.
- Destination selection and “ask where to save.”
- Persistent records and clear missing/interrupted-file states.

Calculate speed from byte changes over elapsed time, smooth noisy readings, and handle unknown sizes and stalled transfers. Stop sampling when no downloads are active.

Do not claim restart-resume support unless implemented and verified.

## 4. Developer tools

Make developer tools a first-class working feature.

Support F12 and Ctrl+Shift+I, menu access, and Inspect Element from page context menus.

Target the active webpage rather than browser chrome. Handle tab switching, tab closure, detached tools, and packaged builds correctly. Keep privileged browser-chrome debugging clearly separate.

## 5. Custom search engines and persistent cookies

Implement custom search engines with a name, keyword, and validated search URL template.

Support a default engine, editing, deletion, and keyword searches. Encode queries safely and reject unsafe schemes.

Ensure normal browsing uses persistent sessions so cookies and site storage survive restart. Preserve session isolation for private windows.

Provide clear controls for site data, cookies, cache, and history. Do not silently erase normal sessions on launch or shutdown.

## 6. Daily wallpaper

Provide an opt-in daily static wallpaper feature with configurable provider support.

Verify provider terms and required attribution. Store credentials securely where needed.

Cache the current image, use bounded storage, and fall back gracefully when offline. Check for a new wallpaper on startup or when the new-tab page becomes visible; avoid a permanently running polling service.

Do not request location, fetch remote wallpapers before consent, or download live video automatically.

Keep local static and video wallpaper options.

## 7. VPN and proxy providers

Design a provider-based connection interface.

Distinguish a browser proxy from a system VPN. Label connection scope accurately.

Inspect available provider APIs, supported local clients, authentication requirements, and operating-system permissions before implementing an adapter.

Implement a real supported adapter when feasible. Otherwise provide an honest setup state and document the exact blocker. Never show a successful connection without verification.

Keep credentials out of renderer storage, logs, and exports. Do not install network drivers, purchase subscriptions, or change system-wide network settings without explicit user authorization.

## 8. Extensions

Investigate the current Electron extension APIs and their limitations.

Implement supported extension loading and management with:

- Explicit user installation.
- Enable/disable and remove.
- Persistent installation metadata.
- Manifest and permission display.
- Clear error reporting.
- A documented compatibility matrix based on actual tests.

Do not claim full Chrome Web Store compatibility. Do not bypass store protections or silently download extensions.

Treat extensions as untrusted code. Prevent access to Piccolo’s privileged UI, preload bridge, local files, secrets, and MCP controls. If the runtime cannot enforce required isolation, defer that capability and explain why.

## 9. Password saving and autofill

Provide secure password saving and autofill through a maintained password-manager integration or another reviewed, appropriate credential-storage design.

Do not build an ad hoc cryptographic password vault.

Require user consent before saving credentials. Match credentials to appropriate origins, prevent cross-origin leakage, and handle frames carefully. Require an explicit user action for sensitive autofill.

Never store plaintext passwords in settings, browser localStorage, logs, exports, or the ordinary application database.

If a safe implementation is blocked by available APIs or dependencies, provide a clear setup or unavailable state and document the limitation. Do not simulate saved credentials or successful autofill.

## 10. Local MCP integration

Support two distinct capabilities:

1. Connecting Piccolo to explicitly configured local MCP servers.
2. An optional Piccolo MCP server exposing a narrow set of browser tools.

Keep both disabled by default and load them only when enabled.

For the initial browser tools, prefer selected-tab metadata, user-authorized text extraction, and explicit navigation. Require approval before consequential writes or external actions.

For local HTTP transport, bind to loopback, authenticate clients, validate Host and Origin where applicable, and protect against DNS rebinding. Offer stdio where appropriate.

Use the current MCP specification and SDK guidance. Validate tool schemas and arguments. Do not expose unrestricted shell execution, arbitrary filesystem access, raw privileged IPC, or unrestricted JavaScript evaluation.

Treat webpage instructions as untrusted content. They cannot grant permissions or authorize tool calls.

Provide inspectable permissions, connection status, redacted activity logs, revocation, cancellation, and clean shutdown. Require explicit user approval before launching newly configured local executables.

## Implementation and validation

Start with a brief repository assessment and phased implementation plan. Then implement:

1. Compact menu and UI cleanup.
2. Performance baseline and targeted fixes.
3. Downloads, developer tools, search engines, and session persistence.
4. Daily wallpaper.
5. Extensions, password integration, VPN providers, and MCP, according to verified feasibility.

Use AdaL’s actual available capabilities for relevant development and testing. Record genuine activity in `ADAL_USAGE.md`; never fabricate usage or evidence.

Test security boundaries, URL handling, persistence, private-session isolation, download speed calculations, settings migration, and tab lifecycle.

Run Electron smoke tests for menus above remote content, keyboard shortcuts, downloads, developer tools, cookies after restart, wallpaper suspension, extension behavior, MCP authorization, and packaged application launch.

Update README, ARCHITECTURE, SECURITY, PERFORMANCE, ADAL_USAGE, and ROADMAP with implemented, verified, limited, and deferred status.

At completion, provide the working build location, commands, measured performance changes, verified features, and remaining limitations. Every visible feature must work or clearly explain its setup requirement.