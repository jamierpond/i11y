"use client";

// Real, aperiodic Penrose (P3) tiling — generated once on the CPU and rendered
// as a static SVG. No WebGL / Three.js / per-frame work, so it's cheap on phones:
// it paints once and then costs nothing.
//
// Method: Robinson-triangle deflation (the golden-ratio subdivision used by
// Preshing / SciPython). Each rhombus is two mirror-image Robinson triangles;
// subdividing by 1/φ preserves the Penrose matching rules, so the result is a
// genuine aperiodic tiling, not a 5-fold-symmetric look-alike.

import React, { useMemo } from "react";

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;

// How many times to subdivide. Each level multiplies tile count by ~φ² (≈2.6).
// 7 gives ~8k triangles: fine to build once, plenty dense, light to render.
const DEPTH = 7;

// We render a square viewBox and let the SVG `slice` it to fill any viewport.
// The deflated patch is a decagon of radius ~1; a viewBox half-size of 0.62
// keeps its corners (0.62·√2 ≈ 0.88) inside the decagon's inner radius
// (cos18° ≈ 0.951), so the screen is always fully covered — no missing tiles.
const HALF = 0.62;

type Pt = readonly [number, number];
// t: 0 = acute ("thin") Robinson triangle, 1 = obtuse ("fat")
type Tri = { t: 0 | 1; a: Pt; b: Pt; c: Pt };

function lerp(a: Pt, b: Pt, f: number): Pt {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// Initial "wheel" of 10 acute triangles around the origin (Preshing's setup).
function buildWheel(): Tri[] {
  const tris: Tri[] = [];
  for (let i = 0; i < 10; i++) {
    let B: Pt = [Math.cos(((2 * i - 1) * Math.PI) / 10), Math.sin(((2 * i - 1) * Math.PI) / 10)];
    let C: Pt = [Math.cos(((2 * i + 1) * Math.PI) / 10), Math.sin(((2 * i + 1) * Math.PI) / 10)];
    if (i % 2 === 0) { const tmp = B; B = C; C = tmp; } // mirror alternate spokes
    tris.push({ t: 0, a: [0, 0], b: B, c: C });
  }
  return tris;
}

// One deflation step. Acute → (acute + obtuse); obtuse → (obtuse + obtuse + acute).
function deflate(tris: Tri[]): Tri[] {
  const out: Tri[] = [];
  for (const { t, a, b, c } of tris) {
    if (t === 0) {
      const P = lerp(a, b, INV_PHI);
      out.push({ t: 0, a: c, b: P, c: b });
      out.push({ t: 1, a: P, b: c, c: a });
    } else {
      const Q = lerp(b, a, INV_PHI);
      const R = lerp(b, c, INV_PHI);
      out.push({ t: 1, a: R, b: c, c: a });
      out.push({ t: 1, a: Q, b: R, c: b });
      out.push({ t: 0, a: R, b: Q, c: a });
    }
  }
  return out;
}

// Minimal HSV→hex (h,s,v in [0,1]).
function hsv(h: number, s: number, v: number): string {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  const hx = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

const N_HUES = 10;
const f4 = (n: number) => n.toFixed(4);

type Built = { fills: { d: string; color: string }[]; edges: string };

function buildTiling(): Built {
  let tris = buildWheel();
  for (let i = 0; i < DEPTH; i++) tris = deflate(tris);

  // Group fills into a small number of paths (one per hue-bucket × type) so the
  // whole tiling is a couple dozen DOM nodes, not thousands.
  const buckets: string[][] = Array.from({ length: N_HUES * 2 }, () => []);
  const seenEdge = new Set<string>();
  const edgeParts: string[] = [];

  const ek = (p: Pt, q: Pt) => {
    const r = (n: number) => Math.round(n * 1e4);
    const ka = `${r(p[0])},${r(p[1])}`;
    const kb = `${r(q[0])},${r(q[1])}`;
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };

  for (const { t, a, b, c } of tris) {
    const edges: [Pt, Pt][] = [[a, b], [b, c], [c, a]];
    const len = edges.map(([p, q]) => Math.hypot(p[0] - q[0], p[1] - q[1]));
    const order = [0, 1, 2].sort((i, j) => len[i] - len[j]);
    // The two equal-length sides are the rhombus edges (legs); the odd one is the
    // internal diagonal. Acute: diagonal is the shortest. Obtuse: it's the longest.
    const legs = t === 0 ? [order[1], order[2]] : [order[0], order[1]];

    // Hue from rhombus orientation: average direction of the two legs (folded to
    // a half-circle so it's stable per rhombus). Both triangles of a rhombus
    // share leg directions, so both land in the same bucket.
    let sx = 0, sy = 0;
    for (const li of legs) {
      const [p, q] = edges[li];
      let dx = q[0] - p[0], dy = q[1] - p[1];
      if (dy < 0 || (dy === 0 && dx < 0)) { dx = -dx; dy = -dy; }
      const l = Math.hypot(dx, dy);
      sx += dx / l; sy += dy / l;
    }
    let ang = Math.atan2(sy, sx);
    if (ang < 0) ang += Math.PI;
    const cls = Math.round((ang / Math.PI) * N_HUES) % N_HUES;

    buckets[t * N_HUES + cls].push(
      `M${f4(a[0])} ${f4(a[1])}L${f4(b[0])} ${f4(b[1])}L${f4(c[0])} ${f4(c[1])}Z`
    );

    for (const li of legs) {
      const [p, q] = edges[li];
      const key = ek(p, q);
      if (!seenEdge.has(key)) {
        seenEdge.add(key);
        edgeParts.push(`M${f4(p[0])} ${f4(p[1])}L${f4(q[0])} ${f4(q[1])}`);
      }
    }
  }

  const fills: { d: string; color: string }[] = [];
  for (let t = 0; t < 2; t++) {
    for (let h = 0; h < N_HUES; h++) {
      const d = buckets[t * N_HUES + h].join("");
      if (!d) continue;
      // Fat rhombi: vivid; thin rhombi: a touch deeper/less saturated.
      fills.push({ d, color: hsv(h / N_HUES, t === 1 ? 0.85 : 0.6, t === 1 ? 0.9 : 0.78) });
    }
  }

  return { fills, edges: edgeParts.join("") };
}

export function PenroseScroll() {
  // Built once per mount; pure function of constants, so it's stable.
  const { fills, edges } = useMemo(buildTiling, []);

  return (
    <div
      aria-hidden
      style={{ position: "fixed", inset: 0, zIndex: 0, background: "#05030f", pointerEvents: "none" }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`${-HALF} ${-HALF} ${HALF * 2} ${HALF * 2}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ display: "block" }}
        shapeRendering="geometricPrecision"
      >
        {fills.map((f, i) => (
          <path key={i} d={f.d} fill={f.color} />
        ))}
        <path
          d={edges}
          fill="none"
          stroke="#04030c"
          strokeOpacity={0.55}
          strokeWidth={1}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
