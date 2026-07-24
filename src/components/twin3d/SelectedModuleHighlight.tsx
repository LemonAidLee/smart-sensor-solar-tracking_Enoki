'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { Cpu, RotateCw, Sun, Wind } from 'lucide-react'
import { getSimulation } from '@/lib/engine/simulation'
import { useTwinStore } from '@/lib/engine/store'
import { lerp } from '@/lib/engine/math'
import { panelIndex, pickUpperCentrePanel } from '@/lib/embedded'
import { useModuleHighlightStore } from '@/lib/dt/moduleHighlightStore'

/**
 * SelectedModuleHighlight — Objective 1: identify which physical façade
 * module the Virtual Embedded Controller belongs to.
 *
 * ── Coordinate-system contract ────────────────────────────────────────────
 * This is NOT a screen-space decoration and it does not estimate the panel's
 * world position. A single `ModuleAnchor` (`anchorRef`, the returned
 * `<group>`) is the ONE object every visual element derives from:
 *
 *   FacadeLayer's InstancedMesh (the actual rotating fin)
 *           │  getMatrixAt(panelIndex) — the exact transform already driving it
 *           ▼
 *   ModuleAnchor  (this component's <group>, mounted INSIDE the same
 *                  building-orientation <group> as FacadeLayer — see
 *                  BuildingMesh.tsx — so it automatically inherits building
 *                  rotation via the scene graph, never a re-derived angle)
 *           │
 *     ┌─────┼──────────────┐
 *     ▼     ▼               ▼
 *  Outline  Label      Hardware Icons
 *     │
 *     ▼
 *  Screen projection (of the anchor's OWN resolved world position) → store → Leader Line
 *
 * The ONLY manual number here is a small standoff along the anchor's local
 * +Z (the panel's current local normal, i.e. it rotates with the blade),
 * applied AFTER inheriting the panel's transform — never before it, and
 * never as a separately-recomputed world-space offset.
 *
 * `facadeMeshRef` must be the SAME ref passed to `FacadeLayer`, and this
 * component must be mounted AFTER `<FacadeLayer/>` as a sibling inside
 * `BuildingMesh`'s oriented group, so its `useFrame` reads THIS frame's
 * already-updated instance matrix (matching `SimDriver`'s own "mount order
 * determines useFrame order" convention).
 */

interface SelectedModuleHighlightProps {
  facadeMeshRef: React.RefObject<THREE.InstancedMesh | null>
}

const HIGHLIGHT_COLOR = '#22d3ee'
/** Slow pulse angular frequency, rad/s — a ~12.6 s period, deliberately subtle. */
const PULSE_SPEED = 0.5
const OUTLINE_OPACITY_MIN = 0.5
const OUTLINE_OPACITY_MAX = 0.85
const GLOW_OPACITY_MIN = 0.035
const GLOW_OPACITY_MAX = 0.075
/** How often the screen-space projection is pushed to the store, seconds. */
const PROJECTION_INTERVAL = 0.1
/**
 * Cosmetic standoff along the panel's local normal, scene-metres (this scene
 * uses real-world metres — panels are ~4 m cells — not PCB-scale millimetres).
 * `depthTest: false` below already prevents any actual z-fighting; this only
 * keeps the outline reading as "just off" the fin's face rather than flush.
 */
const STANDOFF_METERS = 0.1

const OUTLINE_POSITIONS = new Float32Array([
  -0.5, -0.5, 0,
  0.5, -0.5, 0,
  0.5, 0.5, 0,
  -0.5, 0.5, 0,
])

