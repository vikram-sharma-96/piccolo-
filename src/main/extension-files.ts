import { createHash } from "node:crypto";
import { readdir, lstat, readFile } from "node:fs/promises";
import path from "node:path";
// Extension resources must stay inside the user-selected folder, with bounded work.
export async function checkExtensionFiles(root: string) {
  let files = 0,
    bytes = 0;
  const hash = createHash("sha256");
  async function walk(dir: string, depth: number) {
    if (depth > 12) throw Error("Extension folder is too deeply nested.");
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const file = path.join(dir, entry.name);
      const info = await lstat(file);
      if (info.isSymbolicLink())
        throw Error("Extension symlinks/junctions are not allowed.");
      if (++files > 1000) throw Error("Extension exceeds 1000 files.");
      if (info.isDirectory()) await walk(file, depth + 1);
      else {
        bytes += info.size;
        if (bytes > 50 * 1024 * 1024) throw Error("Extension exceeds 50 MB.");
        const data = await readFile(file);
        if (data.length !== info.size)
          throw Error("Extension changed while reading.");
        hash
          .update(path.relative(root, file).replaceAll("\\", "/"))
          .update("\0")
          .update(data)
          .update("\0");
      }
    }
  }
  if ((await lstat(root)).isSymbolicLink())
    throw Error("Extension root cannot be a symlink.");
  await walk(path.resolve(root), 0);
  return hash.digest("hex");
}
