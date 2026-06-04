"use client";

// Real, aperiodic Penrose (P3) tiling — geometry computed once on the CPU,
// animated on the GPU via a tiny raw-WebGL2 shader. No Three.js.
//
// Division of labour (this is the whole trick to making it fast + alive):
//   • CPU, once on mount: Robinson-triangle deflation builds a genuine Penrose
//     tiling (golden-ratio subdivision preserves the matching rules; the
//     fat:thin rhombus count converges to exactly φ). Uploaded to the GPU once.
//   • GPU, every frame: the shader only *colours and moves* that fixed geometry
//     — a disco hue cycle + travelling brightness waves, plus a scroll-driven
//     rotate/zoom. Recolouring existing vertices is effectively free, so it
//     holds 60fps on phones.
//
// Rendering to a <canvas> in useEffect (client only) also means there is no
// server-rendered markup to hydrate, so no hydration mismatch.

import React, { useEffect, useRef } from "react";

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
  cls: Float32Array;      // orientation class 0..9 (drives hue)
  centroid: Float32Array; // 2 floats / vertex (per-tile, for colour waves)
  vertCount: number;
  edgePos: Float32Array;  // 2 floats / vertex, 2 verts / segment (rhombus edges)
  edgeCount: number;
};

function buildGeometry(): Geometry {
  let tris = buildWheel();
  for (let i = 0; i < DEPTH; i++) tris = deflate(tris);

  const n = tris.length;
  const pos = new Float32Array(n * 6);
  const type = new Float32Array(n * 3);
  const cls = new Float32Array(n * 3);
  const centroid = new Float32Array(n * 6);

  const seenEdge = new Set<string>();
  const edges: number[] = [];
  const ek = (p: Pt, q: Pt) => {
    const r = (v: number) => Math.round(v * 1e4);
    const ka = `${r(p[0])},${r(p[1])}`;
    const kb = `${r(q[0])},${r(q[1])}`;
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };

  for (let i = 0; i < n; i++) {
    const { t, a, b, c } = tris[i];
    const tri: [Pt, Pt][] = [[a, b], [b, c], [c, a]];
    const len = tri.map(([p, q]) => Math.hypot(p[0] - q[0], p[1] - q[1]));
    const order = [0, 1, 2].sort((x, y) => len[x] - len[y]);
    // The two equal sides are the rhombus edges; the odd one is the diagonal.
    const legs = t === 0 ? [order[1], order[2]] : [order[0], order[1]];
    const baseIdx = t === 0 ? order[0] : order[2]; // the diagonal we share with our twin

    // Orientation class from the average leg direction (folded to a half-circle
    // so both triangles of a rhombus agree).
    let sx = 0, sy = 0;
    for (const li of legs) {
      const [p, q] = tri[li];
      let dx = q[0] - p[0], dy = q[1] - p[1];
      if (dy < 0 || (dy === 0 && dx < 0)) { dx = -dx; dy = -dy; }
      const l = Math.hypot(dx, dy);
      sx += dx / l; sy += dy / l;
    }
    let ang = Math.atan2(sy, sx);
    if (ang < 0) ang += Math.PI;
    const orient = Math.round((ang / Math.PI) * 10) % 10;

    // Colour anchor = the rhombus centre, i.e. the midpoint of the shared
    // diagonal. Both triangles of a rhombus share this point, so they take the
    // same colour and the rhombus reads as ONE tile (not split along the diagonal).
    const [bp, bq] = tri[baseIdx];
    const cx = (bp[0] + bq[0]) / 2;
    const cy = (bp[1] + bq[1]) / 2;

    const vi = i * 6;
    pos[vi] = a[0]; pos[vi + 1] = a[1];
    pos[vi + 2] = b[0]; pos[vi + 3] = b[1];
    pos[vi + 4] = c[0]; pos[vi + 5] = c[1];
    for (let k = 0; k < 3; k++) {
      type[i * 3 + k] = t;
      cls[i * 3 + k] = orient;
      centroid[vi + k * 2] = cx;
      centroid[vi + k * 2 + 1] = cy;
    }

    for (const li of legs) {
      const [p, q] = tri[li];
      const key = ek(p, q);
      if (!seenEdge.has(key)) {
        seenEdge.add(key);
        edges.push(p[0], p[1], q[0], q[1]);
      }
    }
  }

  return {
    pos, type, cls, centroid,
    vertCount: n * 3,
    edgePos: new Float32Array(edges),
    edgeCount: edges.length / 2,
  };
}

/* -------------------------------------------------------------------- shaders */

const VERT = `#version 300 es
precision highp float;
in vec2 aPos;
in float aType;
in vec2 aCentroid;
uniform float uTime;
uniform float uScroll;
uniform float uAspect;
uniform float uMotion;
out float vType;
out vec2 vCenter;   // tile centroid in screen space (constant per tile -> flat)
out vec2 vScreen;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main(){
  // Slow ambient drift + scroll gently rotate / zoom the tiling. We only ever
  // zoom *in*, so the unit patch always covers the viewport (no exposed edges).
  // uMotion gates all of this for prefers-reduced-motion.
  float ang  = (uScroll * 0.00016 + uTime * 0.006) * uMotion;
  float zoom = 1.0 + uMotion * 0.06 * (0.5 + 0.5 * sin(uScroll * 0.0005 + uTime * 0.03));
  float cover = sqrt(uAspect * uAspect + 1.0) / 0.9;
  float scale = cover * zoom;

  mat2 R = rot(ang);
  vec2 p  = R * aPos;
  vec2 cp = R * aCentroid;                       // same transform as position
  gl_Position = vec4(vec2(p.x / uAspect, p.y) * scale, 0.0, 1.0);
  vScreen = gl_Position.xy;
  vCenter = vec2(cp.x / uAspect, cp.y) * scale;  // flat across the triangle

  vType = aType;
}`;

