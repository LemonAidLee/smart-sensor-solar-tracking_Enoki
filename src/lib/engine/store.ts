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
import type { WeatherSourceMode } from './weatherScenario'
import { pickUpperCentrePanel } from '@/lib/embedded'
import type { PanelState } from './panelStates'
import type { FacadeControlMode } from './facadeControl'
import { DEFAULT_WHATIF_SCENARIO } from '@/lib/prediction'
import type { PredictionReport, WhatIfResult, WhatIfScenarioId } from '@/lib/prediction'
import type { FaultDetectionReport } from '@/lib/ai/faultDetection'

type WeatherInputs = Pick<
  WeatherState,
  'temperature' | 'humidity' | 'windSpeed' | 'windDirection' | 'cloudCoverage' | 'rainIntensity'
>

let neighborSeq = 100

interface TwinState {
  building: BuildingConfig
  neighbors: NeighborBuilding[]
  weather: WeatherInputs
  /** Where the weather comes from — Manual sliders or the Scenario timeline. */
  weatherSource: WeatherSourceMode
  /** Scenario currently loaded in the Weather Scenario Engine. */
  weatherScenarioId: string
  speed: number
  playing: boolean
  month: number
  skinMode: SkinMode
  manualRotation: number
  /** Weather Validation Mode: source of the façade target rotation. */
  facadeControlMode: FacadeControlMode
  /** Sun-Tracking intent for the geometry engine. */
  trackingIntent: 'shade' | 'daylight'
  debugSurfaceId: string | null
  /** Mode for Solar Occlusion Debugging */
  /** Selected module for solar debugging */
  solarSelectedModuleId: string | null
  powerLoss: number
  cameraView: CameraView
  scenarioId: string | null
  snapshot: SimSnapshot
  /**
   * AI Prediction Layer report (Stage 8.1). Held beside the snapshot rather than
   * inside it because prediction is a separate advisory subsystem, not simulation
   * telemetry. The Prediction Engine returns the SAME object while nothing it
   * depends on has changed, so this reference is stable across most polls and the
   * AI Prediction panel does not re-render at the poll rate.
   */
  prediction: PredictionReport
  /**
   * AI What-If Analysis (Stage 8.2). Null until the operator runs a study, and
   * it is NEVER refreshed by the poll — a study executes only on the Run
   * Analysis action, so the simulation loop carries no sandbox cost.
   */
  whatIf: WhatIfResult | null
  /** Which study the selector is on. Selecting one does not run it. */
  whatIfScenarioId: WhatIfScenarioId
  /** True when the twin has moved on since the cached study was run. */
  whatIfStale: boolean
  /**
   * AI Fault Detection & Diagnosis report (Stage 8.5). Read-only monitor
   * output, refreshed on every poll like `prediction` — cheap while nothing a
   * rule reads has changed, since the engine returns the same cached object.
   */
  faultDetection: FaultDetectionReport

  setBuilding: (patch: Partial<BuildingConfig>) => void
  setOrientation: (deg: number) => void
  addNeighbor: () => void
  removeNeighbor: (id: string) => void
  updateNeighbor: (id: string, patch: Partial<NeighborBuilding>) => void
  setWeather: (patch: Partial<WeatherInputs>) => void
  setWeatherSource: (mode: WeatherSourceMode) => void
  setWeatherScenario: (id: string) => void
  /** Manual "Refresh Forecast" — asynchronous, never blocks the simulation. */
  refreshForecast: () => void
  /** "Now" — return the clock to the site's current date and time. */
  returnToNow: () => void
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
  setSolarSelectedModule: (id: string | null) => void
  setSurfaceRotation: (surfaceId: string, angle: number) => void
  setSurfaceState: (surfaceId: string, state: PanelState) => void
  openAll: () => void
  closeAll: () => void
  wave: () => void
  resetSkin: () => void
  setPowerLoss: (fraction: number) => void
  setCameraView: (v: CameraView) => void
  applyScenarioId: (id: string) => void
  /** Point the selector at a study. Does NOT run it. */
  selectWhatIf: (id: WhatIfScenarioId) => void
  /** Run the selected study — the only path that executes a sandbox. */
  runWhatIf: () => void
  /** Discard the cached study. */
  resetWhatIf: () => void
  /** Telemetry tier (~8-10 Hz, driven by `SimDriver`) — snapshot only. */
  pull: () => void
  /**
   * AI advisory tier (~2-4 Hz, driven by `SimDriver` on its own slower
   * cadence). Split from `pull()` per Stage 7.11: the Prediction/FDD reports
   * describe a 12 h-ahead projection and a periodic health check respectively
   * — neither needs telemetry-rate freshness, and AI panels re-rendering at
   * the same ~8-10 Hz as the live gauges was work with no perceptible benefit.
   */
  pullAi: () => void
}

export function getActiveDemonstrationSurface(sim: ReturnType<typeof getSimulation>, debugSurfaceId: string | null) {
  const surfaces = sim.skin.getAllSurfaces()
  if (surfaces.length === 0) return undefined

  if (debugSurfaceId) {
    const s = sim.skin.getSurface(debugSurfaceId)
    if (s) return s
  }

  const autoId = pickUpperCentrePanel(sim)?.surfaceId
  if (autoId) {
    const s = sim.skin.getSurface(autoId)
    if (s) return s
  }

  return surfaces[0]
}

