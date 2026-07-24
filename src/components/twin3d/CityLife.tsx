'use client'

import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'
import { clamp, smoothstep } from '@/lib/engine/math'
import { getCityLayout } from '@/lib/engine/cityLayout'
import { getCityWindowMaterial, updateCityWindows } from '@/lib/engine/cityWindowMaterial'
import { useTwinStore } from '@/lib/engine/store'
import { prefersReducedMotion } from '@/lib/engine/reducedMotion'

/**
 * CityLife — the surrounding urban district: an architectural concept city that
 * gives the adaptive façade scale, context and atmosphere without ever stealing
 * focus. It renders the deterministic layout from `cityLayout`:
 *
 *   • context buildings with procedural lit windows (see cityWindowMaterial);
 *   • a small, legible street network with medians, lane markings & a crosswalk;
 *   • geometric street trees that sway with the wind;
 *   • subtle city life — a few passing vehicles with headlights, an animated
 *     traffic signal, and street lamps that warm up at night.
 *
 * Everything is procedural + instanced where it pays off, GPU-friendly, and
 * driven by the SAME weather/sun engine as the rest of the twin. No crowds, no
 * traffic simulation — just enough life to feel occupied, not busy. This module
 * also owns the single per-frame window-illumination uniform tick for the whole
 * city (functional neighbours share the same material).
 */

/** Night factor 0 (day) → 1 (night), from sun altitude. */
function nightFactor(altitude: number): number {
  return 1 - smoothstep(-3, 12, altitude)
}

/**
 * Shared asphalt material for every road surface — a module singleton (not a
 * hook value) so it can be mutated in the frame loop for the wet-road cue while
 * still being a single material instance across all road meshes.
 */
let _asphalt: THREE.MeshStandardMaterial | null = null
function asphaltMaterial(): THREE.MeshStandardMaterial {
  if (!_asphalt) _asphalt = new THREE.MeshStandardMaterial({ color: '#1b1e24', roughness: 0.9, metalness: 0.1 })
  return _asphalt
}

export function CityLife() {
  const height = useTwinStore((s) => s.building.height)
  const layout = useMemo(() => getCityLayout(height), [height])

  return (
    <group>
      {/* Drives the shared window-illumination animation once per frame. */}
      <CityDriver />
      <Roads roads={layout.roads} />
      <DistrictBuildings />
      <Trees />
      <Vehicles />
      <Lamps />
      <TrafficSignal x={layout.signal.x} z={layout.signal.z} />
    </group>
  )
}

/* ── Window-illumination driver ─────────────────────────────────────────────
   A single headless frame loop advancing the shared city window shader. */
function CityDriver() {
  const sim = getSimulation()
  useFrame((state) => {
    const night = nightFactor(sim.sun.altitude)
    updateCityWindows(state.clock.elapsedTime, night, sim.weather.groundWetness)
  })
  return null
}

/* ── Context buildings ──────────────────────────────────────────────────────
   Individual meshes (so each building seeds its own window pattern from its
   world origin) sharing ONE window material. Roof caps add crown variety. */
function DistrictBuildings() {
  const height = useTwinStore((s) => s.building.height)
  const layout = useMemo(() => getCityLayout(height), [height])
  const winMat = useMemo(() => getCityWindowMaterial(), [])
  // Plain, dark material for mechanical equipment / masts (no windows).
  const equipMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#20252c', metalness: 0.5, roughness: 0.6 }),
    [],
  )

  return (
    <group>
      {layout.buildings.map((b) => (
        <group key={b.id}>
          <mesh position={[b.x, b.h / 2, b.z]} receiveShadow material={winMat}>
            <boxGeometry args={[b.w, b.h, b.d]} />
          </mesh>
          {b.caps.map((c, i) => {
            const y = b.h + c.dy + c.h / 2
            const mat = c.kind === 'penthouse' ? winMat : equipMat
            return (
              <mesh key={i} position={[b.x + c.dx, y, b.z + c.dz]} material={mat}>
                <boxGeometry args={[c.w, c.h, c.d]} />
              </mesh>
            )
          })}
        </group>
      ))}
    </group>
  )
}

