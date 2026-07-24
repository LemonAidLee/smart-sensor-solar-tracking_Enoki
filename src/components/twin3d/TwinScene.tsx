'use client'

import { Canvas } from '@react-three/fiber'
import { SimDriver } from './SimDriver'
import { CameraRig } from './CameraRig'
import { SceneEnvironment } from './SceneEnvironment'
import { NightSky } from './NightSky'
import { CloudLayer } from './CloudLayer'
import { BuildingMesh } from './BuildingMesh'
import { OrientationOverlay } from './OrientationOverlay'
import { NeighborsMesh } from './NeighborsMesh'
import { GroundScene } from './GroundScene'
import { CityLife } from './CityLife'
import { RainFX } from './RainFX'
import { WEATHER_VALIDATION_MODE } from '@/lib/engine/validationMode'

/**
 * Visualization Layer root. The `<Canvas>` hosts the single simulation driver
 * first (so meshes read freshly-ticked state), then the scene. All simulation
 * logic lives in the engine — these components only read + draw it.
 */
export function TwinScene() {
  return (
    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} className="absolute inset-0">
      <SimDriver />
      <CameraRig />
      <SceneEnvironment />
      <NightSky />
      <CloudLayer />
      <GroundScene />
      {/* The Building node — a double-skin kinetic façade (curtain wall + kinetic fins).
          SelectedModuleHighlight now mounts INSIDE BuildingMesh's own oriented
          group (see BuildingMesh.tsx) so it inherits building orientation and
          reads FacadeLayer's actual instance transform — not a scene-level sibling. */}
      <BuildingMesh />
      {/* Weather Validation Mode: world-fixed compass */}
      {WEATHER_VALIDATION_MODE && <OrientationOverlay />}
      <NeighborsMesh />
      <CityLife />
      <RainFX />
    </Canvas>
  )
}
