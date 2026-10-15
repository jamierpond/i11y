// Throwaway dev tool: writes focal points from /focus-editor back into
// app/penrose-photos.ts and rebuilds public/hero. Refuses to run outside `next dev`.
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

type Body = { photos: { src: string; focus: [number, number] }[] };

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("focus editor saves only in dev", { status: 403 });
  }
  const { photos } = (await req.json()) as Body;
  const ok = Array.isArray(photos) && photos.every((p) =>
    typeof p.src === "string" && /^\/[\w./-]+$/.test(p.src) &&
    Array.isArray(p.focus) && p.focus.length === 2 &&
    p.focus.every((v) => typeof v === "number" && v >= 0 && v <= 1));
  if (!ok) return new Response("bad photo list", { status: 400 });

  const file = path.join(process.cwd(), "app", "penrose-photos.ts");
  const src = await fs.readFile(file, "utf8");
  const re = /(export const PENROSE_PHOTOS: readonly PenrosePhoto\[\] = \[\n)[\s\S]*?(\n\];)/;
  if (!re.test(src)) return new Response("couldn't find PENROSE_PHOTOS in penrose-photos.ts", { status: 500 });
  const f = (v: number) => String(Math.round(v * 100) / 100);
  const lines = photos.map((p) => `  { src: ${JSON.stringify(p.src)}, focus: [${f(p.focus[0])}, ${f(p.focus[1])}] },`);
  await fs.writeFile(file, src.replace(re, `$1${lines.join("\n")}$2`));
  // Re-crop the hero copies on the new focal points.
  await promisify(execFile)("node", [path.join(process.cwd(), "scripts", "hero-photos.mjs")]);
  return Response.json({ saved: photos.length });
}
