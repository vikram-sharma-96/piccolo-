import type { GtmObservation } from "./agent-gtm";
import type { SourceReference } from "./agent";
import { parseCsv } from "./agent-sheet";

/*
 * Numeric/currency evidence support.
 *
 * What this proves: every number, price or currency amount that appears in
 * source-derived prose (notes, sheet cells, brief/draft free text) also appears,
 * with numeric boundaries, in the page text we actually observed for an
 * ATTACHED source. Boundaries: 19 is not 199 or 1,990 or 19.5; $19 is not EUR19;
 * 19% is not 19; 9k is not 9. Whitespace differences ("$ 19", "$19", "USD\n19",
 * 19.00 vs 19) are tolerated, different amounts are not.
 *
 * What this does NOT prove: non-numeric claims ("fastest", "supports SSO").
 * Token matching cannot establish semantic truth; those stay covered only by the
 * pre-existing exact-excerpt GTM check and human review. A number that appears
 * on the page for a different reason than the prose claims (e.g. "$19" is a
 * different plan) is also not distinguished.
 */
export const EVIDENCE_LIMITS =
  "Only numbers/prices/currency amounts are checked against observed page text for the attached source. Non-numeric claims are not semantically proven; a matching number may belong to a different fact.";

export type EvidenceSource = {
  id: string;
  url: string;
  kind: "page" | "file" | "recorded" | "operational";
  /** undefined = the source was never observed (status "missing"). */
  text?: string;
  unreachable?: boolean;
};
export type NumericToken = {
  raw: string;
  index: number;
  end: number;
  amount: string;
  currency?: string;
  scale?: string;
  /** Set when letters/underscores are glued to the digits (SKU19, 19th, Q3). */
  word?: string;
  /** undefined = digits; "words" = spelled-out number phrase; "free" = explicit free-price phrase. */
  kind?: "words" | "free";
  /** Normalised lowercase phrase for kind "words"/"free". */
  phrase?: string;
  key: string;
};
export type EvidenceStatus = "supported" | "unsupported" | "missing" | "unknown";
export type EvidenceRecord = {
  location: string;
  value: string;
  key: string;
  status: EvidenceStatus;
  sourceId?: string;
  sourceUrl?: string;
  evidenceKind?: EvidenceSource["kind"];
  /** Only on supported records: the ACTUAL matching page/file text. Never set for unsupported values. */
  snippet?: string;
  reason?: string;
  /** Unsupported/missing/unknown records: the attached source(s) that were searched. */
  candidateSources?: { id: string; url: string; kind: EvidenceSource["kind"] }[];
};
export type ArtifactEvidence = {
  records: EvidenceRecord[];
  acknowledgedUnknown?: boolean;
  checkedAt: number;
  limits: string;
};

const CODES =
  "USD|EUR|GBP|JPY|CAD|AUD|CHF|INR|CNY|RMB|SEK|NOK|DKK|NZD|MXN|BRL|KRW|SGD|HKD|PLN|CZK|ZAR";
const WORD_CURRENCY: Record<string, string> = {
  dollar: "$",
  dollars: "$",
  euro: "EUR",
  euros: "EUR",
  pound: "GBP",
  pounds: "GBP",
};
const SYMBOL: Record<string, string> = {
  $: "$",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "₩": "KRW",
};
const SCALE: Record<string, string> = {
  "%": "%",
  percent: "%",
  k: "k",
  thousand: "k",
  m: "m",
  mm: "m",
  million: "m",
  b: "b",
  bn: "b",
  billion: "b",
};
const PRE = "[$€£¥₹₩]|(?<![A-Za-z])(?:" + CODES + ")(?![A-Za-z])";
const POST =
  "%|(?:percent|dollars?|euros?|pounds?|thousand|million|billion|bn|mm|" +
  CODES +
  "|k|m|b)(?![\\p{L}\\p{N}_])";
const NUMBER = new RegExp(
  "(?:(?<pre>" +
    PRE +
    ")\\s*)?(?<![\\d]|\\d[.,])(?<num>\\d+(?:[.,]\\d+)*)(?![\\d])(?:\\s*(?<post>" +
    POST +
    "))?",
  "giu",
);
export const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

