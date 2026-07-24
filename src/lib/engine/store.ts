'use client'

/**
 * Presentation-layer store (Zustand). Holds ONLY configuration, control state
 * and a throttled telemetry snapshot — never per-frame panel data. Every action
 * drives the non-React {@link Simulation} singleton imperatively and mirrors the
 * config so React inputs stay controlled. The 60 fps loop lives in the engine.
 */

import { create } from 'zustand'
import type {
  BuildingConfig,
  CameraView,
  NeighborBuilding,
  SimSnapshot,
  SkinMode,
  WeatherState,
} from './types'
import { getSimulation } from './simulation'
import { applyScenario, SCENARIOS } from './scenario'
import type { PanelState } from './panelStates'
import type { FacadeControlMode } from './facadeControl'

type WeatherInputs = Pick<
  WeatherState,
  'temperature' | 'humidity' | 'windSpeed' | 'windDirection' | 'cloudCoverage' | 'rainIntensity'
>

let neighborSeq = 100

interface TwinState {
  building: BuildingConfig
  neighbors: NeighborBuilding[]
  weather: WeatherInputs
  speed: number
  playing: boolean
  month: number
  skinMode: SkinMode
  manualRotation: number
  /** Weather Validation Mode: source of the façade target rotation. */
  facadeControlMode: FacadeControlMode
  /** Sun-Tracking intent for the geometry engine. */
  trackingIntent: 'shade' | 'daylight'
  /** Surface id inspected by the kinematics debug overlay/panel (null = auto). */
  debugSurfaceId: string | null
  powerLoss: number
  cameraView: CameraView
  scenarioId: string | null
  snapshot: SimSnapshot

  setBuilding: (patch: Partial<BuildingConfig>) => void
  setOrientation: (deg: number) => void
  addNeighbor: () => void
  removeNeighbor: (id: string) => void
  updateNeighbor: (id: string, patch: Partial<NeighborBuilding>) => void
  setWeather: (patch: Partial<WeatherInputs>) => void
  setTime: (hours: number) => void
  setScrubbing: (b: boolean) => void
  setSpeed: (s: number) => void
  togglePlay: () => void
  setMonth: (m: number) => void
  setSkinMode: (m: SkinMode) => void
  setManualRotation: (a: number) => void
  setFacadeControlMode: (mode: FacadeControlMode) => void
  setTrackingIntent: (intent: 'shade' | 'daylight') => void
  setDebugSurface: (id: string | null) => void
  setSurfaceRotation: (surfaceId: string, angle: number) => void
  setSurfaceState: (surfaceId: string, state: PanelState) => void
  openAll: () => void
  closeAll: () => void
  wave: () => void
  resetSkin: () => void
  setPowerLoss: (fraction: number) => void
  setCameraView: (v: CameraView) => void
  applyScenarioId: (id: string) => void
  pull: () => void
}

let scrubbing = false

function mirrorWeather(): WeatherInputs {
  const w = getSimulation().weather
  return {
    temperature: w.temperature,
    humidity: w.humidity,
    windSpeed: w.windSpeed,
    windDirection: w.windDirection,
    cloudCoverage: w.cloudCoverage,
    rainIntensity: w.rainIntensity,
  }
}

