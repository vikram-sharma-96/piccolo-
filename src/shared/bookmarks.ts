import { Parser } from "htmlparser2";
import { webURL } from "./url";
export interface ImportedBookmark {
  title: string;
  url: string;
  folder: string;
}
export function parseBookmarks(html: string): ImportedBookmark[] {
  if (Buffer.byteLength(html, "utf8") > 5_000_000)
    throw Error("Import exceeds 5 MB.");
  const entries: ImportedBookmark[] = [];
  const seen = new Set<string>();
  const folders: string[] = [];
  let nextFolder = "";
  let title = "";
  let heading = false;
  let link: { url: string; folder: string } | undefined;
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === "h3") {
          heading = true;
          title = "";
        }
        if (name === "dl") {
          folders.push(nextFolder);
          nextFolder = "";
        }
        if (name === "a") {
          link = {
            url: attrs.href || "",
            folder:
              attrs["data-folder"] ||
              folders.filter(Boolean).join(" / ") ||
              "Imported",
          };
          title = "";
        }
      },
      ontext(text) {
        if (heading || link) title += text;
      },
      onclosetag(name) {
        if (name === "h3") {
          heading = false;
          nextFolder = title.slice(0, 100);
        }
        if (name === "dl") folders.pop();
        if (name === "a" && link) {
          if (
            webURL(link.url) &&
            !seen.has(link.url) &&
            entries.length < 10000
          ) {
            seen.add(link.url);
            entries.push({ ...link, title: title.slice(0, 200) || link.url });
          }
          link = undefined;
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  return entries;
}
export function exportBookmarks(entries: ImportedBookmark[]): string {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  let html =
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE><H1>Bookmarks</H1>\n<DL><p>\n';
  for (const folder of new Set(entries.map((b) => b.folder))) {
    html += `<DT><H3>${escape(folder || "Unfiled")}</H3>\n<DL><p>\n`;
    for (const b of entries.filter((b) => b.folder === folder))
      html += `<DT><A HREF="${escape(b.url)}" DATA-FOLDER="${escape(b.folder)}">${escape(b.title)}</A>\n`;
    html += "</DL><p>\n";
  }
  return html + "</DL><p>\n";
}
