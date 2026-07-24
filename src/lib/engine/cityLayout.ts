/**
 * cityLayout — deterministic procedural generation of the surrounding urban
 * district (data only; no three.js, no React).
 *
 * The goal is architectural context, not a game world: believable urban blocks
 * on a street grid, with varied heights, footprints and roof forms, placed
 * intentionally around — never on top of — the central adaptive-façade site.
 * Everything is generated once from a fixed seed so the city is stable across
 * renders and reloads (and identical for every viewer).
 *
 * Consumed by `CityLife` (buildings, trees, vehicles, lamps) and kept lightweight
 * so the whole district is a modest, instancing-friendly set of primitives.
 */

const EXTENT = 1200
const BLOCK = 160

export type RoofKind = 'flat' | 'parapet' | 'penthouse' | 'stepped' | 'antenna'

export interface RoofCap {
  dx: number
  dy: number
  dz: number
  w: number
  h: number
  d: number
  kind: 'equip' | 'penthouse' | 'mast'
}

export interface CityBuilding {
  id: number
  x: number
  z: number
  w: number
  h: number
  d: number
  roof: RoofKind
  caps: RoofCap[]
}

export interface CityTree {
  x: number
  z: number
  scale: number
  phase: number
  conical: boolean
}

export interface CityLamp {
  x: number
  z: number
  dir: number
  rotY: number
}

export interface CityVehicle {
  axis: 'x' | 'z'
  lane: number
  dir: number
  speed: number
  offset: number
  warm: boolean
}

export interface RoadSegment {
  x: number
  z: number
  length: number
  width: number
  axis: 'x' | 'z'
  major: boolean
}