export const useTwinStore = create<TwinState>((set, get) => {
  const sim = getSimulation()
  return {
    building: { ...sim.building },
    neighbors: sim.neighbors.map((n) => ({ ...n })),
    weather: mirrorWeather(),
    speed: sim.clock.speed,
    playing: sim.clock.playing,
    month: sim.clock.date.getMonth(),
    skinMode: sim.skin.getMode(),
    manualRotation: sim.skin.getManualRotation(),
    facadeControlMode: sim.skin.getFacadeControlMode(),
    trackingIntent: sim.skin.getTrackingIntent() as 'shade' | 'daylight',
    debugSurfaceId: null,
    powerLoss: 0,
    cameraView: 'perspective',
    scenarioId: 'kl-rect',
    snapshot: sim.snapshot(),

    setBuilding: (patch) => {
      sim.setBuilding(patch)
      set({ building: { ...sim.building }, scenarioId: null })
    },
    setOrientation: (deg) => {
      sim.setBuilding({ orientation: deg })
      set({ building: { ...sim.building }, scenarioId: null })
    },

    addNeighbor: () => {
      const n: NeighborBuilding = { id: `N${neighborSeq++}`, width: 45, depth: 45, height: 80, distance: 130, bearing: 180 }
      const neighbors = [...get().neighbors, n]
      sim.setNeighbors(neighbors)
      set({ neighbors, scenarioId: null })
    },
    removeNeighbor: (id) => {
      const neighbors = get().neighbors.filter((n) => n.id !== id)
      sim.setNeighbors(neighbors)
      set({ neighbors, scenarioId: null })
    },
    updateNeighbor: (id, patch) => {
      const neighbors = get().neighbors.map((n) => (n.id === id ? { ...n, ...patch } : n))
      sim.setNeighbors(neighbors)
      set({ neighbors, scenarioId: null })
    },

    setWeather: (patch) => {
      sim.setWeather(patch)
      set({ weather: { ...get().weather, ...patch }, scenarioId: null })
    },
    setTime: (hours) => {
      sim.setTime(hours)
      set((s) => ({ snapshot: { ...s.snapshot, timeHours: hours } }))
    },
    setScrubbing: (b) => {
      scrubbing = b
      sim.setPlaying(b ? false : get().playing)
    },
    setSpeed: (s) => {
      sim.setSpeed(s)
      set({ speed: s })
    },
    togglePlay: () => {
      const playing = !get().playing
      sim.setPlaying(playing)
      set({ playing })
    },
    setMonth: (m) => {
      const d = new Date(sim.clock.date)
      d.setMonth(m)
      sim.setDate(d)
      set({ month: m, scenarioId: null })
    },

    setSkinMode: (m) => {
      sim.skin.setMode(m)
      set({ skinMode: m })
    },
    setManualRotation: (a) => {
      // Moving the slider is a manual command — switch the source to Manual.
      sim.skin.setManualRotation(a)
      sim.skin.setFacadeControlMode('manual')
      set({ manualRotation: a, skinMode: 'manual', facadeControlMode: 'manual' })
    },
    setFacadeControlMode: (mode) => {
      sim.skin.setFacadeControlMode(mode)
      set({ facadeControlMode: mode })
    },
    setTrackingIntent: (intent) => {
      sim.skin.setTrackingIntent(intent)
      set({ trackingIntent: intent, facadeControlMode: 'sun-tracking' })
    },
    setDebugSurface: (id) => set({ debugSurfaceId: id }),
    setSurfaceRotation: (surfaceId, angle) => {
      sim.skin.setSurfaceRotation(surfaceId, angle)
    },
    setSurfaceState: (surfaceId, state) => {
      sim.skin.setSurfaceState(surfaceId, state)
    },
    openAll: () => {
      sim.skin.openAll()
      set({ manualRotation: 90, skinMode: 'manual' })
    },
    closeAll: () => {
      sim.skin.closeAll()
      set({ manualRotation: 0, skinMode: 'manual' })
    },
    wave: () => sim.skin.triggerWave(),
    resetSkin: () => {
      sim.skin.reset()
      set({ skinMode: 'auto', manualRotation: 90, powerLoss: 0 })
    },
    setPowerLoss: (fraction) => {
      sim.skin.setPowerLoss(fraction)
      set({ powerLoss: fraction })
    },

    setCameraView: (v) => set({ cameraView: v }),
    applyScenarioId: (id) => {
      const scenario = SCENARIOS.find((s) => s.id === id)
      if (!scenario) return
      applyScenario(sim, scenario)
      set({
        scenarioId: id,
        building: { ...sim.building },
        neighbors: sim.neighbors.map((n) => ({ ...n })),
        weather: mirrorWeather(),
        month: sim.clock.date.getMonth(),
        skinMode: sim.skin.getMode(),
        manualRotation: sim.skin.getManualRotation(),
        powerLoss: 0,
      })
    },

    pull: () => {
      if (scrubbing) return
      set({ snapshot: sim.snapshot() })
    },
  }
})
