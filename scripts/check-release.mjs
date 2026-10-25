import { extractFile } from "@electron/asar";
import { readFile, stat, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const root = path.resolve("release/" + version);
const archive = path.join(root, "win-unpacked/resources/app.asar");
const matched = [];
for (const name of [
  "main",
  "preload",
  "database-worker",
  "optional",
  "mcp",
  "mcp-stdio-entry",
  "coding",
  "coding-preload",
  "coding-terminal",
]) {
  assert.deepEqual(
    extractFile(archive, `dist/${name}.cjs`),
    await readFile(`dist/${name}.cjs`),
  );
  matched.push(name);
}
const assets = [];
async function compareTree(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) await compareTree(file);
    else {
      assert.deepEqual(extractFile(archive, file), await readFile(file));
      assets.push(file);
    }
  }
}
await compareTree("dist/ui");
await compareTree("dist/code");
await compareTree("assets/licenses");
const nativeRoot = path.join(
  root,
  "win-unpacked/resources/app.asar.unpacked/node_modules/@lydell/node-pty-win32-x64/prebuilds/win32-x64",
);
assert.ok((await readdir(nativeRoot)).some((name) => name.endsWith(".node")));
const setup = await readFile("MCP_SETUP.md", "utf8");
const json = JSON.parse(setup.match(/```json\r?\n([\s\S]*?)```/)[1]);
assert.ok((await stat(json.mcpServers.piccolo.command)).isFile());
assert.equal(json.mcpServers.piccolo.env.ELECTRON_RUN_AS_NODE, "1");
assert.deepEqual(
  extractFile(archive, "dist/mcp-stdio-entry.cjs"),
  await readFile("dist/mcp-stdio-entry.cjs"),
);
assert.ok(
  json.mcpServers.piccolo.args[0].endsWith(
    "resources\\app.asar\\dist\\mcp-stdio-entry.cjs",
  ),
);
const files = [];
for (const file of [
  path.join(root, "Piccolo Setup " + version + ".exe"),
  path.join(root, "win-unpacked/Piccolo.exe"),
  archive,
]) {
  const bytes = await readFile(file);
  files.push({
    file,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  "test-results/release-" + version + ".json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      matchedBundles: matched,
      matchedAssets: assets.length,
      nativePtyPresent: true,
      antigravityJsonParsed: true,
      files,
    },
    null,
    2,
  ),
);
console.log(
  `Verified ${matched.length} packaged bundles, ${assets.length} UI/code/license assets, native PTY, MCP setup and artifact checksums.`,
);