export interface CityLayout {
  buildings: CityBuilding[]
  trees: CityTree[]
  lamps: CityLamp[]
  vehicles: CityVehicle[]
  roads: RoadSegment[]
  signal: { x: number; z: number }
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const dist = (x: number, z: number) => Math.hypot(x, z)

// Fixed plaza block boundaries
const PLAZA_X = 240
const PLAZA_Z = 200

function makeBuildings(rand: () => number, bufferRadius: number): CityBuilding[] {
  const buildings: CityBuilding[] = []
  let id = 0

  for (let gx = -EXTENT; gx <= EXTENT; gx += BLOCK) {
    for (let gz = -EXTENT; gz <= EXTENT; gz += BLOCK) {
      const isPlazaBlock = Math.abs(gx) <= PLAZA_X && Math.abs(gz) <= PLAZA_Z
      const perBlock = isPlazaBlock ? 3 : (rand() < 0.6 ? 2 : 1)
      
      for (let k = 0; k < perBlock; k++) {
        const jx = (rand() - 0.5) * (BLOCK - 40)
        const jz = (rand() - 0.5) * (BLOCK - 40)
        const x = gx + jx
        const z = gz + jz
        const r = dist(x, z)

        // Avoid roads
        if (Math.abs(z - PLAZA_Z) < 30 || Math.abs(z + PLAZA_Z) < 26) continue
        if (Math.abs(x - PLAZA_X) < 26 || Math.abs(x + PLAZA_X) < 26) continue

        let w = 24 + rand() * 36
        let d = 24 + rand() * 36
        let h = 0

        // Zone 1: SOLIS Plaza (Protected Urban Buffer)
        if (r < bufferRadius) continue // Strictly clear the central buffer
        
        if (Math.abs(x) < PLAZA_X && Math.abs(z) < PLAZA_Z) {
          // Inside the plaza block, but outside the immediate buffer: low-profile campus elements
          if (rand() < 0.4) continue // sparser
          w = 12 + rand() * 20
          d = 12 + rand() * 20
          h = 6 + rand() * 14 // 1 to 4 stories max
        } else {
          // Zone 2: Immediate Urban Context (Medium-rise)
          // Zone 3: City Core (High-rise)
          const isCore = r > bufferRadius + 300
          
          if (!isCore) {
            // Zone 2
            h = 16 + rand() * 28
            if (rand() < 0.3) continue // More generous spacing
          } else {
            // Zone 3
            const tower = rand() < 0.35
            h = 45 + rand() * (tower ? 115 : 60)
          }

          // Solar Protection: Penalize tall buildings in the South (+z) and East (+x) quadrants
          // that would permanently block morning/midday sun.
          if (x > -50 && z > -50) {
            if (h > 60) {
              h = 30 + rand() * 25 // cap at ~55m
            }
          }
        }

        if (h <= 0) continue

        const caps: RoofCap[] = []
        let roof: RoofKind = 'flat'
        const roll = rand()
        if (h > 120 && roll < 0.3) {
          roof = 'stepped'
          caps.push({ dx: 0, dy: 0, dz: 0, w: w * 0.6, h: 10 + rand() * 20, d: d * 0.6, kind: 'penthouse' })
        } else if (roll < 0.6) {
          roof = 'penthouse'
          caps.push({
            dx: (rand() - 0.5) * w * 0.4, dy: 0, dz: (rand() - 0.5) * d * 0.4,
            w: 6 + rand() * 10, h: 4 + rand() * 6, d: 6 + rand() * 10, kind: 'equip',
          })
        } else if (roll < 0.75) {
          roof = 'parapet'
        }
        if (h > 200 && rand() < 0.4) {
          roof = 'antenna'
          caps.push({ dx: 0, dy: 0, dz: 0, w: 0.6, h: 16 + rand() * 20, d: 0.6, kind: 'mast' })
        }

        buildings.push({ id: id++, x, z, w, h, d, roof, caps })
      }
    }
  }
  return buildings
}

function makeTrees(rand: () => number, bufferRadius: number): CityTree[] {
  const trees: CityTree[] = []
  
  // Street trees along front avenue (z = 200)
  for (let i = 0; i < 30; i++) {
    const x = -EXTENT * 0.8 + (i / 29) * EXTENT * 1.6
    if (Math.abs(x) < 50) continue // intersection clearance
    trees.push({ x, z: PLAZA_Z - 18, scale: 0.8 + rand() * 0.5, phase: rand() * 6.28, conical: rand() < 0.35 })
  }

  // Street trees along back avenue (z = -200)
  for (let i = 0; i < 30; i++) {
    const x = -EXTENT * 0.8 + (i / 29) * EXTENT * 1.6
    trees.push({ x, z: -PLAZA_Z + 18, scale: 0.8 + rand() * 0.5, phase: rand() * 6.28, conical: rand() < 0.3 })
  }

  // Campus trees inside Zone 1 (SOLIS Plaza)
  for (let i = 0; i < 45; i++) {
    const a = rand() * Math.PI * 2
    // Place trees inside the block but outside the central core
    const r = (bufferRadius * 0.5) + rand() * (bufferRadius * 0.6)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (Math.abs(x) < PLAZA_X - 10 && Math.abs(z) < PLAZA_Z - 10) {
      trees.push({
        x, z, scale: 0.6 + rand() * 0.7, phase: rand() * 6.28, conical: rand() < 0.4
      })
    }
  }

  return trees
}

function makeLamps(): CityLamp[] {
  const lamps: CityLamp[] = []
  for (let i = 0; i < 18; i++) {
    const x = -600 + (i / 17) * 1200
    lamps.push({ x, z: PLAZA_Z - 12, dir: -1, rotY: 0 })
  }
  for (let i = 0; i < 16; i++) {
    const x = -560 + (i / 15) * 1120
    lamps.push({ x, z: -PLAZA_Z + 12, dir: 1, rotY: 0 })
  }
  for (let i = 0; i < 10; i++) {
    const z = -PLAZA_Z + 40 + (i / 9) * (PLAZA_Z * 2 - 80)
    lamps.push({ x: -PLAZA_X - 12, z, dir: 1, rotY: Math.PI / 2 })
    lamps.push({ x: PLAZA_X + 12, z, dir: -1, rotY: -Math.PI / 2 })
  }
  return lamps
}

function makeVehicles(rand: () => number): CityVehicle[] {
  const v: CityVehicle[] = []
  // Front avenue
  v.push({ axis: 'x', lane: PLAZA_Z + 5, dir: 1, speed: 26, offset: rand() * 1000, warm: true })
  v.push({ axis: 'x', lane: PLAZA_Z + 12, dir: 1, speed: 22, offset: rand() * 1000, warm: true })
  v.push({ axis: 'x', lane: PLAZA_Z - 5, dir: -1, speed: 24, offset: rand() * 1000, warm: false })
  v.push({ axis: 'x', lane: PLAZA_Z - 12, dir: -1, speed: 30, offset: rand() * 1000, warm: false })
  // Back road
  v.push({ axis: 'x', lane: -PLAZA_Z + 5, dir: 1, speed: 20, offset: rand() * 1000, warm: true })
  v.push({ axis: 'x', lane: -PLAZA_Z - 5, dir: -1, speed: 23, offset: rand() * 1000, warm: false })
  // West cross street
  v.push({ axis: 'z', lane: -PLAZA_X + 4, dir: 1, speed: 21, offset: rand() * 500, warm: true })
  v.push({ axis: 'z', lane: -PLAZA_X - 4, dir: -1, speed: 25, offset: rand() * 500, warm: false })
  // East cross street
  v.push({ axis: 'z', lane: PLAZA_X + 4, dir: -1, speed: 22, offset: rand() * 500, warm: true })
  v.push({ axis: 'z', lane: PLAZA_X - 4, dir: 1, speed: 20, offset: rand() * 500, warm: false })
  return v
}

function makeRoads(): RoadSegment[] {
  return [
    { x: 0, z: PLAZA_Z, length: EXTENT * 2, width: 30, axis: 'x', major: true },
    { x: 0, z: -PLAZA_Z, length: EXTENT * 2, width: 22, axis: 'x', major: false },
    { x: -PLAZA_X, z: 0, length: PLAZA_Z * 2.2, width: 20, axis: 'z', major: false },
    { x: PLAZA_X, z: 0, length: PLAZA_Z * 2.2, width: 20, axis: 'z', major: false },
  ]
}

let cachedHeightBucket = -1
let cached: CityLayout | null = null

export function getCityLayout(buildingHeight: number = 200): CityLayout {
  const bucket = Math.round(buildingHeight / 20) * 20
  if (cached && cachedHeightBucket === bucket) return cached
  
  const rand = mulberry32(0x50115) // "SOLIS"
  const bufferRadius = Math.max(140, buildingHeight * 1.1)
  
  cached = {
    buildings: makeBuildings(rand, bufferRadius),
    trees: makeTrees(rand, bufferRadius),
    lamps: makeLamps(),
    vehicles: makeVehicles(rand),
    roads: makeRoads(),
    signal: { x: -PLAZA_X, z: PLAZA_Z },
  }
  cachedHeightBucket = bucket
  return cached
}
