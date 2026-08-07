'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'
import { useTwinStore, getActiveDemonstrationSurface } from '@/lib/engine/store'
import { useVecStore } from '@/lib/vec/store'
import { clamp, deg2rad, lerp } from '@/lib/engine/math'
import { WEATHER_VALIDATION_MODE } from '@/lib/engine/validationMode'
import { StaticInstances, barMatrix, surfaceGrid } from './StaticInstances'

/**
 * FacadeLayer — the SECOND skin (outer), set out in front of the glass across the
 * ventilated air cavity. Per window bay, the assembly is:
 *
 *   Glass Curtain Wall → Air Cavity (FacadeDepth) → Facade Frame → Mounting
 *   Bracket → Rotation Shaft → Kinetic Panel
 *
 *   • FacadeFrame     — static frame rails at the bay BOUNDARIES, on the cavity plane.
 *   • Mounting bracket — cantilevers from the frame out to the shaft.
 *   • Rotation shaft   — fixed vertical shaft through the bay CENTRE (belongs to the
 *                        second skin — never embedded in the building).
 *   • KineticPanel     — the only moving part: a full-bay-width aluminium fin that
 *                        rotates symmetrically about the central shaft.
 *
 * The fin's geometry origin is its geometric centre (true centre-pivot: the centre
 * never translates). Because a centre-pivot fin sweeps a circle of radius ≈ half
 * its width, the shaft is placed a full swept-radius + clearance beyond the frame,
 * so the fin stays ENTIRELY outside the building envelope through a full 0–360°.
 * Driven by the SAME engine state the PBIF pipeline commands (`sim.skin`) —
 * intelligence unchanged. Rotation uses `makeRotationAxis`, continuous with no clamp.
 */

const BAR_GEOM = new THREE.BoxGeometry(1, 1, 1)

/** Numeric codes for the dirty-cache health comparison — a plain object comparison would allocate. */
const HEALTH_CODE: Record<string, number> = { ok: 0, degraded: 1, fault: 2, offline: 3 }

// ── Second-skin assembly, parameterised off a single FacadeDepth reference ──────
// FacadeDepth = the air-cavity depth from the glass to the façade frame (the
// existing engine param `building.facadeDepth`). EVERY façade element derives its
// outward position from it, so the whole module moves together (e.g. 300 mm vs
// 600 mm cavity) with no per-object edits.
const FIN_WIDTH_RATIO = 0.92
/** Max blade thickness (must match the render scale below — never faked). */
const FIN_THICKNESS_MAX = 0.11
/** Radial gap kept between the fin's swept inner edge and the frame. */
const SHAFT_CLEARANCE = 0.3
/** Floor on the cavity so the frame is always clear of the glass. */
const MIN_CAVITY = 0.3
/**
 * Structural sizes of the second skin, as fractions of the bay pitch. The
 * absolute values these replace were tuned for the old 4.2 m demonstration bays
 * and read as heavy structure on the case study's 1.2 m adaptive module; scaling
 * them keeps the frame/shaft proportion identical at any grid density. Bounded
 * so they stay visible on a small module and sane on a large one.
 */
const FRAME_RAIL_RATIO = 0.09 // ≈107 mm rail on a 1.19 m bay
const SHAFT_RATIO = 0.06 // ≈71 mm rotation shaft
const BRACKET_RATIO = 0.1
const sizeFor = (bay: number, ratio: number, min: number, max: number) =>
  Math.min(max, Math.max(min, bay * ratio))

/** The engine bakes this standoff into every `worldPosition`/`surface.center`;
 *  offsets below are measured from the glass face, then rebased onto it. */
const engineStandoffOf = (facadeDepth: number) => facadeDepth + 0.15

/** Swept radius of a centre-pivot fin — its greatest excursion from the axis. */
function finSweptRadius(finWidth: number): number {
  return Math.hypot(finWidth / 2, FIN_THICKNESS_MAX / 2)
}

/** Distance from the glass face to the fin's pivot axis. Because the fin swings
 *  ±swept about this axis, keeping pivot > cavity + swept guarantees the fin never
 *  re-enters the cavity, the frame or the glass at ANY angle. */
function pivotDepthFromGlass(cavity: number, finWidth: number): number {
  return cavity + finSweptRadius(finWidth) + SHAFT_CLEARANCE
}