/* ── Streets ────────────────────────────────────────────────────────────────
   Asphalt strips with a subtle raised kerb, a dashed median + lane markings on
   major roads, and a crosswalk hint near the central crossing. Asphalt darkens
   and turns reflective in the rain (shared with the ground wetness cue). */
function Roads({ roads }: { roads: ReturnType<typeof getCityLayout>['roads'] }) {
  const sim = getSimulation()

  // The shared asphalt material darkens and turns reflective as the roads get
  // wet. It is a module singleton fetched inside the frame loop (never captured
  // as a render-scope local) so the wetness mutation is isolated from render.
  // Wetness changes only on the environmental tier / user input — dirty-check so
  // the material (and its GPU re-upload) is only touched when it actually changes.
  const lastWet = useRef(NaN)
  useFrame(() => {
    const wet = sim.weather.groundWetness
    if (wet === lastWet.current) return
    lastWet.current = wet
    const m = asphaltMaterial()
    m.roughness = 0.9 - wet * 0.62
    m.metalness = 0.1 + wet * 0.4
    m.color.setRGB(0.11 - wet * 0.04, 0.12 - wet * 0.04, 0.14 - wet * 0.04)
  })

  const markingMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#c9cdd4', roughness: 0.7, emissive: '#20242c', emissiveIntensity: 0.4 }),
    [],
  )

  return (
    <group>
      {roads.map((r, i) => {
        const isX = r.axis === 'x'
        const sx = isX ? r.length : r.width
        const sz = isX ? r.width : r.length
        return (
          <group key={i}>
            {/* Asphalt */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[r.x, 0.05, r.z]} receiveShadow material={asphaltMaterial()}>
              <planeGeometry args={[sx, sz]} />
            </mesh>
            {/* Kerbs on both long edges */}
            {[-1, 1].map((s) => (
              <mesh
                key={s}
                position={isX ? [r.x, 0.12, r.z + s * (r.width / 2 + 0.4)] : [r.x + s * (r.width / 2 + 0.4), 0.12, r.z]}
                material={markingMat}
              >
                <boxGeometry args={isX ? [sx, 0.24, 0.8] : [0.8, 0.24, sz]} />
              </mesh>
            ))}
            {/* Major roads: dashed median + a crosswalk near the crossing. */}
            {r.major && <RoadMarkings road={r} material={markingMat} />}
          </group>
        )
      })}
    </group>
  )
}

