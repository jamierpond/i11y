"use client";

// Throwaway dev tool: set each photo's focal point and watch it in the real
// page (iframe of /focus-editor/preview at phone size). "Save" writes
// app/penrose-photos.ts and rebuilds public/hero (dev server only).
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PENROSE_PHOTOS, PenrosePhoto, focusCrop } from "../penrose-photos";

type Focus = [number, number];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

export default function FocusEditor() {
  const [photos, setPhotos] = useState<PenrosePhoto[]>(() => PENROSE_PHOTOS.map((p) => ({ ...p })));
  const [sel, setSel] = useState(0);
  const [only, setOnly] = useState(false);
  const [dims, setDims] = useState<Record<string, [number, number]>>({});
  const [status, setStatus] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bigRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const cur = photos[sel];
  const saved = PENROSE_PHOTOS;
  const dirty = photos.some((p, i) => p.focus[0] !== saved[i].focus[0] || p.focus[1] !== saved[i].focus[1]);

  // Push the current state to the preview (debounced, and not mid-drag).
  // Originals, not public/hero: those are cropped on the saved focal points.
  const target = only ? photos[sel] : null;
  const list = useMemo(
    () => (target ? [target] : photos).map((p) => ({ ...p, noHero: true })),
    [target, photos],
  );
  const push = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ type: "penrose-photos", photos: list }, window.location.origin);
  }, [list]);
  const pushTimer = useRef<number>(0);
  useEffect(() => {
    if (dragging.current) return;
    window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(push, 250);
  }, [push]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "penrose-preview-ready") push();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [push]);

  const setFocus = (f: Focus) =>
    setPhotos((ps) => ps.map((p, i) => (i === sel ? { ...p, focus: [round2(f[0]), round2(f[1])] } : p)));

  const fromEvent = (e: React.PointerEvent): Focus => {
    const r = bigRef.current!.getBoundingClientRect();
    return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)];
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setSel((s) => (s + 1) % photos.length);
      if (e.key === "ArrowLeft") setSel((s) => (s - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length]);

  const save = async () => {
    setStatus("saving…");
    const res = await fetch("/focus-editor/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photos }),
    });
    setStatus(res.ok ? "saved to app/penrose-photos.ts, hero copies rebuilt" : `save failed: ${await res.text()}`);
  };
  const copy = async () => {
    const lines = photos.map((p) => `  { src: ${JSON.stringify(p.src)}, focus: [${p.focus[0]}, ${p.focus[1]}] },`);
    await navigator.clipboard.writeText(lines.join("\n"));
    setStatus("copied");
  };

  // Square crop as fractions of the image, for the outline and the preview.
  const d = dims[cur.src];
  const crop = d ? focusCrop(d[0], d[1], cur.focus) : null;
  const cropBox = crop && d ? { l: crop.sx / d[0], t: crop.sy / d[1], w: crop.s / d[0], h: crop.s / d[1] } : null;

  return (
    <div className="min-h-screen bg-[#141414] text-white/90 p-4 md:p-6 font-sans">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 mb-4">
        <h1 className="text-lg font-bold">Photo focal points</h1>
        <span className="text-sm text-white/50">Click or drag on the photo. ←/→ switch photo.</span>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-white/60">{status || (dirty ? "unsaved changes" : "no changes")}</span>
          <button onClick={copy} className="px-3 py-1.5 rounded border border-white/20 hover:bg-white/10">Copy TS</button>
          <button onClick={save} disabled={!dirty} className="px-3 py-1.5 rounded bg-purple-600 disabled:opacity-40 hover:bg-purple-500">Save</button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-4">
          <div className="grid grid-cols-6 md:grid-cols-9 gap-1.5">
            {photos.map((p, i) => (
              <button
                key={p.src}
                onClick={() => setSel(i)}
                className={`relative aspect-square overflow-hidden rounded ${i === sel ? "ring-2 ring-purple-400" : "opacity-70 hover:opacity-100"}`}
                title={p.src}
              >
                <Image src={p.src} alt="" fill sizes="100px" className="object-cover" />
                <span
                  className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-purple-400 ring-1 ring-black"
                  style={{ left: `${p.focus[0] * 100}%`, top: `${p.focus[1] * 100}%` }}
                />
              </button>
            ))}
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div
              ref={bigRef}
              className="relative select-none touch-none cursor-crosshair flex-1 min-w-0"
              onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); setFocus(fromEvent(e)); }}
              onPointerMove={(e) => { if (dragging.current) setFocus(fromEvent(e)); }}
              onPointerUp={() => { dragging.current = false; push(); }}
            >
              <Image
                key={cur.src}
                src={cur.src}
                alt=""
                width={1200}
                height={800}
                sizes="(min-width: 1280px) 50vw, 100vw"
                className="w-full h-auto block rounded"
                draggable={false}
                onLoad={(e) => {
                  const im = e.currentTarget;
                  setDims((m) => ({ ...m, [cur.src]: [im.naturalWidth, im.naturalHeight] }));
                }}
              />
              {cropBox && (
                <div
                  className="absolute border-2 border-purple-400/80 pointer-events-none"
                  style={{
                    left: `${cropBox.l * 100}%`, top: `${cropBox.t * 100}%`,
                    width: `${cropBox.w * 100}%`, height: `${cropBox.h * 100}%`,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                  }}
                />
              )}
              <div
                className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.6)] pointer-events-none"
                style={{ left: `${cur.focus[0] * 100}%`, top: `${cur.focus[1] * 100}%` }}
              />
            </div>

            <div className="w-full md:w-56 shrink-0 space-y-3 text-sm">
              <div className="text-white/60 break-all">{cur.src}</div>
              <div className="font-mono">focus [{cur.focus[0]}, {cur.focus[1]}]</div>
              <div>
                <div className="text-white/50 mb-1">Square crop (tiles + gallery)</div>
                <div className="relative w-56 h-56 overflow-hidden rounded bg-black">
                  {crop && d && (
                    <Image
                      src={cur.src}
                      alt=""
                      width={600}
                      height={600}
                      sizes="224px"
                      className="absolute max-w-none"
                      style={{
                        width: `${(d[0] / crop.s) * 100}%`,
                        height: `${(d[1] / crop.s) * 100}%`,
                        left: `${(-crop.sx / crop.s) * 100}%`,
                        top: `${(-crop.sy / crop.s) * 100}%`,
                      }}
                    />
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFocus([saved[sel].focus[0], saved[sel].focus[1]])}
                  className="px-2 py-1 rounded border border-white/20 hover:bg-white/10"
                >Revert</button>
                <button onClick={() => setFocus([0.5, 0.5])} className="px-2 py-1 rounded border border-white/20 hover:bg-white/10">Centre</button>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />
                Preview only this photo
              </label>
              <button onClick={push} className="px-2 py-1 rounded border border-white/20 hover:bg-white/10">Restart preview</button>
            </div>
          </div>
        </div>

        <div className="shrink-0">
          <div className="text-sm text-white/50 mb-2">Real page, 390×844</div>
          <div className="overflow-hidden rounded-2xl border border-white/15" style={{ width: 390 * 0.8, height: 844 * 0.8 }}>
            <iframe
              ref={frameRef}
              src="/focus-editor/preview"
              title="Home page preview"
              style={{ width: 390, height: 844, transform: "scale(0.8)", transformOrigin: "0 0", border: 0 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
