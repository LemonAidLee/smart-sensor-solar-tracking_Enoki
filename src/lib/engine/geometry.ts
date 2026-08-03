/**
 * Geometry Engine — turns a building shape into a collection of exterior
 * surfaces. This is the ONLY place that knows about shapes; the Adaptive Skin
 * Engine downstream sees nothing but `BuildingSurface[]` and their normals, so
 * any footprint (box, triangle, hexagon, cylinder, L-shape, or a future imported
 * polygon) produces correct solar behaviour with zero changes to the optimiser.
 */

import type { BuildingConfig, BuildingShape, BuildingSurface, FacadePanel, PanelHealth } from './types'
import { normalize, type Vec3 } from './math'
import { ANGLE_FULLY_OPEN, opennessFromAngle, PanelState, ROTATION_MAX, ROTATION_MIN, shadingFromAngle } from './panelStates'
import { WEATHER_VALIDATION_MODE } from './validationMode'
import { facadeRowCount, floorForRow, moduleColumnsForEdge } from './facadeModule'

export interface Vec2 {
  x: number
  z: number
}

/** Deterministic hash → [0,1) so layouts + faults are stable between reloads. */
function hash(n: number): number {
  const x = Math.sin(n * 91.7 + 47.13) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Base (unrotated) footprint polygon centred at the origin, CCW in the XZ plane.
 * Exported so the renderer can extrude the exact same solid the surfaces wrap.
 */
export function footprintPolygon(shape: BuildingShape, width: number, depth: number): Vec2[] {
  const r = width / 2
  switch (shape) {
    case 'triangle':
      return regularPolygon(3, r, Math.PI / 2)
    case 'hexagon':
      return regularPolygon(6, r, Math.PI / 6)
    case 'cylinder':
      return regularPolygon(24, r, 0)
    case 'lshape': {
      const w = width / 2
      const d = depth / 2
      return [
        { x: -w, z: -d },
        { x: w, z: -d },
        { x: w, z: 0 },
        { x: 0, z: 0 },
        { x: 0, z: d },
        { x: -w, z: d },
      ]
    }
    case 'rectangle':
    default: {
      const w = width / 2
      const d = depth / 2
      return [
        { x: -w, z: -d },
        { x: w, z: -d },
        { x: w, z: d },
        { x: -w, z: d },
      ]
    }
  }
}

function regularPolygon(sides: number, radius: number, startAngle: number): Vec2[] {
  const pts: Vec2[] = []
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i / sides) * Math.PI * 2
    pts.push({ x: Math.cos(a) * radius, z: Math.sin(a) * radius })
  }
  return pts
}

/** Signed area of a footprint (positive = counter-clockwise winding). */
function signedArea(poly: Vec2[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.z - q.x * p.z
  }
  return a / 2
}

/** Generate every exterior wall surface (with its panel grid) for the building. */
export function generateSurfaces(cfg: BuildingConfig): BuildingSurface[] {
  const poly = footprintPolygon(cfg.shape, cfg.width, cfg.depth)
  const standoff = cfg.facadeDepth + 0.15
  const ccw = signedArea(poly) > 0 // consistent outward normals for convex AND concave
  const surfaces: BuildingSurface[] = []
  let panelSeq = 0

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ex = b.x - a.x
    const ez = b.z - a.z
    const len = Math.hypot(ex, ez)
    if (len < 0.5) continue

    const dir = { x: ex / len, z: ez / len } // along the edge (surface "right")
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    // Outward normal from winding: right-hand perpendicular for CCW, left for CW.
    const nx = ccw ? dir.z : -dir.z
    const nz = ccw ? -dir.x : dir.x

    // Local (unrotated) basis. Building orientation is now handled strictly via coordinate transform.
    const normal = normalize({ x: nx, y: 0, z: nz })
    const right = { x: dir.x, y: 0, z: dir.z }
    const up: Vec3 = { x: 0, y: 1, z: 0 }
    const centerXZ = { x: mid.x + nx * standoff, y: 0, z: mid.z + nz * standoff }
    const center: Vec3 = { x: centerXZ.x, y: cfg.height / 2, z: centerXZ.z }

    // Curtain-wall setting-out: this elevation's own bay count from the nominal
    // adaptive module, and the storey-aligned row count. `cellW`/`cellH` are the
    // ACTUAL module dimensions — the nominal size adjusted so the bays close
    // exactly on this elevation (see facadeModule.ts). Rows are shared by every
    // elevation so transoms line through around the whole building.
    const cols = moduleColumnsForEdge(len)
    const rows = facadeRowCount(cfg)
    const cellW = len / cols
    const cellH = cfg.height / rows
    const id = `S${(i + 1).toString().padStart(2, '0')}`

    const panels: FacadePanel[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = (c + 0.5) / cols - 0.5
        const yFromBottom = cfg.height * (1 - (r + 0.5) / rows)
        const offsetUp = yFromBottom - cfg.height / 2
        const worldPosition: Vec3 = {
          x: center.x + right.x * (u * len) + up.x * offsetUp,
          y: center.y + right.y * (u * len) + up.y * offsetUp,
          z: center.z + right.z * (u * len) + up.z * offsetUp,
        }
        const roll = hash(panelSeq++)
        // Start perpendicular (fully open) — the resting daylight position.
        const angle0 = ANGLE_FULLY_OPEN
        panels.push({
          id: `${id}-${r}-${c}`,
          surfaceId: id,
          row: r,
          column: c,
          floor: floorForRow(r, cfg),
          worldPosition,
          normal,
          width: cellW,
          height: cellH,
          state: PanelState.FULLY_OPEN,
          rotationAngle: angle0,
          targetRotation: angle0,
          commandedRotation: angle0,
          rotationVelocity: 0,
          // Slight per-blade variance in motor strength → believable inertia.
          rotationAcceleration: 135 + hash(panelSeq + 991) * 45,
          rotationLimits: { min: ROTATION_MIN, max: ROTATION_MAX },
          movementDuration: 0,
          movementState: 'idle',
          openness: opennessFromAngle(angle0),
          shading: shadingFromAngle(angle0),
          openingPercentage: Math.round(opennessFromAngle(angle0) * 100),
          incidentAngle: 90,
          solarExposure: 0,
          irradiance: 0,
          surfaceTemperature: 30,
          windLoad: 0,
          rainExposure: 0,
          powerConsumption: 0.35,
          // Fault framework preserved but disabled in Weather Validation Mode:
          // every panel is a normal operational panel while validating weather.
          healthStatus: (WEATHER_VALIDATION_MODE
            ? 'ok'
            : roll < 0.008
              ? 'fault'
              : roll < 0.025
                ? 'degraded'
                : 'ok') as PanelHealth,
        })
      }
    }

    surfaces.push({
      id,
      name: `Surface ${i + 1}`,
      normal,
      center,
      right,
      up,
      width: len,
      height: cfg.height,
      tilt: 90,
      area: len * cfg.height,
      glassRatio: cfg.glassRatio,
      panels,
    })
  }

  return surfaces
}
