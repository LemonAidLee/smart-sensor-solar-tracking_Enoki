'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'
import { clamp, lerp, smoothstep } from '@/lib/engine/math'
import { getSunGlowTexture } from '@/lib/engine/sunGlowTexture'
import { skyEnv } from './skyColor'
import { SUN_DISC_FADE_END, SUN_DISC_FADE_START } from './CloudLayer'

/**
 * Cloud cover at which the diffuse halo starts/finishes rising (behind the
 * fading core disc) and starts/finishes fading away entirely. Together with
 * `SUN_DISC_FADE_*` (from `CloudLayer`) these four bands give the sun four
 * readable states as cloud rises: crisp disc → partially obscured → diffuse
 * glow only → no visible disc at all (uniform diffuse sky light).
 */
const SUN_GLOW_RISE_START = 0.15
const SUN_GLOW_RISE_END = 0.45
const SUN_GLOW_FADE_START = 0.85
const SUN_GLOW_FADE_END = 1.0

/** Shadow blur radius (px) at 0% / 100% cloud cover — crisp sun vs diffuse sky. */
const SHADOW_RADIUS_CLEAR = 1.4
const SHADOW_RADIUS_OVERCAST = 14

/**
 * Sky background, fog and the sun rig (directional light + visible disc + halo
 * + hemisphere/ambient fill). All colours/intensities are driven every frame
 * from the SolarEngine + WeatherEngine — nothing is hard-coded. Background and
 * fog are declared as scene-attached primitives and updated imperatively via
 * refs. The disc/halo/shadow-softness response to cloud cover works alongside
 * `CloudLayer`'s procedural sky dome — see its header comment for the design.
 */
