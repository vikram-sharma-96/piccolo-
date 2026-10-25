import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBookmarks, exportBookmarks } from "../src/shared/bookmarks";
test("bookmark HTML round trip preserves titles, folders and entities", () => {
  const entries = [
    {
      title: "A & B <team>",
      url: "https://example.com/?q=a&b=c",
      folder: "Research",
    },
    { title: "Literal &lt;", url: "https://example.org/", folder: "Work" },
  ];
  assert.deepEqual(parseBookmarks(exportBookmarks(entries)), entries);
});
test("standard Netscape folder import ignores executable and duplicate links", () => {
  const html =
    '<DL><DT><H3>Work</H3><DL><DT><A HREF="https://example.com">One</A><A HREF="javascript:alert(1)">bad</A><A HREF="https://example.com">duplicate</A></DL></DL>';
  assert.deepEqual(parseBookmarks(html), [
    { url: "https://example.com", title: "One", folder: "Work" },
  ]);
});
test("malformed HTML is bounded and never executed", () => {
  assert.ok(
    parseBookmarks('<a href="https://example.com">'.repeat(5000)).length <= 1,
  );
  assert.throws(() => parseBookmarks("x".repeat(5_000_001)));
});