interface FacadeLayerProps {
  /**
   * Optional external ref onto the kinetic-fin InstancedMesh. Passed down by
   * `BuildingMesh` so sibling annotations (e.g. `SelectedModuleHighlight`) can
   * read a specific panel's ACTUAL rendered transform via `getMatrixAt(index)`
   * — the one source of truth for panel position/rotation/scale — instead of
   * recomputing an approximation of this component's own maths.
   */
  meshRef?: React.RefObject<THREE.InstancedMesh | null>
}

export function FacadeLayer({ meshRef }: FacadeLayerProps = {}) {
  const sim = getSimulation()
  // A plain local ref for all of this component's own use (mutated freely
  // below, same as before); `setMeshInstance` is a callback ref that ALSO
  // forwards the node to the caller's external ref, so `mesh` itself never
  // becomes a value derived from a prop as far as static analysis is concerned.
  const mesh = useRef<THREE.InstancedMesh>(null)
  const setMeshInstance = (node: THREE.InstancedMesh | null) => {
    mesh.current = node
    if (meshRef) meshRef.current = node
  }

  // Reusable maths objects (never allocate in the frame loop).
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const surfaceBasis = useMemo(() => new THREE.Matrix4(), [])
  const hingeRotation = useMemo(() => new THREE.Matrix4(), [])
  const hingeAxis = useMemo(() => new THREE.Vector3(0, -1, 0), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const vRight = useMemo(() => new THREE.Vector3(), [])
  const vUp = useMemo(() => new THREE.Vector3(), [])
  const vNorm = useMemo(() => new THREE.Vector3(), [])
  const color = useMemo(() => new THREE.Color(), [])

  // Fin geometry: origin at the GEOMETRIC CENTRE, so the panel pivots about its
  // own central vertical axis — symmetric, no sideways translation.
  const finGeom = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const debugAxesRef = useRef<THREE.AxesHelper>(null)

  const building = useTwinStore((s) => s.building)
  const solarSelectedModuleId = useTwinStore((s) => s.solarSelectedModuleId)
  const setSolarSelectedModule = useTwinStore((s) => s.setSolarSelectedModule)

  // VEC panel-0 highlight is suppressed in Weather Validation Mode (no VEC).
  const vecEnabled = useVecStore((s) => s.enabled) && !WEATHER_VALIDATION_MODE
  const count = sim.skin.getAllPanels().length

  // Stage 7.11 — per-panel dirty cache: 1,620 fins were being fully
  // recomputed (Vector/Matrix4 maths) AND re-uploaded to the GPU
  // (`instanceMatrix`/`instanceColor` `needsUpdate`) on EVERY rendered frame,
  // even for a fully-settled façade where nothing actually changed. Now a
  // panel's own authoritative state (`rotationAngle`, solar-driven tint,
  // health) is compared against last frame's; matrix/colour work — and the
  // GPU upload — only happens for panels that actually moved. `NaN`-filled so
  // the first frame after (re)allocation always updates every panel; keyed on
  // `building` too (not just `count`) so a geometry-affecting edit (e.g.
  // orientation, facadeDepth) that leaves panel COUNT unchanged still forces
  // a full recompute rather than reusing stale cached values.
  // Float64Array, NOT Float32 — `panel.rotationAngle` is a JS double, and a
  // Float32-truncated copy would almost never compare `===` equal to it again
  // even when genuinely unchanged, permanently defeating the dirty check.
  // A `useRef`, not `useMemo` — this is mutated every frame inside `useFrame`
  // (outside React's render phase), which is exactly what refs are for; a
  // `useMemo` result is meant to stay untouched between renders.
  const dirtyCache = useRef({
    angle: new Float64Array(0),
    lit: new Float64Array(0),
    health: new Int8Array(0),
  })
  useEffect(() => {
    dirtyCache.current = {
      angle: new Float64Array(count).fill(NaN),
      lit: new Float64Array(count).fill(NaN),
      health: new Int8Array(count).fill(-1),
    }
  }, [count, building])

  // Static framing — frame rails (bay boundaries), mounting brackets and the fixed
  // central shafts, ALL derived from the single FacadeDepth cavity reference so the
  // whole module sits together, outboard of the building.
  const framing = useMemo(() => {
    const frames: THREE.Matrix4[] = []
    const brackets: THREE.Matrix4[] = []
    const shafts: THREE.Matrix4[] = []
    const cavity = Math.max(MIN_CAVITY, sim.building.facadeDepth)
    const engineStandoff = engineStandoffOf(sim.building.facadeDepth)
    const dnFrame = cavity - engineStandoff // frame at the cavity plane

    for (const s of sim.skin.getAllSurfaces()) {
      const { cols } = surfaceGrid(s.panels)
      const bay = s.width / cols
      const finW = bay * FIN_WIDTH_RATIO
      const dnShaft = pivotDepthFromGlass(cavity, finW) - engineStandoff
      const dnBracket = (dnFrame + dnShaft) / 2
      const bracketLen = dnShaft - dnFrame
      const dvTab = s.height / 2 - Math.min(1.5, s.height * 0.06)

      // Structural member sizes, proportioned to this elevation's bay pitch.
      const railW = sizeFor(bay, FRAME_RAIL_RATIO, 0.06, 0.18)
      const shaftW = sizeFor(bay, SHAFT_RATIO, 0.04, 0.1)
      const bracketW = sizeFor(bay, BRACKET_RATIO, 0.05, 0.12)

      // Frame rails at bay boundaries + top/bottom rails (cavity plane).
      for (let c = 0; c <= cols; c++) {
        const du = (c / cols - 0.5) * s.width
        frames.push(barMatrix(s.center, s.right, s.up, s.normal, du, 0, dnFrame, [railW, s.height, 0.45]))
      }
      frames.push(barMatrix(s.center, s.right, s.up, s.normal, 0, s.height / 2, dnFrame, [s.width, railW * 1.45, 0.5]))
      frames.push(barMatrix(s.center, s.right, s.up, s.normal, 0, -s.height / 2, dnFrame, [s.width, railW * 1.45, 0.5]))

      // Per bay: central shaft at pivot depth + two mounting brackets cantilevering
      // from the frame out to the shaft.
      for (let c = 0; c < cols; c++) {
        const du = ((c + 0.5) / cols - 0.5) * s.width
        shafts.push(barMatrix(s.center, s.right, s.up, s.normal, du, 0, dnShaft, [shaftW, s.height * 0.99, shaftW]))
        brackets.push(barMatrix(s.center, s.right, s.up, s.normal, du, dvTab, dnBracket, [bracketW, bracketW * 1.33, bracketLen]))
        brackets.push(barMatrix(s.center, s.right, s.up, s.normal, du, -dvTab, dnBracket, [bracketW, bracketW * 1.33, bracketLen]))
      }
    }
    return { frames, brackets, shafts }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building])

  useFrame((state) => {
    const m = mesh.current
    if (!m) return
    const panels = sim.skin.getAllPanels()
    const n = Math.min(panels.length, count)
    const cavity = Math.max(MIN_CAVITY, sim.building.facadeDepth)
    const engineStandoff = engineStandoffOf(sim.building.facadeDepth)
    const { angle: lastAngle, lit: lastLit, health: lastHealth } = dirtyCache.current
    let dirty = false

    for (let i = 0; i < n; i++) {
      const p = panels[i]
      const healthCode = HEALTH_CODE[p.healthStatus] ?? 0
      const lit = clamp(p.solarExposure * 1.25)
      // The debug VEC pulse (i===0 while enabled) animates purely from wall-clock
      // time, not panel state, so it must bypass the dirty check to keep pulsing.
      const forceUpdate = vecEnabled && i === 0
      if (!forceUpdate && p.rotationAngle === lastAngle[i] && lit === lastLit[i] && healthCode === lastHealth[i]) {
        continue // settled panel, unchanged tint — nothing to recompute or re-upload
      }
      dirty = true
      lastAngle[i] = p.rotationAngle
      lastLit[i] = lit
      lastHealth[i] = healthCode

      const open = p.openness
      const finW = p.width * FIN_WIDTH_RATIO

      // The fin's CENTRE (its pivot) sits on the bay centre line, pushed out to the
      // pivot depth so the whole fin sweeps outside the building. Same FacadeDepth
      // reference as the frame/shaft — the assembly always moves together.
      const dn = pivotDepthFromGlass(cavity, finW) - engineStandoff
      position.set(
        p.worldPosition.x + p.normal.x * dn,
        p.worldPosition.y + p.normal.y * dn,
        p.worldPosition.z + p.normal.z * dn,
      )

      // 1. Surface coordinate basis (exact orientation of this bay's face).
      vNorm.set(p.normal.x, p.normal.y, p.normal.z)
      vUp.set(0, 1, 0)
      vRight.crossVectors(vUp, vNorm).normalize()
      surfaceBasis.makeBasis(vRight, vUp, vNorm)
      surfaceBasis.setPosition(position)

      // 2. Central-axis rotation about the vertical shaft (−Y). Because the fin
      //    geometry is centre-origin, this spins symmetrically about the centre.
      hingeRotation.makeRotationAxis(hingeAxis, deg2rad(p.rotationAngle))

      // 3. Compose basis × rotation, then scale to a full-bay-width aluminium fin
      //    (covers the glazing at 0°). Kept just under the bay pitch for even gaps.
      dummy.matrix.copy(surfaceBasis).multiply(hingeRotation)
      scale.set(finW, p.height * 0.98, 0.08 + open * 0.03)
      dummy.matrix.scale(scale)
      m.setMatrixAt(i, dummy.matrix)

      if (vecEnabled && i === 0 && debugAxesRef.current) {
        const unscaled = surfaceBasis.clone().multiply(hingeRotation)
        unscaled.decompose(debugAxesRef.current.position, debugAxesRef.current.quaternion, new THREE.Vector3())
        const lastLog = (m as unknown as { _lastLogAngle?: number })._lastLogAngle ?? -999
        if (Math.abs(p.rotationAngle - lastLog) > 1) {
          console.log(`[Transformation Layer] VEC Panel 0 | PBIF Target: ${Math.round(p.rotationAngle)}° | Hinge: -Y | Computed & Applied`)
          ;(m as unknown as { _lastLogAngle?: number })._lastLogAngle = p.rotationAngle
        }
      }

      // Colour: closed = deep cool tint, open = bright reflective; solar adds warmth.
      if (p.healthStatus === 'fault') color.setRGB(0.85, 0.12, 0.12)
      else if (p.healthStatus === 'offline') color.setRGB(0.09, 0.1, 0.12)
      else if (p.healthStatus === 'degraded') color.setRGB(0.72, 0.46, 0.12)
      else
        color.setRGB(
          clamp(lerp(0.5, 0.85, open) + lit * 0.15),
          clamp(lerp(0.52, 0.88, open) + lit * 0.12),
          clamp(lerp(0.55, 0.92, open) + lit * 0.08),
        )

      if (vecEnabled && i === 0) {
        const pulse = 0.8 + 0.2 * Math.sin(performance.now() * 0.005)
        color.setRGB(0.5 * pulse, 1.5 * pulse, 3.0 * pulse)
      }
      
      m.setColorAt(i, color)
    }
    if (dirty) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      // The shadow-casting fins moved — the shadow depth pass must re-render
      // this frame too (see TwinScene.tsx: `shadowMap.autoUpdate = false`).
      state.gl.shadowMap.needsUpdate = true
    }
  })

  return (
    <>
      {/* Exterior façade frames at bay boundaries (static) */}
      <StaticInstances geometry={BAR_GEOM} matrices={framing.frames} color="#1a1d24" metalness={0.72} roughness={0.4} />

      {/* Mounting brackets: cantilever from the frame out to the shaft (static) */}
      <StaticInstances geometry={BAR_GEOM} matrices={framing.brackets} color="#21262d" metalness={0.7} roughness={0.4} castShadow={false} />

      {/* Fixed central rotation shafts through each bay centre */}
      <StaticInstances
        geometry={BAR_GEOM}
        matrices={framing.shafts}
        color="#8a94a8"
        metalness={0.85}
        roughness={0.25}
        castShadow={false}
      />

      {/* Independent kinetic fins — full-bay-width, centre-pivot (the only moving part) */}
      <instancedMesh
        key={count}
        ref={setMeshInstance}
        args={[finGeom, undefined as unknown as THREE.Material, count]}
        castShadow
        receiveShadow
        onPointerDown={(e) => {
          if (!WEATHER_VALIDATION_MODE) return
          e.stopPropagation()
          if (e.instanceId !== undefined) {
            const panels = sim.skin.getAllPanels()
            if (panels[e.instanceId]) {
              setSolarSelectedModule(panels[e.instanceId].id)
            }
          }
        }}
      >
        <meshPhysicalMaterial metalness={0.85} roughness={0.35} clearcoat={0.3} clearcoatRoughness={0.2} envMapIntensity={1.2} />
      </instancedMesh>
      {vecEnabled && <axesHelper ref={debugAxesRef} args={[3]} />}
    </>
  )
}
