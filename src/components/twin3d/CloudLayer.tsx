'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'
import { clamp, lerp, smoothstep } from '@/lib/engine/math'
import { prefersReducedMotion } from '@/lib/engine/reducedMotion'
import { rateHz } from '@/lib/engine/scheduler'

/**
 * CloudLayer — procedural cloud density on a sky dome.
 *
 * Cloud Cover is an atmospheric condition, not an exposure control: increasing
 * it should visibly grow the amount of sky covered by cloud, not just dim the
 * scene. This renders one translucent dome enclosing the whole scene whose
 * fragment shader thresholds a lightweight fractal value-noise field against
 * the current cloud coverage — raising the "counts as cloud" threshold as
 * coverage falls means only rare noise peaks qualify (a clear sky with a few
 * wisps); lowering it as coverage rises means almost the whole field qualifies
 * (solid overcast). One draw call, no volumetrics, no extra render targets —
 * the same lightweight-procedural spirit as `RainFX`'s GPU points.
 *
 * Coverage is eased with a first-order lag (matching the panel-easing pattern
 * in `adaptiveSkin.ts`) so slider changes read as clouds gradually forming or
 * dispersing, never popping between states.
 */

const DOME_RADIUS = 1600

/** First-order lag rate (s⁻¹) for cloud coverage — ≈2.9 s to settle, so the sky
 *  visibly drifts into its new state rather than snapping with the slider. */
const CLOUD_EASE_RATE = 0.35

/** Procedural noise-field frequency across the dome (higher = smaller puffs). */
const NOISE_SCALE = 3.2
/** Base drift speed (noise-units/second) — a living sky even in calm air. */
const DRIFT_SPEED = 0.01
/** Extra drift added per unit of normalised wind strength. */
const DRIFT_WIND_GAIN = 0.02

/**
 * Noise-threshold endpoints. The 4-octave value-noise field used below settles
 * around ~[0.18, 0.8] in practice; these sit just outside that range so 0%
 * coverage reads as "almost no clouds" and 100% as "solid overcast" — the rest
 * of the CLEAR→OVERCAST progression falls out of linearly interpolating
 * between them (see FRAGMENT_SHADER).
 */
const THRESHOLD_AT_CLEAR = 0.82
const THRESHOLD_AT_OVERCAST = 0.05
/** Soft-edge width: crisp small puffs when sparse, a broad soft blanket when dense. */
const EDGE_AT_CLEAR = 0.14
const EDGE_AT_OVERCAST = 0.34

