/**
 * Simulation Engine — the authoritative, framework-free orchestrator.
 *
 * A single instance owns all live state and advances it in `tick(dt)`:
 *   time → solar → weather → wind → adaptive skin → metrics.
 * The visualization layer reads it imperatively each frame; the presentation
 * layer reads only throttled snapshots. This is the "single source of truth"
 * that the future sensor / ESP32 / AI layers will observe — never React state.
 */

import type {
  BuildingConfig,
  BuildingMetrics,
  NeighborBuilding,
  SimClock,
  SimSnapshot,
  SkinMode,
  SunState,
  WeatherState,
} from './types'
import { computeSun } from './solar'
import { updateWeather, updateWind } from './weather'
import { AdaptiveSkinEngine } from './adaptiveSkin'
import { compassToWorld } from './math'
import { rateHz, type RateLimiter } from './scheduler'

/** Environmental tier rate — solar/weather/PBIF/occlusion/metrics recompute Hz.
 *  20 Hz is well below what perceptibly changes yet frees ~⅔ of the old work. */
const ENV_HZ = 20

const HOURS_PER_SEC_AT_1X = 24 / 120 // one simulated day in ~2 min at 1×

export const DEFAULT_BUILDING: BuildingConfig = {
  shape: 'rectangle',
  height: 120,
  width: 60,
  depth: 40,
  floorCount: 32,
  orientation: 0,
  glassRatio: 0.72,
  glassType: 'low-e',
  facadeDepth: 0.3,
  latitude: 3.14,
  longitude: 101.69,
  timezone: 8,
  locationName: 'Kuala Lumpur',
}

const DEFAULT_WEATHER: WeatherState = {
  temperature: 32,
  humidity: 30,
  windSpeed: 10,
  windDirection: 90,
  cloudCoverage: 0.15,
  rainIntensity: 0,
  pressure: 1010,
  visibility: 30,
  uvIndex: 0,
  windStrength: 0,
  groundWetness: 0,
  windVector: compassToWorld(270, 0),
}

