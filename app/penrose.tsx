"use client";

// Real, aperiodic Penrose (P3) tiling — geometry computed once on the CPU,
// animated on the GPU via a tiny raw-WebGL2 shader. No Three.js.
//
// Division of labour:
//   • CPU, once on mount: Robinson-triangle deflation builds a genuine Penrose
//     tiling (golden-ratio subdivision preserves the matching rules; the
//     fat:thin rhombus count converges to exactly φ), plus the rhombus
//     adjacency graph (which rhombi share an edge). Uploaded to the GPU once.
//   • CPU, occasionally: a handful of "patches" grow along that adjacency
//     graph from a seed rhombus. Each patch shows one photo mapped across all
//     of its rhombi. When a patch moves, one small attribute buffer
//     (patch id + growth order per vertex) is re-uploaded.
//   • GPU, every frame: the shader moves the fixed geometry (slow time/scroll
//     rotate/zoom) and runs every tile's fade/flip from its growth order and a
//     few per-patch uniforms (photo layers, start time, mode). No per-tile CPU
//     work per frame.
//
// Photos live in a TEXTURE_2D_ARRAY with two layers per patch (current and
// next), cover-cropped to a square. They load lazily, so memory is fixed no
// matter how many photos PENROSE_PHOTOS lists, and the lattice draws on the
// first frame with photos fading in once loaded.
//
// Rendering to a <canvas> in useEffect (client only) also means there is no
// server-rendered markup to hydrate, so no hydration mismatch.

import React, { useEffect, useRef } from "react";
import { focusCrop, heroSrc, usePenrosePhotos } from "./penrose-photos";

/* ------------------------------------------------------------------ geometry */

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;
const DEPTH = 7; // ~6k triangles; one static buffer

type Pt = readonly [number, number];
type Tri = { t: 0 | 1; a: Pt; b: Pt; c: Pt };

