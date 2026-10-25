import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { AgentEngine } from "../src/main/agent-engine";
import {
  EvidenceLedger,
  ExpectationPins,
  assertEvidence,
  checkNumericSupport,
  evidenceSummary,
  extractNumericTokens,
  verifyPageExpectation,
  flagUnknownText,
  toArtifactEvidence,
  EVIDENCE_RECORD_BUDGET,
  type EvidenceSource,
} from "../src/shared/agent-evidence";
import { gtmBrief, type GtmObservation } from "../src/shared/agent-gtm";
import type {
  AgentCapability,
  AgentProvider,
  SourceReference,
} from "../src/shared/agent";

const page = (text: string, id = "a", url = "https://a.example/pricing"): EvidenceSource => ({
  id,
  url,
  kind: "page",
  text,
});
const one = (claim: string, evidence: string) =>
  checkNumericSupport(claim, "t", [page(evidence)]);
const statuses = (claim: string, evidence: string) =>
  one(claim, evidence).map((record) => record.status);
const observation = (tabId: string, url: string, text: string): GtmObservation => ({
  tabId,
  url,
  title: tabId,
  text,
});
const tab = (id: string, url: string): SourceReference => ({
  kind: "tab",
  id,
  title: id,
  url,
});

test("Observed price passes with a snippet and source URL; absent price fails", () => {
  const [record] = one("Pro costs $19 per month", "Starter free. Pro plan: $19 / month. Team $49");
  assert.equal(record.status, "supported");
  assert.equal(record.value, "$19");
  assert.equal(record.sourceUrl, "https://a.example/pricing");
  assert.match(record.snippet!, /Pro plan: \$19 \/ month/);
  assert.deepEqual(statuses("Pro costs $29", "Pro plan: $19 / month"), ["unsupported"]);
  assert.deepEqual(statuses("Costs 5 dollars", "no prices here"), ["unsupported"]);
});

test("Numeric boundaries: 19 is not 199, $19 is not EUR19, units and decimals are distinct", () => {
  assert.deepEqual(statuses("19", "item 199"), ["unsupported"]);
  assert.deepEqual(statuses("19", "item 1,990 or 19.5"), ["unsupported"]);
  assert.deepEqual(statuses("$19", "price $199"), ["unsupported"]);
  assert.deepEqual(statuses("$19", "EUR19"), ["unsupported"]);
  assert.deepEqual(statuses("$19", "EUR 19 or €19"), ["unsupported"]);
  assert.deepEqual(statuses("€19", "only $19"), ["unsupported"]);
  assert.deepEqual(statuses("19%", "19 users"), ["unsupported"]);
  assert.deepEqual(statuses("9k", "9 users"), ["unsupported"]);
  assert.deepEqual(statuses("SKU19", "item 19"), ["unsupported"]);
  assert.deepEqual(statuses("-19", "19"), ["unsupported"]);
  assert.deepEqual(statuses("1,299", "1,2990"), ["unsupported"]);
  // Same amounts in different whitespace/format are allowed.
  assert.deepEqual(statuses("$19", "Just $ 19 today"), ["supported"]);
  assert.deepEqual(statuses("$19", "Just $\n19 today"), ["supported"]);
  assert.deepEqual(statuses("19 USD", "USD 19"), ["supported"]);
  assert.deepEqual(statuses("EUR19", "€19"), ["supported"]);
  assert.deepEqual(statuses("$19.00", "$19"), ["supported"]);
  assert.deepEqual(statuses("$1299", "$1,299.00"), ["supported"]);
  assert.deepEqual(statuses("19", "item 19 here"), ["supported"]);
  assert.deepEqual(statuses("19%", "save 19 %"), ["supported"]);
  assert.equal(extractNumericTokens("a 1,299.50 b").length, 1);
});

test("Missing evidence source is reported as missing, not silently passed", () => {
  const [record] = checkNumericSupport("$19", "t", [
    { id: "a", url: "https://a.example", kind: "page" },
  ]);
  assert.equal(record.status, "missing");
  const none = checkNumericSupport("$19", "t", []);
  assert.equal(none[0].status, "missing");
  const unreachable = checkNumericSupport("$19", "t", [
    { ...page("unknown"), unreachable: true },
  ]);
  assert.equal(unreachable[0].status, "missing");
  const flagged = checkNumericSupport("$19", "t", [page("none")], {
    acknowledgeUnknown: true,
  });
  assert.equal(flagged[0].status, "unknown");
  assert.equal(evidenceSummary(flagged).fullySupported, false);
  assert.equal(evidenceSummary(flagged).acceptable, true);
});

