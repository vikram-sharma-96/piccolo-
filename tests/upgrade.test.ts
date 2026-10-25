import { test } from "node:test";
import assert from "node:assert/strict";
import { TransferMeter, remainingSeconds } from "../src/shared/download";
import { destination } from "../src/shared/url";
import { settingsSchema } from "../src/shared/model";
test("custom engines encode queries and keyword selection", () => {
  const s = settingsSchema.parse({
    searchEngine: "custom",
    searchEngines: [
      {
        id: "custom",
        name: "Example",
        keyword: "ex",
        template: "https://example.com/?q={searchTerms}",
      },
    ],
  });
  assert.equal(
    destination("ex a&b #c", s.searchEngine, s.searchEngines),
    "https://example.com/?q=a%26b%20%23c",
  );
  assert.equal(
    destination("plain query", s.searchEngine, s.searchEngines),
    "https://example.com/?q=plain%20query",
  );
  for (const template of [
    "javascript:{searchTerms}",
    "https://{searchTerms}.example.com/",
    "file:///x?q={searchTerms}",
    "https://user:pass@host/?q={searchTerms}",
    "https://host/?q=none",
    "https://host/{searchTerms}/{searchTerms}",
  ])
    assert.equal(
      settingsSchema.safeParse({
        searchEngines: [{ id: "x", name: "X", keyword: "x", template }],
      }).success,
      false,
    );
});
test("migration defaults to sidebar off and low-power static behavior", () => {
  const s = settingsSchema.parse({});
  assert.equal(s.sidebarMode, "off");
  assert.equal(s.lowPower, true);
  assert.equal(s.dailyWallpaper, false);
  assert.equal(s.searchEngines.length, 3);
  assert.equal(settingsSchema.parse({ sidebarWidth: 80 }).sidebarMode, "off");
});
test("transfer speed smooths, handles stalls, pause, unknown totals and zero elapsed", () => {
  const m = new TransferMeter();
  m.sample(0, 1000);
  assert.equal(m.sample(1024, 2000), 1024);
  const rate = m.sample(3072, 3000);
  assert.ok(rate > 1024 && rate < 2048);
  assert.equal(m.sample(3072, 3000), rate);
  m.sample(3072, 4000);
  m.sample(3072, 5000);
  assert.equal(m.sample(3072, 6000), 0);
  assert.equal(m.sample(4000, 7000, false), 0);
  assert.equal(remainingSeconds(0, 100, 10), null);
  assert.equal(remainingSeconds(1000, 100, 100), 9);
  assert.equal(remainingSeconds(1000, 1000, 0), null);
});
