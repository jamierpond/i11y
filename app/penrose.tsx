// Quick start
// 1) npm i react react-dom three @react-three/fiber
// 2) Drop this component in your app and render <PenroseScroll /> somewhere full-screen.
// 3) Scroll the page. The quasicrystal (Penrose-like) pattern will respond smoothly and feels infinite.
//
// Notes
// • This uses a quasicrystal shader (10‑fold symmetry) which visually resembles Penrose tiling without constructing discrete rhombs.
// • If you absolutely need exact kites/rhombs, you’ll need a de Bruijn grid or cut‑and‑project implementation; that’s heavier and not shown here.
// • Scroll drives scale, rotation, and line thresholding so it feels like you’re diving through an infinite tiling.

import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";

// Fragment shader: 10‑fold symmetric quasicrystal made from 5 plane waves (and their opposites)
// We emphasize linework by taking the absolute of summed cosines and sharpening with smoothstep.
const frag = /* glsl */`
precision highp float;

uniform vec2 u_resolution;     // canvas size in pixels
uniform float u_time;          // seconds
uniform float u_scroll;        // mapped scroll (pixels)
uniform float u_lineWidth;     // thin lines threshold

// Colors
uniform vec3 u_color_line;
uniform vec3 u_color_thick_tri1;
uniform vec3 u_color_thick_tri2;
uniform vec3 u_color_thin_tri1;
uniform vec3 u_color_thin_tri2;

// rotate a 2D vector by angle a
mat2 rot(float a){
  float c = cos(a), s = sin(a);
  return mat2(c,-s,s,c);
}

// --- HSV/RGB Conversion Helpers ---
// From https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main(){
  // Normalized coords centered at 0 with aspect correction
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // --- Scroll-based effects ---
  // 1. Oscillating zoom that doesn't get too far away
  // It oscillates twice over a scroll distance of about 5000px.
  // The maximum additional zoom is capped to prevent tiles from becoming too small.
  float scroll_norm = u_scroll / 5000.0; // Normalize scroll for easier frequency control
  float freq = 2.0; // 2 cycles over the normalized distance
  float max_zoom_factor = tanh(scroll_norm * 2.0) * 2.5; // Limits max additional zoom to ~2.5
  float oscillation = (sin(scroll_norm * freq * 2.0 * 3.14159) + 1.0) / 2.0; // range [0, 1]
  float z = 1.0 + max_zoom_factor * oscillation;
  uv = uv * z;

  // 2. Faster, more intense kaleidoscopic rotation
  const float K_PI = 3.14159265359;
  float segments = 5.0;
  float scroll_rot = u_scroll * 0.001; // Increased rotation speed
  float angle = atan(uv.y, uv.x) + scroll_rot;
  float r = length(uv);
  float segment_angle = 2.0 * K_PI / segments;
  angle = mod(angle, segment_angle);
  angle = abs(angle - segment_angle / 2.0);
  uv.x = r * cos(angle);
  uv.y = r * sin(angle);
  
  // 3. Base rotation (slower)
  float ang = u_scroll * 0.0002;
  uv = rot(ang) * uv;

  // Add slow drift so it never feels static
  uv += 0.03 * vec2(sin(u_time*0.25), cos(u_time*0.2));

  // --- Penrose Tiling using a dual-grid (de Bruijn) method ---
  float k = 12.0; // Tiling density
  vec2 p = uv * k;

  // Five basis vectors
  const float PI = 3.14159265359;
  vec2 e[5];
  e[0] = vec2(cos(0.0 * 2.0 * PI / 5.0), sin(0.0 * 2.0 * PI / 5.0));
  e[1] = vec2(cos(1.0 * 2.0 * PI / 5.0), sin(1.0 * 2.0 * PI / 5.0));
  e[2] = vec2(cos(2.0 * 2.0 * PI / 5.0), sin(2.0 * 2.0 * PI / 5.0));
  e[3] = vec2(cos(3.0 * 2.0 * PI / 5.0), sin(3.0 * 2.0 * PI / 5.0));
  e[4] = vec2(cos(4.0 * 2.0 * PI / 5.0), sin(4.0 * 2.0 * PI / 5.0));

  // Add a phase shift (gamma) to center the pattern and create global symmetry
  float gamma = 0.5;

  // For each of the 5 grids, calculate the projection of our point p.
  float V[5];
  for(int i=0; i<5; i++){
    V[i] = dot(p, e[i]) + gamma;
  }
  
  // Get the integer part (the index of the strip) and the fractional part.
  float I[5];
  float F[5];
  for(int i=0; i<5; i++){
    I[i] = floor(V[i]);
    F[i] = fract(V[i]);
  }

  // Find the two strips that are closest to being crossed.
  float min_f = 1.0;
  int min_i = 0;
  float max_f = 0.0;
  int max_i = 0;

  // Unrolled loop for GLSL 1.0 compatibility
  if(F[0] < min_f){ min_f = F[0]; min_i = 0; }
  if(F[1] < min_f){ min_f = F[1]; min_i = 1; }
  if(F[2] < min_f){ min_f = F[2]; min_i = 2; }
  if(F[3] < min_f){ min_f = F[3]; min_i = 3; }
  if(F[4] < min_f){ min_f = F[4]; min_i = 4; }

  if(F[0] > max_f){ max_f = F[0]; max_i = 0; }
  if(F[1] > max_f){ max_f = F[1]; max_i = 1; }
  if(F[2] > max_f){ max_f = F[2]; max_i = 2; }
  if(F[3] > max_f){ max_f = F[3]; max_i = 3; }
  if(F[4] > max_f){ max_f = F[4]; max_i = 4; }

  // Determine rhombus type (thick/thin)
  int d_i = abs(min_i - max_i);
  if (d_i > 2) d_i = 5 - d_i; // handle wrap-around
  bool is_thick = (d_i == 1);

  // Determine which of the two triangles within the rhombus we are in
  bool is_tri1 = min_f + max_f < 1.0;

  // 4. Hue rotation based on scroll
  vec3 baseColor;
  if (is_thick) {
      baseColor = is_tri1 ? u_color_thick_tri1 : u_color_thick_tri2;
  } else {
      baseColor = is_tri1 ? u_color_thin_tri1 : u_color_thin_tri2;
  }

  vec3 hsv = rgb2hsv(baseColor);
  hsv.x += u_scroll * 0.0001; // Apply hue rotation
  vec3 faceColor = hsv2rgb(hsv);

  // Draw the rhombus edges with a soft glow to prevent strobing
  float dist_to_edge = min(min_f, 1.0 - max_f);
  
  // Core line with a slightly softer edge
  float line_intensity = 1.0 - smoothstep(0.0, u_lineWidth * 0.15, dist_to_edge);
  
  // 5. Stable glow effect (no "breathing")
  float glow_intensity = 1.0 - smoothstep(0.0, u_lineWidth * 0.5, dist_to_edge);

  // Final color using additive blending for a glowing effect
  vec3 col = faceColor + u_color_line * line_intensity + u_color_line * glow_intensity * 0.3;

  gl_FragColor = vec4(col, 1.0);
}
`;