function canonicalAmount(raw: string) {
  const dots = raw.split(".").length - 1,
    commas = raw.split(",").length - 1;
  let integer = raw,
    fraction = "";
  const grouped = (s: string, sep: string) => {
    const parts = s.split(sep);
    return (
      parts[0].length >= 1 &&
      parts[0].length <= 3 &&
      parts.slice(1).every((part) => part.length === 3)
    );
  };
  if (dots && commas) {
    const decimal = raw.lastIndexOf(".") > raw.lastIndexOf(",") ? "." : ",",
      thousands = decimal === "." ? "," : ".",
      at = raw.lastIndexOf(decimal);
    const head = raw.slice(0, at);
    if (head.includes(decimal) || !grouped(head, thousands))
      return "~" + raw;
    integer = head.split(thousands).join("");
    fraction = raw.slice(at + 1);
  } else if (commas) {
    const at = raw.lastIndexOf(",");
    if (commas === 1 && !grouped(raw, ",")) {
      integer = raw.slice(0, at);
      fraction = raw.slice(at + 1);
    } else if (grouped(raw, ",")) integer = raw.split(",").join("");
    else return "~" + raw;
  } else if (dots) {
    if (dots > 1) return "~" + raw;
    const at = raw.indexOf(".");
    integer = raw.slice(0, at);
    fraction = raw.slice(at + 1);
  }
  integer = integer.replace(/^0+(?=\d)/, "");
  fraction = fraction.replace(/0+$/, "");
  return fraction ? integer + "." + fraction : integer;
}

export function extractNumericTokens(text: string): NumericToken[] {
  const tokens: NumericToken[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const pre = match.groups!.pre,
      post = match.groups!.post?.toLowerCase(),
      numStart = match.index! + match[0].indexOf(match.groups!.num, pre ? pre.length : 0);
    let start = match.index!,
      end = match.index! + match[0].length;
    let currency: string | undefined, scale: string | undefined;
    if (pre) currency = SYMBOL[pre] || pre.toUpperCase();
    if (post) {
      if (SCALE[post]) scale = SCALE[post];
      else if (!currency)
        currency = WORD_CURRENCY[post] || post.toUpperCase();
    }
    let word: string | undefined;
    const before = text[numStart - 1] || "",
      after = text[end] || "";
    const glued = (c: string) => /[\p{L}\p{N}_]/u.test(c);
    if ((!pre && /[\p{L}_]/u.test(before)) || (!post && /[\p{L}_]/u.test(after))) {
      let a = numStart,
        b = end;
      while (a > 0 && glued(text[a - 1])) a--;
      while (b < text.length && glued(text[b])) b++;
      word = text.slice(a, b);
      start = Math.min(start, a);
      end = Math.max(end, b);
    }
    let amount = canonicalAmount(match.groups!.num);
    const signAt = (pre ? match.index! : numStart) - 1;
    if (
      !word &&
      /[-−]/.test(text[signAt] || "") &&
      !glued(text[signAt - 1] || "") &&
      !/[.,]/.test(text[signAt - 1] || "")
    )
      amount = "-" + amount;
    tokens.push({
      raw: collapse(text.slice(start, end)),
      index: start,
      end,
      amount,
      currency,
      scale,
      word,
      key: [
        currency || "",
        amount,
        scale || "",
        word ? word.toLowerCase() : "",
      ].join("|"),
    });
  }
  for (const match of text.matchAll(WORDS)) {
    const phrase = normalizePhrase(match[0]);
    tokens.push({
      raw: collapse(match[0]),
      index: match.index!,
      end: match.index! + match[0].length,
      amount: phrase,
      kind: "words",
      phrase,
      key: "w|" + phrase,
    });
  }
  for (const match of text.matchAll(FREE)) {
    const phrase = normalizePhrase(match[0]);
    tokens.push({
      raw: collapse(match[0]),
      index: match.index!,
      end: match.index! + match[0].length,
      amount: phrase,
      kind: "free",
      phrase,
      key: "f|" + phrase,
    });
  }
  return tokens.sort((a, b) => a.index - b.index);
}

/*
 * Spelled-out amounts and free-price claims. Exact normalised-phrase support only:
 * no word->digit conversion, so "twenty dollars" is supported by "twenty dollars"
 * (case/hyphen/whitespace/plural-insensitive) and NOT by "$20" or "20 dollars".
 * Whole-word boundaries keep "ElevenLabs" from being read as "eleven".
 * "one" is included, so ordinary prose such as "no one" is also checked; this is
 * deliberately conservative (use "unknown" or acknowledge on notes).
 */
