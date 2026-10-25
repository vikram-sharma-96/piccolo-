# Piccolo 0.4 delivery

The existing React/Electron/TypeScript browser is preserved. Source, packaged application and installer are in this workspace; the 0.3 package remains available for comparison. No personal browser profile was cleared, reset or migrated by the test harnesses.

## Run

- Installer: `C:\Github Projects\Piccolo\release\0.4.0\Piccolo Setup 0.4.0.exe`
- Unpacked application: `C:\Github Projects\Piccolo\release\0.4.0\win-unpacked\Piccolo.exe` (keep the full folder together).
- Development and repeatable checks: README.md. Configure-once client examples: MCP_SETUP.md. Pairing keys and revocable grants remain persistent.

## Delivered changes

- Every website download enters a main-process approval policy, including direct user popups, private windows, redirects and blob exports. Metadata distinguishes the initiating page from the destination. Queue/rate limits prevent approval floods; multiple requests require a separate revocable grant. Risky names require additional consent.
- Cancel stops the actual transfer, zeros speed/ETA and prevents late revival. Active view excludes canceled records. History labels them Canceled and supports removal/clearing without deleting successful files. Safe cleanup applies only to owned stages. Final file saving is tracked through shutdown.
- Browser-owned Light/Dark/System themes share semantic tokens, initialize before first paint and follow OS changes in System mode. Explicit UI preferences do not force website colors. Core text/accent palette contrast checks meet 4.5:1 in each mode.
- Settings has clearer navigation/setup states, larger secondary labels, a search editor that retains invalid drafts, improved bookmark-dialog focus handling and feedback positioned above native browsing content.
- Proxy verification now uses a unique, uncached HTTPS request. A cached response cannot falsely validate an unreachable new proxy; failure restores the previous configuration or pauses networking until explicit disconnect.
- Short, interruptible menu/panel/tab feedback uses CSS and chrome-only WAAPI. Reduced motion and low-power mode disable nonessential effects. No animation library, additional renderer or permanent animation loop was added.
- `Ctrl+J` opens/reuses Downloads while preserving the initiating tab; `Ctrl+Shift+PageUp/PageDown` reorders the active tab. Supported widget layout controls are exercised and persist across restart.

## Verification

The final packaged suites cover 19 everyday browser checks, 16 upgrade checks, 17 MCP integration checks, 18 download-policy cases and 26 appearance/Settings audit groups. Fourteen unit tests and seven non-debugger lifecycle checks also pass. Machine-readable evidence and real MCP screenshots are under `test-results/`; `test-results/release-0.4.0.json` contains artifact hashes and bundle verification. Native responses are substituted only inside isolated tests, while real transfers, sessions, signatures, tunnels, storage and MCP requests execute.

Detailed matrices: APPLICATION_AUDIT.md. Download behavior: DOWNLOAD_PROTECTION.md. Extension results: EXTENSION_COMPATIBILITY.md. Discussion research and selected changes: BROWSER_RESEARCH.md. Installed design-skill sources/revisions: DESIGN_SOURCES.md. Actual AdaL review: ADAL_USAGE.md.

PERFORMANCE.md compares fresh-profile packaged runs on the same host. The latest short run measured 397.4 MiB for the new-tab UI versus 389.8 MiB before, with 0.026% summed idle CPU. This is a memory increase, not a claimed optimization or low-spec hardware guarantee. The report preserves the exact values, method, video/hidden/minimized scenarios and measured application hash.

## Remaining limits

- Electron's download hook runs after networking has started; buffers/staging can receive bytes before pause. No malware/reputation service is implemented. A power loss during final destination copying can leave a partial file; restart resume/transactional cross-volume publication remain deferred.
- OS-native menus, security prompts and file choosers follow OS appearance. Per-dialog explicit Piccolo theming is not claimed; Electron's global override would also change website preference signals.
- Firefox XPI/Chrome CRX installation and general background/privileged extension APIs are unsupported. uBlock Origin, Tree Style Tab and Bitwarden were statically reviewed as incompatible, not presented as working installations. Local content-script/storage fixtures are functionally tested.
- Password autofill, a system VPN, successful live NASA image delivery, physical printer/device tests, actual OS multi-monitor/scaling changes and a complete screen-reader audit remain unsupported or blocked as recorded in the matrix.
- Packages are unsigned because no signing certificate is configured. Installer generation and packaged launch are verified; OS installation is not automated.
