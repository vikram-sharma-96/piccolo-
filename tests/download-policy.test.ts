import { test } from "node:test";
import assert from "node:assert/strict";
import {
  downloadName,
  downloadRisk,
  liveDownload,
} from "../src/shared/download-policy";
test("untrusted download names cannot create paths or Windows device names", () => {
  for (const raw of [
    "../../CON.txt",
    "C:\\fake\\NUL",
    "report\u202etxt.exe",
    "bad:name?.txt",
    "x".repeat(139) + ". ",
  ]) {
    const name = downloadName(raw);
    assert.ok(name.length <= 141);
    assert.ok(!/[\\/:?<>|\u202e]/.test(name));
    assert.ok(!/[. ]$/.test(name));
    assert.ok(!/^(con|nul)(\.|$)/i.test(name));
  }
});
test("risky file names are warnings, ordinary exports remain usable", () => {
  for (const name of [
    "setup.exe",
    "shortcut.lnk",
    "script.py",
    "update.msp",
    "report.docm",
    "photo.jpg.exe",
    "safe\u202etxt",
  ])
    assert.ok(downloadRisk(name), name);
  assert.equal(downloadRisk("report.csv"), "");
  assert.equal(downloadRisk("export.txt"), "");
});
test("only nonterminal states count as active downloads", () => {
  for (const status of [
    "awaiting-approval",
    "approving",
    "progressing",
    "paused",
    "finalizing",
  ])
    assert.ok(liveDownload(status));
  for (const status of ["cancelled", "completed", "interrupted", "blocked"])
    assert.ok(!liveDownload(status));
});