test("verify.page pins numbers before testing; a retry that changes or drops an amount is rejected", async () => {
  const ledger = new EvidenceLedger(new Map());
  const text = "Plan Pro $19 per month. Team $49";
  const run = (expected: string, observed = text) =>
    verifyPageExpectation(ledger, { tabId: "t1", expected }, async () => ({
      url: "https://a.example",
      text: observed,
    }));
  await assert.rejects(run("Pro $29 per month"), /absent|exact boundaries/);
  assert.deepEqual(ledger.pins.outstanding(), ["t1"]);
  // Changed number: rejected BEFORE the page is even observed.
  let observed = false;
  await assert.rejects(
    verifyPageExpectation(ledger, { tabId: "t1", expected: "Pro $19 per month" }, async () => {
      observed = true;
      return { url: "u", text };
    }),
    /pinned.*\$29/s,
  );
  assert.equal(observed, false);
  // Dropped amount: rejected.
  await assert.rejects(run("Pro per month"), /pinned/);
  // The pin survives and cannot be loosened by a different number.
  assert.deepEqual(ledger.pins.outstanding(), ["t1"]);
  // Non-numeric wording may change while the pinned amount is kept (still fails honestly).
  await assert.rejects(run("The Pro plan costs $29"), /absent|exact boundaries/);
  // Succeeds only when the pinned number really exists; result exposes immutable values.
  const ok = await run("Plan Pro $29", "Plan Pro $29 per month");
  assert.equal(ok.verified, true);
  assert.equal(ok.expectedValues.immutable, true);
  assert.deepEqual(ok.expectedValues.values.map((v) => v.raw), ["$29"]);
  assert.equal(ok.numericEvidence.records[0].status, "supported");
  assert.deepEqual(ledger.pins.outstanding(), []);
});

test("verify.page does not accept $19 inside $199 or EUR19 and tolerates whitespace", async () => {
  const run = (expected: string, text: string) =>
    verifyPageExpectation(new EvidenceLedger(new Map()), { tabId: "x", expected }, async () => ({
      url: "u",
      text,
    }));
  await assert.rejects(run("Pro $19", "Pro $199 monthly"), /exact boundaries/);
  await assert.rejects(run("Pro $19", "Pro EUR19 monthly"), /exact boundaries/);
  assert.equal((await run("Pro  $19", "Pro\n$19 monthly")).verified, true);
});

test("Pins: additions are stricter and allowed; unrelated tabs do not share pins", () => {
  const pins = new ExpectationPins();
  pins.pin("a", "costs $19");
  assert.equal(pins.pin("a", "costs $19 and $49").values.length, 2);
  assert.throws(() => pins.pin("a", "costs $49"), /pinned/);
  assert.doesNotThrow(() => pins.pin("b", "costs $5"));
  assert.deepEqual(pins.outstanding().sort(), ["a", "b"]);
});

test("Engine: a failed verify.page is not cleared by a successful verify on a different target", async () => {
  const ledger = new EvidenceLedger(new Map());
  const pageText: Record<string, string> = { A: "Pro $19", B: "Pro $19" };
  const verifyPage: AgentCapability = {
    id: "verify.page",
    description: "fixture",
    schema: z.object({ tabId: z.string(), expected: z.string() }).strict(),
    permission: "tabs",
    consequential: false,
    verification: true,
    timeoutMs: 1000,
    targetKey: (a) => "tab:" + a.tabId,
    execute: (a) =>
      verifyPageExpectation(ledger, a, async () => ({ url: "u", text: pageText[a.tabId] })),
  };
  const decisions: unknown[] = [
    { objective: "o", capability: "verify.page", arguments: { tabId: "A", expected: "Pro $29" }, plan: [] },
    { objective: "o", capability: "verify.page", arguments: { tabId: "B", expected: "Pro $19" }, plan: [] },
    { objective: "o", capability: "finish", arguments: { summary: "done" }, plan: [] },
  ];
  const fixture: AgentProvider = {
    id: "unit",
    model: "m",
    text: true,
    vision: false,
    structured: true,
    streaming: false,
    audio: false,
    query: async () => JSON.stringify(decisions.shift()),
    close: async () => {},
  };
  const engine = new AgentEngine(fixture, [verifyPage], "fixture", [], 5, async () => {});
  await engine.run();
  assert.equal(engine.task.status, "failed");
  assert.match(engine.task.error || "", /Unresolved failed steps/);
  assert.equal(engine.task.steps[0].target, "tab:A");
});

