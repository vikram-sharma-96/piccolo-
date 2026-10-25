# AdaL development diagnostic · 2026-10-25

Interface: configured AdaL MCP `adal_get_status` and `adal_run_task`; installed CLI 1.11.0. Read-only source review, enabled tool groups Read/Search only, self-review mode. First attempt failed because positive and negative tool lists cannot be combined; the corrected operation returned the following actual output. Native runtime execution is verified separately; this diagnostic alone does not establish it.

# Piccolo prompt3 architecture diagnostic

I read only the eight files you listed. Nothing was edited or run. "SRC" means I saw it in source. "DOC" means it comes from SECURITY.md or RELEASE_0_6.md. This is development assistance, not runtime proof.

## Capability matrix

| Capability | Grant needed | Source observation (SRC) | Doc claim (DOC) / gap |
|---|---|---|---|
| Browser tools (stdio) | `Pair.full`, or a per-call native dialog. `Pair.private` is needed for private windows. | `approve()` skips the dialog only if `principal.full && !revoked`. `activeBrowser()` rejects private windows without `private`. | DOC: matches. |
| Browser tools (HTTP) | Bearer token, plus a dialog on every call. | `principal` is undefined, so `full` never applies. `hasWorkspaceGrant` returns false for an undefined client. | DOC: "HTTP always asks per call". |
| `workspace_state`, `files`, `editor`, `git`, `preview`, `extensions`, `terminal` | A `coding-grants` record `{client, project}`, an open project in that window, and `trusted` set. | `hasWorkspaceGrant` checks all of these. `workspaceAccess` re-checks them on every call. `full` is not consulted. | DOC: "independent of browser permission". |
| File writes | Workspace grant. | Needs a revision, rejects sensitive paths, and rejects unsaved editor buffers. Delete needs a native dialog. | DOC: matches. |
| Terminal start | Workspace grant, plus a trusted project, plus a native dialog. | `startTerminal` shows a dialog that receives the abort signal. | DOC: "runs with user-account privileges". |
| Terminal input | Same, plus a native dialog for every input. | Capped at 1500 characters, control characters rejected, one approval at a time via `approvingInput`. | DOC: matches. |
| Git | Workspace grant. Staging or committing also needs project trust. | Hooks, filters and signing are disabled. Automation is limited to single regular files for stage, unstage and diff. | DOC: matches. |
| Cancellation | Revoke, takeover, trust revoke, workspace close, or disconnect. | See the list below the table. | DOC: "completed effects are not rolled back". |
| `workspace.ts` contracts (`Agent`, `Task`, `PermissionRequest`) | None. | The file has types only. None of the other seven files import it. Its `scope` values (`tab`/`file`/`tool`/`external-action`) don't match the real grant shape `{client, project}`. `Task.status` has `paused` and `cancelled`, but no code in the other seven files uses them. | No coordinator exists yet. |
| `optional.ts` | None of its own. | It lazy-loads `mcp.cjs`. For `status`, `server-stop`, `disconnect` and `cancel` it reports the stored pairs without loading MCP. Its extensions, proxy and daily services are unrelated to coding grants. | — |
| `model.ts` | None of its own. | The `workspace` command enum includes `grant-client` and `takeover`, with `value` capped at 64 characters. The `optional` service enum includes `mcp`. | The `workspace` line in `commandSchema` is not formatted like the rest. |

Cancellation sources in the source:
- **Per principal:** `principalControllers`.
- **Per connection:** `connectionSignal`.
- **Server-wide:** `serverController`.
- **HTTP credential:** `httpController`, aborted on token rotation.
- **Workspace-wide:** `s.abort`.
- **Per client:** `activeSignals`.
- **Time limit:** a 30-second timer in the `mcp.ts` wrapper.

## Source risks for a coordinator

1. **Sub-agents share one principal.**
   - Grants, `inflight` (4 per connection) and `activeSignals` are keyed by pair id.
   - Revoking or taking over cancels every sub-agent under that client. You can't cancel one sub-agent selectively.
   - `workspaceAccess` also has a global cap of 4 across all clients, so one client can starve the others.
