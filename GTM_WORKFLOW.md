# Piccolo GTM workflow

Current source implementation; the previously packaged 0.7 installer is unchanged.

## Inspection before implementation

The existing artifact type is `src/shared/agent.ts:AgentArtifact`; encrypted persistence is `src/main/agent-storage.ts:AgentArchive`. `src/main/agent.ts:artifact.note` wrote text notes, but no disk Markdown/document writer or image generator existed. Existing `image.findings` and `AdalProvider` supported vision input only. The shared native approval method and capability registry were already in `src/main/agent.ts`. Task-owned disk writing, path/link guards and pruning were in `src/main/agent-sheet.ts:TaskSheets`.

This change extends those types, registry and approvals, adds Markdown/PNG support to the same owned writer, and keeps the existing CSV methods and note writer. It does not introduce another artifact store or approval system. `src/shared/agent-gtm.ts` holds the GTM schemas/source checks; `src/main/agent-gtm.ts` writes approved Markdown documents using that existing writer.

## Actual AdaL/provider preflight

AdaL MCP `adal_get_status` succeeded and reported installed version 1.11.0. A real model query through the existing Piccolo `AdalProvider` returned the requested connectivity JSON; installation alone was not treated as authentication proof. Its local non-secret model catalog listed `gpt-image-2.5-flare` as the default image model. No credential values were exposed or copied; authentication remained with AdaL. [AdaL's image documentation](https://docs.sylph.ai/features/image-generation/) and installed CLI support `generate_image`; availability was then established by the actual generated banner, not the catalog alone.

Text planning instances still disable all direct AdaL tools and deny callbacks. Only the separate, explicitly approved banner instance enables `generate_image`. Its callback permits exactly one call with the approved prompt, configured model, one image, exact owned output path and 16:9/1K settings. Extra tools, external sending/publishing, changed paths/arguments and repeated calls are denied. Provider failures stop the task; no placeholder or alternate provider is substituted. Interrupted generation is not silently replayed.

## Run in Piccolo

1. Build/run the current source, open Agent and connect its authenticated local MCP client. AdaL must be installed and authenticated.
2. Explicitly attach competitor pages. Enable **GTM launch kit** under task permissions; file-edit approval is required. This mode accepts only attached normal webpage tabs, not terminals, project files, screenshot attachments or arbitrary navigation.
3. Describe the product, proposed audience and launch message. The live run used Piccolo's existing Browser/Code/Agent workflow, a proposed researcher/developer audience and “Browse. Build. Verify.” It did not invent public availability, pricing, benchmarks or download URLs.
4. Approve provider transmission, the image generation request and Markdown writes using the existing native dialogs. The registry exposes only `browser.observe`, `write_gtm`, `generate_launch_banner` and `verify_gtm` in GTM mode. Drafting never invokes a sender/publisher. Those outbound capabilities are unavailable; existing approvals are not bypassed or replaced by an automatic publishing path.

Competitor positioning, pricing and audience must be short exact visible excerpts (whitespace normalized) or `unknown`. The main process checks the excerpts against its observed snapshots; it does not accept model prior knowledge as evidence. Each field receives its source link, including unknown fields, and unknowns enter the timeline. A source redirect requires the existing origin checks. The brief's own-product positioning section is labeled as a proposal. Launch/email drafts use own-product copy, not unsupported competitor comparisons.

The three Markdown artifacts and PNG use `USER_DATA/agent/tasks/TASK_UUID/ARTIFACT_UUID.md|png`. Agent displays friendly titles, sources and an inspection view. These ordinary output files are plaintext; encrypted snapshots remain in the existing store. Existing ownership-safe retention/clear controls also cover the new extensions.

## Verification and actual results

`verify_gtm` reopens all four files, compares immutable expected hashes, checks every structured competitor field/link and explicit unknown marker, and decodes the actual image with Electron to measure dimensions. Completion repeats these checks. This establishes saved-output agreement and observed-excerpt provenance; it does not prove that an excerpt is a complete product/pricing description or that marketing strategy is correct.

The real in-app run attached only:

- https://www.perplexity.ai/comet
- https://www.opera.com/neon (redirected to https://www.operaneon.com/)
- https://www.diabrowser.com (canonical trailing slash)

The run completed with seven main planning decisions, six successful capability steps, three Markdown artifacts and one actual image generated through AdaL `gpt-image-2.5-flare`. The banner opens at **1088 × 608**. All four file checks passed; nine competitor fields have source links, with four fields explicitly unknown.

Comet's observed positioning is “The browser that works for you”; pricing and audience were unknown. Neon displayed “Opera Neon is a browser built to act.” and `$19.90/month`; audience was unknown. Dia displayed “More than a browser. A better workday.” and “Download Dia for free”; audience was unknown. Dia's quote establishes a free-download CTA, not a verified full pricing plan. No competitor facts were taken from the user's introductory descriptions or outside coverage.

[Positioning brief](docs/evidence/gtm/positioning-brief.md), [launch post](docs/evidence/gtm/launch-post.md), [email draft](docs/evidence/gtm/email-draft.md), [banner](docs/evidence/gtm/launch-banner.png), [verification](docs/evidence/gtm/verification.json), [run/provenance report](docs/evidence/gtm/run-report.json). Nothing was sent or published. Native dialog responses were programmatically supplied by the isolated test harness; this does not claim a human clicked each test prompt.

## Repeatable checks

```powershell
npm test
npm run build
node scripts/agent-gtm-live.mjs
node scripts/agent-gtm-evidence.mjs
```

The live test uses a real provider and may incur usage charges. It creates a temporary profile and never resets personal browser data. Automated tests cover missing source links, unobserved/unsupported claims, explicit unknowns, denial-before-write, Markdown retention, exact once-only image permission and rejection of sending/publishing proposals in a draft-only registry. Existing spreadsheet/browser/agent tests remain applicable.