function RoadMarkings({
  road,
  material,
}: {
  road: ReturnType<typeof getCityLayout>['roads'][number]
  material: THREE.Material
}) {
  const dashRef = useRef<THREE.InstancedMesh>(null)
  const isX = road.axis === 'x'
  const dashes = Math.floor(road.length / 24)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useLayoutEffect(() => {
    const m = dashRef.current
    if (!m) return
    for (let i = 0; i < dashes; i++) {
      const t = -road.length / 2 + (i + 0.5) * 24
      // Skip dashes over the central crossing (leaves room for the crosswalk).
      const skip = Math.abs(t) < 22
      dummy.position.set(isX ? road.x + t : road.x, 0.07, isX ? road.z : road.z + t)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.set(skip ? 0 : isX ? 8 : 0.35, skip ? 0 : isX ? 0.35 : 8, 1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }, [dashes, isX, road.x, road.z, road.length, dummy])

  return (
    <>
      <instancedMesh ref={dashRef} args={[undefined as unknown as THREE.BufferGeometry, material, Math.max(1, dashes)]}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      {/* Crosswalk hint at the central crossing */}
      <group>
        {Array.from({ length: 6 }, (_, i) => {
          const off = (i - 2.5) * 2.4
          return (
            <mesh
              key={i}
              rotation={[-Math.PI / 2, 0, 0]}
              position={isX ? [off, 0.07, road.z] : [road.x, 0.07, off]}
              material={material}
            >
              <planeGeometry args={isX ? [1.2, road.width * 0.8] : [road.width * 0.8, 1.2]} />
            </mesh>
          )
        })}
      </group>
    </>
  )
}

/* ── Trees ──────────────────────────────────────────────────────────────────
   Two instanced canopies (round + conical) + instanced trunks, all pivoting at
   the base so they sway together with the wind. Geometry is pre-translated so
   its base sits at y=0 → a per-instance rotation about the origin reads as sway. */
function Trees() {
  const height = useTwinStore((s) => s.building.height)
  const layout = useMemo(() => getCityLayout(height), [height])
  const sim = getSimulation()

  const round = useMemo(() => layout.trees.filter((t) => !t.conical), [layout])
  const cones = useMemo(() => layout.trees.filter((t) => t.conical), [layout])

  const trunkRound = useRef<THREE.InstancedMesh>(null)
  const trunkCone = useRef<THREE.InstancedMesh>(null)
  const canopyRound = useRef<THREE.InstancedMesh>(null)
  const canopyCone = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.32, 0.5, 6, 6).translate(0, 3, 0), [])
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(4, 10, 8).translate(0, 8.5, 0), [])
  const coneGeo = useMemo(() => new THREE.ConeGeometry(3.4, 10, 8).translate(0, 10, 0), [])

  const applied = (
    trunkMesh: THREE.InstancedMesh | null,
    canopyMesh: THREE.InstancedMesh | null,
    list: typeof round,
    t: number,
    wind: number,
  ) => {
    if (!trunkMesh || !canopyMesh) return
    for (let i = 0; i < list.length; i++) {
      const tr = list[i]
      const sway = Math.sin(t * 1.1 + tr.phase) * 0.03 * (0.35 + wind)
      dummy.position.set(tr.x, 0, tr.z)
      dummy.rotation.set(0, 0, sway)
      dummy.scale.set(tr.scale, tr.scale, tr.scale)
      dummy.updateMatrix()
      trunkMesh.setMatrixAt(i, dummy.matrix)
      canopyMesh.setMatrixAt(i, dummy.matrix)
    }
    trunkMesh.instanceMatrix.needsUpdate = true
    canopyMesh.instanceMatrix.needsUpdate = true
  }

  // Under reduced-motion the sway is frozen; the matrices are written once and
  // then left untouched (no per-frame instance-buffer uploads).
  const settled = useRef(false)
  useFrame((state) => {
    const reduced = prefersReducedMotion()
    if (reduced && settled.current) return
    const wind = reduced ? 0 : clamp(sim.weather.windStrength)
    const t = reduced ? 0 : state.clock.elapsedTime
    applied(trunkRound.current, canopyRound.current, round, t, wind)
    applied(trunkCone.current, canopyCone.current, cones, t, wind)
    if (reduced) settled.current = true
  })

  return (
    <group>
      <instancedMesh ref={trunkRound} args={[trunkGeo, undefined as unknown as THREE.Material, Math.max(1, round.length)]}>
        <meshStandardMaterial color="#3b352f" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={canopyRound} args={[sphereGeo, undefined as unknown as THREE.Material, Math.max(1, round.length)]}>
        <meshStandardMaterial color="#4a5d4e" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={trunkCone} args={[trunkGeo, undefined as unknown as THREE.Material, Math.max(1, cones.length)]}>
        <meshStandardMaterial color="#3b352f" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={canopyCone} args={[coneGeo, undefined as unknown as THREE.Material, Math.max(1, cones.length)]}>
        <meshStandardMaterial color="#425840" roughness={0.9} />
      </instancedMesh>
    </group>
  )
}

/* ── Vehicles ───────────────────────────────────────────────────────────────
   A handful of passing cars per road — instanced body + head/tail lights. Lights
   are faint by day and glow after dark. No traffic model: constant-speed loops. */
