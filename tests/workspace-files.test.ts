import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceFiles } from "../src/main/workspace-files";
test("Workspace files reject escapes and sensitive automation paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-files-")),
    files = await WorkspaceFiles.create(root);
  for (const value of [
    "../outside",
    "C:/Windows/system.ini",
    "folder\\file",
    "x:stream",
    "nul.txt",
    "foo.",
  ])
    await assert.rejects(files.resolve(value));
  for (const value of [
    ".env",
    ".env.local",
    ".git/config",
    ".ssh/id_rsa",
    "keys/private.pem",
  ])
    await assert.rejects(files.resolve(value, true));
  await writeFile(path.join(root, ".env"), "not-a-secret fixture");
  assert.equal(
    Buffer.from((await files.read(".env")).data, "base64").toString(),
    "not-a-secret fixture",
  );
  assert.ok(!(await files.list("", true)).some(([name]) => name === ".env"));
});
test("Workspace files refuse symlinks/junctions to outside folders", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-links-")),
    outside = await mkdtemp(path.join(tmpdir(), "piccolo-outside-"));
  await writeFile(path.join(outside, "private.txt"), "outside fixture");
  await symlink(
    outside,
    path.join(root, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const files = await WorkspaceFiles.create(root);
  await assert.rejects(files.read("linked/private.txt"), /links|junctions/);
});
test("Workspace saves enforce real read revisions and preserve concurrent disk edits", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-revision-")),
    files = await WorkspaceFiles.create(root);
  await files.write("hello.txt", Buffer.from("first").toString("base64"), null);
  const before = await files.read("hello.txt");
  await writeFile(path.join(root, "hello.txt"), "external edit");
  await assert.rejects(
    files.write(
      "hello.txt",
      Buffer.from("overwrite").toString("base64"),
      before.revision,
    ),
    /changed on disk/,
  );
  assert.equal(
    await readFile(path.join(root, "hello.txt"), "utf8"),
    "external edit",
  );
  const latest = await files.read("hello.txt");
  await files.write(
    "hello.txt",
    Buffer.from("saved").toString("base64"),
    latest.revision,
  );
  assert.equal(await readFile(path.join(root, "hello.txt"), "utf8"), "saved");
});
test("Workspace moves do not overwrite files or move the selected root", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-move-")),
    files = await WorkspaceFiles.create(root);
  await files.mkdir("src");
  await files.write("a.txt", Buffer.from("a").toString("base64"), null);
  await files.write("b.txt", Buffer.from("b").toString("base64"), null);
  await assert.rejects(files.rename("a.txt", "b.txt"), /already exists/);
  await assert.rejects(files.rename("", "elsewhere"), /root/);
  await files.rename("a.txt", "src/a.txt");
  assert.equal(await readFile(path.join(root, "src/a.txt"), "utf8"), "a");
});
test("Project search skips sensitive files and supports cancellation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "piccolo-search-")),
    files = await WorkspaceFiles.create(root);
  await writeFile(path.join(root, "a.txt"), "needle");
  await writeFile(path.join(root, ".env"), "needle secret fixture");
  const found = await files.search("needle");
  assert.deepEqual(
    found.results.map((r) => r.path),
    ["a.txt"],
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(files.search("needle", controller.signal), /cancelled/);
});
