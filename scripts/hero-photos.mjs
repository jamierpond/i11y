// Makes the small square copies the home page hero loads: public/hero/<name>.webp,
// 512px, cover-cropped on each photo's focal point from app/penrose-photos.ts.
// Run after adding a photo or changing a focal point: `pnpm hero-photos`
// (the /focus-editor Save button runs it for you).
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

const SIZE = 512;
const QUALITY = 68;

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const list = await fs.readFile(path.join(root, "app", "penrose-photos.ts"), "utf8");
const photos = [...list.matchAll(/src: "([^"]+)", focus: \[([\d.]+), ([\d.]+)\]/g)]
  .map((m) => ({ src: m[1], focus: [Number(m[2]), Number(m[3])] }));

const outDir = path.join(root, "public", "hero");
await fs.mkdir(outDir, { recursive: true });

const keep = new Set();
for (const { src, focus } of photos) {
  const name = path.basename(src).replace(/\.[^.]+$/, ".webp");
  keep.add(name);
  const input = path.join(root, "public", src);
  const { width: w, height: h } = await sharp(input).metadata();
  // Same crop as focusCrop() in app/penrose-photos.ts.
  const s = Math.min(w, h);
  const clamp = (v, hi) => Math.max(0, Math.min(hi, v));
  const left = Math.round(clamp(focus[0] * w - s / 2, w - s));
  const top = Math.round(clamp(focus[1] * h - s / 2, h - s));
  await sharp(input)
    .extract({ left, top, width: s, height: s })
    .resize(SIZE, SIZE)
    .webp({ quality: QUALITY })
    .toFile(path.join(outDir, name));
}
for (const f of await fs.readdir(outDir)) {
  if (!keep.has(f)) await fs.unlink(path.join(outDir, f));
}
console.log(`hero photos: ${keep.size} written to public/hero`);