const FRAG = `#version 300 es
precision highp float;
in float vType;
in vec2 vCenter;
in vec2 vScreen;
uniform float uTime;
uniform float uScroll;
uniform float uIsEdge;
uniform float uMotion;
out vec4 frag;

// Curated, moody gradient (deep violet -> magenta -> pink -> teal -> deep blue),
// in the spirit of the real wall's hand-picked palettes. Loops seamlessly.
vec3 palette(float x){
  x = fract(x);
  vec3 c0 = vec3(0.09, 0.02, 0.20);
  vec3 c1 = vec3(0.66, 0.02, 0.46);
  vec3 c2 = vec3(0.93, 0.28, 0.80);
  vec3 c3 = vec3(0.02, 0.58, 0.58);
  vec3 c4 = vec3(0.05, 0.07, 0.30);
  vec3 cs[6] = vec3[6](c0, c1, c2, c3, c4, c0);
  float s = x * 5.0;
  int i = int(floor(s));
  return mix(cs[i], cs[i + 1], s - float(i));
}

void main(){
  if (uIsEdge > 0.5){
    // Thin, near-black rhombus outlines for that stained-glass definition.
    frag = vec4(0.01, 0.006, 0.02, 0.5);
    return;
  }

  vec2 s = vCenter;
  float sc = uScroll * 0.0010;

  // The wall's "Ripple": concentric palette bands expanding from the centre,
  // with a second offset source for organic interference. No beat, no strobe —
  // a slow, hypnotic wave from the middle.
  float RINGS = 5.0;   // ring density
  float SPD   = 0.28;  // outward speed
  float d1 = length(s);
  float d2 = length(s - vec2(0.62, -0.34));
  float field = (d1 * RINGS - uTime * SPD)
              + 0.5 * (d2 * RINGS - uTime * SPD * 0.9);

  // vType nudges the two rhombus kinds onto slightly different palette stops
  // (echoing the wall's Pulse effect), giving the tiling its two-tone texture.
  float x = field + vType * 0.06 + sc + uTime * 0.012;
  vec3 col = palette(x);

  // Moody: a slow breath, plus a centre vignette so the headline sits on a
  // calmer, darker bed.
  float breath = 0.9 + 0.1 * sin(uTime * 0.4);
  float vign = smoothstep(0.0, 1.1, length(vScreen));
  col *= breath * mix(0.5, 1.0, vign);

  frag = vec4(col, 1.0);
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

export function PenroseScroll() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef(0);

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

    const loc = {
      aPos: gl.getAttribLocation(prog, "aPos"),
      aType: gl.getAttribLocation(prog, "aType"),
      aCentroid: gl.getAttribLocation(prog, "aCentroid"),
      uTime: gl.getUniformLocation(prog, "uTime"),
      uScroll: gl.getUniformLocation(prog, "uScroll"),
      uAspect: gl.getUniformLocation(prog, "uAspect"),
      uIsEdge: gl.getUniformLocation(prog, "uIsEdge"),
      uMotion: gl.getUniformLocation(prog, "uMotion"),
    };

    // Reduced motion only damps the geometric motion (spin/zoom/shockwave);
    // the colours still pulse so the page never looks frozen.
    const motion = reduce ? 0.0 : 1.0;

    // --- geometry → buffers ---
    const g = buildGeometry();
    const mkBuf = (data: Float32Array) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    };
    const posBuf = mkBuf(g.pos);
    const typeBuf = mkBuf(g.type);
    const centBuf = mkBuf(g.centroid);
    const edgeBuf = mkBuf(g.edgePos);

    // Fill VAO
    const fillVAO = gl.createVertexArray();
    gl.bindVertexArray(fillVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, typeBuf);
    gl.enableVertexAttribArray(loc.aType);
    gl.vertexAttribPointer(loc.aType, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, centBuf);
    gl.enableVertexAttribArray(loc.aCentroid);
    gl.vertexAttribPointer(loc.aCentroid, 2, gl.FLOAT, false, 0, 0);

    // Edge VAO (only position; other attribs stay constant — ignored by shader)
    const edgeVAO = gl.createVertexArray();
    gl.bindVertexArray(edgeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuf);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // --- sizing ---
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    let raf = 0;
    const start = performance.now();

    const render = (now: number) => {
      resize();
      const t = (now - start) / 1000;

      gl.clearColor(0.02, 0.012, 0.06, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(prog);
      gl.uniform1f(loc.uTime, t);
      gl.uniform1f(loc.uScroll, scrollRef.current);
      gl.uniform1f(loc.uAspect, canvas.width / canvas.height);
      gl.uniform1f(loc.uMotion, motion);

      gl.uniform1f(loc.uIsEdge, 0);
      gl.bindVertexArray(fillVAO);
      gl.drawArrays(gl.TRIANGLES, 0, g.vertCount);

      gl.uniform1f(loc.uIsEdge, 1);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(typeBuf);
      gl.deleteBuffer(centBuf);
      gl.deleteBuffer(edgeBuf);
      gl.deleteVertexArray(fillVAO);
      gl.deleteVertexArray(edgeVAO);
      gl.deleteProgram(prog);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        display: "block",
        width: "100%",
        height: "100%",
        background: "#05030f",
        pointerEvents: "none",
      }}
    />
  );
}