const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty",
  "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand",
  "million", "billion", "trillion",
].sort((a, b) => b.length - a.length).join("|");
const WORD_EDGE_BEFORE = "(?<![\\p{L}\\p{N}_])";
const WORD_EDGE_AFTER = "(?![\\p{L}\\p{N}_])";
const WORDS = new RegExp(
  WORD_EDGE_BEFORE +
    "(?:" + NUMBER_WORDS + ")" +
    "(?:[\\s-]+(?:and[\\s-]+)?(?:" + NUMBER_WORDS + "))*" +
    "(?:\\s+(?:dollars?|euros?|pounds?|cents?|percent))?" +
    WORD_EDGE_AFTER,
  "giu",
);
const FREE_PHRASES = [
  "free forever", "forever free", "free for life", "free of charge",
  "at no cost", "at no charge", "no cost", "no charge", "free",
].sort((a, b) => b.length - a.length);
const FREE = new RegExp(
  WORD_EDGE_BEFORE +
    "(?:" + FREE_PHRASES.map((p) => p.replace(/ /g, "[\\s-]+")).join("|") + ")" +
    WORD_EDGE_AFTER,
  "giu",
);
function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s-]+/g, " ")
    .trim()
    .replace(/\b(dollar|euro|pound|cent)$/, "$1s");
}

/** Does evidence token `ev` support claimed token `claim`? */
function supports(claim: NumericToken, ev: NumericToken) {
  if (claim.kind !== ev.kind) return false;
  if (claim.kind === "words") return claim.phrase === ev.phrase;
  if (claim.kind === "free")
    // "no cost" is explicitly stated by "at no cost"; "Free" alone never supports "free forever".
    return (" " + ev.phrase + " ").includes(" " + claim.phrase + " ");
  if (claim.word || ev.word)
    return (
      !!claim.word &&
      !!ev.word &&
      claim.word.toLowerCase() === ev.word.toLowerCase()
    );
  if (claim.amount !== ev.amount) return false;
  if (claim.currency && claim.currency !== ev.currency) return false;
  if ((claim.scale || "") !== (ev.scale || "")) return false;
  return true; // a bare claimed number may be supported by a priced/unpriced page number
}

function snippetAt(text: string, token: NumericToken) {
  return collapse(
    text.slice(Math.max(0, token.index - 50), Math.min(text.length, token.end + 50)),
  ).slice(0, 160);
}

export function checkNumericSupport(
  text: string,
  location: string,
  sources: EvidenceSource[],
  options: { acknowledgeUnknown?: boolean } = {},
): EvidenceRecord[] {
  const claims = new Map<string, NumericToken>();
  for (const token of extractNumericTokens(text))
    if (!claims.has(token.key)) claims.set(token.key, token);
  if (claims.size > 200)
    throw Error(
      "More than 200 distinct numeric values in one text; split or shorten it.",
    );
  const usable = sources.filter(
    (source) => source.text !== undefined && !source.unreachable,
  );
  const evidence = usable.map((source) => ({
    source,
    tokens: extractNumericTokens(source.text!),
  }));
  return [...claims.values()].map((claim) => {
    const base = { location, value: claim.raw, key: claim.key };
    for (const { source, tokens } of evidence) {
      const hit = tokens.find((token) => supports(claim, token));
      if (hit)
        return {
          ...base,
          status: "supported" as const,
          sourceId: source.id,
          sourceUrl: source.url,
          evidenceKind: source.kind,
          snippet: snippetAt(source.text!, hit),
        };
    }
    const status: EvidenceStatus = usable.length ? "unsupported" : "missing";
    return {
      ...base,
      status: options.acknowledgeUnknown ? ("unknown" as const) : status,
      candidateSources: sources.map((source) => ({
        id: source.id,
        url: source.url,
        kind: source.kind,
      })),
      reason:
        (status === "missing"
          ? "No observed evidence text exists for the attached source(s)"
          : "Value not found with numeric/currency boundaries in the attached source(s)") +
        ": " +
        sources.map((source) => source.url || source.id).join(", ") +
        (options.acknowledgeUnknown
          ? ". Explicitly flagged unknown by the writer."
          : ""),
    };
  });
}

