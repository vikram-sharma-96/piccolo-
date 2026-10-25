import { z } from "zod";
import { checkNumericSupport, PROPOSED_HEADING } from "./agent-evidence";
export const gtmSchema = z
  .object({
    competitors: z
      .array(
        z
          .object({
            tabId: z.string().max(100),
            positioning: z.string().max(220),
            pricing: z.string().max(220),
            targetAudience: z.string().max(220),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    proposedPositioning: z.string().min(1).max(1500),
    launchPost: z.string().min(1).max(5000),
    emailDraft: z.string().min(1).max(3000),
  })
  .strict();
export type GtmObservation = {
  tabId: string;
  url: string;
  title: string;
  text: string;
  unreachable?: boolean;
};
export type GtmClaim = {
  field: string;
  value: string;
  url: string;
  tabId: string;
};
const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
export function gtmBrief(
  input: z.infer<typeof gtmSchema>,
  observations: GtmObservation[],
) {
  const claims: GtmClaim[] = [];
  const seen = new Set<string>();
  const sections = input.competitors.map((competitor) => {
    const source = observations.find(
      (source) => source.tabId === competitor.tabId,
    );
    if (!source || seen.has(source.tabId))
      throw Error("Missing or duplicate observed competitor source.");
    seen.add(source.tabId);
    const fields = [
      ["Positioning", competitor.positioning],
      ["Pricing", competitor.pricing],
      ["Target audience", competitor.targetAudience],
    ];
    const lines = fields.map(([field, raw]) => {
      const value = source.unreachable
        ? "unknown"
        : normalized(raw) || "unknown";
      if (value !== "unknown" && !normalized(source.text).includes(value))
        throw Error(
          field +
            " is not visibly quoted in the attached source. Use an exact visible excerpt or unknown.",
        );
      if (value !== "unknown") {
        // Substring match alone lets "$9" pass inside "$99"; require numeric boundaries too.
        const bad = checkNumericSupport(value, field, [
          { id: source.tabId, url: source.url, kind: "page", text: source.text },
        ]).filter((record) => record.status !== "supported");
        if (bad.length)
          throw Error(
            field +
              " excerpt cuts or changes numeric/currency value(s) " +
              bad.map((record) => record.value).join(", ") +
              " of the attached source. Quote whole amounts or use unknown.",
          );
      }
      if (/[\[\]<>]/.test(value))
        throw Error(
          "Use a plain visible excerpt without Markdown/HTML markup.",
        );
      const claim = { field, value, url: source.url, tabId: source.tabId };
      claims.push(claim);
      return claimLine(claim);
    });
    return "## Competitor source: " + source.url + "\n\n" + lines.join("\n");
  });
  if (seen.size !== observations.length)
    throw Error(
      "Every attached competitor needs all three fields; use unknown for missing information.",
    );
  return {
    text:
      "# Positioning brief\n\nCompetitor facts below quote only observed page text. Unknown means not visible in the observed content.\n\n" +
      sections.join("\n\n") +
      "\n\n" +
      PROPOSED_HEADING +
      "\n\n" +
      input.proposedPositioning +
      "\n",
    claims,
  };
}
function claimLine(claim: GtmClaim) {
  return (
    "- **" +
    claim.field +
    ":** " +
    claim.value +
    " ([source](<" +
    claim.url +
    ">))"
  );
}
export function verifyGtmBrief(markdown: string, claims: GtmClaim[]) {
  const missing = claims.filter(
    (claim) => !markdown.split("\n").includes(claimLine(claim)),
  );
  return {
    verified: claims.length > 0 && missing.length === 0,
    claims: claims.length,
    missingSources: missing.map((claim) => ({
      field: claim.field,
      url: claim.url,
      value: claim.value,
    })),
    unknown: claims.filter((claim) => claim.value === "unknown").length,
  };
}
