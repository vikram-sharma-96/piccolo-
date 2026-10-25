You are the lead software engineer and browser architect for PICCOLO.

Build Piccolo: a lightweight, customizable desktop browser using React, Electron, and TypeScript, with a foundation for future office workspaces, coding tools, and user-controlled AI agents.

Your job is to implement a working application, verify its behavior, and document its limitations. Do not stop at planning, UI mockups, or placeholder features.

PRODUCT IDENTITY
Name: Piccolo
Personality: calm, fast, personal, capable.
Design: polished browser chrome, compact controls, readable typography, subtle motion, and generous browsing space.
Avoid a generic SaaS dashboard appearance.

CORE PRIORITIES
1. Reliable everyday browsing.
2. Secure Electron architecture.
3. Low unnecessary background activity.
4. Customization that remains responsive.
5. Clear boundaries for future workspaces and agents.

Electron is a deliberate requirement. Do not claim that Electron guarantees low RAM usage or a small installer. Measure actual behavior and report results honestly.

DEVELOPMENT WORKFLOW
- Inspect the repository and applicable instructions before changing files.
- Preserve existing useful code.
- Verify current official Electron documentation before selecting APIs.
- Use a current supported Electron release and compatible dependencies.
- Use React, TypeScript with strict checking, and a suitable modern build setup.
- Prefer Windows as the initial packaging target, while keeping platform-specific logic isolated.
- Use AdaL actively for implementation, debugging, and browser testing.
- Keep a truthful ADAL_USAGE.md documenting actual development activity and instructions for capturing demo evidence. Never fabricate evidence.
- Work incrementally. Build and validate each phase before expanding it.
- If a feature cannot be implemented reliably, explain the limitation and mark it deferred rather than simulating success.

ARCHITECTURE

Separate these trust boundaries:
- Electron main process: windows, tabs, sessions, navigation, downloads, permissions, persistence.
- Trusted React renderer: browser chrome and internal pages.
- Narrow preload bridge: typed, validated IPC only.
- Remote web content: isolated from Node.js, privileged IPC, local files, and trusted UI.

Use Electron's supported WebContentsView architecture where appropriate, after verifying current documentation. Avoid deprecated BrowserView APIs and avoid webview tags unless a documented requirement makes them necessary.

Build a tab controller that manages:
- Tab identity and metadata.
- WebContentsView creation and destruction.
- Active view attachment and bounds.
- Navigation state.
- Loading, title, favicon, audio, and crash events.
- Session partition and privacy mode.
- Discarding and restoring inactive tabs.

Handle native-view stacking deliberately:
- Trusted menus, dialogs, and overlays must display correctly.
- Account for browser chrome, side panels, window resizing, display scaling, and fullscreen.
- Never assume a DOM overlay will automatically appear above a native web view.

Keep browser state outside React component lifecycles. React should render state and issue typed commands.

Use a structured local persistence layer, preferably SQLite with migrations if compatible with the chosen runtime. Keep database access in the main process and avoid blocking hot paths.

FOUNDATION: REAL BROWSING

Implement:
- Multiple tabs.
- New tab, close tab, duplicate tab, reopen closed tab.
- Tab switching and tab overflow.
- Tab reordering and pinned tabs.
- Address/search bar.
- Back, forward, reload, stop loading.
- Home and new-tab actions.
- Page title, favicon, loading status.
- Per-tab zoom and reset zoom.
- Find in page.
- Fullscreen and developer tools.
- Copy URL and useful page context menus.
- Open links in the same tab, a new tab, or a new window according to user intent.
- Safe handling of window.open and target="_blank".
- Graceful loading failures and renderer crashes.

Address-bar behavior:
- Distinguish URLs from search queries.
- Support localhost and development ports.
- Handle HTTP and HTTPS deliberately.
- Support configurable search engines.
- Reject unsafe or unsupported schemes.
- Do not silently bypass certificate failures.
- Display the actual destination clearly.

Use dedicated internal routes for Piccolo pages. Do not expose internal privileged pages through arbitrary remote navigation.

HISTORY

Implement:
- Persistent browsing history.
- Searchable history page.
- Grouping by date.
- Open history entries.
- Delete individual entries.
- Clear history by time range.
- Suggestions from history and bookmarks.

Avoid recording transient redirects as separate meaningful visits unnecessarily. Never record private browsing history.

BOOKMARKS

Implement:
- Add, edit, and remove bookmarks.
- Bookmark folders.
- Searchable bookmark manager.
- Optional bookmarks bar.
- Drag/reorder where reliable.
- Import and export a documented bookmark format, preferably standard HTML.
- Graceful handling of duplicates and malformed imports.