// Simple pass‑through vertex shader for a screen‑aligned quad
const vert = /* glsl */`
precision highp float;
void main(){
  gl_Position = vec4(position, 1.0);
}
`;

function FullscreenQuad(){
  const { size, gl } = useThree();
  const matRef = useRef();
  const scrollY = useRef(0);

  // Track scroll once globally
  useEffect(() => {
    const onScroll = () => {
      // Clamp to avoid floating overflow during marathon scrolls
      scrollY.current = Math.max(-1e6, Math.min(1e6, window.scrollY));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Build the ShaderMaterial only once
  const material = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        u_resolution: { value: new THREE.Vector2(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio()) },
        u_time: { value: 0 },
        u_scroll: { value: 0 },
        u_lineWidth: { value: 0.06 }, // smaller → thinner lines
        u_color_line: { value: new THREE.Color("#000000") },
        u_color_thick_tri1: { value: new THREE.Color("#181848") },
        u_color_thick_tri2: { value: new THREE.Color("#242460") },
        u_color_thin_tri1: { value: new THREE.Color("#302478") },
        u_color_thin_tri2: { value: new THREE.Color("#3c3090") },
      },
      // Disable depth & write for a clean full‑screen pass
      depthTest: false,
      depthWrite: false,
    });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update resolution on resize
  useEffect(() => {
    if (!material) return;
    material.uniforms.u_resolution.value.set(
      size.width * gl.getPixelRatio(),
      size.height * gl.getPixelRatio()
    );
  }, [size, gl, material]);

  // Animate time + push scroll into the shader each frame
  useFrame((_, dt) => {
    if (!material) return;
    material.uniforms.u_time.value += dt;
    material.uniforms.u_scroll.value = scrollY.current;
  });

  // A clip‑space quad (-1..1) with three vertices (two triangles collapsed via triangle strip style)
  // Here we just use a simple 2‑triangle plane in clip space.
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -1, -1, 0,
       3, -1, 0,
      -1,  3, 0,
    ]);
    g.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    return g;
  }, []);

  return (
    <mesh geometry={geom} frustumCulled={false}>
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export function PenroseScroll(){
  // Canvas fills parent. Wrap this in a full‑viewport container in your app.
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Canvas gl={{ antialias: true }} dpr={[1, 2]}>
        {/* No lights needed; it’s a pure fragment shader */}
        <FullscreenQuad />
      </Canvas>
    </div>
  );
}

