import type { BuildingConfig, PVModule } from './types'

export const PV_MODULE_W = 1.134
export const PV_MODULE_H = 2.278
export const PV_MODULE_THICKNESS = 0.035
export const PV_TILT_DEG = 0

/**
 * Stage 7.1: Rooftop PV System Engine
 * 
 * Generates the geometry for the rooftop PV modules based on building configuration.
 * This ensures the Solar Physics Engine evaluates the exact same module layout 
 * that the 3D visualizer renders.
 */
export class RooftopPVEngine {
  private modules: PVModule[] = []

  constructor(building: BuildingConfig) {
    this.rebuild(building)
  }

  public rebuild(building: BuildingConfig) {
    this.modules = []
    
    const { width, depth, height } = building
    
    const pitchX = 1.15 // 1.134m module + 16mm clamp gap
    const pitchZ = 2.5  // allows for inter-row shading clearance and maintenance

    // Central HVAC plant footprint (width * 0.42, depth * 0.42) + 1.0m clearance
    const plantClearX = (width * 0.42) / 2 + 1.0
    const plantClearZ = (depth * 0.42) / 2 + 1.0
    
    // Target 189 panels (190 slots minus 1 hatch)
    const startX = -11.0
    const endX = 11.0
    const startZ = -16.0
    const endZ = 14.0

    const validPoints: {x: number, z: number}[] = []
    
    for (let z = startZ; z <= endZ + 0.1; z += pitchZ) {
      for (let x = startX; x <= endX + 0.1; x += pitchX) {
        if (Math.abs(x) < plantClearX && Math.abs(z) < plantClearZ) {
          continue
        }
        validPoints.push({ x, z })
      }
    }
    
    const selected = validPoints.slice(0, 189)
    const tiltRad = (PV_TILT_DEG * Math.PI) / 180
    const rackingHeight = height + 0.05
    const dy = (PV_MODULE_H / 2) * Math.sin(tiltRad)
    
    // With 0 degree tilt, normal is straight up.
    // If tilt is non-zero (rotated around X), normal tilts towards -Z or +Z.
    // Here we're rotating -90 around X, then +tilt.
    // Starting with Front Face = +Z.
    // Rotating -90 around X makes Front Face point UP (+Y).
    // Then rotating +tilt around X points it slightly backward (-Z).
    // So normal = [0, cos(tilt), -sin(tilt)].
    const nx = 0
    const ny = Math.cos(tiltRad)
    const nz = -Math.sin(tiltRad)
    
    selected.forEach((pt, idx) => {
      this.modules.push({
        id: `PV-${idx}`,
        worldPosition: { x: pt.x, y: rackingHeight + dy, z: pt.z },
        normal: { x: nx, y: ny, z: nz }
      })
    })
  }

  public getModules(): PVModule[] {
    return this.modules
  }
}