DOWNLOADS

Implement a real download manager:
- Filename, source, destination, progress, status.
- Pause/resume where supported.
- Cancel.
- Open downloaded file.
- Show in folder.
- Choose download destination.
- Optional “ask where to save.”
- Persistent download records.
- Safe handling of interrupted and missing files.

Never imply a download is resumable across restarts unless that behavior is actually implemented and verified. Do not automatically execute downloaded files.

SESSIONS AND PRIVATE BROWSING

Implement:
- Restore the previous normal session.
- Optional startup with a blank/new-tab page.
- Reopen recently closed tabs.
- Recovery after unexpected shutdown.
- Dedicated private windows using nonpersistent session partitions.
- Clear private browsing explanations: downloads and exported files can remain on disk.

Do not share cookies or storage between normal and private sessions. Ensure private session resources are disposed of when no longer needed.

CUSTOMIZABLE NEW-TAB PAGE

Build a useful, configurable new-tab experience:
- Search bar.
- Quick links.
- Clock and date.
- Optional greeting.
- Wallpaper.
- Widget grid.
- Edit-layout mode.

Customization:
- Light, dark, and system themes.
- Accent colors.
- Compact and comfortable density.
- Optional bookmarks bar.
- Adjustable sidebar and panel sizes.
- Motion and transparency controls.
- Export/import customization settings with schema validation.
- Reset settings and layout.

Wallpaper:
- Solid color and gradients.
- Local static images.
- Local video wallpapers.
- Fit, fill, position, dimming, blur, and contrast controls.
- Muted video playback by default.
- Pause animation when the new-tab page is hidden or the window is minimized.
- Respect reduced-motion preferences.
- Provide a low-power mode and static fallback.
- Do not decode separate copies of the same animated wallpaper unnecessarily.
- Do not autoplay remote videos or download wallpapers without user action.

Widgets:
- Clock/date.
- Quick links.
- Notes with local autosave.
- To-do list.
- Optional weather only after real provider configuration and user-selected location.

Widgets must support:
- Add/remove.
- Reorder.
- Resize within sensible constraints.
- Per-widget settings.
- Local persistence.
- Keyboard-accessible controls.

Do not request location automatically.
Do not display invented weather.
Do not execute arbitrary JavaScript or HTML from imported widgets.
Use a first-party widget registry with explicit interfaces.

SETTINGS

Create organized settings for:
- Appearance.
- New-tab page and wallpapers.
- Search.
- Startup and sessions.
- Privacy and site data.
- Site permissions.
- Downloads.
- Performance.
- Keyboard shortcuts.
- About/version.

Every visible setting must change real behavior. Hide or clearly label incomplete features.

SECURITY REQUIREMENTS

- Disable Node integration for remote content.
- Enable context isolation and sandboxing wherever supported.
- Expose a minimal preload API only to trusted UI.
- Validate IPC inputs and verify sender identity.
- Use a restrictive CSP for trusted pages.
- Do not disable web security.
- Do not ignore TLS/certificate errors globally.
- Never expose arbitrary shell execution, filesystem access, or unrestricted IPC.
- Handle external protocols with validation and user confirmation.
- Prevent unexpected popups.
- Restrict navigation to privileged internal pages.
- Scope permissions to origins and persist user decisions safely.
- Default sensitive permissions to ask or deny.
- Handle camera, microphone, geolocation, notifications, and screen capture deliberately.
- Make site permissions inspectable and revocable.
- Provide controls to clear cookies, cache, history, and site storage.

Do not implement a custom password vault in this phase.
Do not claim Chrome extension compatibility, DRM support, browser sync, or default-browser integration unless implemented and tested.

PERFORMANCE REQUIREMENTS

Implement a measured performance strategy:
- Lazy-load internal tools and heavy components.
- Avoid rendering hidden browsing views unnecessarily.
- Clean up listeners, timers, IPC subscriptions, and destroyed tabs.
- Bound history queries and suggestions.
- Debounce address-bar searches.
- Disable hidden animation loops.
- Avoid unnecessary polling.
- Keep browser chrome responsive during downloads and database operations.

Tab sleeping:
- Make inactivity timeout configurable.
- Distinguish background throttling from actual tab discarding.
- Do not discard tabs playing audio, capturing media, downloading, running an approved task, or pinned by user preference.
- Warn that restoring a discarded tab reloads it and may lose unsaved page state.
- Preserve available URL and tab metadata.
- Let users exclude sites from sleeping.