export function getActiveDemonstrationModule(
  sim: ReturnType<typeof getSimulation>,
  debugSurfaceId: string | null,
  solarSelectedModuleId: string | null
) {
  const surface = getActiveDemonstrationSurface(sim, debugSurfaceId)
  if (!surface || surface.panels.length === 0) return undefined

  if (solarSelectedModuleId) {
    const p = surface.panels.find(p => p.id === solarSelectedModuleId)
    if (p) return p
  }

  return surface.panels[0]
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
    weatherSource: sim.weatherScenario.getMode(),
    weatherScenarioId: sim.weatherScenario.getScenarioId(),
    speed: sim.clock.speed,
    playing: sim.clock.playing,
    month: sim.clock.date.getMonth(),
    skinMode: sim.skin.getMode(),
    manualRotation: sim.skin.getManualRotation(),
    facadeControlMode: sim.skin.getFacadeControlMode(),
    trackingIntent: sim.skin.getTrackingIntent() as 'shade' | 'daylight',
    debugSurfaceId: null,
    solarSelectedModuleId: pickUpperCentrePanel(sim)?.id ?? null,
    powerLoss: 0,
    cameraView: 'perspective',
    scenarioId: 'kl-rect',
    snapshot: sim.snapshot(),
    prediction: sim.getPrediction(),
    whatIf: null,
    whatIfScenarioId: DEFAULT_WHATIF_SCENARIO,
    whatIfStale: false,
    faultDetection: sim.getFaultDetection(sim.snapshot()),

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
      // Manual edits are ignored while a scenario owns the weather — the UI hides
      // the sliders, and the timeline would overwrite the value on the next tick.
      if (get().weatherSource === 'scenario') return
      sim.setWeather(patch)
      set({ weather: { ...get().weather, ...patch }, scenarioId: null })
    },
    setWeatherSource: (mode) => {
      sim.setWeatherSource(mode)
      set({
        weatherSource: sim.weatherScenario.getMode(),
        weather: mirrorWeather(),
        // Entering Forecast Mode moves the clock to the site's current date, so
        // the mirrored month has to follow it.
        month: sim.clock.date.getMonth(),
      })
    },
    setWeatherScenario: (id) => {
      sim.setWeatherScenario(id)
      set({ weatherScenarioId: sim.weatherScenario.getScenarioId(), weather: mirrorWeather() })
    },
    returnToNow: () => {
      sim.returnToSiteNow()
      // Push a snapshot straight away so the Forecast Playback card lands on the
      // new timestamp on click, rather than up to one poll interval later. The
      // prediction and FDD report follow the same jump for the same reason.
      const snap = sim.snapshot()
      set({
        snapshot: snap,
        prediction: sim.getPrediction(),
        faultDetection: sim.getFaultDetection(snap),
        weather: mirrorWeather(),
        month: sim.clock.date.getMonth(),
      })
    },
    refreshForecast: () => {
      // Fire-and-forget: the result lands in the cache and reaches the UI on the
      // next snapshot poll. A failure is absorbed by the engine, not thrown here.
      void sim.liveForecast.refresh()
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
    setDebugSurface: (id) => {
      const surface = getActiveDemonstrationSurface(sim, id)
      let currentModule = get().solarSelectedModuleId
      // Ensure the selected module belongs to the new active surface
      if (surface && !surface.panels.find(p => p.id === currentModule)) {
        // Fallback to the first panel on this surface
        currentModule = surface.panels[0]?.id ?? null
      }
      set({ debugSurfaceId: id, solarSelectedModuleId: currentModule })
    },
    setSolarSelectedModule: (id) => set({ solarSelectedModuleId: id }),
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
        // `applyScenario` hands the weather back to Manual — mirror that here.
        weatherSource: sim.weatherScenario.getMode(),
        month: sim.clock.date.getMonth(),
        skinMode: sim.skin.getMode(),
        manualRotation: sim.skin.getManualRotation(),
        powerLoss: 0,
      })
    },

    selectWhatIf: (id) => set({ whatIfScenarioId: id }),
    runWhatIf: () => {
      // The ONLY place a sandbox executes. Synchronous and self-contained: two
      // 12-step projections over pure data, well under a frame.
      const result = sim.runWhatIf(get().whatIfScenarioId)
      set({ whatIf: result, whatIfStale: false })
    },
    resetWhatIf: () => {
      sim.whatIf.reset()
      set({ whatIf: null, whatIfStale: false })
    },

    pull: () => {
      if (scrubbing) return
      const snap = sim.snapshot()
      // While a scenario drives the weather, the mirrored inputs must follow the
      // timeline too — they are what the collapsed readouts and (on returning to
      // Manual) the sliders start from.
      if (sim.weatherScenario.isActive()) {
        set({ snapshot: snap, weather: mirrorWeather() })
      } else {
        set({ snapshot: snap })
      }
    },
    pullAi: () => {
      if (scrubbing) return
      // The prediction report is CACHED by its engine: this returns the identical
      // object while nothing it depends on has changed, so the AI panel's
      // selector sees no reference change and does not re-render.
      const prediction = sim.getPrediction()
      // Same caching guarantee as prediction — the FDD engine only re-runs its
      // twelve subsystem checks when something a rule reads has actually moved.
      // Reuses the MOST RECENT telemetry snapshot rather than pulling a fresh
      // one — this tier never needs to be more current than the snapshot tier.
      const faultDetection = sim.getFaultDetection(get().snapshot)
      // Staleness is only meaningful once a study exists, so the check is skipped
      // entirely otherwise — no sandbox runs here either way, only a key compare.
      const whatIfStale = get().whatIf !== null && sim.isWhatIfStale()
      set({ prediction, faultDetection, whatIfStale })
    },
  }
})
