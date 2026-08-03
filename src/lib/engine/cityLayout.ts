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

const EXTENT = 200
const PLAZA_X = 100
const PLAZA_Z = 100

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

function makeBuildings(rand: () => number, bufferRadius: number): CityBuilding[] {
  const buildings: CityBuilding[] = []
  
  // 4 simple contextual buildings on the outer corners, flat roof, grey/glass
  const corners = [
    { x: 160, z: 160 },
    { x: -160, z: 160 },
    { x: 160, z: -160 },
    { x: -160, z: -160 }
  ]
  
  corners.forEach((c, i) => {
    buildings.push({
      id: i,
      x: c.x,
      z: c.z,
      w: 40 + rand() * 20,
      h: 30 + rand() * 30, // 30-60m tall
      d: 40 + rand() * 20,
      roof: 'flat',
      caps: [] // No cluttered roofs
    })
  })
  
  return buildings
}

function makeTrees(rand: () => number, bufferRadius: number): CityTree[] {
  const trees: CityTree[] = []
  
  // Intentional placement: road corners, parking edges, lawn boundaries
  const places = [
    // Road corners (inside the block)
    {x: 80, z: 80}, {x: -80, z: 80}, {x: 80, z: -80}, {x: -80, z: -80},
    // Parking edge (rear -z)
    {x: -40, z: -70}, {x: -20, z: -70}, {x: 0, z: -70}, {x: 20, z: -70}, {x: 40, z: -70},
    // Verge (front)
    {x: -60, z: 85}, {x: -20, z: 85}, {x: 20, z: 85}, {x: 60, z: 85},
    // Left boundary
    {x: -85, z: -40}, {x: -85, z: 0}, {x: -85, z: 40},
    // Right boundary
    {x: 85, z: -40}, {x: 85, z: 0}, {x: 85, z: 40}
  ]
  
  places.forEach((p, i) => {
    trees.push({
      x: p.x,
      z: p.z,
      scale: 0.25 + rand() * 0.25, // Mix small, medium, large
      phase: rand() * 6.28,
      conical: rand() < 0.3
    })
  })
  
  return trees
}

function makeLamps(): CityLamp[] {
  const lamps: CityLamp[] = []
  // Align lamps perfectly along the road edges
  for (let i = 0; i < 6; i++) {
    const x = -100 + (i / 5) * 200
    lamps.push({ x, z: PLAZA_Z + 10, dir: -1, rotY: 0 })
    lamps.push({ x, z: -PLAZA_Z - 10, dir: 1, rotY: Math.PI })
  }
  for (let i = 0; i < 6; i++) {
    const z = -100 + (i / 5) * 200
    lamps.push({ x: -PLAZA_X - 10, z, dir: 1, rotY: Math.PI / 2 })
    lamps.push({ x: PLAZA_X + 10, z, dir: -1, rotY: -Math.PI / 2 })
  }
  return lamps
}

function makeVehicles(rand: () => number): CityVehicle[] {
  const v: CityVehicle[] = []
  v.push({ axis: 'x', lane: PLAZA_Z + 20, dir: 1, speed: 18, offset: rand() * 1000, warm: true })
  v.push({ axis: 'x', lane: -PLAZA_Z - 20, dir: -1, speed: 20, offset: rand() * 1000, warm: false })
  v.push({ axis: 'z', lane: PLAZA_X + 20, dir: -1, speed: 19, offset: rand() * 500, warm: true })
  v.push({ axis: 'z', lane: -PLAZA_X - 20, dir: 1, speed: 21, offset: rand() * 500, warm: false })
  return v
}

function makeRoads(): RoadSegment[] {
  return [
    { x: 0, z: PLAZA_Z + 20, length: EXTENT * 2, width: 16, axis: 'x', major: false },
    { x: 0, z: -PLAZA_Z - 20, length: EXTENT * 2, width: 16, axis: 'x', major: false },
    { x: -PLAZA_X - 20, z: 0, length: EXTENT * 2, width: 16, axis: 'z', major: false },
    { x: PLAZA_X + 20, z: 0, length: EXTENT * 2, width: 16, axis: 'z', major: false },
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
    signal: { x: -PLAZA_X - 10, z: PLAZA_Z + 10 },
  }
  cachedHeightBucket = bucket
  return cached
}
