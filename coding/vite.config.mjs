import { defineConfig } from "vite";
import { createHash } from "node:crypto";
// Code OSS 1.142 defines this constant DOM custom element through Function().
// Compile that constant body statically, retaining a strict top-frame CSP.
const staticObserver = {
  name: "piccolo-static-connection-observer",
  enforce: "pre",
  transform(code, id) {
    if (!id.replaceAll("\\", "/").endsWith("/vs/base/browser/dom.js")) return;
    if (
      createHash("sha256").update(code).digest("hex") !==
      "4caa103388c9db4a61087b41f8a290e8ee50c93bdc8c36531cc804b228eaabed"
    )
      throw Error(
        "Pinned Code OSS DOM source changed. Review the CSP adapter.",
      );
    const match = code.match(/mainWindow\.Function\(`([\s\S]*?)`\)\(\);/);
    if (!match || match[1].includes("${"))
      throw Error("Code OSS DOM observer changed: review CSP adapter.");
    const body = match[1]
      .replaceAll("customElements", "mainWindow.customElements")
      .replace("extends HTMLElement", "extends mainWindow.HTMLElement");
    return code.replace(match[0], "(()=>{" + body + "})();");
  },
};
export default defineConfig({
  base: "./",
  plugins: [staticObserver],
  resolve: { dedupe: ["@codingame/monaco-vscode-api"] },
  build: {
    outDir: "../dist/code",
    emptyOutDir: true,
    target: "esnext",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 3000,
  },
  worker: { format: "es" },
});
