import { test } from "node:test";
import assert from "node:assert/strict";
import { destination, webURL, internal } from "../src/shared/url";
import { commandSchema, settingsSchema } from "../src/shared/model";
test("addresses, development ports and queries resolve deliberately", () => {
  assert.equal(
    destination("localhost:3000/test"),
    "http://localhost:3000/test",
  );
  assert.equal(destination("127.0.0.1:8000"), "http://127.0.0.1:8000/");
  assert.equal(destination("example.com"), "https://example.com/");
  assert.equal(destination("http://example.com"), "http://example.com/");
  assert.equal(
    destination("hello world", "bing"),
    "https://www.bing.com/search?q=hello%20world",
  );
  assert.equal(destination("piccolo://settings"), "piccolo://settings");
});
test("remote URL boundary rejects privileged, executable and credential URLs", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///C:/secret",
    "piccolo-ui://app/index.html",
    "piccolo://not-real",
    "https://user:secret@example.com",
  ]) {
    assert.throws(() => destination(url));
    assert.equal(webURL(url), false);
  }
  assert.equal(internal("piccolo://settings/extra"), false);
  assert.equal(webURL("https://example.com"), true);
});
test("IPC inputs are constrained and do not expose general execution", () => {
  for (const c of [
    { type: "execute", code: "process.exit()" },
    { type: "tab", action: "activate", id: 1 },
    { type: "overlay", open: "yes" },
    { type: "clear", target: "filesystem" },
    { type: "settings", value: { sleepMinutes: -1 } },
    { type: "find", text: "a".repeat(1001) },
  ])
    assert.equal(commandSchema.safeParse(c).success, false);
  assert.deepEqual(commandSchema.parse({ type: "find", text: "test" }), {
    type: "find",
    text: "test",
    forward: true,
    next: false,
  });
});
test("settings migration fills defaults and validates imported layouts", () => {
  const s = settingsSchema.parse({ theme: "light" });
  assert.equal(s.theme, "light");
  assert.equal(s.widgets.length, 4);
  assert.equal(s.wallpaper.kind, "gradient");
  assert.equal(
    settingsSchema.safeParse({ ...s, accent: "url(https://evil)" }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({
      ...s,
      widgets: [{ id: "x", kind: "script", width: "small", title: "x" }],
    }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ ...s, sleepMinutes: 1441 }).success,
    false,
  );
});
