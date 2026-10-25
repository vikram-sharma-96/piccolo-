import { AdalProvider } from "../src/main/agent-adal.ts";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const directory = path.resolve("test-results/agent-adal-probe-" + Date.now());
await mkdir(directory, { recursive: true });
const provider = new AdalProvider("", directory),
  results = [];
try {
  const text = await provider.query(
    'Return only JSON: {"result":17} after computing 9+8. Do not call tools.',
    [],
    AbortSignal.timeout(140000),
  );
  results.push({ kind: "text", answer: text });
  console.log("TEXT", text);
  const image = await sharp(
    Buffer.from(
      '<svg width="360" height="160"><rect width="360" height="160" fill="white"/><rect x="12" y="12" width="100" height="100" fill="red"/><text x="140" y="65" font-size="34" fill="black">PICCOLO</text><text x="140" y="110" font-size="30" fill="black">731</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  await writeFile(path.join(directory, "vision-fixture.png"), image);
  const vision = await provider.query(
    "Inspect the attached image. Return JSON with the visible word, three-digit number, and shape color. Use only the image. No tools.",
    ["data:image/png;base64," + image.toString("base64")],
    AbortSignal.timeout(140000),
  );
  results.push({ kind: "vision", answer: vision });
  console.log("VISION", vision);
} catch (error) {
  results.push({ kind: "failure", error: String(error) });
  console.error(error);
  process.exitCode = 1;
} finally {
  await provider.close();
  await writeFile(
    path.join(directory, "report.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        interface: "AdaL SDK protocol 1",
        results,
      },
      null,
      2,
    ),
  );
  console.log("Evidence", directory);
}