2. **The terminal is shared.**
   - `terminalClients` is a global set, and `terminalOutput` and `terminal-stop` aren't checked per client.
   - Any granted client can read another client's terminal output and stop its terminal.
   - `revokeClient` on one client stops the terminal and clears the whole set, so it can kill another client's session.
3. **The wrapper's cancellation is only partial.**
   - The `Promise.race` in `mcp.ts` rejects on abort, but the underlying callback keeps running.
   - `editorOperation` takes no signal, and `executeJavaScript` can't be aborted.
   - `shell.trashItem` and `postMessage` input can't be undone once they start.
4. **The delete dialog ignores the abort signal.** The `showMessageBox` call for delete has no `signal`. A cancelled request leaves a stale dialog on screen. `signal.aborted` is only checked after the user answers.
5. **The consent text understates the tool surface.** The grant dialog says "read/edit ordinary files, editor and Git". The granted client can also call `workspace_extensions`, `workspace_terminal` and `workspace_preview`. I couldn't see whether `installExtension` shows its own native dialog, because `coding-extensions` wasn't in scope.
6. **Some browser grant changes leave workspace grants in place.** Only `revoke-client` and `restore-client` clear `coding-grants`. `grant-client`, the `private` toggle and `trust-disable` don't. This fits the docs' "independent" claim, but a coordinator that assumes de-escalation will be wrong.
7. **A 30-second limit applies to every tool call.** The `mcp.ts` wrapper applies it to workspace tools too, so a slow approval dialog is aborted at 30 seconds.
8. **A time-of-check gap in `workspace_state`.** It checks `hasWorkspaceGrant` separately before `withWorkspace` checks it again. The window is small and probably harmless.
9. **The security docs are out of date in one place.** The 0.2 section of SECURITY.md says "21 tools" and "no unrestricted shell". I could only confirm 6 coding tools in source. The browser tools are in a file I wasn't asked to read. The 0.6 section does disclose the terminal's user-level authority.

RELEASE_0_6.md lists packaged MCP and coding tests as passed. I haven't re-run or verified any of them.

## Five concrete tests

1. **Privilege separation.**
   - Pair client A with `full` and no workspace grant. Pair client B with a workspace grant and no `full`.
   - Call all six `workspace_*` tools plus `workspace_state` as A. Expect denial, with `workspace_state` returning `available:false`.
   - Call `navigate` and `browser_read` as B. Expect a native dialog each time.
   - Repeat with the project untrusted, and with the project open in a different window than the one selected.
2. **Revocation mid-flight.**
   - Start a long `workspace_files` search and a pending `terminal-input` dialog as client A, plus a pending dialog as client B.
   - Run `revoke-client` on A. Expect A's calls to reject, A's grant record to be gone, and B unaffected.
   - Check whether the stale dialog persists. Check that `restore-client` does not bring back A's workspace grant.
3. **Terminal cross-client isolation.**
   - Give A and B workspace grants. A starts a terminal and sends an approved input.
   - Have B call `terminalOutput` and `terminal-stop`. This tests risk 2. If it succeeds, the coordinator needs per-sub-agent terminal ownership.
   - Then revoke B and confirm whether A's terminal dies.
4. **Cancellation versus effects.**
   - Abort the MCP request at three points: before approval, during `git commit`, and during a `write`.
   - Check that the repository is consistent (no half-written file or partial commit).
   - Check that `activeSignals` and `inflight` are cleaned up. Check that `editorOperation` is not cancelled (risk 3).
   - Confirm the response and the `events` log both say "cancelled" even if the effect landed.
5. **Concurrency and starvation.**
   - Open 4 connections as client A, each with one blocked workspace call. Then make a call as client B.
   - Expect "Too many concurrent workspace requests" for B (the global cap, risk 1).
   - Then send a 5th call on one A connection and expect the per-connection `inflight` error.
   - Finally run `takeover` and check that all 4 abort and the terminal stops only if a `terminalClients` entry exists.

## Recommendations for the lazy coordinator

- Give each coordinator or sub-agent role its own pairing, or treat all sub-agents as one trust domain.
- Don't give the coordinator a `Task` or `PermissionRequest` layer until it maps onto `{client, project}` grants.
- Fix risks 2 and 4 before running multiple concurrent clients.
