import { z } from "zod";
export const sheetColumns = [
  "name",
  "product",
  "pricing",
  "source_url",
  "status",
] as const;
export const sheetRow = z
  .object({
    name: z.string().max(300).nullish(),
    product: z.string().max(2000).nullish(),
    pricing: z.string().max(2000).nullish(),
    source_url: z.string().url().max(1500),
    status: z.enum(["ok", "unknown", "unreachable"]),
  })
  .strict();
export const writeSheetSchema = z
  .object({
    rows: z.array(sheetRow).min(1).max(100),
    artifactId: z.string().uuid().optional(),
  })
  .strict();
export const verifySheetSchema = z
  .object({ artifactId: z.string().uuid() })
  .strict();
export type SheetRow = {
  name: string;
  product: string;
  pricing: string;
  source_url: string;
  status: "ok" | "unknown" | "unreachable";
};
export function normalizeSheetRows(
  input: z.infer<typeof sheetRow>[],
): SheetRow[] {
  return input.map((row) => {
    const result = {
      ...row,
      name: row.name?.trim() || "unknown",
      product: row.product?.trim() || "unknown",
      pricing: row.pricing?.trim() || "unknown",
    };
    if (row.status === "unreachable") {
      result.product = "unknown";
      result.pricing = "unknown";
    }
    if (
      result.status === "ok" &&
      [result.name, result.product, result.pricing].some((value) =>
        /\bunknown\b/i.test(value),
      )
    )
      result.status = "unknown";
    return result;
  });
}
// Quoted RFC-4180 cells; prefix formula-like values so spreadsheet apps do not execute page content.
export function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function encodeSheet(rows: SheetRow[]) {
  return (
    [sheetColumns, ...rows.map((row) => sheetColumns.map((key) => row[key]))]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") + "\r\n"
  );
}
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
      continue;
    }
    if (char === '"') {
      if (cell || closed) throw Error("Malformed CSV quote");
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed) throw Error("Unexpected content after CSV quote");
      cell += char;
    }
  }
  if (quoted) throw Error("Unterminated CSV quote");
  if (cell || row.length || closed) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
export type SheetCheck = {
  row: number;
  column: string;
  status: "matched" | "mismatched" | "missing";
  expected: string;
  actual?: string;
};
export function compareSheet(
  expected: string[][],
  actual: string[][] | undefined,
) {
  const cells: SheetCheck[] = [];
  for (let r = 0; r < Math.max(expected.length, actual?.length || 0); r++)
    for (
      let c = 0;
      c < Math.max(expected[r]?.length || 0, actual?.[r]?.length || 0);
      c++
    ) {
      const want = expected[r]?.[c],
        got = actual?.[r]?.[c];
      cells.push({
        row: r + 1,
        column: sheetColumns[c] || String(c + 1),
        status:
          got === undefined
            ? "missing"
            : want === got
              ? "matched"
              : "mismatched",
        expected: want ?? "",
        ...(got === undefined ? {} : { actual: got }),
      });
    }
  const counts = {
    matched: cells.filter((cell) => cell.status === "matched").length,
    mismatched: cells.filter((cell) => cell.status === "mismatched").length,
    missing: cells.filter((cell) => cell.status === "missing").length,
  };
  return {
    verified:
      counts.mismatched === 0 && counts.missing === 0 && cells.length > 0,
    ...counts,
    cells,
  };
}
