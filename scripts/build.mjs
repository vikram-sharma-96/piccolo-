import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
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
])
  await build({
    entryPoints: [`src/main/${name}.ts`],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron", "@lydell/node-pty"],
    outfile: `dist/${name}.cjs`,
    sourcemap: true,
  });
await viteBuild({
  root: "src/renderer",
  base: "./",
  build: { outDir: "../../dist/ui", emptyOutDir: true },
});
await viteBuild({
  root: "coding",
  configFile: "coding/vite.config.mjs",
  logLevel: "warn",
});
