# Download protection · 0.4

Website downloads now require explicit approval in Piccolo's Downloads page. The toolbar counter and `Ctrl+J` reach the queue without replacing the initiating tab. Allow shows a native destination chooser when Ask where to save is enabled; Cancel never means merely hiding a record. Risky filename categories require a second native warning with Cancel selected by default.

The trusted approval record shows the initiating origin/page (including opener attribution for direct popup downloads), final download URL, filename, MIME type, advertised size when available, and planned destination. Unknown attribution is shown as unknown. Neither HTTPS, MIME nor a filename establishes safety. This is not antivirus, reputation checking or executable-content inspection.

## Main-process boundary

Every configured normal/private session uses one `will-download` policy in `src/main/downloads.ts`. Unknown/unowned download sources are canceled. New windows and accepted user popups pass through the same session policy; unsolicited popups are rejected by the existing input-gated popup handler. Remote renderers do not control approval state, destination paths or transfer records.

Electron's [will-download event](https://www.electronjs.org/docs/latest/api/session#event-will-download) supplies a [DownloadItem](https://www.electronjs.org/docs/latest/api/download-item). Piccolo sets its unique staging path synchronously and pauses it before presenting approval. **This is not zero-byte pre-transfer blocking:** Chromium has already requested response headers, and some body bytes can reach network buffers or the owned staging file before pause takes effect. Approved bytes are copied to the selected destination only after completion. There is no claim that an unsolicited request never contacted its server.

Current bounds: one unapproved request per initiating origin/session by default; explicit, separately revocable multiple-download permission permits up to four. Four pending per owning window, eight total transfers, ten attempts per origin/minute, two-minute pending expiry. Additional requests are canceled, coalesced into bounded blocked history, and their persistence/UI updates are batched to avoid modal or disk-write floods. These conservative limits can require a legitimate bulk export to be retried later; multiple permission never approves a file automatically.

Navigation, source destruction, private-window closure, dismissed risk/save prompts and expiry cancel unapproved work. Accepted normal transfers can continue when their source tab closes. Cancel sets a terminal flag and zeroes rate/ETA before canceling the real DownloadItem. Late progress/completion callbacks cannot revive it. Once transfer completion has entered final file saving, it is at a commit point; stale Cancel/Pause/Resume calls are rejected rather than corrupting status.

## History and files

Active/awaiting view excludes canceled, completed, blocked and interrupted records. History labels Canceled, offers removal and clear history, and never offers successful-file actions on canceled items. Removing a record does not cancel an active transfer or delete a saved file. Retry starts a new request and requires fresh approval. Open requires completion, a present file and a separate user confirmation; there is no automatic file execution.

Only UUID `.part` files inside Piccolo's own staging directory are cleaned up. Cancellation retries cleanup for short Windows file-lock races; normal shutdown awaits pending work, and startup sweeps owned leftover stages. Active states recovered from a crash become Interrupted with zero speed/ETA. Private records are not persisted, but an abrupt OS/process failure can leave private staging bytes until the next startup sweep. Staging and normal browser data inherit the profile directory's OS access permissions.

Destination publication uses exclusive creation and never overwrites an existing file, even if a native chooser permits selecting one. Failed saves are Interrupted with a retry explanation. Publication is a filesystem copy, not a transactional cross-volume rename: a power loss during final saving can leave a partial destination. Piccolo conservatively does not automatically delete that destination after restart because it must not remove an unrelated or completed file. Restart-resume and transactional destination recovery remain deferred.

## Reproduction and evidence

`scripts/download-baseline.mjs` intentionally runs the preserved 0.3 package against harmless localhost fixtures. `test-results/download-baseline.json` records: drive-by completed with zero approvals; Cancel stopped server transfer; canceled rows remained in the default view; late Cancel relabeled completed history. Do not run the baseline against personal downloads.

`npm run download-policy` exercises real local transfers, explicit saves, repeated cancellation, redirects, blob exports, user popup/opener attribution, pending and accepted source-tab closure, harmless risky names, delayed chooser races, multiple grants, private windows, floods and restart/record clearing. `npm run mcp-smoke` additionally exercises approval and cancellation over the authenticated local MCP connection in Light, Dark and System modes. Native responses are substituted only by these isolated test harnesses. No live malware is used.
