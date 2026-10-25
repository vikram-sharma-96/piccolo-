import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readdir, mkdir, writeFile } from "node:fs/promises";
const source = `icon/${(await readdir("icon")).find((n) => n.endsWith(".png"))}`;
await mkdir("assets/icons", { recursive: true });
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024])
  await sharp(source)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(`assets/icons/${size}x${size}.png`);
await writeFile(
  "assets/icon.ico",
  await pngToIco([16, 32, 48, 256].map((s) => `assets/icons/${s}x${s}.png`)),
);
await sharp(source)
  .resize(256, 256, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .toFile("assets/icon.png");
const blocks = [];
for (const [type, size] of [
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
]) {
  const data = await sharp(source)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32BE(data.length + 8, 4);
  blocks.push(header, data);
}
const header = Buffer.alloc(8);
header.write("icns");
header.writeUInt32BE(8 + blocks.reduce((n, b) => n + b.length, 0), 4);
await writeFile("assets/icon.icns", Buffer.concat([header, ...blocks]));
console.log("Platform icons generated from", source);
