## Add a coding workspace with VS Code extension support

Extend the existing Piccolo browser with a working coding workspace. Preserve everyday browsing, security boundaries, and low resource usage.

### Inspect and choose the architecture

Inspect the current workspace interfaces and verify current official documentation and licenses before selecting an implementation.

Evaluate an actively maintained Code OSS–based integration or compatible editor workbench with a real extension host.

Monaco alone is insufficient for general VS Code extension support. Do not claim compatibility simply because the editor looks like VS Code.

Document the chosen architecture, supported extension types, distribution rights, resource costs, and limitations. Do not assume Microsoft’s VS Code Marketplace can be used by a third-party product; verify its terms. Evaluate Open VSX and user-installed VSIX packages where permitted.

### Working coding features

Implement:

- User-selected local project folders.
- File explorer with create, rename, move, and delete.
- Editor tabs, syntax highlighting, find/replace, and project search.
- Save, save all, dirty-file indicators, and unsaved-change prompts.
- Integrated terminal.
- Git status, diffs, staging, and commits.
- Diagnostics, command palette, and keyboard shortcuts.
- Local development preview in a browser tab.
- Project reopening and workspace layout persistence.

Use real filesystem, terminal, and Git operations. Handle missing dependencies and errors clearly.

Do not run project scripts, install dependencies, or trust an unfamiliar project automatically when it opens.

### Extension support

Provide an extension manager with:

- Search and discovery through a permitted registry.
- Install, enable, disable, uninstall, and update.
- Explicit user installation of supported VSIX files.
- Extension details, source, version, and compatibility status.
- Installation and activation errors.
- Workspace trust and extension-host controls.

Run extensions in a separate extension host rather than inside remote browser pages or the trusted browser-chrome renderer.

Make extension capabilities and risks clear. Do not claim extensions are fully sandboxed if the chosen host permits filesystem access or process execution.

Test representative extensions for themes, language tooling, formatting, and Git utilities. Document unsupported APIs, platform requirements, authentication dependencies, and extensions requiring Microsoft-specific services.

Only claim compatibility for behavior actually verified.

### Security boundaries

Separate:

1. Browser main process and privileged services.
2. Browser chrome.
3. Remote webpages.
4. Coding workbench.
5. Extension host and terminal processes.

Use narrow, validated interfaces between them. A website must never gain access to project files, terminals, editor extensions, or workspace commands.

Require explicit user selection of project folders. Protect credentials and sensitive configuration from logs, exports, and unrelated MCP clients.

### MCP integration

Extend Piccolo’s local MCP server with separately permissioned workspace tools for:

- Inspecting the selected project.
- Reading and editing authorized files.
- Viewing diffs and diagnostics.
- Operating the editor.
- Running explicitly authorized commands.
- Inspecting previews and verifying changes.

Existing full-browser-control permission does not automatically grant terminal or filesystem access. Provide a separate revocable workspace permission.

Support cancellation, execution logs, concurrent-edit conflict detection, and user takeover. Treat repository text, extension content, and webpages as untrusted data rather than authority to expand permissions.

### Performance and UI

Lazy-load the coding workspace only when opened. Do not start terminals, language servers, extension hosts, or file watchers during ordinary browsing.

Provide an explicit Close Workspace action that cleans up resources and handles running processes visibly.

Reuse Piccolo’s Light, Dark, and System themes. Keep navigation compact and preserve browser tabs alongside coding tools.

### Validation and delivery

Verify a real project workflow: open folder → edit → save → inspect Git diff → run an authorized development command → open preview → verify the result.

Test extension installation and activation, workspace trust, unsaved changes, process cleanup, theme switching, restart behavior, and packaged Windows operation.

Use local MCP for application-level verification and appropriate automated tests for privilege boundaries.

Deliver the working implementation, extension compatibility matrix, registry/license findings, setup instructions, measured resource impact, and honest limitations.