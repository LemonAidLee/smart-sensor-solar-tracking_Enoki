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

function preset(view: CameraView, orientation: number): Preset {
  const target: Vec3Tuple = [0, 45, 0]
  switch (view) {
    case 'isometric':
      return { ortho: true, pos: [200, 180, 200], zoom: 2.8, target }
    case 'top':
      return { ortho: true, pos: [0, 520, 0.1], zoom: 2.5, target: [0, 0, 0] }
    case 'orthographic':
      return { ortho: true, pos: [0, 95, 280], zoom: 2.4, target }
    case 'facade': {
      const n = compassToWorld(orientation, 0)
      const dist = 140
      return { ortho: false, pos: [n.x * dist, 50, n.z * dist], fov: 42, target: [n.x * 10, 45, n.z * 10] }
    }
    case 'perspective':
    default:
      // Lower angle, pulled back to show scale and context
      return { ortho: false, pos: [170, 75, 190], fov: 45, target }
  }
}

/**
 * Camera rig with Perspective / Orthographic / Top / Isometric / Façade-Inspection
 * presets. The façade view aligns to the current building orientation so it always
 * frames the kinetic skin head-on, however the building is rotated.
 */
export function CameraRig() {
  const view = useTwinStore((s) => s.cameraView)
  const orientation = useTwinStore((s) => s.building.orientation)
  const p = useMemo(() => preset(view, orientation), [view, orientation])
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
        <OrthographicCamera key={camKey} makeDefault position={p.pos} zoom={p.zoom} near={1} far={4000} />
      ) : (
        <PerspectiveCamera key={camKey} makeDefault position={p.pos} fov={p.fov} near={1} far={5000} />
      )}
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI * 0.49}
        minDistance={40}
        maxDistance={950}
        target={p.target}
      />
    </>
  )
}