const DEFAULT_NEIGHBORS: NeighborBuilding[] = [
  { id: 'N1', width: 42, depth: 42, height: 90, distance: 120, bearing: 150 },
  { id: 'N2', width: 52, depth: 34, height: 150, distance: 165, bearing: 205 },
]

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export class Simulation {
  clock: SimClock
  building: BuildingConfig
  neighbors: NeighborBuilding[]
  weather: WeatherState
  sun: SunState
  skin: AdaptiveSkinEngine
  metrics: BuildingMetrics

  private fps = 60
  private fpsFrames = 0
  private fpsAccum = 0
  /** Fires the expensive environmental recompute at ~ENV_HZ, not per frame. */
  private envTier: RateLimiter = rateHz(ENV_HZ)

  constructor() {
    this.clock = { date: new Date(2026, 8, 21), timeHours: 7, speed: 1, playing: false }
    this.building = { ...DEFAULT_BUILDING }
    this.neighbors = DEFAULT_NEIGHBORS.map((n) => ({ ...n }))
    this.weather = { ...DEFAULT_WEATHER }
    this.skin = new AdaptiveSkinEngine(this.building)
    this.sun = computeSun(this.clock, this.building, this.weather.cloudCoverage)
    updateWind(this.weather, 0)
    this.skin.update(this.building, this.sun, this.weather, this.neighbors, 0)
    this.metrics = this.skin.getBuildingMetrics()
  }

  // -- Hot loop --------------------------------------------------------------
  tick(dtSeconds: number): void {
    const dt = Math.min(dtSeconds, 0.05)

    // Clock advances every frame so the day/night cycle is perfectly smooth.
    if (this.clock.playing && this.clock.speed > 0) {
      this.clock.timeHours = (this.clock.timeHours + dt * HOURS_PER_SEC_AT_1X * this.clock.speed) % 24
    }

    // Environmental tier (~ENV_HZ): the astronomically/physically expensive
    // work — solar position + irradiance, weather + wind evolution, PBIF,
    // neighbour occlusion, per-surface targets and metrics — recomputed only as
    // often as it perceptibly changes. `envDt` is the true elapsed time since the
    // last recompute, so weather/wind evolve at the correct rate regardless of
    // frame rate. The façade still eases toward its target EVERY frame (below).
    const envDt = this.envTier.tick(dt)
    const resolve = envDt > 0
    if (resolve) {
      this.sun = computeSun(this.clock, this.building, this.weather.cloudCoverage)
      updateWeather(this.weather, this.sun.uvIndex, envDt)
      updateWind(this.weather, envDt)
    }

    this.skin.update(this.building, this.sun, this.weather, this.neighbors, dt, resolve)
    if (resolve) this.metrics = this.skin.getBuildingMetrics()

    this.fpsFrames++
    this.fpsAccum += dt
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum)
      this.fpsFrames = 0
      this.fpsAccum = 0
    }
  }

  // -- Config mutators (called by the store; renderer reads live) ------------
  // Each forces the environmental tier to recompute on the very next frame so a
  // slider / timeline / geometry change is reflected immediately, never up to one
  // env-interval late.
  setBuilding(patch: Partial<BuildingConfig>): void {
    this.building = { ...this.building, ...patch }
    this.skin.rebuild(this.building)
    this.envTier.trigger()
  }
  setNeighbors(neighbors: NeighborBuilding[]): void {
    this.neighbors = neighbors
    this.envTier.trigger()
  }
  setWeather(patch: Partial<WeatherState>): void {
    this.weather = { ...this.weather, ...patch }
    this.envTier.trigger()
  }
  setTime(hours: number): void {
    this.clock.timeHours = ((hours % 24) + 24) % 24
    this.envTier.trigger()
  }
  setDate(date: Date): void {
    this.clock.date = date
    this.envTier.trigger()
  }
  setSpeed(speed: number): void {
    this.clock.speed = speed
  }
  setPlaying(playing: boolean): void {
    this.clock.playing = playing
  }

  // -- Snapshot for UI (throttled by the store's polling) --------------------
  snapshot(): SimSnapshot {
    const h = Math.floor(this.clock.timeHours)
    const m = Math.floor((this.clock.timeHours - h) * 60)
    return {
      timeHours: this.clock.timeHours,
      clockLabel: `${pad(h)}:${pad(m)}`,
      sun: {
        azimuth: Math.round(this.sun.azimuth),
        altitude: Math.round(this.sun.altitude * 10) / 10,
        irradiance: this.sun.irradiance,
        uvIndex: this.sun.uvIndex,
        isDaytime: this.sun.isDaytime,
        // ASHRAE pipeline
        zenithAngle: Math.round(this.sun.zenithAngle * 10) / 10,
        airMass: this.sun.airMass,
        extraterrestrialIrradiance: this.sun.extraterrestrialIrradiance,
        tauB: this.sun.tauB,
        tauD: this.sun.tauD,
        dniClearSky: this.sun.dniClearSky,
        dhiClearSky: this.sun.dhiClearSky,
        ghiClearSky: this.sun.ghiClearSky,
        cloudModificationFactor: this.sun.cloudModificationFactor,
        // WHO UV pipeline
        uvErythemalClearSky: this.sun.uvErythemalClearSky,
        uvCloudModificationFactor: this.sun.uvCloudModificationFactor,
        ozoneDU: this.sun.ozoneDU,
      },
      weather: this.weather,
      metrics: this.metrics,
      surfaces: this.skin.getSurfaceSummaries(),
      orientation: this.building.orientation,
      shape: this.building.shape,
      skinMode: this.skin.getMode(),
      fps: this.fps,
    }
  }
}

// Lazily-created client singleton (safe on the server too — no browser APIs).
let _sim: Simulation | null = null
export function getSimulation(): Simulation {
  if (!_sim) _sim = new Simulation()
  return _sim
}

export type { SkinMode }
