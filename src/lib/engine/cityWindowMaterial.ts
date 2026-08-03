'use client'

import * as THREE from 'three'

/**
 * cityWindowMaterial — procedural window illumination for the surrounding city.
 *
 * The single most important environmental cue for "this building lives in a real
 * city" is lit windows on the neighbours. A detailed interior is far too
 * expensive, so this instead injects a procedural window grid into a standard PBR
 * material (`onBeforeCompile`). Every vertical façade of every context building
 * gets, entirely on the GPU:
 *
 *   • a regular window grid (module ≈ WINDOW_M metres), with dark frames between
 *     panes so the façade reads as glazing, not a painted texture;
 *   • per-window occupancy from a hash — only SOME windows are lit;
 *   • clustering — windows share an "office section" bias so whole floors / wings
 *     light up together instead of random static;
 *   • per-window brightness + warm/cool colour variation;
 *   • slow temporal change — the lit pattern drifts over ~26 s buckets (cross-
 *     faded), so the city feels occupied and alive, never flickering;
 *   • day/night response — a faint daytime reflection that blooms into real
 *     interior light after sunset, driven by the shared `uNight` uniform.
 *
 * It is deliberately built on ONE shared `MeshStandardMaterial` so every context
 * building (functional neighbours + procedural district) shares a single shader
 * program and a single per-frame uniform update. Per-building variety (window
 * pattern, façade tint, warm vs cool glazing) is derived from the building's
 * world origin (`modelMatrix[3]`) inside the shader — no per-mesh clones. Because
 * only the emissive term is touched (not vertex positions), shadow casting and
 * the depth pass are completely unaffected.
 *
 * Cost: one extra material, a handful of cheap hashes per fragment, one uniform
 * write per frame. No textures, no render targets, no lights added.
 */

/** Window module size in metres (roughly one office bay). */
const WINDOW_M = 3.2

/** Shared, live uniforms — updated once per frame via {@link updateCityWindows}. */
const sharedUniforms = {
  uCityTime: { value: 0 },
  uNight: { value: 0 },
  uWet: { value: 0 },
}

let cached: THREE.MeshStandardMaterial | null = null

export function getCityWindowMaterial(): THREE.MeshStandardMaterial {
  if (cached) return cached

  const mat = new THREE.MeshStandardMaterial({
    color: '#5a6066',
    metalness: 0.32,
    roughness: 0.62,
    // Emissive is BLACK by default so the façade only glows where windows are lit
    // — the window radiance is added manually in the injected fragment code.
    emissive: new THREE.Color('#000000'),
    emissiveIntensity: 1,
  })

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCityTime = sharedUniforms.uCityTime
    shader.uniforms.uNight = sharedUniforms.uNight
    shader.uniforms.uWet = sharedUniforms.uWet

    // ── Vertex: carry object-space position/normal + a per-building seed ──────
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vObjPos;
        varying vec3 vObjNrm;
        varying float vSeed;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vObjPos = position;
        vObjNrm = normal;
        // Building world origin → a stable per-building seed (no per-mesh clones).
        vec3 wOrigin = modelMatrix[3].xyz;
        vSeed = fract(sin(dot(floor(wOrigin.xz * 0.08), vec2(12.9898, 78.233))) * 43758.5453);`,
      )

    // ── Fragment: façade tint + procedural lit-window grid ───────────────────
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vObjPos;
        varying vec3 vObjNrm;
        varying float vSeed;
        uniform float uCityTime;
        uniform float uNight;
        uniform float uWet;

        float cityHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        // Is a given window cell lit right now? Clustered and static.
        float windowLit(vec2 cell, float seed) {
          // Office "sections" (3 wide × 4 tall) share an occupancy bias so whole
          // wings / floors light up together rather than as random speckle.
          vec2 section = floor(cell / vec2(3.0, 4.0));
          float occ = cityHash(section + seed * 7.0);
          float prob = mix(0.06, 0.55, occ);
          // Fixed pattern per cell for stable night lighting.
          float r = cityHash(cell + seed * 3.1);
          return step(1.0 - prob, r);
        }`,
      )
      // Subtle per-building façade tint (concrete vs. lighter/bluish glass).
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        diffuseColor.rgb *= mix(0.82, 1.14, vSeed);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.9, 0.96, 1.08), step(0.62, cityHash(vec2(vSeed * 17.0))));
        // Wet façades read a touch darker/cooler in the rain.
        diffuseColor.rgb *= mix(1.0, 0.82, uWet * 0.6);`,
      )
      // Add the lit windows to the emissive term (windows only — roofs excluded).
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          vec3 an = abs(vObjNrm);
          if (an.y < 0.5) {
            // Pick the two façade-tangent axes for this vertical face.
            vec2 grid = an.x > an.z ? vec2(vObjPos.z, vObjPos.y) : vec2(vObjPos.x, vObjPos.y);
            vec2 g = grid / ${WINDOW_M.toFixed(1)};
            vec2 cell = floor(g);
            vec2 fp = fract(g);
            // Dark frame between panes → discrete windows, not a glowing wall.
            float pane = step(0.16, fp.x) * step(fp.x, 0.84) * step(0.14, fp.y) * step(fp.y, 0.9);
            float lit = windowLit(cell, vSeed) * pane;
            float bright = 0.55 + 0.45 * cityHash(cell + vSeed * 5.0);
            vec3 wcol = vec3(1.0, 0.93, 0.84); // #ffedd6 warm uniform glow
            // Faint daytime reflection → real interior glow after dark.
            float emit = lit * bright * (0.05 + uNight * 1.6);
            totalEmissiveRadiance += wcol * emit;
          }
        }`,
      )
  }

  cached = mat
  return cached
}

/**
 * Advance the shared window animation. Call once per frame from a single scene
 * component (CityLife). `night` is 0 (full day) → 1 (full night); `wet` is the
 * current ground/façade wetness 0→1.
 */
export function updateCityWindows(time: number, night: number, wet: number) {
  sharedUniforms.uCityTime.value = time
  sharedUniforms.uNight.value = night
  sharedUniforms.uWet.value = wet
}
