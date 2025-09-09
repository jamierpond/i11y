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

// rotate a 2D vector by angle a
mat2 rot(float a){
  float c = cos(a), s = sin(a);
  return mat2(c,-s,s,c);
}

void main(){
  // Normalized coords centered at 0 with aspect correction
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // Map scroll to quasi‑infinite zoom + slow rotation
  float z = 1.0 + u_scroll * 0.0006;       // zoom factor driven by scroll
  float ang = u_scroll * 0.0002;           // slight rotation as you scroll
  uv = rot(ang) * (uv * z);

  // Add slow drift so it never feels static
  uv += 0.03 * vec2(sin(u_time*0.25), cos(u_time*0.2));

  // Penrose tiling via de Bruijn grid method
  float k = 10.0; // density of the tiling
  
  float min_dist = 1.0;
  for (int i = 0; i < 5; i++) {
    float angle = float(i) * 2.0 * 3.14159265359 / 5.0; // 72 degrees
    vec2 dir = vec2(cos(angle), sin(angle));
    // Project p onto dir, take fractional part, find distance to center of band (0.5)
    float dist = abs(fract(dot(uv * k, dir)) - 0.5);
    min_dist = min(min_dist, dist);
  }

  // min_dist is the distance to the nearest line in the 5 grids.
  // This creates the characteristic rhombus shapes.
  // We can draw the lines by checking if min_dist is small.
  float lines = 1.0 - smoothstep(0.0, u_lineWidth, min_dist);

  // Optional edge glow for crispness
  float glow = smoothstep(0.0, 1.0, lines) * 0.8;

  // Final color: slate background with light lines
  vec3 bg = vec3(0.06, 0.07, 0.1);
  vec3 fg = vec3(0.95, 0.97, 1.0);
  vec3 col = mix(bg, fg, lines) + glow * 0.05;

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

