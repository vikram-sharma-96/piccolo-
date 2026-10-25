# Numeric evidence support and verification retries

Implemented in current source; the earlier packaged installer is unchanged. Restart the source application to load the rebuilt code. Existing open windows were not stopped.

## Inspection and changes

- `src/main/agent.ts`: `verify.page` previously used `text.includes(expected)` and allowed a new expected value on every retry. It now uses the shared page verifier and pins unresolved numeric/currency expectations before reading the page. Wording/whitespace may change; dropping or changing a pinned amount is rejected. Different tabs cannot clear each other's failed checks.
- `src/main/agent.ts`: `artifact.note` previously validated only read/attached source provenance. It now checks title/text numbers against declared sources. Unsupported notes are rejected unless explicitly acknowledged; acknowledged values are visibly flagged in the saved text and metadata and cannot receive fully-supported verification.
- `src/main/agent.ts`: `write_sheet` / `verify_sheet` now check numeric cell data against each row's own observed source URL, in addition to immutable disk-cell comparison. An unrelated row's price cannot supply evidence.
- `src/shared/agent-gtm.ts`, `src/main/agent-gtm.ts`: existing exact-excerpt competitor checks remain. Brief/proposal/draft numeric checks use the same evidence support mechanism; no duplicate artifact or approval system was added.
- `src/shared/agent-evidence.ts`: shared extractor, source-bound ledger, retry pins and support records. Supported values include an actual source URL and matching snippet; unsupported/missing values retain candidate sources and never receive a fabricated snippet.
- `src/shared/agent.ts`: existing artifact and step types now carry evidence metadata and verification target identity.
- `src/main/agent-engine.ts`: a later success can clear a failure only for the same capability/target. Completion rechecks artifact support and outstanding expectations. Its authoritative summary is generated from recorded execution state. Model-summary numeric prose is separately audited/withheld; operational counters cannot supply evidence for arbitrary page claims.

The previous loopholes were changing `expected` on a retry, substring matches such as `19` inside `199`, storage-only verification blessing unsupported extraction, and a model-written completion summary borrowing unrelated successful checks.

## Matching and records

Digit amounts, currency markers, percentages, scale suffixes and common English number-word phrases need observed support. `19` does not match `199` or `19.5`; `$19` does not match `EUR19`; `19%` does not match bare `19`. Whitespace and equal numeric formatting such as trailing decimal zeroes are tolerated without changing the amount. Words are matched as normalized phrases rather than guessed numeric conversions. `ElevenLabs` is not treated as the number eleven.

Explicit free-price phrases, including bare `Free`, need evidence. `Free` does not establish `free forever`. Unproven values fail or are explicitly marked unknown; they are never silently fully verified. The root review added a bare-Free regression after AdaL's word-phrase implementation.

Records contain location, value/key, support status, source identity/URL and a bounded matching snippet. Missing/unsupported values have candidate sources and a reason, not a pretend match. Full artifact records are retained; outputs above the record budget are rejected. Tool previews may be explicitly truncated, with full records retained in artifact metadata.

## Actual tests and live check · 25 October 2026

AdaL used its own coding workflow to read source, edit source/tests, execute the full unit suite and fix failures. The initial MCP call timed out; two local CLI continuations of session `b5b1f001-d56a-474e-9c1c-4e2e3b244da7` completed successfully. AdaL reported 64 then 67 passing tests and clean TypeScript checks. Root independently reran the suite, added the bare-Free case and obtained **68 passed, zero failed**.

Required cases are covered in `tests/agent-evidence.test.ts`: present/absent values, changed/dropped retry amounts, extra unsupported second-product prices, numeric boundaries/currencies, source-specific cells, failed checks on different targets, unknown flags, full record retention, completion-summary laundering, English word amounts and free-price promises. Existing engine/sheet/GTM tests remain in the full suite.

The real in-app task attached only `https://elevenlabs.io/pricing`, observed the page through the authenticated MCP client, wrote the actual quote `Pro $99 per month`, and independently checked page and artifact support. Both verification records include `$99`, the actual source URL, and the observed snippet:

> g Additional Credits 121k credits per month Pro $99 per month Choose Pro Everything in Creator, plus

[Written note](docs/evidence/evidence-support/note.txt), [verification records](docs/evidence/evidence-support/verification.json), [live report](docs/evidence/evidence-support/live-report.json), [AdaL coding results](docs/evidence/evidence-support/adal-coding.json). The snippet includes surrounding page context; it is not a separate assertion about another plan. Native consent was programmatically approved only in the isolated live test profile. Provider responses and page observations were real, not fixtures.

```powershell
npm test
npm run build
node scripts/agent-evidence-support-live.mjs
node scripts/agent-evidence-support-evidence.mjs
```

## Limits

This is lexical numeric/price support, not a semantic fact checker. It does not prove that a number belongs to the product/plan asserted in arbitrary prose, that a publisher's statement is true, or that an unsupported non-numeric claim is correct. GTM competitor fields retain their stronger exact-excerpt checks. Image contents are not OCR-verified by this feature. English word detection covers a finite vocabulary, not every language or expression; words and digits are not automatically converted. Some currency aliases remain distinct. Source snapshots are bounded and rechecks use current observations, so re-observation can invalidate earlier support. Strict matching can reject valid paraphrases; use visible wording or explicit unknowns instead of lowering the expected amount. Recorded file/code results and system-generated operational metadata remain distinct from webpage evidence.