test("Note with an extra unsupported second product price is flagged; nothing is silently exempt", () => {
  const pages = new Map([
    ["a", observation("a", "https://a.example/pricing", "Alpha Pro costs $19 per month.")],
    ["b", observation("b", "https://b.example/pricing", "Beta Pro costs $29 per month.")],
  ]);
  const ledger = new EvidenceLedger(pages);
  const sources = [tab("a", "https://a.example/pricing"), tab("b", "https://b.example/pricing")];
  const good = ledger.noteEvidence(
    { title: "Pricing", text: "Alpha Pro is $19. Beta Pro is $29." },
    sources,
  );
  assert.equal(evidenceSummary(good).fullySupported, true);
  assert.deepEqual(
    good.map((r) => r.sourceUrl).sort(),
    ["https://a.example/pricing", "https://b.example/pricing"],
  );
  const bad = ledger.noteEvidence(
    { title: "Pricing", text: "Alpha Pro is $19. Beta Pro is $29. Gamma Pro is $39." },
    sources,
  );
  assert.throws(() => assertEvidence(bad, "Artifact note"), /\$39/);
  assert.equal(bad.filter((r) => r.status === "unsupported").length, 1);
  // Only DECLARED sources count: a price from an undeclared attached page is unsupported.
  const declaredOnlyA = ledger.noteEvidence(
    { title: "t", text: "Beta Pro is $29" },
    [sources[0]],
  );
  assert.equal(declaredOnlyA[0].status, "unsupported");
  // Explicit flag keeps it written but unknown (never fully supported).
  const flagged = ledger.noteEvidence(
    { title: "t", text: "Gamma $39" },
    sources,
    true,
  );
  assert.equal(flagged[0].status, "unknown");
  assert.doesNotThrow(() => assertEvidence(flagged, "n"));
  assert.equal(evidenceSummary(flagged).fullySupported, false);
  // Notes citing only an unread image/file cannot be proven.
  const image = ledger.noteEvidence({ title: "t", text: "Costs $5" }, [
    { kind: "image", id: "img", title: "img" },
  ]);
  assert.equal(image[0].status, "missing");
});

test("Recheck uses the current observation: a changed page invalidates earlier support", () => {
  const pages = new Map([["a", observation("a", "https://a.example", "Pro $19")]]);
  const ledger = new EvidenceLedger(pages);
  const artifact = {
    mime: "text/plain",
    data: "Pro $19",
    title: "n",
    sources: [tab("a", "https://a.example")],
  };
  assert.equal(evidenceSummary(ledger.recheckArtifact(artifact, [])!).fullySupported, true);
  pages.set("a", observation("a", "https://a.example", "Pro $25"));
  assert.equal(evidenceSummary(ledger.recheckArtifact(artifact, [])!).acceptable, false);
  // Code/vision artifacts keep storage-only semantics.
  assert.equal(
    ledger.recheckArtifact({ ...artifact, mime: "application/json", data: '{"n":999}' }, []),
    undefined,
  );
});

