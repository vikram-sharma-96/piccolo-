# Coding workspace

Piccolo 0.6 extends the restored 0.4 browser. Ordinary browsing does not import the coding renderer, launch an extension host, start a shell or watch project files. The existing 0.4 packages and rollback snapshot remain preserved.

## Setup and workflow

Requires Windows x64, Node.js 24/npm for building, and Git on PATH for Git operations. PowerShell is the integrated shell. A preview command also needs its own runtime, such as Node. Piccolo never installs project dependencies automatically.

```powershell
npm ci
npm ci --prefix coding
npm test
npm run build
npm run coding-smoke
npm run installer
```

Open Workspaces from the browser menu, select a local project folder using the native chooser, then choose **Trust project** after reviewing its contents. Opening or reopening starts restricted, even when a previous session was trusted. No package lifecycle, folder-open task or terminal command runs merely because the project opens.

The Code OSS Explorer supports new files/folders, rename/move and deletion through Piccolo's filesystem provider. Delete uses native confirmation and the Recycle Bin. Editor tabs support syntax coloring, find/replace, split groups, dirty indicators, Save and Save All. Ctrl+S saves, Ctrl+F finds, Ctrl+H replaces and F1 opens commands. Project Search performs bounded literal text search. Files over 8 MB and paths through symlinks/junctions are rejected. Unsupported or failed operations report errors.

Use the **Git** panel for real status, a selected-file diff, stage/unstage and commits. The selected folder must be the repository root. Piccolo disables Git hooks, external diffs, textconv, signing and staging filters for its own operations. Missing Git, missing author identity and repository errors are surfaced. This is a compact Git interface, without clone, push, pull, merge-resolution or authentication management.

**Terminal** asks before starting PowerShell with `-NoLogo -NoProfile`. It uses Windows ConPTY through a separate Electron utility process and xterm.js. This shell runs with the Windows user's rights: it is not a project sandbox. Explicitly run your development command, then use **Preview** to open its loopback URL in an ordinary browser tab. Remote preview pages receive no project, terminal or browser-chrome bridge.

**Project controls** contains trust, per-client MCP grants, takeover and Close Workspace. Close prompts for unsaved buffers and running terminal processes. A normal close stops the owned shell/process tree and destroys the coding WebContentsView and workers. Detached services can escape a parent process tree; users must stop those separately. Terminal sessions are never resumed automatically.

## Architecture

The workbench uses CodinGame's actively maintained `monaco-vscode-api` and service overrides **38.0.4**, with actual Code OSS **1.142.0** workbench services, Explorer, working copies, commands, diagnostics, configuration and extension machinery. This is more than a standalone Monaco editor. The `vscode` dependency aliases the upstream extension API, while `monaco-editor` aliases its editor API. Package locks pin all dependencies.

The coding view is a separate sandboxed WebContentsView at a project-specific `piccolo-code://` origin/session. Only its exact top-level frame receives a narrow validated coding preload. Browser main, browser chrome, ordinary webpages, coding renderer, web extension worker and native terminal utility remain separate surfaces. A small first-party workbench adaptor runs inside the coding renderer; installed third-party executable extensions always use the real LocalWebWorker host (kind 2), not browser chrome or remote pages.

The top-level coding CSP prohibits arbitrary eval and external network connections. An upstream constant custom-element initializer is replaced with an equivalent static initializer by a fail-closed, source-hash-pinned build plugin. The owned extension-host worker/iframe bootstrap needs eval to load web extension CommonJS; that exception applies only to those bootstrap assets. They have no privileged preload. It is not an OS isolation guarantee for all project content.

Main-process filesystem access uses a canonical chosen root, rejects traversal, alternate data streams, reserved names and links, and uses revision-checked atomic writes. Direct automation also excludes credential/configuration paths. Editor-version checks reject stale edits; automation cannot overwrite dirty editor buffers. No filesystem watcher starts: self changes notify the editor, while external disk changes are detected on subsequent reads/saves and explicit Explorer refresh. External live synchronization is deferred.

The native terminal is lazy and isolated from the browser main process. Commands still execute as the user. Environment forwarding omits common credential variables; this does not remove all ambient Windows authority. The user must approve code and commands they trust.

## MCP

Existing configure-once Ed25519 pairing and browser grants remain. A browser-control grant gives no workspace permission. In Project controls, independently grant a paired client access to that selected project. Runtime trust is also required. New tools are `workspace_state`, `workspace_files`, `workspace_editor`, `workspace_git`, `workspace_terminal`, `workspace_preview` and `workspace_extensions`.

Workspace reads/writes are bounded and do not expose arbitrary JavaScript, selectors, commands or key injection into the privileged workbench. Each MCP terminal input separately shows its complete text in a native approval (maximum 1500 characters, no control-sequence injection). MCP cancellation, client revocation, trust removal, close and takeover abort active requests. Takeover revokes project grants and stops a terminal used by automation. Browser pairing revoke/restore also clears that client's workspace grants. Completed side effects cannot be undone by cancellation.

Workspace activity stores bounded completion/failure/cancellation metadata in memory, without command bodies or file contents. Credentials and terminal output must still be treated as sensitive; terminal read is restricted to explicitly granted project clients. Installed extensions themselves can access the selected project through VS Code APIs, including files direct MCP tools refuse; install and trust are meaningful code-consent decisions.

## Persistence, appearance and limits

Recent projects, editor file groups/active file, managed extension records and project-scoped MCP grants persist. Reopening requires runtime trust again. Light/Dark/System follows Piccolo's resolved appearance, including automatic System updates, and applies the matching Code OSS theme. Native prompts follow Windows appearance. Website colors remain independent.

One coding project can be open per profile. Per-project sessions store Code OSS layout/configuration. Terminal contents and execution are not restored; custom lower panels are reopened explicitly. No automatic cloud sync, accounts, remote development, Node extension host, debugger, language-server executable downloads or Microsoft services are provided. Built-in JS/TS packages provide syntax grammars; they do not establish a TypeScript language server. JSON formatting/language tooling is verified.

The workbench adds substantial assets and memory while open; see PERFORMANCE.md for measured costs. Close Workspace releases its resources. Do not assume browser-only resource targets apply to an active IDE.
