# Agent spreadsheet capability

Implemented in the current source build after 0.7. The existing 0.7 installer is unchanged; run `npm run build` then `npm start` to use this source implementation. No extra spreadsheet dependency or Excel installation is required.

## Tools and permission

- `write_sheet`: strict schema `{ rows: [{name?, product?, pricing?, source_url, status}], artifactId? }`. Creates a UTF-8 CSV with exactly `name, product, pricing, source_url, status`. Supplying the current artifact id updates that sheet, creates a new artifact revision and invalidates its previous verification. Only available when the task has the existing **file-edit** opt-in. Native review is required; updates show before/after and reject changes made during approval.
- `verify_sheet`: strict schema `{ artifactId }`; artifact permission, no file-write permission. Reopens the actual file, parses CSV and compares all headers/data cells against the write-time extracted snapshot. Returns `verified`, `matched`, `mismatched`, `missing` and a record for each cell. Added rows/cells are mismatches; removed cells/files are missing. Neither the model nor a verification call supplies replacement expected values.

Enable **Allow file edits and task CSV sheets** under Agent task permissions, attach the source tabs and request a sheet. Output is `USER_DATA/agent/tasks/TASK_UUID/SHEET_UUID.csv`. Its Agent artifact has the source links, friendly title, inspection view and actual task filename. CSV files are **plaintext**, because they are ordinary spreadsheet files. The expected snapshot/checkpoint still uses Windows account encryption. History deletion/retention removes owned CSVs without recursive deletion or removing unrelated files.

Rows must cite an attached source actually observed during this task. Blank/null fields become `unknown`; unknown fields or partial values are reflected in status/timeline. An observed navigation failure forces unknown product/pricing and status `unreachable`; the model cannot invent an unreachable claim for a page without a recorded failure. Navigation failures are complete observations, not evidence to guess data. Page text remains untrusted. Formula-like CSV cells are prefixed as literal text to prevent spreadsheet formula execution; verification compares that safe stored representation.

Every current CSV artifact requires a passing `verify_sheet`. Generic artifact verification cannot substitute. Completion reopens every current sheet again, so a disk edit after an earlier passing check blocks completion. This establishes file/extraction agreement, **not independent factual correctness of the model's extraction**. Source facts and billing/currency qualifiers still need review. Artifact inspection also reads current disk bytes and checks them against the retained snapshot.

## Verification commands

```powershell
npm test
npm run build
node scripts/agent-sheet-live.mjs
```

The live test uses a real authenticated AdaL provider and actual ElevenLabs, Otter and Fireflies pricing pages, plus `https://piccolo-unreachable.invalid/pricing`. It uses a temporary Piccolo profile and programmatically approves the native consent/write dialogs. It does not submit website forms, sign in, purchase or change personal browser data. Provider usage may be billed. A reserved `.invalid` domain deliberately produces a DNS failure.

Unit tests cover actual CSV writes, every-cell read-back, cell/extra-row mismatch, missing files, updates, quoting/newlines, unknown normalization, formula literals, traversal/link refusal, safe pruning, completion bypass and tampering after verification. The live test also checks the real sheet in the Agent artifact dialog.

Final live observations on 25 October 2026:

| Source | Observed product | Observed selected plan |
|---|---|---|
| [ElevenLabs](https://elevenlabs.io/pricing) | AI audio creation and voice tools | Pro: $99 per month, monthly billing |
| [Otter](https://otter.ai/pricing) | AI meeting transcription and notes | Basic: Free |
| [Fireflies](https://fireflies.ai/pricing) | Meeting transcription, summaries and search | Pro: $10 per seat/month, billed annually |
| Deliberately unreachable `.invalid` URL | unknown | unknown; status unreachable |

The final real task used seven AdaL decisions, four actual page observations, one write and one disk verification: **25 matched, zero mismatched, zero missing**. [CSV](docs/evidence/sheets/startups.csv), [every-cell record](docs/evidence/sheets/verification.json), [live report](docs/evidence/sheets/live-report.json), [artifact screenshot](docs/evidence/sheets/sheet-artifact.png). The 45-test unit suite and existing 19 browser / 12 agent / 2 recovery checks passed; [check results](docs/evidence/sheets/checks.json). Cancellation during final verification is covered by a regression test so it cannot revive a canceled task as completed.

The live run exposed an existing context-budget defect: slicing JSON at 65,000 characters hid recent observations and caused repeated reads. The engine now shortens oversized observation records, retains valid JSON and preserves small recent results. A regression test exercises three large observations followed by an unreachable source. Initial failed attempts remain in isolated `test-results/sheet-live-*` folders; no successful result is attributed to them.