test("Sheet cells are checked against the row's own source URL", () => {
  const pages = new Map([
    ["a", observation("a", "https://a.example/p", "Alpha Pro costs $19")],
    ["b", observation("b", "https://b.example/p", "Beta Pro costs $29")],
  ]);
  const ledger = new EvidenceLedger(pages);
  const sources = [tab("a", "https://a.example/p"), tab("b", "https://b.example/p")];
  const header = ["name", "product", "pricing", "source_url", "status"];
  const ok = ledger.sheetEvidence(
    [header, ["Alpha", "Pro", "$19", "https://a.example/p", "ok"], ["Beta", "Pro", "$29", "https://b.example/p", "ok"]],
    sources,
  );
  assert.equal(evidenceSummary(ok).fullySupported, true);
  // Row 2 borrows Alpha's price although it cites Beta's page.
  const swapped = ledger.sheetEvidence(
    [header, ["Alpha", "Pro", "$19", "https://a.example/p", "ok"], ["Beta", "Pro", "$19", "https://b.example/p", "ok"]],
    sources,
  );
  const bad = swapped.filter((r) => r.status !== "supported");
  assert.equal(bad.length, 1);
  assert.equal(bad[0].location, "row 2 pricing");
  // Unknown source URL -> missing.
  const nowhere = ledger.sheetEvidence(
    [header, ["X", "Y", "$5", "https://c.example", "ok"]],
    sources,
  );
  assert.equal(nowhere[0].status, "missing");
  // Non-numeric / "unknown" cells produce no records.
  assert.equal(
    ledger.sheetEvidence([header, ["Alpha", "unknown", "unknown", "https://a.example/p", "unknown"]], sources).length,
    0,
  );
});

test("GTM: excerpts that cut a number, and unsupported numbers in brief/draft text, are rejected", () => {
  const obs = observation("t", "https://c.example", "Pro $99 per month.");
  const input = (pricing: string) => ({
    competitors: [{ tabId: "t", positioning: "unknown", pricing, targetAudience: "unknown" }],
    proposedPositioning: "Piccolo is private.",
    launchPost: "Launch.",
    emailDraft: "Email.",
  });
  assert.doesNotThrow(() => gtmBrief(input("Pro $99 per month."), [obs]));
  assert.throws(() => gtmBrief(input("Pro $9"), [obs]), /cuts or changes numeric/);
  const ledger = new EvidenceLedger(new Map([["t", obs]]));
  const free = ledger.freeTextEvidence([
    { location: "launchPost", text: "Beats the $99 plan, now $5" },
  ]);
  assert.deepEqual(free.map((r) => r.status).sort(), ["supported", "unsupported"]);
  const brief = gtmBrief(input("Pro $99 per month."), [obs]);
  assert.equal(
    evidenceSummary(ledger.gtmArtifactEvidence("positioning-brief", brief.text, brief.claims)).fullySupported,
    true,
  );
  const tampered = brief.text.replace("Piccolo is private.", "Piccolo is $3 private.");
  assert.equal(
    evidenceSummary(ledger.gtmArtifactEvidence("positioning-brief", tampered, brief.claims)).acceptable,
    false,
  );
});

test("Completion report: deterministic summary always; model prose withheld unless page-supported, operational counts never bless it", async () => {
  const pages = new Map([["a", observation("a", "https://a.example", "Pro $19")]]);
  const run = async (summary: string) => {
    const verify: AgentCapability = {
      id: "verify",
      description: "fixture",
      schema: z.object({}).strict(),
      permission: "tabs",
      consequential: false,
      verification: true,
      timeoutMs: 500,
      execute: async () => ({ verified: true }),
    };
    const decisions: unknown[] = [
      { objective: "o", capability: "verify", arguments: {}, plan: [] },
      { objective: "o", capability: "finish", arguments: { summary }, plan: [] },
    ];
    const fixture: AgentProvider = {
      id: "unit",
      model: "m",
      text: true,
      vision: false,
      structured: true,
      streaming: false,
      audio: false,
      query: async () => JSON.stringify(decisions.shift()),
      close: async () => {},
    };
    const engine = new AgentEngine(
      fixture,
      [verify],
      "fixture",
      [],
      5,
      async () => {},
      undefined,
      (text) => checkNumericSupport(text, "completion summary", [page(pages.get("a")!.text)]),
    );
    await engine.run();
    assert.equal(engine.task.status, "completed");
    return JSON.parse(engine.task.artifacts.at(-1)!.data);
  };
  const withheld = await run("Verified; the plan costs $25 per month");
  assert.equal(withheld.summaryAudit.modelSummary, "withheld");
  assert.deepEqual(withheld.summaryAudit.unsupported, ["$25"]);
  assert.equal(withheld.modelSummary.status, "withheld");
  assert.equal(withheld.modelSummary.text, undefined);
  assert.doesNotMatch(withheld.summary, /\$25/);
  // task.calls is 2 here; "2 features" must not be blessed by that operational count.
  const borrowed = await run("The page shows 2 features");
  assert.equal(borrowed.summaryAudit.modelSummary, "withheld");
  assert.match(borrowed.summary, /after 2 provider call/); // deterministic metadata stays truthful
  const accepted = await run("Observed Pro $19");
  assert.equal(accepted.summaryAudit.modelSummary, "accepted");
  assert.equal(accepted.modelSummary.text, "Observed Pro $19");
  assert.doesNotMatch(accepted.summary, /Observed Pro/); // report summary is always grounded
});