export function evidenceSummary(records: EvidenceRecord[]) {
  const count = (status: EvidenceStatus) =>
    records.filter((record) => record.status === status).length;
  const unsupported = count("unsupported"),
    missing = count("missing"),
    unknown = count("unknown");
  return {
    checked: records.length,
    supported: count("supported"),
    unsupported,
    missing,
    unknown,
    /** No rejected value (flagged unknown values are allowed to exist but never "fully supported"). */
    acceptable: unsupported + missing === 0,
    fullySupported: unsupported + missing + unknown === 0,
  };
}
/** Bounded per-value report for tool results; unsupported values are listed first. */
export function evidenceReport(records: EvidenceRecord[], limit = 30) {
  const rank = { unsupported: 0, missing: 1, unknown: 2, supported: 3 };
  return {
    ...evidenceSummary(records),
    records: [...records]
      .sort((a, b) => rank[a.status] - rank[b.status])
      .slice(0, limit)
      .map((record) => ({
        ...record,
        snippet: record.snippet?.slice(0, 120),
        reason: record.reason?.slice(0, 200),
      })),
    recordsTruncated: records.length > limit,
    limits: EVIDENCE_LIMITS,
  };
}
/** For acknowledged notes: mark unproven values inside the saved text itself. */
export function flagUnknownText(text: string, records: EvidenceRecord[]) {
  const unknown = [
    ...new Set(records.filter((r) => r.status === "unknown").map((r) => r.value)),
  ];
  return unknown.length
    ? text +
        "\n\n[UNVERIFIED NUMERIC VALUES - NOT SUPPORTED BY ATTACHED SOURCE EVIDENCE: " +
        unknown.join(", ") +
        "]"
    : text;
}
export function assertEvidence(records: EvidenceRecord[], what: string) {
  const bad = records.filter(
    (record) => record.status === "unsupported" || record.status === "missing",
  );
  if (bad.length)
    throw Error(
      what +
        " contains " +
        bad.length +
        " numeric/currency value(s) not supported by observed attached-source text: " +
        bad
          .slice(0, 8)
          .map((record) => record.location + " " + record.value + " [" + record.status + "]")
          .join("; ") +
        ". Use only values visible in the source, write unknown, or (notes only) set acknowledgeUnsupportedNumbers to mark them unknown.",
    );
}
/** Every checked value is retained; writers above this budget are rejected, never truncated. */
export const EVIDENCE_RECORD_BUDGET = 2000;
export function toArtifactEvidence(
  records: EvidenceRecord[],
  acknowledgedUnknown = false,
): ArtifactEvidence {
  if (records.length > EVIDENCE_RECORD_BUDGET)
    throw Error(
      "Too many numeric values to retain evidence for (" +
        records.length +
        " > " +
        EVIDENCE_RECORD_BUDGET +
        "). Split the output into smaller artifacts.",
    );
  return {
    records,
    ...(acknowledgedUnknown ? { acknowledgedUnknown } : {}),
    checkedAt: Date.now(),
    limits: EVIDENCE_LIMITS,
  };
}

/* ---------- pinned verify.page expectations ---------- */
export type PinnedValues = {
  target: string;
  immutable: true;
  values: { raw: string; key: string }[];
};
export class ExpectationPins {
  private pins = new Map<string, Map<string, string>>();
  /** Pin numeric/currency expectations BEFORE the page is tested. */
  pin(target: string, expected: string): PinnedValues {
    const next = new Map<string, string>();
    for (const token of extractNumericTokens(expected))
      if (!next.has(token.key)) next.set(token.key, token.raw);
    const old = this.pins.get(target);
    if (old) {
      const dropped = [...old].filter(([key]) => !next.has(key));
      if (dropped.length)
        throw Error(
          "Numeric expectations for " +
            target +
            " are pinned by an earlier unresolved verify.page attempt and cannot be changed or dropped: " +
            dropped.map(([, raw]) => raw).join(", ") +
            ". Retry with every pinned value present (non-numeric wording may change), or start a new task.",
        );
    }
    if (next.size || old) {
      for (const [key, raw] of old || []) next.set(key, raw);
      this.pins.set(target, next);
    }
    return {
      target,
      immutable: true,
      values: [...next].map(([key, raw]) => ({ key, raw })),
    };
  }
  resolve(target: string) {
    this.pins.delete(target);
  }
  outstanding() {
    return [...this.pins.keys()];
  }
  clear() {
    this.pins.clear();
  }
}

