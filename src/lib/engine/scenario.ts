/**
 * Scenario Engine — whole-configuration presets. Switching a scenario instantly
 * re-configures the building (shape, geometry, location), neighbours, weather and
 * time; the simulation then derives everything else live. Because the skin is
 * geometry-agnostic, a triangular tower or a cylinder needs no special handling.
 */

import type { Scenario } from './types'
import type { Simulation } from './simulation'

export const SCENARIOS: Scenario[] = [
  {
    id: 'kl-rect',
    name: 'KL · Office Tower',
    description: 'Rectangular tower in Kuala Lumpur, clear tropical midday.',
    building: { shape: 'rectangle', orientation: 0, locationName: 'Kuala Lumpur', latitude: 3.14, longitude: 101.69, timezone: 8, height: 120, width: 60, depth: 40 },
    neighbors: [
      { id: 'N1', width: 42, depth: 42, height: 90, distance: 120, bearing: 150 },
      { id: 'N2', width: 52, depth: 34, height: 150, distance: 165, bearing: 205 },
    ],
    weather: { temperature: 34, humidity: 70, cloudCoverage: 0.1, rainIntensity: 0, windSpeed: 10 },
    timeHours: 12.5,
    month: 6,
    skinMode: 'auto',
  },
  {
    id: 'sg-triangle',
    name: 'Singapore · Triangular',
    description: 'Triangular tower in Singapore — three surfaces, each optimised alone.',
    building: { shape: 'triangle', orientation: 20, locationName: 'Singapore', latitude: 1.35, longitude: 103.82, timezone: 8, height: 140, width: 68, depth: 68 },
    neighbors: [{ id: 'N1', width: 46, depth: 46, height: 120, distance: 120, bearing: 200 }],
    weather: { temperature: 31, humidity: 84, cloudCoverage: 0.3, rainIntensity: 0, windSpeed: 12 },
    timeHours: 9,
    month: 2,
    skinMode: 'auto',
  },
  {
    id: 'cylinder',
    name: 'Cylindrical Tower',
    description: 'A curved 24-facet skin — exposure sweeps smoothly around the sun.',
    building: { shape: 'cylinder', orientation: 0, locationName: 'Kuala Lumpur', latitude: 3.14, longitude: 101.69, timezone: 8, height: 150, width: 66, depth: 66 },
    neighbors: [],
    weather: { temperature: 33, humidity: 72, cloudCoverage: 0.15, rainIntensity: 0, windSpeed: 14 },
    timeHours: 15,
    month: 6,
    skinMode: 'auto',
  },
  {
    id: 'hexagon',
    name: 'Hexagonal · Dense',
    description: 'Hexagonal tower boxed in by tall neighbours — deep local shading.',
    building: { shape: 'hexagon', orientation: 10, locationName: 'Kuala Lumpur', latitude: 3.14, longitude: 101.69, timezone: 8, height: 130, width: 64, depth: 64 },
    neighbors: [
      { id: 'N1', width: 55, depth: 55, height: 210, distance: 100, bearing: 170 },
      { id: 'N2', width: 45, depth: 45, height: 180, distance: 110, bearing: 250 },
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
    building: { shape: 'lshape', orientation: 30, locationName: 'Kuala Lumpur', latitude: 3.14, longitude: 101.69, timezone: 8, height: 110, width: 70, depth: 70 },
    neighbors: [{ id: 'N1', width: 42, depth: 42, height: 90, distance: 130, bearing: 150 }],
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
  sim.setWeather(scenario.weather)
  sim.setTime(scenario.timeHours)
  const d = new Date(sim.clock.date)
  d.setMonth(scenario.month)
  sim.setDate(d)
  sim.skin.reset()
  sim.skin.setMode(scenario.skinMode)
}
