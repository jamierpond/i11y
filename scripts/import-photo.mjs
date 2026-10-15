// Copies a camera photo into public/ as a web-sized WebP: EXIF orientation
// applied, long side capped at 2000px, quality stepped down until it is
// under ~600KB. The original is only read.
//   node scripts/import-photo.mjs <source.jpg> <name>   → public/<name>.webp
// Then add it to app/penrose-photos.ts and run `pnpm hero-photos`.
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

const [src, name] = process.argv.slice(2);
if (!src || !name) {
  console.error("usage: node scripts/import-photo.mjs <source> <name>");
  process.exit(1);
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "public", `${name}.webp`);
const MAX_BYTES = 600 * 1024;

let buf;
for (const quality of [80, 74, 68, 62, 56]) {
  buf = await sharp(src)
    .rotate() // apply EXIF orientation
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
  if (buf.length <= MAX_BYTES) break;
}
await fs.writeFile(out, buf);
const { width, height } = await sharp(buf).metadata();
console.log(`public/${name}.webp  ${width}x${height}  ${Math.round(buf.length / 1024)}KB`);