test("Evidence records keep candidate sources structurally, no fabricated snippets, and are never truncated", () => {
  const [bad] = checkNumericSupport("$5", "t", [page("nothing", "a", "https://a.example/x")]);
  assert.equal(bad.status, "unsupported");
  assert.equal(bad.snippet, undefined);
  assert.deepEqual(bad.candidateSources, [{ id: "a", url: "https://a.example/x", kind: "page" }]);
  const [missing] = checkNumericSupport("$5", "t", [{ id: "z", url: "https://z.example", kind: "page" }]);
  assert.equal(missing.status, "missing");
  assert.equal(missing.snippet, undefined);
  assert.equal(missing.candidateSources![0].url, "https://z.example");
  const [good] = checkNumericSupport("$5", "t", [page("only $5 here")]);
  assert.ok(good.snippet && good.sourceUrl);
  const many = Array.from({ length: EVIDENCE_RECORD_BUDGET }, () => good);
  assert.equal(toArtifactEvidence(many).records.length, EVIDENCE_RECORD_BUDGET);
  assert.throws(() => toArtifactEvidence([...many, good]), /Too many numeric values/);
});

test("acknowledgeUnsupportedNumbers marks the note text and metadata and never reaches fullySupported", () => {
  const pages = new Map([["a", observation("a", "https://a.example", "Alpha $19")]]);
  const ledger = new EvidenceLedger(pages);
  const declared = [tab("a", "https://a.example")];
  const records = ledger.noteEvidence({ title: "t", text: "Alpha $19, Gamma $39" }, declared, true);
  assert.deepEqual(records.map((r) => r.status).sort(), ["supported", "unknown"]);
  const text = flagUnknownText("Alpha $19, Gamma $39", records);
  assert.match(text, /\[UNVERIFIED NUMERIC VALUES.*\$39\]$/);
  const evidence = toArtifactEvidence(records, true);
  assert.equal(evidence.acknowledgedUnknown, true);
  const artifact = { mime: "text/plain", data: text, title: "t", sources: declared, evidence };
  const again = ledger.recheckArtifact(artifact, [])!;
  assert.equal(evidenceSummary(again).fullySupported, false);
  assert.equal(evidenceSummary(again).acceptable, true);
  assert.equal(again.find((r) => r.value === "$39")!.status, "unknown");
  // Without the flag the same text is rejected.
  assert.throws(
    () => assertEvidence(ledger.noteEvidence({ title: "t", text }, declared), "Artifact note"),
    /\$39/,
  );
});

