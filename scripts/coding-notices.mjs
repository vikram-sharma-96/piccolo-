import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
const destination = path.resolve("assets/licenses");
await mkdir(destination, { recursive: true });
const inventory = [],
  sections = [];
async function collect(folder) {
  const pkg = JSON.parse(
    await readFile(path.join(folder, "package.json"), "utf8"),
  );
  const names = (await readdir(folder)).filter((n) =>
    /^(licen[sc]e|notice|thirdpartynotices|copying)([.-]|$)/i.test(n),
  );
  inventory.push({
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    repository: pkg.repository,
  });
  for (const name of names) {
    try {
      sections.push(
        `\n===== ${pkg.name} ${pkg.version} / ${name} =====\n` +
          (await readFile(path.join(folder, name), "utf8")),
      );
    } catch {}
  }
}
for (const name of await readdir("coding/node_modules")) {
  if (name.startsWith(".")) continue;
  if (name.startsWith("@"))
    for (const child of await readdir("coding/node_modules/" + name))
      await collect("coding/node_modules/" + name + "/" + child);
  else await collect("coding/node_modules/" + name);
}
for (const name of await readdir("node_modules/@lydell"))
  await collect("node_modules/@lydell/" + name);
await writeFile(
  path.join(destination, "coding-dependencies.json"),
  JSON.stringify(inventory, null, 2),
);
await writeFile(
  path.join(destination, "coding-dependencies.txt"),
  sections.join("\n"),
);
// @codingame npm packages omit their MIT text; preserve the exact upstream notice.
for (const [name, url] of [
  [
    "CodinGame-LICENSE.txt",
    "https://raw.githubusercontent.com/CodinGame/monaco-vscode-api/9e70dd83a1d12bb9fbbe66ff3079a3f195ec282a/LICENSE",
  ],
  [
    "Code-OSS-LICENSE.txt",
    "https://raw.githubusercontent.com/microsoft/vscode/d956e8a6ac5d904486557eea07e1d6bd62a4d36f/LICENSE.txt",
  ],
  [
    "Code-OSS-ThirdPartyNotices.txt",
    "https://raw.githubusercontent.com/microsoft/vscode/d956e8a6ac5d904486557eea07e1d6bd62a4d36f/ThirdPartyNotices.txt",
  ],
]) {
  const response = await fetch(url);
  if (!response.ok) throw Error(url + ": " + response.status);
  await writeFile(path.join(destination, name), await response.text());
}
console.log(
  `Recorded ${inventory.length} coding/PTY package manifests and license notices.`,
);