/** Crisp core disc fully visible up to here, fully gone by `SUN_DISC_FADE_END`. */
export const SUN_DISC_FADE_START = 0.05
export const SUN_DISC_FADE_END = 0.55

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDir;
  void main() {
    // The dome is centred at the origin, so the local vertex position IS the
    // world-space direction toward that point on the sky.
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec3 vDir;

  uniform float uCoverage;
  uniform float uTime;
  uniform float uDayFactor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uThresholdMax;
  uniform float uThresholdMin;
  uniform float uEdgeMin;
  uniform float uEdgeMax;
  uniform float uScale;

  // Cheap hash-based value noise (no texture lookups) — standard technique for
  // lightweight procedural sky/terrain noise.
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Fractal Brownian Motion, 4 octaves — enough for soft cumulus-like puffiness
  // without the cost of a volumetric march.
  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 4; i++) {
      sum += amp * valueNoise(p * freq);
      freq *= 2.03;
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    // Fade the layer out at/below the horizon so it blends with fog and ground.
    float zenithFade = smoothstep(-0.06, 0.14, vDir.y);
    if (zenithFade <= 0.001) discard;

    vec2 p = vDir.xz * uScale + vDir.y * uScale * 0.35;
    vec2 drift = vec2(uTime * 0.9, uTime * 0.5);
    float n = fbm(p + drift);
    // Secondary sample at a different frequency/offset for internal puffy shading.
    float detail = fbm(p * 2.3 - drift * 1.3);

    // Coverage raises/lowers the "counts as cloud" bar and widens the soft
    // edge — this alone produces the CLEAR→PARTLY→MOSTLY→OVERCAST progression.
    float threshold = mix(uThresholdMax, uThresholdMin, uCoverage);
    float edge = mix(uEdgeMin, uEdgeMax, uCoverage);
    float density = smoothstep(threshold - edge, threshold + edge, n) * zenithFade;
    if (density <= 0.003) discard;

    vec3 nightColor = vec3(0.10, 0.11, 0.15);
    vec3 dayColor = mix(vec3(0.86, 0.88, 0.92), uSunColor, 0.22);
    vec3 cloudColor = mix(nightColor, dayColor, uDayFactor);
    cloudColor *= mix(0.7, 1.05, detail);

    // Silver lining: cloud lit from behind reads brighter near the sun direction —
    // this is what makes the sun read as "a diffused glow behind the cloud layer".
    float sunProximity = pow(max(dot(vDir, uSunDir), 0.0), 10.0);
    cloudColor += uSunColor * sunProximity * uDayFactor * 0.55;

    // Thin wisps read as translucent; a dense overcast reads nearly opaque.
    float alpha = density * mix(0.5, 0.92, uCoverage);
    gl_FragColor = vec4(cloudColor, alpha);
  }
`

export function CloudLayer() {
  const sim = getSimulation()
  const mat = useRef<THREE.ShaderMaterial>(null)
  const eased = useRef(0)
  const time = useRef(0)

  // Built once to seed the material's `uniforms` prop below; every subsequent
  // update goes through `mat.current.uniforms` inside useFrame instead (same
  // pattern as RainFX mutating `points.current.geometry` rather than its
  // memoized `positions` array) — three.js re-uploads a uniform to the GPU
  // whenever its `.value` changes.
  const initialUniforms = useMemo(
    () => ({
      uCoverage: { value: 0 },
      uTime: { value: 0 },
      uDayFactor: { value: 1 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#ffffff') },
      uThresholdMax: { value: THRESHOLD_AT_CLEAR },
      uThresholdMin: { value: THRESHOLD_AT_OVERCAST },
      uEdgeMin: { value: EDGE_AT_CLEAR },
      uEdgeMax: { value: EDGE_AT_OVERCAST },
      uScale: { value: NOISE_SCALE },
    }),
    [],
  )

  const limiter = useMemo(() => rateHz(20), [])

  useFrame((_, frameDt) => {
    const dt = limiter.tick(frameDt)
    if (dt === 0) return

    const m = mat.current
    if (!m) return
    const w = sim.weather
    const s = sim.sun

    // First-order lag toward the target coverage — gradual, never a pop.
    eased.current += (w.cloudCoverage - eased.current) * Math.min(1, dt * CLOUD_EASE_RATE)
    time.current += dt * (DRIFT_SPEED + w.windStrength * DRIFT_WIND_GAIN)

    const day = smoothstep(-2, 12, s.altitude)
    const warmth = clamp(1 - Math.abs(s.altitude) / 12)

    const u = m.uniforms as typeof initialUniforms
    u.uCoverage.value = clamp(eased.current)
    u.uTime.value = time.current
    u.uDayFactor.value = day
    u.uSunDir.value.set(s.worldDir.x, Math.max(s.worldDir.y, 0.02), s.worldDir.z).normalize()
    u.uSunColor.value.setRGB(1.0, lerp(1.0, 0.85, warmth), lerp(1.0, 0.72, warmth))
  })

  return (
    <mesh renderOrder={-10}>
      {/* Upper hemisphere + a little past the horizon, centred on the scene. */}
      <sphereGeometry args={[DOME_RADIUS, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        fog={false}
        uniforms={initialUniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
      />
    </mesh>
  )
}