function lerp(a: Pt, b: Pt, f: number): Pt {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function buildWheel(): Tri[] {
  const tris: Tri[] = [];
  for (let i = 0; i < 10; i++) {
    let B: Pt = [Math.cos(((2 * i - 1) * Math.PI) / 10), Math.sin(((2 * i - 1) * Math.PI) / 10)];
    let C: Pt = [Math.cos(((2 * i + 1) * Math.PI) / 10), Math.sin(((2 * i + 1) * Math.PI) / 10)];
    if (i % 2 === 0) { const tmp = B; B = C; C = tmp; }
    tris.push({ t: 0, a: [0, 0], b: B, c: C });
  }
  return tris;
}

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

type Geometry = {
  pos: Float32Array;      // 2 floats / vertex, 3 verts / triangle
  type: Float32Array;     // 0 = thin, 1 = fat
  center: Float32Array;   // 2 floats / vertex: rhombus centre (same for both halves)
  axis: Float32Array;     // 2 floats / vertex: unit flip axis (the shared diagonal)
  seed: Float32Array;     // 1 float / vertex: per-rhombus random 0..1
  vertCount: number;
  edgePos: Float32Array;  // 2 floats / vertex, 2 verts / segment (rhombus edges)
  edgeCount: number;
  edgeLen: number;        // mean rhombus edge length (tiling units)
  // Rhombus graph (CPU only, for growing patches).
  rhombusCount: number;
  rCx: Float32Array;      // rhombus centre x
  rCy: Float32Array;      // rhombus centre y
  rTris: number[][];      // triangle indices of each rhombus (1 or 2)
  rNbrs: number[][];      // rhombi sharing an edge
  edgeRh: Int32Array;     // per edge segment: the 1-2 rhombi on either side (-1 = none)
};

function buildGeometry(): Geometry {
  let tris = buildWheel();
  for (let i = 0; i < DEPTH; i++) tris = deflate(tris);

  const n = tris.length;
  const pos = new Float32Array(n * 6);
  const type = new Float32Array(n * 3);
  const center = new Float32Array(n * 6);
  const axis = new Float32Array(n * 6);
  const seed = new Float32Array(n * 3);

  const r = (v: number) => Math.round(v * 1e4);
  const pk = (p: Pt) => `${r(p[0])},${r(p[1])}`;
  const ek = (p: Pt, q: Pt) => {
    const ka = pk(p);
    const kb = pk(q);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };

  const edgeOwners = new Map<string, number[]>();
  const edges: number[] = [];
  const rhombusOf = new Map<string, number>();
  const rCx: number[] = [];
  const rCy: number[] = [];
  const rTris: number[][] = [];

  for (let i = 0; i < n; i++) {
    const { t, a, b, c } = tris[i];
    const tri: [Pt, Pt][] = [[a, b], [b, c], [c, a]];
    const len = tri.map(([p, q]) => Math.hypot(p[0] - q[0], p[1] - q[1]));
    const order = [0, 1, 2].sort((x, y) => len[x] - len[y]);
    // The two equal sides are the rhombus edges; the odd one is the diagonal.
    const legs = t === 0 ? [order[1], order[2]] : [order[0], order[1]];
    const baseIdx = t === 0 ? order[0] : order[2]; // the diagonal we share with our twin

    // Rhombus centre = midpoint of the shared diagonal. Both triangles of a
    // rhombus share this point, so it identifies the rhombus.
    const [bp, bq] = tri[baseIdx];
    const cx = (bp[0] + bq[0]) / 2;
    const cy = (bp[1] + bq[1]) / 2;
    let ax = bq[0] - bp[0], ay = bq[1] - bp[1];
    const al = Math.hypot(ax, ay);
    ax /= al; ay /= al;

    const rkey = pk([cx, cy]);
    let rid = rhombusOf.get(rkey);
    if (rid === undefined) {
      rid = rCx.length;
      rhombusOf.set(rkey, rid);
      rCx.push(cx); rCy.push(cy); rTris.push([]);
    }
    rTris[rid].push(i);

    // Per-rhombus random, stable across both halves.
    const h = Math.sin(rid * 12.9898 + 78.233) * 43758.5453;
    const sd = h - Math.floor(h);

    const vi = i * 6;
    pos[vi] = a[0]; pos[vi + 1] = a[1];
    pos[vi + 2] = b[0]; pos[vi + 3] = b[1];
    pos[vi + 4] = c[0]; pos[vi + 5] = c[1];
    for (let k = 0; k < 3; k++) {
      type[i * 3 + k] = t;
      seed[i * 3 + k] = sd;
      center[vi + k * 2] = cx;
      center[vi + k * 2 + 1] = cy;
      axis[vi + k * 2] = ax;
      axis[vi + k * 2 + 1] = ay;
    }

    for (const li of legs) {
      const [p, q] = tri[li];
      const key = ek(p, q);
      const owners = edgeOwners.get(key);
      if (!owners) {
        edgeOwners.set(key, [rid]);
        edges.push(p[0], p[1], q[0], q[1]);
      } else if (!owners.includes(rid)) {
        owners.push(rid);
      }
    }
  }

  const rNbrs: number[][] = rCx.map(() => []);
  // Map preserves insertion order, which is the order segments went into `edges`.
  const edgeRh = new Int32Array(edgeOwners.size * 2).fill(-1);
  let ei = 0;
  for (const owners of edgeOwners.values()) {
    edgeRh[ei * 2] = owners[0];
    if (owners.length > 1) edgeRh[ei * 2 + 1] = owners[1];
    ei++;
    if (owners.length === 2) {
      rNbrs[owners[0]].push(owners[1]);
      rNbrs[owners[1]].push(owners[0]);
    }
  }

  return {
    pos, type, center, axis, seed,
    vertCount: n * 3,
    edgePos: new Float32Array(edges),
    edgeCount: edges.length / 2,
    edgeLen: (() => {
      let sum = 0;
      for (let i = 0; i < edges.length; i += 4) sum += Math.hypot(edges[i + 2] - edges[i], edges[i + 3] - edges[i + 1]);
      return sum / Math.max(1, edges.length / 4);
    })(),
    rhombusCount: rCx.length,
    rCx: new Float32Array(rCx),
    rCy: new Float32Array(rCy),
    rTris,
    rNbrs,
    edgeRh,
  };
}


/* ------------------------------------------------------------------ timeline */

// The whole tiling is split into Penrose-shaped photo regions (a Voronoi over
// rhombus centres, so borders follow tile edges). Each "generation" is a new
// split with new photos. A generation is revealed by a ring that spreads out
// from an origin: every tile flips to it as the ring passes. Automatic rings
// start at a random point on screen; a tap starts one from the finger.
//
// Generations live in SLOTS slots: the one fully on screen (base), any rings
// still spreading, and one "pending" generation already loaded and waiting, so
// a tap can always reveal new photos at once. Rings can overlap: per tile the
// newest ring to have passed wins.
const SLOTS = 5;
const MAX_REGIONS = 12;   // per generation
const FLIP_DUR = 1.0;     // s, one tile's flip
const AUTO_RING_S = 3.2;  // s for an automatic ring to travel the visible radius
const TAP_RING_S = 1.4;   // s for a tap ring to travel the visible radius
const HOLD = 2.5;         // s, rest between automatic rings
const HOVER_TILES = 3.5;  // hover radius, in rhombus edge lengths
// Phones: zoom the tiling in (never out) until a rhombus edge is at least this
// many CSS px, so the tiles read as tiles and regions hold fewer, bigger pieces.
const MIN_TILE_PX = 26;

/* -------------------------------------------------------------------- shaders */

const VERT = `#version 300 es
precision highp float;
in vec2 aPos;
in float aType;
in vec2 aCenter;
in vec2 aAxis;
in float aSeed;
in vec4 aReg;        // region of this rhombus in slots 0-3
in float aReg4;      // ... and slot 4
in vec4 aEdgeA;      // edges only: region of the rhombus on side A, slots 0-3
in float aEdgeA4;
in vec4 aEdgeB;      // ... side B (-1 = no rhombus)
in float aEdgeB4;
uniform float uTime;
uniform float uAspect;
uniform float uMotion;
uniform float uAng;
uniform float uScale;
uniform float uPass;  // 0 = empty tiles, 1 = photo tiles, 2 = edges
uniform vec4 uSlot[${SLOTS}];   // ring origin.xy, start time, speed (tiling units / s)
uniform vec4 uSlotB[${SLOTS}];  // rank (newer = higher), photo angle, live
uniform vec4 uFrame[${SLOTS * MAX_REGIONS}]; // per slot+region: centre.xy (upright), half-size, texture layer
uniform vec3 uHover;  // tiling xy, strength
uniform float uHoverR;
out vec2 vScreen;
out vec2 vUVA;
out vec2 vUVB;
flat out float vType;
flat out float vSeed;
flat out float vMix;
flat out float vShade;
flat out float vLayerA;
flat out float vLayerB;
flat out float vFrontA;
flat out float vBorder;

const float PI = 3.14159265;
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float ease(float x){ return x * x * (3.0 - 2.0 * x); }

// Which generations show at tiling point c: "back" is the newest slot whose
// ring has reached c (pr = its flip progress there), "front" the newest older
// slot whose ring had already flipped c. -1 = none.
void resolve(vec2 c, out int front, out int back, out float pr){
  float prs[${SLOTS}];
  float backRank = -1.0;
  back = -1; pr = 0.0;
  for (int s = 0; s < ${SLOTS}; s++){
    prs[s] = 0.0;
    if (uSlotB[s].z < 0.5) continue;
    vec4 S = uSlot[s];
    prs[s] = clamp((uTime - S.z - length(c - S.xy) / S.w) / ${FLIP_DUR.toFixed(2)}, 0.0, 1.0);
    if (prs[s] > 0.0 && uSlotB[s].x > backRank){ backRank = uSlotB[s].x; back = s; pr = prs[s]; }
  }
  front = -1;
  float frontRank = -1.0;
  for (int s = 0; s < ${SLOTS}; s++){
    if (uSlotB[s].z < 0.5 || s == back) continue;
    if (uSlotB[s].x < backRank && prs[s] > 0.5 && uSlotB[s].x > frontRank){ frontRank = uSlotB[s].x; front = s; }
  }
}

vec2 uvIn(vec4 F, float ang, vec2 p){
  vec2 q = (rot(ang) * p - F.xy) / F.z;
  return vec2(0.5 + 0.5 * q.x, 0.5 - 0.5 * q.y);
}

void main(){
  vec2 p = aPos;
  vType = aType; vSeed = aSeed;
  vMix = 0.0; vShade = 1.0; vLayerA = 0.0; vLayerB = 0.0; vFrontA = 0.0; vBorder = 0.0;
  vUVA = vec2(0.5); vUVB = vec2(0.5);

  if (uPass > 1.5) {
    // Edge: a region border in whichever generation shows here?
    int front, back; float pr;
    resolve(aPos, front, back, pr);
    int s = pr > 0.5 ? back : front;
    if (s >= 0) {
      float ea[${SLOTS}] = float[${SLOTS}](aEdgeA.x, aEdgeA.y, aEdgeA.z, aEdgeA.w, aEdgeA4);
      float eb[${SLOTS}] = float[${SLOTS}](aEdgeB.x, aEdgeB.y, aEdgeB.z, aEdgeB.w, aEdgeB4);
      vBorder = (eb[s] > -0.5 && abs(ea[s] - eb[s]) > 0.5) ? 1.0 : 0.0;
    }
  } else if (uPass > 0.5) {
    int front, back; float pr;
    resolve(aCenter, front, back, pr);
    if (back < 0) {                    // nothing revealed here yet
      gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
      vScreen = vec2(0.0);
      return;
    }
    float regs[${SLOTS}] = float[${SLOTS}](aReg.x, aReg.y, aReg.z, aReg.w, aReg4);
    vec4 FB = uFrame[back * ${MAX_REGIONS} + int(regs[back] + 0.5)];
    vUVB = uvIn(FB, uSlotB[back].y, aPos);
    vLayerB = FB.w;
    if (front >= 0) {
      vec4 FA = uFrame[front * ${MAX_REGIONS} + int(regs[front] + 0.5)];
      vUVA = uvIn(FA, uSlotB[front].y, aPos);
      vLayerA = FA.w;
      vFrontA = 1.0;
    }

    float hv = uHover.z * (1.0 - smoothstep(0.0, uHoverR, length(aCenter - uHover.xy)));

    if (uMotion > 0.5) {
      // Each rhombus turns about its own diagonal: squash across the axis by
      // |cos|, show the new photo past edge-on.
      float th = ease(pr) * PI;
      float c = cos(th);
      vec2 d = (aPos - aCenter) * (1.0 + 0.07 * hv);   // hover lift
      vec2 along = dot(d, aAxis) * aAxis;
      p = aCenter + along + (d - along) * abs(c);
      vMix = pr > 0.5 ? 1.0 : 0.0;
      vShade = mix(0.3, 1.0, abs(c)) + 0.35 * pow(sin(2.0 * th), 8.0);
      vShade *= 1.0 + 0.28 * hv;
    } else {
      vMix = ease(pr);              // reduced motion: crossfade as the ring passes
    }
  }

  // Slow ambient drift + scroll gently rotate / zoom the tiling (uAng/uScale
  // come from the CPU, which also needs them to place rings and regions).
  vec2 r = rot(uAng) * p;
  gl_Position = vec4(vec2(r.x / uAspect, r.y) * uScale, 0.0, 1.0);
  vScreen = gl_Position.xy;
}`;

const FRAG = `#version 300 es
precision highp float;
precision mediump sampler2DArray;
in vec2 vScreen;
in vec2 vUVA;
in vec2 vUVB;
flat in float vType;
flat in float vSeed;
flat in float vMix;
flat in float vShade;
flat in float vLayerA;
flat in float vLayerB;
flat in float vFrontA;
flat in float vBorder;
uniform float uTime;
uniform float uPass;
uniform vec2 uHalfPx;  // canvas half size, CSS px
uniform vec2 uKeep;    // headline block half size, CSS px
uniform sampler2DArray uTex;
out vec4 frag;

void main(){
  if (uPass > 1.5){
    // Rhombus outlines: faint violet light inside a region, a darker lead
    // line along region borders.
    frag = vBorder > 0.5 ? vec4(0.03, 0.0, 0.07, 0.7) : vec4(1.0, 0.31, 0.85, 0.18);
    return;
  }

  // Centre vignette, plus a darker ellipse behind the headline + buttons.
  float vign = smoothstep(0.0, 1.15, length(vScreen));
  float v = mix(0.5, 1.0, vign);
  float e = length(vScreen * uHalfPx / uKeep);
  v *= mix(0.4, 1.0, smoothstep(0.55, 1.35, e));

  if (uPass < 0.5){
    // Empty tiles (seen before photos load and behind a flipping tile): dark,
    // fat a touch lighter than thin, each breathing on its own phase.
    vec3 thin = vec3(0.028, 0.020, 0.066);
    vec3 fat  = vec3(0.060, 0.040, 0.120);
    vec3 col = mix(thin, fat, vType);
    col *= 0.8 + 0.2 * sin(uTime * 0.35 + vSeed * 6.2831853);
    frag = vec4(col * v, 1.0);
    return;
  }

  vec3 a = texture(uTex, vec3(vUVA, vLayerA)).rgb;
  vec3 b = texture(uTex, vec3(vUVB, vLayerB)).rgb;
  vec3 col = mix(a, b, vMix);
  float alpha = mix(vFrontA, 1.0, vMix);  // nothing older here: front face is empty
  // Fat/thin shows through the photo very slightly.
  col *= (vType > 0.5) ? 1.0 : 0.9;
  frag = vec4(col * vShade * v, alpha);
}`;

/* ------------------------------------------------------------------ component */

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

type Gen = {
  count: number;          // regions
  visible: number;        // regions 0..visible-1 are on screen
  layers: Int32Array;     // texture layer per region (-1 = none yet)
  photos: Int32Array;     // photo index per region
  frames: Float32Array;   // MAX_REGIONS * vec4 (centre.xy, half-size, layer)
  ang: number;            // photos upright at this tiling angle
};
type Slot = {
  gen: Gen | null;
  live: boolean;          // ring started (else: pending)
  rank: number;
  ox: number; oy: number; t0: number; speed: number; end: number;
};

// Dev-only log the Playwright check reads (every tap and what it revealed).
type PenroseDebug = {
  firstShown?: number; firstVisible?: number; perGen?: number;
  taps: { t: number; photos: number[]; prevPhotos: number[]; ready: boolean; wasReady: boolean }[];
};

export function PenroseScroll() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef(0);
  const photos = usePenrosePhotos();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "low-power" });
    if (!gl) return; // very old device: leave the dark CSS background as-is

    const reduce = typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // --- program ---
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const loc = {
      uTime: u("uTime"), uAspect: u("uAspect"), uMotion: u("uMotion"),
      uAng: u("uAng"), uScale: u("uScale"), uPass: u("uPass"),
      uSlot: u("uSlot"), uSlotB: u("uSlotB"), uFrame: u("uFrame"),
      uHover: u("uHover"), uHoverR: u("uHoverR"),
      uHalfPx: u("uHalfPx"), uKeep: u("uKeep"), uTex: u("uTex"),
    };

    // Reduced motion: no spin/zoom, no flips (rings crossfade), no hover.
    const motion = reduce ? 0.0 : 1.0;

    // --- geometry → buffers ---
    const g = buildGeometry();
    const buffers: WebGLBuffer[] = [];
    const mkBuf = (data: Float32Array, usage: number = gl.STATIC_DRAW) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      buffers.push(b);
      return b;
    };
    const attr = (name: string, buf: WebGLBuffer, size: number, stride = 0, offset = 0) => {
      const l = gl.getAttribLocation(prog, name);
      if (l < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride, offset);
    };

    // Region of each vertex's rhombus, per slot (5 floats / vertex).
    const regData = new Float32Array(g.vertCount * SLOTS);
    const regBuf = mkBuf(regData, gl.DYNAMIC_DRAW);
    // Regions either side of each edge, per slot (5 + 5 floats / edge vertex).
    const edgeData = new Float32Array(g.edgeCount * SLOTS * 2).fill(-1);
    const edgeRegBuf = mkBuf(edgeData, gl.DYNAMIC_DRAW);

    const fillVAO = gl.createVertexArray();
    gl.bindVertexArray(fillVAO);
    attr("aPos", mkBuf(g.pos), 2);
    attr("aType", mkBuf(g.type), 1);
    attr("aCenter", mkBuf(g.center), 2);
    attr("aAxis", mkBuf(g.axis), 2);
    attr("aSeed", mkBuf(g.seed), 1);
    attr("aReg", regBuf, 4, SLOTS * 4, 0);
    attr("aReg4", regBuf, 1, SLOTS * 4, 16);

    const edgeVAO = gl.createVertexArray();
    gl.bindVertexArray(edgeVAO);
    attr("aPos", mkBuf(g.edgePos), 2);
    attr("aEdgeA", edgeRegBuf, 4, SLOTS * 8, 0);
    attr("aEdgeA4", edgeRegBuf, 1, SLOTS * 8, 16);
    attr("aEdgeB", edgeRegBuf, 4, SLOTS * 8, SLOTS * 4);
    attr("aEdgeB4", edgeRegBuf, 1, SLOTS * 8, SLOTS * 4 + 16);
    gl.bindVertexArray(null);

    // --- photo cache: a fixed number of texture layers, filled lazily ---
    const regionRadiusPx = (W: number, H: number) => Math.min(0.21 * H, 0.4 * W);
    const W0 = canvas.clientWidth || window.innerWidth;
    const H0 = canvas.clientHeight || window.innerHeight;
    const r0 = regionRadiusPx(W0, H0);
    const regionsFor = (W: number, H: number) => {
      const diag2 = (W * W + H * H) / 4;
      const r = regionRadiusPx(W, H);
      return Math.min(MAX_REGIONS, Math.max(3, Math.round(diag2 / (r * r * 0.85))));
    };
    const perGen = regionsFor(W0, H0);
    const dpr0 = Math.min(window.devicePixelRatio || 1, 1.5);
    const texSize = Math.max(256, Math.min(512, Math.round((r0 * 2 * dpr0) / 64) * 64));
    // Enough for every photo when there are few; otherwise ~3 generations' worth.
    const layers = Math.max(1, Math.min(photos.length, 3 * perGen));

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.floor(Math.log2(texSize)) + 1, gl.RGBA8, texSize, texSize, layers);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    let disposed = false;
    let now = 0;
    const layerPhoto = new Int32Array(layers).fill(-1);
    const layerState = new Uint8Array(layers);   // 0 loading, 1 ready, 2 failed
    const layerUsed = new Float64Array(layers);
    const layerToken = new Int32Array(layers);
    const bad = new Set<number>();
    const isFree = (l: number) => layerPhoto[l] === -1 || layerState[l] === 2;
    const scratch = document.createElement("canvas");
    scratch.width = scratch.height = texSize;
    const sctx = scratch.getContext("2d");

    // Two decodes at a time: full-size photos are big when decoded.
    const queue: { layer: number; photo: number; tok: number }[] = [];
    let inFlight = 0;
    const pump = () => {
      while (inFlight < 2 && queue.length) {
        const { layer, photo, tok } = queue.shift()!;
        if (tok !== layerToken[layer]) continue;
        inFlight++;
        const img = new Image();
        img.decoding = "async";
        img.src = photos[photo].noHero ? photos[photo].src : heroSrc(photos[photo].src);
        img.decode().then(() => {
          if (disposed || tok !== layerToken[layer] || !sctx) return;
          // Cover-crop to a square around the photo's focal point.
          const { sx, sy, s } = focusCrop(img.naturalWidth, img.naturalHeight, photos[photo].focus);
          sctx.drawImage(img, sx, sy, s, s, 0, 0, texSize, texSize);
          gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
          gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, texSize, texSize, 1, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
          gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
          layerState[layer] = 1;
        }).catch(() => {
          // Missing or broken photo: never pick it again. Generations holding
          // this layer swap it for a loaded photo before they are shown.
          bad.add(photo);
          if (tok === layerToken[layer]) layerState[layer] = 2;
        }).finally(() => {
          inFlight--;
          if (!disposed) pump();
        });
      }
    };
    const loadInto = (layer: number, photo: number) => {
      layerPhoto[layer] = photo;
      layerState[layer] = 0;
      layerUsed[layer] = now;
      queue.push({ layer, photo, tok: ++layerToken[layer] });
      pump();
    };

    // --- slots ---
    const slots: Slot[] = Array.from({ length: SLOTS }, () => ({
      gen: null, live: false, rank: 0, ox: 0, oy: 0, t0: 0, speed: 1, end: 0,
    }));
    let rankCounter = 0;
    const layersInUse = () => {
      const used = new Set<number>();
      for (const s of slots) if (s.gen) for (const l of s.gen.layers) if (l >= 0) used.add(l);
      return used;
    };
    const newestLive = () => {
      let best: Slot | null = null;
      for (const s of slots) if (s.gen && s.live && (!best || s.rank > best.rank)) best = s;
      return best;
    };

    // A layer holding `photo`, loading it into a free layer if needed (-1 = no room).
    const ensure = (photo: number) => {
      for (let l = 0; l < layers; l++) {
        if (layerPhoto[l] === photo && layerState[l] !== 2) { layerUsed[l] = now; return l; }
      }
      const used = layersInUse();
      let pick = -1;
      for (let l = 0; l < layers; l++) {
        if (used.has(l)) continue;
        if (isFree(l)) { pick = l; break; }
        if (pick < 0 || layerUsed[l] < layerUsed[pick]) pick = l;
      }
      if (pick >= 0) loadInto(pick, photo);
      return pick;
    };
    // A ready layer to stand in for one still loading: prefer photos not on
    // screen right now, and spread the picks.
    const fallback = (avoid: Set<number>, k: number) => {
      const ready: number[] = [];
      for (let l = 0; l < layers; l++) if (layerState[l] === 1 && layerPhoto[l] >= 0) ready.push(l);
      if (!ready.length) return -1;
      const fresh = ready.filter((l) => !avoid.has(layerPhoto[l]));
      const list = fresh.length ? fresh : ready;
      return list[k % list.length];
    };

    // Start at the top of the list: the first set is what the page preloads.
    let nextPhoto = 0;
    const takePhoto = () => {
      const i = nextPhoto;
      nextPhoto = (nextPhoto + 1) % photos.length;
      return i;
    };

    // Photos of the regions currently on screen, which the next generation
    // should not repeat.
    const onScreenPhotos = () => {
      const gen = newestLive()?.gen;
      return new Set<number>(gen ? Array.from(gen.photos).slice(0, gen.visible) : []);
    };
    const pickPhoto = (avoid: Set<number>) => {
      for (let i = 0; i < photos.length; i++) {
        const p = takePhoto();
        if (!avoid.has(p) && !bad.has(p)) return p;
      }
      for (let i = 0; i < photos.length; i++) {
        const p = takePhoto();
        if (!bad.has(p)) return p;
      }
      return takePhoto();
    };

    // Background prefetch: fill empty layers with upcoming photos.
    let prefetchNext = -1;
    const prefetch = () => {
      if (queue.length || inFlight >= 2) return;
      const used = layersInUse();
      for (let l = 0; l < layers; l++) {
        if (!isFree(l) || used.has(l)) continue;
        if (prefetchNext < 0) prefetchNext = nextPhoto;
        for (let tries = 0; tries < photos.length; tries++) {
          const p = prefetchNext;
          prefetchNext = (prefetchNext + 1) % photos.length;
          if (!bad.has(p) && !layerPhoto.includes(p)) { loadInto(l, p); return; }
        }
        return;
      }
    };

    // --- view transform (formula ported from the shader, which now gets the result) ---
    let ang = 0, scale = 1, baseScale = 1;
    const updateView = (t: number) => {
      const sc = scrollRef.current;
      const aspect = canvas.width / canvas.height;
      ang = (sc * 0.00016 + t * 0.006) * motion;
      const zoom = 1.0 + motion * 0.06 * (0.5 + 0.5 * Math.sin(sc * 0.0005 + t * 0.03));
      const cover = Math.sqrt(aspect * aspect + 1.0) / 0.9;
      const tilePx = g.edgeLen * cover * (canvas.clientHeight / 2);
      const tileZoom = tilePx > 0 ? Math.max(1, MIN_TILE_PX / tilePx) : 1;
      baseScale = cover * tileZoom;
      scale = baseScale * zoom;
    };
    // Screen px from canvas centre (y up) → tiling space.
    const toTiling = (px: number, py: number): Pt => {
      const half = canvas.clientHeight / 2;
      const c = Math.cos(ang), s = Math.sin(ang);
      const sx = px / half / scale, sy = py / half / scale;
      return [c * sx - s * sy, s * sx + c * sy];
    };
    // Radius of the tiling that can ever be on screen (rotation is about the
    // centre, zoom only ever goes in).
    const visRadius = () => {
      const W = canvas.clientWidth || W0, H = canvas.clientHeight || H0;
      return Math.hypot(W, H) / 2 / (H / 2) / baseScale;
    };

    // --- generations ---
    let genNum = 0;
    const buildGen = (slotIdx: number): Gen => {
      genNum++;
      const count = perGen;
      const Rv = visRadius();

      // Seeds: best-candidate sampling in the visible disk, so regions come
      // out roughly even in size.
      const sx: number[] = [], sy: number[] = [];
      for (let i = 0; i < count; i++) {
        let bx = 0, by = 0, bd = -1;
        for (let c = 0; c < 24; c++) {
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * Rv * 0.95;
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
          let d = Infinity;
          for (let j = 0; j < sx.length; j++) d = Math.min(d, Math.hypot(x - sx[j], y - sy[j]));
          if (d > bd) { bd = d; bx = x; by = y; }
        }
        sx.push(bx); sy.push(by);
      }
      // Regions on screen first (seed inside the hero, with some margin since
      // a cell spreads past its seed), nearest the centre first: they get
      // first pick of photos, and the first set waits only for them.
      const W = canvas.clientWidth || W0, H = canvas.clientHeight || H0;
      const half = H / 2, margin = 0.5 * regionRadiusPx(W, H);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const onScreen = sx.map((x, i) => {
        const px = (ca * x + sa * sy[i]) * scale * half, py = (-sa * x + ca * sy[i]) * scale * half;
        return Math.abs(px) < W / 2 + margin && Math.abs(py) < H / 2 + margin;
      });
      const order = sx.map((_, i) => i).sort((a, b) =>
        (Number(onScreen[b]) - Number(onScreen[a])) || Math.hypot(sx[a], sy[a]) - Math.hypot(sx[b], sy[b]));
      const visible = onScreen.filter(Boolean).length;
      const ox = order.map((i) => sx[i]), oy = order.map((i) => sy[i]);
      sx.splice(0, count, ...ox);
      sy.splice(0, count, ...oy);

      // Voronoi over rhombus centres, lightly jittered so borders wander.
      const regOf = new Int16Array(g.rhombusCount);
      for (let i = 0; i < g.rhombusCount; i++) {
        let best = 0, bd = Infinity;
        for (let j = 0; j < count; j++) {
          const h = Math.sin(i * 12.9898 + j * 78.233 + genNum * 37.719) * 43758.5453;
          const d = Math.hypot(g.rCx[i] - sx[j], g.rCy[i] - sy[j]) * (1 + 0.12 * (h - Math.floor(h)));
          if (d < bd) { bd = d; best = j; }
        }
        regOf[i] = best;
        for (const ti of g.rTris[i]) {
          for (let v = 0; v < 3; v++) regData[(ti * 3 + v) * SLOTS + slotIdx] = best;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, regBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, regData);
      for (let e = 0; e < g.edgeCount / 2; e++) {
        const a = g.edgeRh[e * 2], b = g.edgeRh[e * 2 + 1];
        for (let v = 0; v < 2; v++) {
          const k = (e * 2 + v) * SLOTS * 2;
          edgeData[k + slotIdx] = regOf[a];
          edgeData[k + SLOTS + slotIdx] = b >= 0 ? regOf[b] : -1;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, edgeRegBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, edgeData);

      // Each region's photo frame: upright now, covering the region's visible box.
      const c = Math.cos(ang), s = Math.sin(ang);
      const minX = new Float32Array(count).fill(Infinity), minY = new Float32Array(count).fill(Infinity);
      const maxX = new Float32Array(count).fill(-Infinity), maxY = new Float32Array(count).fill(-Infinity);
      for (let i = 0; i < g.rhombusCount; i++) {
        const rg = regOf[i];
        for (const ti of g.rTris[i]) {
          for (let v = 0; v < 3; v++) {
            const x = g.pos[ti * 6 + v * 2], y = g.pos[ti * 6 + v * 2 + 1];
            if (x * x + y * y > Rv * Rv) continue;
            const ux = c * x + s * y, uy = -s * x + c * y;
            if (ux < minX[rg]) minX[rg] = ux;
            if (ux > maxX[rg]) maxX[rg] = ux;
            if (uy < minY[rg]) minY[rg] = uy;
            if (uy > maxY[rg]) maxY[rg] = uy;
          }
        }
      }
      const frames = new Float32Array(MAX_REGIONS * 4);
      for (let j = 0; j < count; j++) {
        if (!isFinite(minX[j])) { frames.set([0, 0, 1, 0], j * 4); continue; }
        const half = Math.max(maxX[j] - minX[j], maxY[j] - minY[j]) / 2;
        frames.set([(minX[j] + maxX[j]) / 2, (minY[j] + maxY[j]) / 2, half * 1.02, 0], j * 4);
      }

      // Photos: next in the list; if the cache is full, reuse a loaded one.
      const gen: Gen = { count, visible, layers: new Int32Array(count).fill(-1), photos: new Int32Array(count), frames, ang };
      slots[slotIdx].gen = gen; // so ensure() treats layers picked so far as in use
      const avoid = onScreenPhotos();
      for (let j = 0; j < count; j++) {
        const p = pickPhoto(avoid);
        let l = ensure(p);
        if (l < 0) l = fallback(avoid, j);
        gen.layers[j] = l;
        gen.photos[j] = l >= 0 ? layerPhoto[l] : p;
        avoid.add(gen.photos[j]);
        frames[j * 4 + 3] = Math.max(0, l);
      }
      return gen;
    };

    const genReady = (gen: Gen) => {
      for (const l of gen.layers) if (l < 0 || layerState[l] !== 1) return false;
      return true;
    };
    // Swap any region still loading for a photo that is already loaded.
    const makeReady = (gen: Gen) => {
      const avoid = onScreenPhotos();
      for (let j = 0; j < gen.count; j++) {
        const l = gen.layers[j];
        if (l >= 0 && layerState[l] === 1) { avoid.add(gen.photos[j]); continue; }
      }
      for (let j = 0; j < gen.count; j++) {
        const l = gen.layers[j];
        if (l >= 0 && layerState[l] === 1) continue;
        const f = fallback(avoid, j);
        if (f < 0) return false;
        gen.layers[j] = f;
        gen.photos[j] = layerPhoto[f];
        avoid.add(layerPhoto[f]);
        gen.frames[j * 4 + 3] = f;
      }
      return true;
    };

    // Regions whose photo failed to load take an already-loaded photo instead.
    const swapFailed = (gen: Gen) => {
      const avoid = onScreenPhotos();
      for (let j = 0; j < gen.count; j++) {
        const l = gen.layers[j];
        if (l >= 0 && layerState[l] !== 2) continue;
        const f = fallback(avoid, j);
        if (f < 0) continue;
        gen.layers[j] = f;
        gen.photos[j] = layerPhoto[f];
        gen.frames[j * 4 + 3] = f;
      }
    };

    const pendingSlot = () => slots.find((s) => s.gen && !s.live) ?? null;
    const ensurePending = () => {
      if (!photos.length || pendingSlot()) return;
      const free = slots.findIndex((s) => !s.gen);
      if (free < 0) return;
      buildGen(free);
      slots[free].live = false;
    };
    // A ring that has passed every tile hides all older generations: free them.
    const retire = (t: number) => {
      for (const r of slots) {
        if (!r.gen || !r.live || t < r.end) continue;
        for (const o of slots) {
          if (o.gen && o.live && o.rank < r.rank) { o.gen = null; o.live = false; }
        }
      }
    };
    const startRing = (s: Slot, x: number, y: number, ringSeconds: number, t: number) => {
      const Rv = visRadius();
      s.live = true;
      s.rank = ++rankCounter;
      s.ox = x; s.oy = y; s.t0 = t;
      s.speed = Rv / ringSeconds;
      s.end = t + (Math.hypot(x, y) + Rv) / s.speed + FLIP_DUR;
      ensurePending();
    };
    const ringRunning = (t: number) => slots.some((s) => s.gen && s.live && t < s.end);
    let lastEnd = -Infinity;

    const debug: PenroseDebug | null = process.env.NODE_ENV !== "production" ? { taps: [] } : null;
    if (debug) (window as unknown as { __penrose: PenroseDebug }).__penrose = debug;

    // The hero opens with its first set already in place (no reveal, no empty
    // lattice): the canvas stays hidden on the dark background until the
    // photos for the on-screen regions have decoded, then fades in.
    let shown = false;
    const show = () => {
      if (shown) return;
      shown = true;
      canvas.style.opacity = "1";
      if (debug) debug.firstShown = performance.now();
    };
    const SHOW_ANYWAY_S = 6; // nothing loads at all (offline, broken files)

    const stepGens = (t: number) => {
      if (!photos.length) { show(); return; }
      retire(t);
      ensurePending();
      prefetch();
      if (!newestLive()) {
        const p = pendingSlot();
        if (p) {
          swapFailed(p.gen!);
          const vis = p.gen!.visible;
          const visReady = p.gen!.layers.slice(0, vis).every((l) => l >= 0 && layerState[l] === 1);
          if (visReady && makeReady(p.gen!)) {
            startRing(p, 0, 0, AUTO_RING_S, t);
            p.t0 = -1e6;               // already fully revealed
            p.end = t;
            lastEnd = t;
            if (debug) { debug.firstVisible = vis; debug.perGen = perGen; }
            show();
          } else if (t > SHOW_ANYWAY_S) {
            show();
          }
        }
        return;
      }
      for (const s of slots) if (s.gen && s.live) lastEnd = Math.max(lastEnd, s.end);
      const p = pendingSlot();
      if (p && p.gen!.layers.some((l) => l < 0 || layerState[l] === 2)) swapFailed(p.gen!);
      if (!p || ringRunning(t)) return;
      if (t >= lastEnd + HOLD && genReady(p.gen!)) {
        // Automatic ring from a random point on screen.
        const W = canvas.clientWidth, H = canvas.clientHeight;
        const [x, y] = toTiling((Math.random() - 0.5) * W * 0.8, (Math.random() - 0.5) * H * 0.8);
        startRing(p, x, y, AUTO_RING_S, t);
      }
    };

    // A tap always starts a ring of new photos from the finger. If every slot
    // is busy with rings still spreading, the oldest one finishes instantly.
    const tap = (px: number, py: number) => {
      if (!photos.length) return;
      const t = now;
      retire(t);
      ensurePending();
      if (!pendingSlot()) {
        let oldest: Slot | null = null;
        for (const s of slots) {
          if (s.gen && s.live && t < s.end && (!oldest || s.rank < oldest.rank)) oldest = s;
        }
        if (oldest) { oldest.t0 = -1e6; oldest.end = t; }
        retire(t);
        ensurePending();
      }
      const p = pendingSlot();
      const wasReady = !!p && genReady(p.gen!);
      if (!p || !makeReady(p.gen!)) return; // nothing loaded at all yet
      const prevGen = newestLive()?.gen;
      const prev = prevGen ? Array.from(prevGen.photos).slice(0, prevGen.visible) : [];
      const [x, y] = toTiling(px, py);
      startRing(p, x, y, TAP_RING_S, t);
      debug?.taps.push({
        t, ready: genReady(p.gen!), wasReady,
        photos: Array.from(p.gen!.photos).slice(0, p.gen!.visible), prevPhotos: prev,
      });
    };

    // --- pointer: click/tap starts a ring, hover lifts tiles ---
    const hover = { x: 0, y: 0, s: 0, target: 0 };
    const host = canvas.parentElement;
    const local = (e: MouseEvent): Pt => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left - r.width / 2, r.top + r.height / 2 - e.clientY];
    };
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest("a,button")) return;
      const [x, y] = local(e);
      tap(x, y);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const [x, y] = local(e);
      const [tx, ty] = toTiling(x, y);
      hover.x = tx; hover.y = ty; hover.target = 1;
    };
    const onLeave = () => { hover.target = 0; };
    if (host) {
      host.addEventListener("click", onClick);
      if (!reduce) {
        host.addEventListener("pointermove", onMove, { passive: true });
        host.addEventListener("pointerleave", onLeave, { passive: true });
      }
    }

    // --- sizing ---
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const uSlot = new Float32Array(SLOTS * 4);
    const uSlotB = new Float32Array(SLOTS * 4);
    const uFrame = new Float32Array(SLOTS * MAX_REGIONS * 4);

    let raf = 0;
    let visible = true;
    const start = performance.now();

    const render = (ms: number) => {
      if (!visible) return;
      resize();
      const t = (ms - start) / 1000;
      now = t;
      updateView(t);
      stepGens(t);
      hover.s += (hover.target - hover.s) * 0.08;

      for (let i = 0; i < SLOTS; i++) {
        const s = slots[i];
        const live = !!s.gen && s.live;
        uSlot.set([s.ox, s.oy, s.t0, s.speed], i * 4);
        uSlotB.set([s.rank, s.gen ? s.gen.ang : 0, live ? 1 : 0, 0], i * 4);
        if (s.gen) uFrame.set(s.gen.frames, i * MAX_REGIONS * 4);
      }

      gl.clearColor(0.02, 0.012, 0.06, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(prog);
      gl.uniform1f(loc.uTime, t);
      gl.uniform1f(loc.uAspect, canvas.width / canvas.height);
      gl.uniform1f(loc.uMotion, motion);
      gl.uniform1f(loc.uAng, ang);
      gl.uniform1f(loc.uScale, scale);
      gl.uniform4fv(loc.uSlot, uSlot);
      gl.uniform4fv(loc.uSlotB, uSlotB);
      gl.uniform4fv(loc.uFrame, uFrame);
      gl.uniform3f(loc.uHover, hover.x, hover.y, hover.s);
      gl.uniform1f(loc.uHoverR, HOVER_TILES * g.edgeLen);
      gl.uniform2f(loc.uHalfPx, canvas.clientWidth / 2, canvas.clientHeight / 2);
      gl.uniform2f(loc.uKeep, Math.min(330, canvas.clientWidth / 2), 150);
      gl.uniform1i(loc.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);

      gl.bindVertexArray(fillVAO);
      gl.uniform1f(loc.uPass, 0);
      gl.drawArrays(gl.TRIANGLES, 0, g.vertCount);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      if (newestLive()) {
        gl.uniform1f(loc.uPass, 1);
        gl.drawArrays(gl.TRIANGLES, 0, g.vertCount);
      }

      gl.uniform1f(loc.uPass, 2);
      gl.bindVertexArray(edgeVAO);
      gl.drawArrays(gl.LINES, 0, g.edgeCount);
      gl.disable(gl.BLEND);

      gl.bindVertexArray(null);

      raf = requestAnimationFrame(render);
    };

    const onScroll = () => {
      scrollRef.current = Math.max(-1e6, Math.min(1e6, window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();

    // Only render while the hero is on screen.
    const io = new IntersectionObserver((entries) => {
      const v = entries[entries.length - 1].isIntersecting;
      if (v && !visible) raf = requestAnimationFrame(render);
      if (!v) cancelAnimationFrame(raf);
      visible = v;
    });
    io.observe(canvas);
    raf = requestAnimationFrame(render);

    return () => {
      disposed = true;
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (host) {
        host.removeEventListener("click", onClick);
        host.removeEventListener("pointermove", onMove);
        host.removeEventListener("pointerleave", onLeave);
      }
      for (const b of buffers) gl.deleteBuffer(b);
      gl.deleteTexture(tex);
      gl.deleteVertexArray(fillVAO);
      gl.deleteVertexArray(edgeVAO);
      gl.deleteProgram(prog);
    };
  }, [photos]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        display: "block",
        width: "100%",
        height: "100%",
        background: "#05030f",
        pointerEvents: "none",
        opacity: 0,
        transition: "opacity 0.35s ease-out",
      }}
    />
  );
}
