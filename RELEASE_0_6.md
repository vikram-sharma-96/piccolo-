# Piccolo 0.6 delivery

Implemented the coding workspace requested in `prompt/prompt2.md` on the restored **0.4.0** browser base. The earlier ThreeUI 0.5 changes were not reintroduced. Previous release folders and the rollback snapshot under `test-results/rollback-0.5.0-1792902439108` are preserved. The user's live personal 0.4 profile was not altered by these tests.

## Windows package

- Installer: `C:\Github Projects\Piccolo\release\0.6.0\Piccolo Setup 0.6.0.exe` (131,208,362 bytes).
- Portable launch: `C:\Github Projects\Piccolo\release\0.6.0\win-unpacked\Piccolo.exe`. Keep the whole unpacked directory.
- Installer SHA-256: `815d4e86e1cfc4a0b2035fae941f378953c7ca96a0050bce4b4e599d2e92e4cc`.
- Packaged `app.asar` SHA-256: `b95dabce048e725db869f26fc36da57953bc2b8464d14a633598f2ae1f21f9f7`.
- Build/launch tested on Windows x64. No signing certificate is configured. The NSIS installer was built; interactive OS installation/uninstallation was not performed.

`node scripts/check-release.mjs` verified nine main-process/preload bundles, 130 UI/workbench/license assets, native PTY presence and current MCP setup paths against the final build. Full checksums: `test-results/release-0.6.0.json`.

## Verification matrix

All application tests use fresh temporary profiles and harmless project/download fixtures. Native chooser and approval responses are substituted only inside test instances. Actual transfers, files, Git, extension workers, native shells, preview servers, MCP signing/reconnection and persistence run for real.

| Area                                                                                                              | Status         | Evidence                                                          |
| ----------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| Strict root and coding TypeScript checks; production build                                                        | Passed         | `test-results/coding-package-final.log`                           |
| Unit tests, including canonical paths, junctions, sensitive paths, atomic revision writes and search cancellation | Passed: 19     | `test-results/coding-unit.log`                                    |
| Packaged selected-folder/restricted startup and no automatic tasks/install/shell                                  | Passed         | Coding report below                                               |
| Separate MCP grant, unrelated-client denial, sensitive paths, stale editor/disk conflicts                         | Passed         | Coding report                                                     |
| Real filesystem create, move, remove, literal search, edit/save                                                   | Passed         | Coding report                                                     |
| Git diff, stage and commit; fixture hook not executed                                                             | Passed         | Coding report                                                     |
| Real JSON worker formatting, custom-language formatting/diagnostics and Git API fixture                           | Passed         | Coding report                                                     |
| Open VSX discovery/install; VSIX install/update/disable/enable/remove; tamper enable rejection                    | Passed         | Coding report                                                     |
| Unsafe traversal and desktop-only VSIX rejected before execution                                                  | Passed         | Coding report                                                     |
| Light/Dark/System, actual editor theme, palette, native System change events both ways                            | Passed         | Coding screenshots/report                                         |
| Terminal denial, approved native ConPTY command, live local Node preview of saved source                          | Passed         | Coding report                                                     |
| Remote preview has no Node or privileged IPC; non-loopback preview request rejected                               | Passed         | Coding report                                                     |
| User takeover revokes automation and stops its server                                                             | Passed         | Coding report                                                     |
| Unsaved Cancel/Save, close destroys coding view, shell cleanup                                                    | Passed         | Coding report                                                     |
| Restart keeps pairing/recent project/file layout; reopens restricted without terminal                             | Passed         | Coding report                                                     |
| Pair revoke/restore clears persistent workspace grants                                                            | Passed         | Coding report                                                     |
| Explorer visible New File action, native editor typing/Ctrl+S, F2 rename and Ctrl+H                               | Passed: 4      | `test-results/coding-ui-1792908739683/report.json` and screenshot |
| Packaged everyday browser, real HTTPS, tabs, navigation, isolation, persistence and crash recovery                | Passed: 19     | `test-results/packaged-smoke.json`, `coding-final-smoke.log`      |
| Packaged upgrade/integration behaviors                                                                            | Passed: 17     | `test-results/upgrade-packaged.json`                              |
| Packaged MCP pairing, permissions, cancellation, persistent adapters and restart                                  | Passed: 17     | `test-results/mcp-packaged.json`, `coding-final-mcp-smoke.log`    |
| Central download approval, cancel/races/flood/private/popup/history fixtures                                      | Passed: 18     | `test-results/download-policy.json`                               |
| Settings/application appearance and controls, all three modes                                                     | Passed: 26     | `test-results/appearance-audit.json`                              |
| Non-debugger lifecycle/discard/crash/database cleanup                                                             | Passed: 7      | `test-results/lifecycle.json`                                     |
| Interactive installer OS registration/uninstall; other OS/architectures; long-duration low-spec testing           | Not tested     | No claims made                                                    |
| Desktop Node extensions, Microsoft Marketplace, remote development/debuggers                                      | Not applicable | Deliberately unsupported; see compatibility document              |

The final **24-check packaged coding report** is `test-results/coding-1792908445394/report.json`. It includes measurements, real MCP activity checks and screenshots for all three appearance modes. The supplemental Explorer/editor test uses actual visible Code OSS controls and keyboard input; it waits for the editor to open after filesystem creation before typing.

An earlier browser HTTPS check timed out; an isolated probe and full rerun passed. An earlier MCP test expected only transport rejection; it was corrected to accept an MCP cancellation error response as well as transport closure. No production approval was bypassed to make these tests pass. Development failures and logs remain available under `test-results`.

## Reproduce

```powershell
npm ci
npm ci --prefix coding
npm test
npm run build
npm run installer
$env:PICCOLO_EXE = (Resolve-Path 'release/0.6.0/win-unpacked/Piccolo.exe').Path
npm run coding-smoke
node scripts/coding-ui-smoke.mjs
npm run smoke
npm run upgrade-smoke
npm run mcp-smoke
npm run download-policy
npm run appearance-audit
node scripts/run-lifecycle.mjs
node scripts/check-release.mjs
```

`run-lifecycle.mjs` uses its own instrumented non-debugger Electron runner; the other listed application suites honor `PICCOLO_EXE`. Open VSX checks need internet access, and the fixture development server uses Node available on PATH. `scripts/coding-notices.mjs` regenerates coding dependency inventory/license notices from installed packages and pinned upstream license sources; network is needed for regeneration, not ordinary compilation.

## Scope and remaining limits

See [CODING_WORKSPACE.md](CODING_WORKSPACE.md) for setup, architecture, trust and security boundaries, [CODING_EXTENSION_COMPATIBILITY.md](CODING_EXTENSION_COMPATIBILITY.md) for actual supported behavior and registry/license findings, and [PERFORMANCE.md](PERFORMANCE.md) for raw-method caveats and resource observations. The active IDE used about 1.3 GiB in these short measurements, and about 1.4 GiB with shell/preview descendants; it has a material cost on low-memory machines. Ordinary browsing starts no coding host or terminal.

This is a web extension workbench, not universal VS Code desktop extension support. No live external filesystem watcher, automatic project tasks, dependency install, Node extension host, TypeScript server, terminal resurrection, cloud sync or Microsoft services are implemented. Project extensions can access project files through VS Code APIs; approved terminal commands run with Windows user permissions. Detached services may require manual shutdown. Core 0.4 download protection/limitations, browser extension support and prior browser research remain documented in their existing files.