function Vehicles() {
  const height = useTwinStore((s) => s.building.height)
  const layout = useMemo(() => getCityLayout(height), [height])
  const sim = getSimulation()
  const vehicles = layout.vehicles
  const RANGE = 900

  const body = useRef<THREE.InstancedMesh>(null)
  const head = useRef<THREE.InstancedMesh>(null)
  const tail = useRef<THREE.InstancedMesh>(null)
  const headMat = useRef<THREE.MeshStandardMaterial>(null)
  const tailMat = useRef<THREE.MeshStandardMaterial>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const offsets = useRef(vehicles.map((v) => v.offset))

  const bodyGeo = useMemo(() => new THREE.BoxGeometry(4.6, 1.5, 2.1).translate(0, 0.95, 0), [])
  const headGeo = useMemo(() => new THREE.BoxGeometry(0.3, 0.3, 1.7).translate(2.35, 0.7, 0), [])
  const tailGeo = useMemo(() => new THREE.BoxGeometry(0.2, 0.3, 1.7).translate(-2.35, 0.7, 0), [])

  const lastNight = useRef(NaN)
  useFrame((state, dt) => {
    const b = body.current
    const h = head.current
    const ta = tail.current
    if (!b || !h || !ta) return
    // Reduced-motion: freeze traffic (no forward progress) but keep the cars placed.
    const move = prefersReducedMotion() ? 0 : dt
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i]
      offsets.current[i] += v.dir * v.speed * move
      // Wrap within a full pass across the district.
      const p = ((offsets.current[i] % (RANGE * 2)) + RANGE * 2) % (RANGE * 2) - RANGE
      const isX = v.axis === 'x'
      dummy.position.set(isX ? p : v.lane, 0, isX ? v.lane : p)
      dummy.rotation.set(0, isX ? (v.dir > 0 ? 0 : Math.PI) : v.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      b.setMatrixAt(i, dummy.matrix)
      h.setMatrixAt(i, dummy.matrix)
      ta.setMatrixAt(i, dummy.matrix)
    }
    b.instanceMatrix.needsUpdate = true
    h.instanceMatrix.needsUpdate = true
    ta.instanceMatrix.needsUpdate = true

    // Head/tail-light intensity tracks night — only rewrite on a real change.
    const night = nightFactor(sim.sun.altitude)
    if (Math.abs(night - lastNight.current) > 0.002) {
      lastNight.current = night
      if (headMat.current) headMat.current.emissiveIntensity = 0.4 + night * 2.6
      if (tailMat.current) tailMat.current.emissiveIntensity = 0.5 + night * 1.8
    }
  })

  return (
    <group>
      <instancedMesh ref={body} args={[bodyGeo, undefined as unknown as THREE.Material, vehicles.length]}>
        <meshStandardMaterial color="#2b3038" metalness={0.5} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={head} args={[headGeo, undefined as unknown as THREE.Material, vehicles.length]}>
        <meshStandardMaterial ref={headMat} color="#fff6e0" emissive="#fff2d0" emissiveIntensity={1} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={tail} args={[tailGeo, undefined as unknown as THREE.Material, vehicles.length]}>
        <meshStandardMaterial ref={tailMat} color="#ff5a44" emissive="#ff3b30" emissiveIntensity={1} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

/* ── Street lamps ───────────────────────────────────────────────────────────
   Instanced poles + arms + emissive heads that warm up at night. */
function Lamps() {
  const height = useTwinStore((s) => s.building.height)
  const layout = useMemo(() => getCityLayout(height), [height])
  const sim = getSimulation()
  const lamps = layout.lamps

  const pole = useRef<THREE.InstancedMesh>(null)
  const arm = useRef<THREE.InstancedMesh>(null)
  const headHolder = useRef<THREE.InstancedMesh>(null)
  const headMat = useRef<THREE.MeshStandardMaterial>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const poleGeo = useMemo(() => new THREE.CylinderGeometry(0.22, 0.26, 16, 6).translate(0, 8, 0), [])
  const armGeo = useMemo(() => new THREE.BoxGeometry(3.2, 0.22, 0.22).translate(1.6, 15.4, 0), [])
  const headGeo = useMemo(() => new THREE.BoxGeometry(1.5, 0.28, 0.7).translate(3.2, 15.2, 0), [])

  useLayoutEffect(() => {
    lamps.forEach((l, i) => {
      dummy.position.set(l.x, 0, l.z)
      dummy.rotation.set(0, l.rotY, 0)
      dummy.scale.set(l.dir, 1, 1) // mirror the arm to the kerb side
      dummy.updateMatrix()
      pole.current?.setMatrixAt(i, dummy.matrix)
      arm.current?.setMatrixAt(i, dummy.matrix)
      headHolder.current?.setMatrixAt(i, dummy.matrix)
    })
    if (pole.current) pole.current.instanceMatrix.needsUpdate = true
    if (arm.current) arm.current.instanceMatrix.needsUpdate = true
    if (headHolder.current) headHolder.current.instanceMatrix.needsUpdate = true
  }, [lamps, dummy])

  const lastNight = useRef(NaN)
  useFrame(() => {
    const night = nightFactor(sim.sun.altitude)
    if (Math.abs(night - lastNight.current) < 0.002) return
    lastNight.current = night
    if (headMat.current) headMat.current.emissiveIntensity = night * 3.2
  })

  return (
    <group>
      <instancedMesh ref={pole} args={[poleGeo, undefined as unknown as THREE.Material, lamps.length]}>
        <meshStandardMaterial color="#2a2f37" metalness={0.6} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={arm} args={[armGeo, undefined as unknown as THREE.Material, lamps.length]}>
        <meshStandardMaterial color="#2a2f37" metalness={0.6} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={headHolder} args={[headGeo, undefined as unknown as THREE.Material, lamps.length]}>
        <meshStandardMaterial ref={headMat} color="#fff4dc" emissive="#ffe8bd" emissiveIntensity={0} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

/* ── Traffic signal ─────────────────────────────────────────────────────────
   A single animated intersection accent — three lamps cycling red→green→amber.
   Not a traffic model; purely an environmental "the city is running" cue. */
function TrafficSignal({ x, z }: { x: number; z: number }) {
  const red = useRef<THREE.MeshStandardMaterial>(null)
  const amber = useRef<THREE.MeshStandardMaterial>(null)
  const green = useRef<THREE.MeshStandardMaterial>(null)

  // The lamps only change three times per 12 s cycle — write on transition only,
  // not every frame. Reduced-motion holds a steady green (no flashing).
  const lastSig = useRef(-1)
  useFrame((state) => {
    const phase = (state.clock.elapsedTime % 12) / 12
    const sig = prefersReducedMotion() ? 0 : phase < 0.45 ? 0 : phase < 0.55 ? 1 : 2
    if (sig === lastSig.current) return
    lastSig.current = sig
    if (green.current) green.current.emissiveIntensity = (sig === 0 ? 2.4 : 0) + 0.05
    if (amber.current) amber.current.emissiveIntensity = (sig === 1 ? 2.6 : 0) + 0.05
    if (red.current) red.current.emissiveIntensity = (sig === 2 ? 2.4 : 0) + 0.05
  })

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 5, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 10, 6]} />
        <meshStandardMaterial color="#22262d" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 9.4, 0]}>
        <boxGeometry args={[0.9, 2.4, 0.7]} />
        <meshStandardMaterial color="#181b21" roughness={0.7} />
      </mesh>
      <mesh position={[0, 10.1, 0.4]}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshStandardMaterial ref={red} color="#ff4433" emissive="#ff2a1a" emissiveIntensity={0.05} toneMapped={false} />
      </mesh>
      <mesh position={[0, 9.4, 0.4]}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshStandardMaterial ref={amber} color="#ffbb33" emissive="#ffaa00" emissiveIntensity={0.05} toneMapped={false} />
      </mesh>
      <mesh position={[0, 8.7, 0.4]}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshStandardMaterial ref={green} color="#44dd77" emissive="#22cc55" emissiveIntensity={0.05} toneMapped={false} />
      </mesh>
    </group>
  )
}
