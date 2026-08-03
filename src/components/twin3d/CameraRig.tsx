'use client'

import { useEffect, useMemo, useRef } from 'react'
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { useTwinStore } from '@/lib/engine/store'
import { compassToWorld } from '@/lib/engine/math'
import type { CameraView } from '@/lib/engine/types'

type Vec3Tuple = [number, number, number]

interface Preset {
  ortho: boolean
  pos: Vec3Tuple
  target: Vec3Tuple
  fov?: number
  zoom?: number
}

/**
 * Framing reference derived from the actual massing, so every preset re-frames
 * itself when the building changes. `span` is the largest overall dimension (the
 * old presets were hand-tuned for the previous 120 m tower, i.e. span = 120 —
 * the ratios below reproduce those exact framings, now expressed as multiples of
 * the real geometry instead of absolute metres).
 */
interface Framing {
  /** Largest overall dimension of the building, m. */
  span: number
  /** Plan diagonal of the footprint, m. */
  diag: number
  /** Eye/target height on the elevation, m (≈ mid-façade). */
  eye: number
}

function framingOf(width: number, depth: number, height: number): Framing {
  return {
    span: Math.max(width, depth, height),
    diag: Math.hypot(width, depth),
    eye: height * 0.42,
  }
}

/**
 * Orthographic zoom is px-per-world-unit, so it must scale inversely with the
 * building. These constants are the previous hand-tuned zooms multiplied by that
 * building's 120 m span — i.e. identical framing, expressed dimensionlessly.
 */
const ORTHO_ZOOM_K = { isometric: 340, top: 300, orthographic: 290 } as const

function preset(view: CameraView, orientation: number, f: Framing): Preset {
  const target: Vec3Tuple = [0, f.eye, 0]
  // Orbit distance that comfortably contains the footprint diagonal AND the
  // full height at the perspective FOVs used below.
  const dist = Math.max(f.diag * 1.5, f.span * 1.6)
  switch (view) {
    case 'isometric':
      return { ortho: true, pos: [dist, dist * 0.9, dist], zoom: ORTHO_ZOOM_K.isometric / f.span, target }
    case 'top':
      return { ortho: true, pos: [0, f.span * 4.4, 0.1], zoom: ORTHO_ZOOM_K.top / f.span, target: [0, 0, 0] }
    case 'orthographic':
      return { ortho: true, pos: [0, f.eye * 2.1, dist * 2.2], zoom: ORTHO_ZOOM_K.orthographic / f.span, target }
    case 'facade': {
      const n = compassToWorld(orientation, 0)
      const d = dist * 1.15
      return {
        ortho: false,
        pos: [n.x * d, f.eye * 1.25, n.z * d],
        fov: 42,
        target: [n.x * f.diag * 0.2, f.eye, n.z * f.diag * 0.2],
      }
    }
    case 'perspective':
    default:
      // Three-quarter hero view: low enough to read the storeys, pulled back far
      // enough to show the building in its context.
      return { ortho: false, pos: [dist * 0.94, f.span * 0.72, dist * 0.32], fov: 45, target }
  }
}

/**
 * Camera rig with Perspective / Orthographic / Top / Isometric / Façade-Inspection
 * presets. The façade view aligns to the current building orientation so it always
 * frames the kinetic skin head-on, however the building is rotated. Every preset
 * is derived from the live building dimensions — no preset assumes a size.
 */
export function CameraRig() {
  const view = useTwinStore((s) => s.cameraView)
  const orientation = useTwinStore((s) => s.building.orientation)
  const { width, depth, height } = useTwinStore((s) => s.building)
  const f = useMemo(() => framingOf(width, depth, height), [width, depth, height])
  const p = useMemo(() => preset(view, orientation, f), [view, orientation, f])
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null)

  useEffect(() => {
    const c = controls.current
    if (c) {
      c.target.set(p.target[0], p.target[1], p.target[2])
      c.update()
    }
  }, [p])

  const camKey = `${view}-${view === 'facade' ? Math.round(orientation) : 0}`

  return (
    <>
      {p.ortho ? (
        <OrthographicCamera key={camKey} makeDefault position={p.pos} zoom={p.zoom} near={0.5} far={4000} />
      ) : (
        <PerspectiveCamera key={camKey} makeDefault position={p.pos} fov={p.fov} near={0.5} far={5000} />
      )}
      {/* Zoom envelope scales with the building: close enough to inspect a single
          1.2 m module, far enough to see the whole district. */}
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI * 0.49}
        minDistance={Math.max(6, f.diag * 0.35)}
        maxDistance={Math.max(250, f.span * 4)}
        target={p.target}
      />
    </>
  )
}