export function SelectedModuleHighlight({ facadeMeshRef }: SelectedModuleHighlightProps) {
  const sim = getSimulation()
  const building = useTwinStore((s) => s.building)
  const panelOpen = useModuleHighlightStore((s) => s.panelOpen)
  const setScreen = useModuleHighlightStore((s) => s.setScreen)

  // Same panel VirtualEmbeddedPanel resolves, plus its position in the SAME
  // array FacadeLayer's InstancedMesh indexes — both re-run only when the
  // building geometry changes, never per-frame. `building` isn't read inside
  // the callback (it reads `sim`'s live surfaces instead) but is required to
  // invalidate this memo when `setBuilding`/`setOrientation` replace it.
  const resolvedIndex = useMemo(() => {
    const panel = pickUpperCentrePanel(sim)
    return panel ? panelIndex(sim, panel.id) : -1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building, sim])

  const anchorRef = useRef<THREE.Group>(null)
  const outlineMat = useRef<THREE.LineBasicMaterial>(null)
  const glowMat = useRef<THREE.MeshBasicMaterial>(null)
  const projAcc = useRef(0)

  const outlineGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(OUTLINE_POSITIONS, 3))
    return geo
  }, [])

  // Reusable scratch objects — never allocated in the frame loop.
  const instanceMatrix = useMemo(() => new THREE.Matrix4(), [])
  const decomposedPos = useMemo(() => new THREE.Vector3(), [])
  const decomposedQuat = useMemo(() => new THREE.Quaternion(), [])
  const decomposedScale = useMemo(() => new THREE.Vector3(), [])
  const localNormal = useMemo(() => new THREE.Vector3(), [])
  const worldPos = useMemo(() => new THREE.Vector3(), [])
  const camDir = useMemo(() => new THREE.Vector3(), [])
  const toPoint = useMemo(() => new THREE.Vector3(), [])
  const ndc = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera, size, clock }, dt) => {
    const anchor = anchorRef.current
    const facadeMesh = facadeMeshRef.current
    if (!anchor) return

    if (!facadeMesh || resolvedIndex < 0) {
      anchor.visible = false
      return
    }
    anchor.visible = true

    // Read the fin's ACTUAL current transform — the one source of truth,
    // never re-derived from panel.normal/rotationAngle/surface basis.
    facadeMesh.getMatrixAt(resolvedIndex, instanceMatrix)
    instanceMatrix.decompose(decomposedPos, decomposedQuat, decomposedScale)

    // Standoff AFTER the inherited transform, along the panel's current local
    // normal (rotates with the blade — this IS "attached to the module").
    localNormal.set(0, 0, 1).applyQuaternion(decomposedQuat)
    anchor.position.copy(decomposedPos).addScaledVector(localNormal, STANDOFF_METERS)
    anchor.quaternion.copy(decomposedQuat)
    // XY only — matches the fin's actual rendered width/height; Z-scale is
    // irrelevant to a flat (Z=0) outline.
    anchor.scale.set(decomposedScale.x, decomposedScale.y, 1)

    const t = clock.elapsedTime
    const pulse = Math.sin(t * PULSE_SPEED) * 0.5 + 0.5
    if (outlineMat.current) outlineMat.current.opacity = lerp(OUTLINE_OPACITY_MIN, OUTLINE_OPACITY_MAX, pulse)
    if (glowMat.current) glowMat.current.opacity = lerp(GLOW_OPACITY_MIN, GLOW_OPACITY_MAX, pulse)

    // Throttled screen-space projection for the 2D leader line — reads the
    // anchor's OWN resolved world position (post building-orientation via the
    // scene graph), not a separately-tracked local variable.
    projAcc.current += dt
    if (projAcc.current < PROJECTION_INTERVAL) return
    projAcc.current = 0

    anchor.updateMatrixWorld(true)
    anchor.getWorldPosition(worldPos)

    camera.getWorldDirection(camDir)
    toPoint.subVectors(worldPos, camera.position)
    if (camDir.dot(toPoint) <= 0) {
      setScreen(null)
      return
    }
    ndc.copy(worldPos).project(camera)
    setScreen({ x: (ndc.x * 0.5 + 0.5) * size.width, y: (-ndc.y * 0.5 + 0.5) * size.height })
  })

  return (
    <group ref={anchorRef} renderOrder={5}>
      {/* Faint emissive wash — the "slight brightness increase". */}
      <mesh renderOrder={5}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={glowMat}
          color={HIGHLIGHT_COLOR}
          transparent
          opacity={GLOW_OPACITY_MIN}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* Thin cyan outline. */}
      <lineLoop geometry={outlineGeometry} renderOrder={6}>
        <lineBasicMaterial ref={outlineMat} color={HIGHLIGHT_COLOR} transparent opacity={OUTLINE_OPACITY_MIN} depthTest={false} toneMapped={false} />
      </lineLoop>

      {/* Engineering label — always visible while a module is selected. */}
      <Html position={[0, 0.62, 0.1]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div className="glass whitespace-nowrap rounded-full border border-electric/25 px-2.5 py-1 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-electric">Embedded Controller</p>
          <p className="text-[9px] font-medium text-white/80">Upper Centre</p>
        </div>
      </Html>

      {/* Hardware icons — gently fade in with the panel (recommendation). */}
      <HardwareIcon icon={Sun} position={[-0.25, 0.4, 0.08]} color="#f59e0b" visible={panelOpen} />
      <HardwareIcon icon={Wind} position={[0.25, 0.4, 0.08]} color="#f59e0b" visible={panelOpen} />
      <HardwareIcon icon={Sun} position={[0, -0.4, 0.08]} color="#f59e0b" visible={panelOpen} />
      <HardwareIcon icon={RotateCw} position={[0, 0, 0.08]} color="#a78bfa" visible={panelOpen} />
      <HardwareIcon icon={Cpu} position={[0.3, -0.15, 0.08]} color="#38bdf8" visible={panelOpen} />
    </group>
  )
}

function HardwareIcon({
  icon: Icon,
  position,
  color,
  visible,
}: {
  icon: typeof Sun
  position: [number, number, number]
  color: string
  visible: boolean
}) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div
        className="flex h-5 w-5 items-center justify-center rounded-full border transition-opacity duration-700"
        style={{ opacity: visible ? 0.75 : 0, background: 'rgba(10,14,20,0.55)', borderColor: `${color}55`, backdropFilter: 'blur(2px)' }}
      >
        <Icon className="h-2.5 w-2.5" style={{ color }} />
      </div>
    </Html>
  )
}
