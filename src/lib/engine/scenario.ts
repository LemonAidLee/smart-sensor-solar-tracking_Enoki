/**
 * Scenario Engine — whole-configuration presets. Switching a scenario instantly
 * re-configures the building (shape, geometry, location), neighbours, weather and
 * time; the simulation then derives everything else live. Because the skin is
 * geometry-agnostic, a triangular tower or a cylinder needs no special handling.
 */

import type { Scenario } from './types'
import type { Simulation } from './simulation'

/**
 * Every scenario carries `floorCount` alongside `height`, because the two
 * together fix the floor-to-floor height and therefore the storey-aligned
 * adaptive-module grid (`facadeModule.ts`). Omitting it would leave a preset
 * inheriting the reference building's 5 storeys and silently generating an
 * absurd floor-to-floor height — and with it, an absurd panel count.
 *
 * `kl-rect` IS the engineering case study from the project report; the other
 * presets are footprint-shape studies of the same 5-storey office programme, so
 * the shape-agnostic geometry/solar/PBIF stack can still be exercised on a
 * triangle, cylinder, hexagon and concave L without changing building class.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: 'kl-rect',
    name: 'KL · Reference Office',
    description: 'The project-report case study: 5-storey, 25 × 40 m commercial office in Kuala Lumpur.',
    building: { shape: 'rectangle', buildingType: 'Commercial Office', orientation: 90, locationName: 'Kuala Lumpur', latitude: 3.14, longitude: 101.69, timezone: 8, height: 19, width: 25, depth: 40, floorCount: 5 },
    neighbors: [
      { id: 'N1', width: 30, depth: 30, height: 24, distance: 70, bearing: 150 },
      { id: 'N2', width: 34, depth: 26, height: 34, distance: 92, bearing: 205 },
    ],
    weather: { temperature: 34, humidity: 70, cloudCoverage: 0.1, rainIntensity: 0, windSpeed: 10 },
    timeHours: 12.5,
    month: 6,
    skinMode: 'auto',
  },
  {
    id: 'sg-triangle',
    name: 'Singapore · Triangular',
    description: 'Triangular footprint in Singapore — three surfaces, each optimised alone.',
    building: { shape: 'triangle', buildingType: 'Commercial Office', orientation: 20, locationName: 'Singapore', latitude: 1.35, longitude: 103.82, timezone: 8, height: 19, width: 40, depth: 40, floorCount: 5 },
    neighbors: [{ id: 'N1', width: 30, depth: 30, height: 28, distance: 75, bearing: 200 }],
    weather: { temperature: 31, humidity: 84, cloudCoverage: 0.3, rainIntensity: 0, windSpeed: 12 },
    timeHours: 9,
    month: 2,
    skinMode: 'auto',
  },
  {
    id: 'cylinder',
    name: 'Cylindrical Footprint',
    description: 'A curved 24-facet skin — exposure sweeps smoothly around the sun.',
    building: { shape: 'cylinder', buildingType: 'Commercial Office', orientation: 0, locationName: 'Kuala Lumpur', latitude: 3.14, longitude: 101.69, timezone: 8, height: 19, width: 34, depth: 34, floorCount: 5 },
    neighbors: [],
    weather: { temperature: 33, humidity: 72, cloudCoverage: 0.15, rainIntensity: 0, windSpeed: 14 },
    timeHours: 15,
    month: 6,
    skinMode: 'auto',
  },
  {
    id: 'hexagon',
    name: 'Hexagonal · Dense',
    description: 'Hexagonal footprint boxed in by taller neighbours — deep local shading.',
    building: { shape: 'hexagon', buildingType: 'Commercial Office', orientation: 10, locationName: 'Kuala Lumpur', latitude: 3.14, longitude: 101.69, timezone: 8, height: 19, width: 36, depth: 36, floorCount: 5 },
    neighbors: [
      { id: 'N1', width: 34, depth: 34, height: 46, distance: 62, bearing: 170 },
      { id: 'N2', width: 30, depth: 30, height: 38, distance: 68, bearing: 250 },
    ],
    weather: { temperature: 33, humidity: 74, cloudCoverage: 0.2, rainIntensity: 0, windSpeed: 11 },
    timeHours: 13,
    month: 6,
    skinMode: 'auto',
  },
  {
    id: 'lshape-storm',
    name: 'L-Shape · Storm',
    description: 'Concave L-shape in a 42 km/h storm — the skin drives to safe mode.',
    building: { shape: 'lshape', buildingType: 'Commercial Office', orientation: 30, locationName: 'Kuala Lumpur', latitude: 3.14, longitude: 101.69, timezone: 8, height: 19, width: 40, depth: 40, floorCount: 5 },
    neighbors: [{ id: 'N1', width: 30, depth: 30, height: 26, distance: 72, bearing: 150 }],
    weather: { temperature: 27, humidity: 95, cloudCoverage: 0.9, rainIntensity: 0.8, windSpeed: 42 },
    timeHours: 16,
    month: 10,
    skinMode: 'auto',
  },
]

/** Apply a scenario to a running Simulation (instant reconfiguration). */
export function applyScenario(sim: Simulation, scenario: Scenario): void {
  sim.setBuilding(scenario.building)
  sim.setNeighbors(scenario.neighbors.map((n) => ({ ...n })))
  // A building preset carries its own fixed weather, so the source returns to
  // Manual — otherwise the Weather Scenario Engine would overwrite it on the
  // very next environmental tick.
  sim.setWeatherSource('manual')
  sim.setWeather(scenario.weather)
  sim.setTime(scenario.timeHours)
  const d = new Date(sim.clock.date)
  d.setMonth(scenario.month)
  sim.setDate(d)
  sim.skin.reset()
  sim.skin.setMode(scenario.skinMode)
}
