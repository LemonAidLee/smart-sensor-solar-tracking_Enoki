'use client'

import { useRef } from 'react'
import * as THREE from 'three'
import { CurtainWall } from './CurtainWall'
import { FacadeLayer } from './FacadeLayer'
import { RoofSolarArray } from './RoofSolarArray'

import { useTwinStore } from '@/lib/engine/store'
import { deg2rad } from '@/lib/kinematics/vectorMath'

import { WEATHER_VALIDATION_MODE } from '@/lib/engine/validationMode'
import { ActiveSurfaceHighlight } from './ActiveSurfaceHighlight'
import { KinematicsDebug } from './KinematicsDebug'
import { OcclusionDebug } from './OcclusionDebug'
import { SelectedModuleHighlight } from './SelectedModuleHighlight'

/**
 * BuildingMesh — the Building node of the Digital Twin scene graph.
 *
 * It is now a modern Double-Skin Kinetic Façade, composed of two independent
 * skins around the engine's air cavity:
 *
 *   Building
 *    ├─ CurtainWall              FIRST skin  — static glazing + aluminium mullion bays
 *    ├─ FacadeLayer              SECOND skin — exterior frames + independent kinetic fins
 *    └─ SelectedModuleHighlight  reads FacadeLayer's own InstancedMesh transform
 *                                (`facadePanelMeshRef`) — never a re-derived position
 *
 * Everything else in the twin (scene, camera, sun, weather, PBIF pipeline, sim
 * loop, UI) is untouched: this component only redraws the building itself, from
 * the very same `sim.skin` surfaces/panels the rest of the system already uses.
 *
 * `SelectedModuleHighlight` MUST stay inside this same rotated `<group>` (so it
 * inherits `building.orientation` exactly as the fins do — see the project's
 * Scene Graph Rules) and MUST be mounted AFTER `<FacadeLayer/>` so its
 * `useFrame` runs after FacadeLayer's has refreshed this frame's instance
 * matrices (mount-order dependency, same convention `SimDriver` documents).
 */
export function BuildingMesh() {
  const orientation = useTwinStore((s) => s.building.orientation)
  const facadePanelMeshRef = useRef<THREE.InstancedMesh>(null)

  return (
    <group rotation={[0, -deg2rad(orientation), 0]}>
      <CurtainWall />
      <FacadeLayer meshRef={facadePanelMeshRef} />
      <RoofSolarArray />
      {/* Building-mounted debug/annotation objects explicitly inherit the building transform */}
      {WEATHER_VALIDATION_MODE && <ActiveSurfaceHighlight />}
      {WEATHER_VALIDATION_MODE && (
        <>
          <KinematicsDebug />
          <OcclusionDebug />
        </>
      )}
      {WEATHER_VALIDATION_MODE && <SelectedModuleHighlight facadeMeshRef={facadePanelMeshRef} />}
    </group>
  )
}