export function SceneEnvironment() {
  const sim = getSimulation()
  const bg = useRef<THREE.Color>(null)
  const fog = useRef<THREE.FogExp2>(null)
  const dir = useRef<THREE.DirectionalLight>(null)
  const sun = useRef<THREE.Mesh>(null)
  const sunGlow = useRef<THREE.Sprite>(null)
  const amb = useRef<THREE.AmbientLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const glowTexture = useMemo(() => getSunGlowTexture(), [])

  // Night-time illumination
  const nightLight1 = useRef<THREE.DirectionalLight>(null)
  const nightLight2 = useRef<THREE.DirectionalLight>(null)

  // Dirty-check: the sky/lights are a pure function of the sun + a few weather
  // scalars. `computeSun` returns a NEW object only on the ~20 Hz environmental
  // tier, so comparing its identity (plus the weather scalars, which change on
  // the same tier or on user input) lets us skip this whole recompute on the
  // intervening render frames — identical output, ~⅔ fewer updates.
  const lastSun = useRef<object | null>(null)
  const lastW = useRef({ cloud: NaN, humidity: NaN, rain: NaN })

  useFrame(() => {
    const s = sim.sun
    const w = sim.weather
    if (
      lastSun.current === s &&
      lastW.current.cloud === w.cloudCoverage &&
      lastW.current.humidity === w.humidity &&
      lastW.current.rain === w.rainIntensity
    ) {
      return
    }
    lastSun.current = s
    lastW.current = { cloud: w.cloudCoverage, humidity: w.humidity, rain: w.rainIntensity }

    const env = skyEnv(s.altitude, w.cloudCoverage)

    if (bg.current) bg.current.setRGB(env.background[0], env.background[1], env.background[2])
    if (fog.current) {
      fog.current.color.setRGB(env.fog[0], env.fog[1], env.fog[2])
      fog.current.density = 0.00015 + (w.humidity / 100) * 0.0005 + w.rainIntensity * 0.0008
    }

    const R = 700
    const d = s.worldDir
    const cloud = w.cloudCoverage
    if (dir.current) {
      dir.current.position.set(d.x * R, Math.max(d.y * R, 6), d.z * R)
      dir.current.intensity = env.sunIntensity
      dir.current.color.setRGB(env.sunColor[0], env.sunColor[1], env.sunColor[2])
      // Softer-edged shadows as cloud density rises — diffuse sky light casts
      // softer shadows than a crisp, unobscured sun (a consequence of cloud
      // density, not an independent lighting redesign).
      dir.current.shadow.radius = lerp(SHADOW_RADIUS_CLEAR, SHADOW_RADIUS_OVERCAST, cloud)
    }
    // Crisp core disc: fully visible while mostly clear, fully gone by the time
    // cloud cover is enough to obscure it (see SUN_DISC_FADE_* in CloudLayer).
    const discOpacity = 1 - smoothstep(SUN_DISC_FADE_START, SUN_DISC_FADE_END, cloud)
    if (sun.current) {
      sun.current.position.set(d.x * R, d.y * R, d.z * R)
      sun.current.visible = s.altitude > -2 && discOpacity > 0.01
      const m = sun.current.material as THREE.MeshBasicMaterial
      m.color.setRGB(env.sunColor[0], Math.min(1, env.sunColor[1] + 0.15), Math.min(1, env.sunColor[2] + 0.2))
      m.opacity = discOpacity
    }
    // Diffuse halo: rises as the core disc fades, so the sun reads as "a glow
    // behind the cloud layer" through the mid-to-high cover range, then fades
    // away itself once cover is near-total (no visible sun at all — only
    // uniform diffuse sky light, via the unchanged ambient/hemisphere lights).
    if (sunGlow.current) {
      const glowRise = smoothstep(SUN_GLOW_RISE_START, SUN_GLOW_RISE_END, cloud)
      const glowFall = 1 - smoothstep(SUN_GLOW_FADE_START, SUN_GLOW_FADE_END, cloud)
      const glowOpacity = glowRise * glowFall
      sunGlow.current.position.set(d.x * R, d.y * R, d.z * R)
      sunGlow.current.visible = s.altitude > -2 && glowOpacity > 0.01
      const scale = lerp(70, 150, glowRise)
      sunGlow.current.scale.set(scale, scale, 1)
      const gm = sunGlow.current.material as THREE.SpriteMaterial
      gm.opacity = glowOpacity * 0.85
      gm.color.setRGB(env.sunColor[0], Math.min(1, env.sunColor[1] + 0.1), Math.min(1, env.sunColor[2] + 0.15))
    }
    if (amb.current) amb.current.intensity = env.ambientIntensity
    if (hemi.current) {
      hemi.current.color.setRGB(env.hemiSky[0], env.hemiSky[1], env.hemiSky[2])
      hemi.current.groundColor.setRGB(env.hemiGround[0], env.hemiGround[1], env.hemiGround[2])
      hemi.current.intensity = 0.5 + clamp(s.altitude / 60) * 0.5
    }

    // Fade in night lights when the sun sets
    const day = smoothstep(-2, 12, s.altitude)
    const nightFactor = 1 - day
    if (nightLight1.current) nightLight1.current.intensity = nightFactor * 0.9
    if (nightLight2.current) nightLight2.current.intensity = nightFactor * 0.5
  })

  return (
    <>
      <color ref={bg} attach="background" args={['#101018']} />
      <fogExp2 ref={fog} attach="fog" args={['#223344', 0.0002]} />
      <ambientLight ref={amb} intensity={0.6} />
      <hemisphereLight ref={hemi} intensity={0.8} />
      <directionalLight
        ref={dir}
        castShadow
        intensity={1.5}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={1800}
        shadow-camera-left={-280}
        shadow-camera-right={280}
        shadow-camera-top={280}
        shadow-camera-bottom={-280}
        shadow-bias={-0.0005}
      />
      <mesh ref={sun}>
        <sphereGeometry args={[20, 24, 24]} />
        <meshBasicMaterial color="#fff3d0" toneMapped={false} fog={false} transparent />
      </mesh>
      {/* Diffuse halo — reads as "sun glowing behind the clouds" once the crisp
          disc above has faded (see the cloud-driven opacity logic above). */}
      <sprite ref={sunGlow} renderOrder={1}>
        <spriteMaterial
          map={glowTexture}
          color="#fff3d0"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          fog={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      {/* City glow / Moonlight for visibility at night */}
      <directionalLight ref={nightLight1} position={[150, 60, 200]} color="#647b9e" />
      <directionalLight ref={nightLight2} position={[-200, 40, -100]} color="#3a4768" />
    </>
  )
}