Add a performance page showing useful process metrics through supported Electron APIs.

Measure and document:
- Cold startup.
- Idle resource usage.
- One active tab.
- Several tabs.
- Video wallpaper enabled versus disabled.
- Tab closing and resource cleanup.

Report operating system, hardware, app build, test pages, and measurement method. Never invent performance numbers or enforce arbitrary RAM promises.

FUTURE WORKSPACE AND AGENT FOUNDATION

Design extension points now, but prioritize the browser.

Define typed interfaces for:
- Workspace.
- Tool.
- Agent.
- Task.
- Artifact.
- Permission request.
- Execution event.
- Verification result.

Future coding workspace:
- File explorer.
- Editor.
- Terminal.
- Git.
- Local preview.

Future office workspace:
- Documents.
- Spreadsheets.
- PDF viewing.
- Research sources.
- Artifact export.

Future multiagent behavior:
- User-selected agents and models.
- Per-agent access to tabs, files, and tools.
- Configurable concurrency.
- Shared artifacts.
- File-edit conflict control.
- Visible execution timeline.
- Pause/cancel/manual takeover.
- Approval before consequential external actions.
- Verification before completion.

Do not place unrestricted agent control in remote pages.
Treat webpage content as untrusted data, never as authority to change permissions or system instructions.
Keep secrets out of renderer storage, logs, and exports.

If the browser foundation is complete and validated, implement one narrow real agent workflow:
User instruction → selected-tab extraction → structured output artifact → read-back verification.

Use a real configured provider. If credentials are absent, show a setup state. Never replace real execution with a fake animation or fabricated result.

IMPLEMENTATION PHASES

Phase 1 — Browser foundation
Working desktop app, tabs, navigation, remote-content isolation, internal new-tab page.

Phase 2 — Everyday browser features
History, bookmarks, downloads, session recovery, private windows, find, zoom, permissions.

Phase 3 — Personalization
Themes, wallpapers, widgets, layouts, customization persistence.

Phase 4 — Reliability and performance
Sleeping tabs, process metrics, cleanup, recovery, packaging, accessibility.

Phase 5 — Agent integration
Only after the browser is stable: one genuine tool-based workflow with transparent execution and verified output.

Begin implementation immediately after a brief architecture plan. Continue through the authorized scope without repeatedly asking for routine implementation approval.

VALIDATION

Use appropriate automated tests for security boundaries, persistence, URL handling, tab lifecycle, private-session isolation, and settings migration.

Perform application-level smoke tests for:
- Opening, switching, reordering, and closing tabs.
- Back/forward/reload.
- Popups and new-window links.
- History and bookmark persistence.
- Actual download and cancellation.
- Normal session restore.
- Private-mode isolation.
- Wallpaper pause while hidden.
- Widget persistence.
- Tab crash recovery.
- Native view bounds and trusted overlays.
- Packaged-app launch.

Do not rely solely on a React dev-server preview to claim that Electron integration works.

DELIVERABLES

Provide:
- Complete source code.
- Repeatable development/build/package commands.
- Working packaged build for the available target environment, or an exact explanation of the packaging blocker.
- README.md.
- ARCHITECTURE.md.
- SECURITY.md.
- PERFORMANCE.md with actual observations.
- ADAL_USAGE.md.
- ROADMAP.md.
- Honest feature status: implemented, verified, limited, deferred.

At completion, explain what works, what was tested, and remaining limitations.

SUCCESS CRITERION

Piccolo launches as a real desktop browser, opens real websites, manages everyday browsing data, offers useful customization, and remains responsive without unnecessary background work.

Build the browser foundation well enough that office, coding, and multiagent capabilities can be added without rewriting its security and tab architecture.

AdaL MCP integration:
If an AdaL MCP server is available and configured, discover its exposed tools and use relevant capabilities for coding, debugging, browser testing, or workflow orchestration. Verify the actual tool names and supported operations; do not assume an AdaL MCP server exists or invent capabilities. Keep integration optional, protect credentials, and document genuine usage in ADAL_USAGE.md. If unavailable, continue using AdaL through its supported CLI or desktop workflow.

Application icon:
Use the provided image as Piccolo’s application icon. Preserve its original design, colors, and proportions; do not redraw or replace it. Generate the required platform assets (.ico for Windows, .icns for macOS, and PNG sizes for Linux) and configure the Electron window, taskbar/dock, installer, and packaged application to use them. Verify the icon in the packaged build. If the image is missing, request it rather than inventing a substitute.