/** Page-expectation check: whitespace-normalised substring AND bounded numeric support. */
export function evaluatePageExpectation(
  expected: string,
  page: { id: string; url: string; text: string },
) {
  const records = checkNumericSupport(expected, "expected", [
    { id: page.id, url: page.url, kind: "page", text: page.text },
  ]);
  const present = collapse(page.text).includes(collapse(expected));
  return {
    present,
    records,
    verified: present && records.every((r) => r.status === "supported"),
  };
}

/** Shared by verify.page and tests: pin first, then observe, then test. */
export async function verifyPageExpectation(
  ledger: { pins: ExpectationPins },
  args: { tabId: string; expected: string },
  observe: () => Promise<{ url: string; text: string }>,
) {
  const pinned = ledger.pins.pin(args.tabId, args.expected);
  const observation = await observe();
  const check = evaluatePageExpectation(args.expected, {
    id: args.tabId,
    url: observation.url,
    text: observation.text,
  });
  if (!check.verified)
    throw Error(
      (check.present ? "" : "Expected text is absent. ") +
      (check.records.some((r) => r.status !== "supported")
        ? "Expected numeric/currency value(s) are not present with exact boundaries: " +
          check.records
            .filter((r) => r.status !== "supported")
            .map((r) => r.value)
            .join(", ")
        : "") +
        " Pinned numeric expectations for this tab stay: " +
        (pinned.values.map((v) => v.raw).join(", ") || "none") +
        ". Observed: " +
        observation.text.slice(0, 1000),
    );
  ledger.pins.resolve(args.tabId);
  return {
    verified: true as const,
    url: observation.url,
    expected: args.expected,
    expectedValues: pinned,
    numericEvidence: evidenceReport(check.records, 20),
    text: observation.text.slice(0, 3000),
  };
}

/* ---------- ledger wiring over the existing observation map ---------- */
export const PROPOSED_HEADING =
  "## Proposed Piccolo positioning (proposal, not competitor fact)";