test("Spelled-out amounts and free-price claims need the exact phrase in the attached source", () => {
  // Absent -> flagged, with structural candidate source and no fabricated snippet.
  const [absent] = checkNumericSupport("It costs twenty dollars a month", "t", [
    page("Pro is thirty dollars a month", "a", "https://a.example/p"),
  ]);
  assert.equal(absent.status, "unsupported");
  assert.equal(absent.value, "twenty dollars");
  assert.equal(absent.snippet, undefined);
  assert.equal(absent.candidateSources![0].url, "https://a.example/p");
  // Supported -> real snippet and source URL; hyphen/case/plural/whitespace variants match.
  const [ok] = checkNumericSupport("Twenty-One Dollars", "t", [
    page("Plans start at twenty one dollars per seat.", "a", "https://a.example/p"),
  ]);
  assert.equal(ok.status, "supported");
  assert.equal(ok.sourceUrl, "https://a.example/p");
  assert.match(ok.snippet!, /start at twenty one dollars per seat/);
  // No conversion: digits do not support words and vice versa; units are distinct.
  assert.deepEqual(statuses("twenty dollars", "$20"), ["unsupported"]);
  assert.deepEqual(statuses("$20", "twenty dollars"), ["unsupported"]);
  assert.deepEqual(statuses("twenty euros", "twenty dollars"), ["unsupported"]);
  assert.deepEqual(statuses("one hundred and five", "one hundred and five users"), ["supported"]);
  assert.deepEqual(statuses("one hundred", "one hundred and five users"), ["unsupported"]);
  // Free-price claims: "Free" alone does not support "free forever".
  assert.deepEqual(statuses("Free forever for individuals", "Free for individuals"), ["unsupported"]);
  assert.deepEqual(statuses("No charge", "Pro is free"), ["unsupported"]);
  assert.deepEqual(statuses("free forever", "Our plan is Free-Forever."), ["supported"]);
  assert.deepEqual(statuses("at no cost", "Available at no cost today"), ["supported"]);
  assert.deepEqual(statuses("no cost", "Available at no cost today"), ["supported"]);
  const [free] = checkNumericSupport("free forever", "t", [page("Starter: free forever, no card")]);
  assert.match(free.snippet!, /Starter: free forever, no card/);
  // A bare Free price also requires actual observed support.
  assert.equal(checkNumericSupport("Free tier available", "t", [page("free")])[0].status, 'supported');
});
test('An unobserved bare Free price cannot pass with zero checked values',()=>{
 const records=checkNumericSupport('Basic: Free','pricing',[page('Basic is a paid subscription.')]);
 assert.equal(records.length,1);assert.equal(records[0].status,'unsupported');assert.throws(()=>assertEvidence(records,'Pricing'),/not supported/);
});

test("Number words respect word boundaries: ElevenLabs and Someone are not number words", () => {
  assert.deepEqual(extractNumericTokens("ElevenLabs offers TTS").map((t) => t.raw), []);
  assert.deepEqual(extractNumericTokens("Someone phoned Tenfold and Fiveable").map((t) => t.raw), []);
  assert.deepEqual(extractNumericTokens("ElevenLabs costs eleven dollars").map((t) => t.phrase), [
    "eleven dollars",
  ]);
  assert.equal(
    checkNumericSupport("ElevenLabs is a voice tool", "t", [page("nothing")]).length,
    0,
  );
});

test("Spelled-out amounts are flagged in notes, sheets and pinned verify.page expectations", async () => {
  const pages = new Map([["a", observation("a", "https://a.example/p", "Pro costs thirty dollars. Starter is free.")]]);
  const ledger = new EvidenceLedger(pages);
  const sources = [tab("a", "https://a.example/p")];
  const note = ledger.noteEvidence({ title: "t", text: "Pro is thirty dollars; Starter is free forever" }, sources);
  assert.deepEqual(note.map((r) => [r.value, r.status]), [
    ["thirty dollars", "supported"],
    ["free forever", "unsupported"],
  ]);
  assert.throws(() => assertEvidence(note, "Artifact note"), /free forever/);
  const flagged = ledger.noteEvidence({ title: "t", text: "Starter is free forever" }, sources, true);
  assert.equal(flagged[0].status, "unknown");
  const header = ["name", "product", "pricing", "source_url", "status"];
  const sheet = ledger.sheetEvidence([header, ["A", "Pro", "twenty dollars", "https://a.example/p", "ok"]], sources);
  assert.equal(sheet[0].status, "unsupported");
  assert.equal(sheet[0].location, "row 1 pricing");
  // Retry pins cover spelled-out amounts.
  const run = (expected: string) =>
    verifyPageExpectation(ledger, { tabId: "a", expected }, async () => ({
      url: "https://a.example/p",
      text: "Pro costs thirty dollars",
    }));
  await assert.rejects(run("Pro costs twenty dollars"), /boundaries/);
  await assert.rejects(run("Pro costs thirty dollars"), /pinned.*twenty dollars/s);
  await assert.rejects(run("Pro costs"), /pinned/);
  assert.deepEqual(ledger.pins.outstanding(), ["a"]);
});
