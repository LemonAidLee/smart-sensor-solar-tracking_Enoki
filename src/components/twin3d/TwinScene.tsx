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
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true }}
      className="absolute inset-0"
      // Stage 7.11 — the shadow depth pass was re-rendering every one of every
      // shadow-casting object (1,620 fins + 189 roof modules + curtain wall)
      // on EVERY rendered frame, even when the façade was fully settled and
      // the sun hadn't moved since the last frame. `autoUpdate = false` turns
      // that into an opt-in pass: every place something shadow-relevant
      // actually moves (`FacadeLayer.tsx`, `SceneEnvironment.tsx`'s sun rig)
      // flags `gl.shadowMap.needsUpdate = true` itself the frame it happens.
      // Three.js clears the flag after it renders that one pass, so a static
      // scene now pays for the shadow pass roughly as often as the shadows
      // actually change, not once per render frame.
      onCreated={({ gl }) => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true }}
    >
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