export class EvidenceLedger {
  readonly pins = new ExpectationPins();
  constructor(
    /** The existing observed-page snapshot map (gtmObservations). */
    readonly pages: Map<string, GtmObservation>,
    readonly files: Map<string, string> = new Map(),
  ) {}
  reset() {
    this.pins.clear();
    this.files.clear();
  }
  source(ref: SourceReference): EvidenceSource {
    if (ref.kind === "tab") {
      const page = this.pages.get(ref.id);
      return {
        id: ref.id,
        url: page?.url || ref.url || ref.id,
        kind: "page",
        text: page?.text,
        unreachable: page?.unreachable,
      };
    }
    if (ref.kind === "file")
      return { id: ref.id, url: ref.id, kind: "file", text: this.files.get(ref.id) };
    return { id: ref.id, url: ref.url || ref.id, kind: "recorded" }; // no text evidence
  }
  noteEvidence(
    note: { title: string; text: string },
    declared: SourceReference[],
    acknowledgeUnknown = false,
  ) {
    const sources = declared.map((ref) => this.source(ref));
    return [
      ...checkNumericSupport(note.title, "title", sources, { acknowledgeUnknown }),
      ...checkNumericSupport(note.text, "text", sources, { acknowledgeUnknown }),
    ];
  }
  /** Rows are checked against the row's OWN source_url, never another row's source. */
  sheetEvidence(grid: string[][], taskSources: SourceReference[]) {
    const records: EvidenceRecord[] = [];
    const header = grid[0] || [],
      urlAt = header.indexOf("source_url");
    grid.slice(1).forEach((row, i) => {
      const url = row[urlAt] ?? "";
      const ref = taskSources.find(
        (source) => source.kind === "tab" && source.url === url,
      );
      const sources = ref ? [this.source(ref)] : [];
      header.forEach((column, c) => {
        if (!["name", "product", "pricing"].includes(column)) return;
        records.push(
          ...checkNumericSupport(
            row[c] ?? "",
            "row " + (i + 1) + " " + column,
            sources.length ? sources : [{ id: url, url, kind: "page" }],
          ),
        );
      });
    });
    return records;
  }
  csvEvidence(csv: string, taskSources: SourceReference[]) {
    return this.sheetEvidence(parseCsv(csv), taskSources);
  }
  /** Free text (proposed positioning, drafts) must match ANY attached observed page. */
  freeTextEvidence(texts: { location: string; text: string }[]) {
    const sources = [...this.pages.values()].map(
      (page): EvidenceSource => ({
        id: page.tabId,
        url: page.url,
        kind: "page",
        text: page.text,
        unreachable: page.unreachable,
      }),
    );
    return texts.flatMap((item) =>
      checkNumericSupport(item.text, item.location, sources),
    );
  }
  /** Competitor excerpt must be supported by its OWN attached tab. */
  claimEvidence(claims: { field: string; value: string; url: string; tabId: string }[]) {
    return claims
      .filter((claim) => claim.value !== "unknown")
      .flatMap((claim) =>
        checkNumericSupport(claim.value, claim.field + " " + claim.url, [
          this.source({ kind: "tab", id: claim.tabId, title: "", url: claim.url }),
        ]),
      );
  }
  /** GTM: re-derive every free-text check from the actual file text. */
  gtmArtifactEvidence(
    role: string,
    text: string,
    claims: { field: string; value: string; url: string; tabId: string }[] = [],
  ) {
    if (role === "positioning-brief") {
      const at = text.indexOf(PROPOSED_HEADING);
      return [
        ...this.claimEvidence(claims),
        ...this.freeTextEvidence([
          {
            location: "proposedPositioning",
            text: at < 0 ? "" : text.slice(at + PROPOSED_HEADING.length),
          },
        ]),
      ];
    }
    return this.freeTextEvidence([{ location: role, text }]);
  }
  /** Recheck any artifact kind that carries source-derived prose; undefined = not applicable. */
  recheckArtifact(
    artifact: {
      mime: string;
      data: string;
      title: string;
      role?: string;
      sources: SourceReference[];
      evidence?: ArtifactEvidence;
    },
    taskSources: SourceReference[],
  ): EvidenceRecord[] | undefined {
    if (artifact.role) return undefined; // GTM files: verify_gtm with file bytes
    if (artifact.mime === "text/csv")
      return this.csvEvidence(artifact.data, taskSources);
    if (artifact.mime === "text/plain")
      return this.noteEvidence(
        { title: artifact.title, text: artifact.data },
        artifact.sources,
        !!artifact.evidence?.acknowledgedUnknown,
      );
    return undefined; // image findings, completion reports: code/file/vision semantics untouched
  }
}

/* ---------- completion summary ---------- */
export function groundedSummary(task: {
  calls: number;
  steps: { capability: string; status: string; verified: boolean }[];
  artifacts: { title: string }[];
}) {
  const ok = task.steps.filter((step) => step.status === "succeeded"),
    verified = ok.filter((step) => step.verified);
  return (
    "Task finished after " +
    task.calls +
    " provider call(s): " +
    ok.length +
    " step(s) succeeded, " +
    verified.length +
    " independently verified" +
    (verified.length
      ? " (" + [...new Set(verified.map((step) => step.capability))].join(", ") + ")"
      : "") +
    ". Artifacts: " +
    (task.artifacts.map((artifact) => artifact.title).join("; ") || "none") +
    ". See the recorded steps for details."
  );
}
/** Operational metadata is recorded system data, not page facts. */
export function operationalText(task: {
  calls: number;
  maxCalls: number;
  created: number;
  updated: number;
  steps: unknown[];
  artifacts: { sha256: string; created: number }[];
  sources: unknown[];
}) {
  return [
    "calls " + task.calls,
    "maxCalls " + task.maxCalls,
    "steps " + task.steps.length,
    "sources " + task.sources.length,
    "artifacts " + task.artifacts.length,
    new Date(task.created).toISOString(),
    new Date(task.updated).toISOString(),
    ...task.artifacts.map(
      (artifact) =>
        artifact.sha256 + " " + new Date(artifact.created).toISOString(),
    ),
  ].join("\n");
}
export const RECORDED_EVIDENCE_CAPABILITIES = [
  "file.read",
  "git.diff",
  "verify.file",
  "file.write",
  "terminal.read",
  "terminal.start",
  "terminal.input",
];
