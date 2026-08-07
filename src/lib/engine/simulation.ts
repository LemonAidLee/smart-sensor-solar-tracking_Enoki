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
import { WeatherScenarioEngine, type WeatherSourceMode } from './weatherScenario'
import { LiveForecastEngine } from './liveForecast'
import { OpenMeteoProvider } from './forecastProvider'
import { AdaptiveSkinEngine } from './adaptiveSkin'
import { SolarPhysicsEngine } from './solarPhysics'
import { RooftopPVEngine } from './pvArray'
import { PVElectricalEngine } from './pvElectrical'
import { PVInverterEngine } from './pvInverter'
import { BuildingEnergyEngine } from './buildingEnergy'
import { BuildingThermalEngine } from './buildingThermal'
import { BuildingLightingEngine } from './buildingLighting'
import { facadeSolarGainKW } from './metrics'
import { BatteryEnergyEngine } from './battery'
import { GridEnergyEngine } from './grid'
import { DailyEnergyLedger } from './energyLedger'
import { bootstrapDailyEnergy } from './dailyEnergyBootstrap'
import { VirtualSensorEngine } from './virtualSensor'
import { compassToWorld, rotateY, deg2rad } from './math'
import { rateHz, type RateLimiter } from './scheduler'
import { PredictionEngine, WhatIfEngine, LIVE_PARAMETERS } from '@/lib/prediction'
import type {
  PredictionContext,
  PredictionReport,
  WhatIfResult,
  WhatIfScenarioId,
} from '@/lib/prediction'
import { engineeringContext } from '@/lib/assistant'
import { FaultDetectionEngine } from '@/lib/ai/faultDetection'
import type { FaultDetectionReport } from '@/lib/ai/faultDetection'

/** Environmental tier rate — solar/weather/PBIF/occlusion/metrics recompute Hz.
 *  20 Hz is well below what perceptibly changes yet frees ~⅔ of the old work. */
const ENV_HZ = 20

const HOURS_PER_SEC_AT_1X = 24 / 120 // one simulated day in ~2 min at 1×

/**
 * The engineering case study from the project report (Comprehensive Project
 * Summary Table) — no longer a generic demonstration tower.
 *
 *   Commercial office · 5 storeys · 25 m wide × 40 m long × 19 m tall
 *   Floor-to-floor 3.8 m · 100% curtain wall · external adaptive façade
 *
 * The façade grid is NOT configured here: `facadeModule.ts` derives it from this
 * massing (21 + 33 bays per elevation × 3 rows per storey → 324 panels/floor,
 * 1,620 total, covering the full 2,470 m² envelope).
 */
export const DEFAULT_BUILDING: BuildingConfig = {
  shape: 'rectangle',
  buildingType: 'Commercial Office',
  height: 19,
  width: 25,
  depth: 40,
  floorCount: 5,
  orientation: 90,
  glassRatio: 1, // 100% curtain wall
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

/**
 * Immediate context for a 5-storey office: mid-rise neighbours close enough to
 * genuinely occlude the façade at low sun angles (which is what the occlusion
 * ray-caster exists to demonstrate) without dwarfing a 19 m building.
 */
const DEFAULT_NEIGHBORS: NeighborBuilding[] = []

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

/**
 * The site's current wall-clock instant, as a UTC-based `Date` whose UTC
 * fields read as the SITE's local calendar date/time — `Date.now()` shifted
 * by the building's own timezone offset, the same one the solar engine uses.
 * The one authority both a fresh launch's initial clock (constructor) and
 * `syncClockToSiteNow()`'s "return to now" derive their site-local date from,
 * so the two can never disagree about what day it is at the site.
 */
function siteLocalNow(timezoneOffsetHours: number): Date {
  return new Date(Date.now() + timezoneOffsetHours * 3_600_000)
}

/** Stage 7.11.1 — a fresh launch opens at this local site time, not "now". */
const INITIAL_SIM_TIME_HOURS = 6

export class Simulation {
  clock: SimClock
  building: BuildingConfig
  neighbors: NeighborBuilding[]
  weather: WeatherState
  /**
   * Weather Scenario Engine (Stage 7.7) — the source of the weather drivers
   * while Scenario Mode is active. In Manual Mode it emits nothing and
   * `this.weather` stays exactly what the operator dialled in.
   */
  weatherScenario: WeatherScenarioEngine
  /**
   * Live Forecast Engine (Stage 7.8) — fetches, caches and converts real hourly
   * forecast data into a timeline. It supplies the Weather Scenario Engine and
   * writes NOTHING into the simulation itself.
   */
  liveForecast: LiveForecastEngine
  sun: SunState
  solarPhysics: SolarPhysicsEngine
  pvArray: RooftopPVEngine
  pvElectrical: PVElectricalEngine
  pvInverter: PVInverterEngine
  /**
   * Building Thermal Response Engine (Stage 7.9) — bridges the adaptive façade
   * and the BEMS: converts the façade's solar gain into a lagged, physically
   * meaningful cooling load rather than a hardcoded percentage. Runs
   * immediately after the façade updates and before the BEMS consumes it.
   */
  buildingThermal: BuildingThermalEngine
  /**
   * Building Lighting Response Engine (Stage 7.10) — the second Building
   * Physics Layer subsystem, sibling to `buildingThermal`. Converts outdoor
   * daylight (via the façade's effective irradiance and openness) into a
   * daylight-harvesting artificial lighting demand rather than a fixed
   * occupancy-only load. Independently consumes façade information; neither
   * this nor `buildingThermal` depends on the other. Runs after Building
   * Thermal and before the PV/BEMS chain consumes it.
   */
  buildingLighting: BuildingLightingEngine
  /** BEMS — building demand, the AC bus and the energy balance (Stage 7.4). */
  buildingEnergy: BuildingEnergyEngine
  /** BESS — state of charge and charge/discharge dispatch (Stage 7.5). */
  battery: BatteryEnergyEngine
  /** Utility grid — the balancing component at the end of the chain (7.6). */
  grid: GridEnergyEngine
  /** Daily energy totals across every bus flow, reset at simulated midnight. */
  energyLedger: DailyEnergyLedger
  virtualSensor: VirtualSensorEngine
  skin: AdaptiveSkinEngine
  /**
   * AI Prediction Layer (Stage 8.1) — an OBSERVER, not a controller. It
   * receives a read-only context and writes nothing back, so PBIF remains the
   * sole authority over the façade. `tick()`'s `resolve` block DOES reach it —
   * via `engineeringContext.update(this)` → `buildAIPrediction()` →
   * `getPrediction()` below — but at a cost bounded by two layers of caching
   * (`EngineeringContextBuilder`'s own coarse key, then this engine's own
   * `TIME_BUCKET_HOURS`-quantised key), not a per-tick projection. See
   * `predictionEngine.ts`'s header for the full reachability note.
   */
  prediction: PredictionEngine
  /**
   * AI What-If Analysis (Stage 8.2) — evaluates hypothetical alternatives in a
   * throwaway sandbox. Like the Prediction Engine it controls nothing, and it
   * additionally never runs on its own: `runWhatIf()` fires only from the
   * operator's Run Analysis action.
   */
  whatIf: WhatIfEngine
  /**
   * AI Fault Detection & Diagnosis (Stage 8.5) — a read-only MONITOR, not a
   * controller. Never called from `tick()`; the UI pulls a cached report from
   * `getFaultDetection()`. It re-derives expected subsystem behaviour from the
   * same snapshot the rest of the UI reads and writes nothing back.
   */
  faultDetection: FaultDetectionEngine
  metrics: BuildingMetrics

  private fps = 60
  private fpsFrames = 0
  private fpsAccum = 0
  /** Fires the expensive environmental recompute at ~ENV_HZ, not per frame. */
  private envTier: RateLimiter = rateHz(ENV_HZ)
  /**
   * Clock reading at the previous BEMS update, used to derive elapsed
   * **simulated** time. The BEMS integrates a building thermal lag, which must
   * advance with the simulated day (compressed to ~2 real minutes at 1×), never
   * with wall-clock seconds. See `energyStepSimSeconds()`.
   */
  private lastEnergyTimeHours = 0

  constructor() {
    // Stage 7.11.1 — a fresh launch opens on TODAY'S real-world date at the
    // building site, at a fixed 06:00 local time (so the twin always begins
    // its story at sunrise, not mid-afternoon or mid-simulated-night). This
    // is deliberately NOT `syncClockToSiteNow()` — that method also adopts
    // the current MINUTE, which is exactly what re-entering Forecast Mode or
    // pressing "Now" still needs (untouched, below); a fresh launch wants
    // today's date but a fixed hour, not the operator's literal wall-clock
    // minute at load time.
    const siteToday = siteLocalNow(DEFAULT_BUILDING.timezone)
    this.clock = {
      date: new Date(siteToday.getUTCFullYear(), siteToday.getUTCMonth(), siteToday.getUTCDate()),
      timeHours: INITIAL_SIM_TIME_HOURS,
      speed: 1,
      playing: false,
    }
    this.building = { ...DEFAULT_BUILDING }
    this.neighbors = DEFAULT_NEIGHBORS.map((n) => ({ ...n }))
    this.weather = { ...DEFAULT_WEATHER }
    this.weatherScenario = new WeatherScenarioEngine()
    // The forecast is retrieved for the building's own site, and follows it if
    // the operator relocates the twin. Constructing the engine performs no
    // network access — `start()` (from the store, on the client) does.
    this.liveForecast = new LiveForecastEngine(new OpenMeteoProvider(), {
      latitude: this.building.latitude,
      longitude: this.building.longitude,
      locationName: this.building.locationName,
    })
    this.weatherScenario.connectForecast(this.liveForecast)
    this.solarPhysics = new SolarPhysicsEngine()
    this.pvArray = new RooftopPVEngine(this.building)
    this.pvElectrical = new PVElectricalEngine(this.pvArray.getModules())
    this.pvInverter = new PVInverterEngine()
    this.buildingThermal = new BuildingThermalEngine()
    this.buildingLighting = new BuildingLightingEngine()
    this.buildingEnergy = new BuildingEnergyEngine(this.building)
    // The battery connects to the bus as a storage port, so the BEMS routes
    // through it without importing anything from the battery module.
    this.battery = new BatteryEnergyEngine()
    this.buildingEnergy.connectStorage(this.battery)
    this.grid = new GridEnergyEngine()
    this.energyLedger = new DailyEnergyLedger()
    this.virtualSensor = new VirtualSensorEngine()
    this.skin = new AdaptiveSkinEngine(this.building)
    this.prediction = new PredictionEngine()
    this.whatIf = new WhatIfEngine()
    this.faultDetection = new FaultDetectionEngine()
    this.sun = computeSun(this.clock, this.building, this.weather.cloudCoverage)
    updateWind(this.weather, 0)
    
    const localSun = {
      ...this.sun,
      worldDir: rotateY(this.sun.worldDir, deg2rad(this.building.orientation))
    }
    const localNeighbors = this.neighbors.map((n) => ({
      ...n,
      bearing: (n.bearing - this.building.orientation + 360) % 360,
    }))
    this.solarPhysics.update(this.skin.getAllSurfaces(), this.pvArray.getModules(), localSun, localNeighbors)
    // Seed the BEMS so the first snapshot carries a settled load profile rather
    // than a frame of zeros. Generation is still 0 here — the PV engines are
    // first evaluated on the opening environmental tick, exactly as before.
    // The façade has not moved yet either, so the thermal chain seeds at 0 gain
    // for the same reason. dt = 0 → both lags initialise to target, no startup
    // transient.
    this.lastEnergyTimeHours = this.clock.timeHours
    this.buildingThermal.update(0, 0, this.weather.temperature, this.sun.irradiance, 0)
    this.buildingLighting.update(0, 0, this.buildingEnergy.getSnapshot().floorAreaM2, this.clock.timeHours, 0)
    this.buildingEnergy.update(
      this.clock.timeHours,
      this.weather.temperature,
      this.pvInverter.getMetrics().currentACPowerKW,
      0,
      this.buildingThermal.getState().coolingLoadKW,
      this.buildingLighting.getState().lightingElectricalKW,
    )
    // The grid projects the settled bus; the ledger seeds its day baseline.
    this.grid.update(this.buildingEnergy.getBusState())
    this.energyLedger.update(this.clock.timeHours, 0, this.buildingEnergy.getBusState())
    this.virtualSensor.update(this.skin.getAllSurfaces(), this.solarPhysics, 0.016)
    this.skin.update(this.building, this.sun, this.weather, this.solarPhysics, this.virtualSensor, 0)
    this.metrics = this.skin.getBuildingMetrics()
    // Stage 7.9.5 — a session opening (or reloading) mid-day has never ticked
    // through 00:00-to-now, so the ledger seeded above knows nothing about
    // that stretch. Reconstruct it deterministically from the twin's own
    // projection physics before the first live tick runs; see
    // `dailyEnergyBootstrap.ts` for why this never touches a live engine.
    bootstrapDailyEnergy(this.energyLedger, this.predictionContext(), this.clock.timeHours, this.battery.getState().storedKWh)
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
      // Weather source FIRST: in Scenario Mode the timeline sets the drivers for
      // this step; in Manual Mode it is a no-op. Everything after this line is
      // identical either way — solar, sensors, PBIF and the energy chain simply
      // consume `this.weather` as they always have.
      this.applyScenarioWeather()
      this.sun = computeSun(this.clock, this.building, this.weather.cloudCoverage)
      updateWeather(this.weather, this.sun.uvIndex, envDt)
      updateWind(this.weather, envDt)
      const localSun = {
        ...this.sun,
        worldDir: rotateY(this.sun.worldDir, deg2rad(this.building.orientation))
      }
      const localNeighbors = this.neighbors.map((n) => ({
        ...n,
        bearing: (n.bearing - this.building.orientation + 360) % 360,
      }))
      this.solarPhysics.update(this.skin.getAllSurfaces(), this.pvArray.getModules(), localSun, localNeighbors)
      // The simulated step is taken ONCE and shared by every lagged integrator
      // below (thermal mass, HVAC plant, battery, daily ledger) so they all
      // advance the same interval.
      const simSeconds = this.energyStepSimSeconds()
      // Building Thermal Response (Stage 7.9) — runs immediately after the
      // façade and before the energy chain. `this.metrics` is the façade's most
      // recently SETTLED state (skin.update() below computes this tick's, one
      // env-tick from now — negligible at ENV_HZ); `facadeSolarGainKW` is the
      // SAME authority the surface metrics and the AI Prediction layer read,
      // never re-derived here.
      const facadeAreaM2 = this.skin.getFacadeLayout().facadeArea
      const solarGainKW = facadeSolarGainKW(
        this.metrics.averageSolarExposure,
        this.metrics.averageOpenness,
        facadeAreaM2,
      )
      this.buildingThermal.update(
        this.metrics.averageOpenness,
        solarGainKW,
        this.weather.temperature,
        this.sun.irradiance,
        simSeconds,
      )
      // Building Lighting Response (Stage 7.10) — independently consumes the
      // SAME façade information Building Thermal does (`metrics.averageSolarExposure`
      // is the effective-irradiance authority both read; neither depends on the
      // other's output). Floor area is read from the BEMS's own authority
      // (`grossFloorArea`, via its snapshot) rather than recomputed here.
      this.buildingLighting.update(
        this.metrics.averageSolarExposure,
        this.metrics.averageOpenness,
        this.buildingEnergy.getSnapshot().floorAreaM2,
        this.clock.timeHours,
        simSeconds,
      )
      this.pvElectrical.update(this.pvArray.getModules(), this.solarPhysics)
      this.pvInverter.update(this.pvElectrical)
      // BEMS — runs immediately after the inverter and REUSES its AC output; the
      // energy balance is never derived from irradiance or DC power a second time.
      // `solarCoolingLoadKW` / `lightingElectricalKW` are the ONE values it takes
      // from the thermal / lighting engines — already electrical kW, added
      // straight onto the HVAC / Lighting categories respectively.
      this.buildingEnergy.update(
        this.clock.timeHours,
        this.weather.temperature,
        this.pvInverter.getMetrics().currentACPowerKW,
        simSeconds,
        this.buildingThermal.getState().coolingLoadKW,
        this.buildingLighting.getState().lightingElectricalKW,
      )
      // The grid is the balancing component: it projects the settled bus and
      // adds no routing. The ledger integrates every flow into daily energy.
      const bus = this.buildingEnergy.getBusState()
      this.grid.update(bus)
      this.energyLedger.update(this.clock.timeHours, simSeconds, bus)
      this.virtualSensor.update(this.skin.getAllSurfaces(), this.solarPhysics, envDt)
      
      // Flush deterministic context to the AI layer
      engineeringContext.update(this)
    }

    this.skin.update(this.building, this.sun, this.weather, this.solarPhysics, this.virtualSensor, dt, resolve)
    if (resolve) this.metrics = this.skin.getBuildingMetrics()

    this.fpsFrames++
    this.fpsAccum += dt
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum)
      this.fpsFrames = 0
      this.fpsAccum = 0
    }
  }

  /**
   * Simulated seconds elapsed since the last BEMS update, derived from the clock
   * itself rather than from frame time. This is correct across every case the
   * twin allows: paused (0), any playback speed, the midnight wrap, and a
   * timeline scrub — a jump of more than an hour is treated as a discontinuity
   * and reported as 0, which makes the thermal lag re-initialise instead of
   * integrating a jump that never physically happened.
   */
  private energyStepSimSeconds(): number {
    let dHours = this.clock.timeHours - this.lastEnergyTimeHours
    this.lastEnergyTimeHours = this.clock.timeHours
    if (dHours < 0) dHours += 24 // midnight wrap
    if (dHours > 1) return 0 // scrub / date change — not a physical elapse
    return dHours * 3600
  }

  // -- Config mutators (called by the store; renderer reads live) ------------
  // Each forces the environmental tier to recompute on the very next frame so a
  // slider / timeline / geometry change is reflected immediately, never up to one
  // env-interval late.
  setBuilding(patch: Partial<BuildingConfig>): void {
    this.building = { ...this.building, ...patch }
    this.skin.rebuild(this.building)
    this.pvArray.rebuild(this.building)
    this.pvElectrical.rebuild(this.pvArray.getModules())
    // Demand is scaled to gross floor area, so it must follow the massing.
    this.buildingEnergy.rebuild(this.building)
    // A relocated twin needs the forecast for its NEW site; the engine drops the
    // stale cache and re-fetches only if the coordinates actually moved.
    this.liveForecast.setLocation(this.building.latitude, this.building.longitude, this.building.locationName)
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
  /**
   * Switch the weather source. Scenario Mode takes effect immediately — the
   * drivers are sampled at the current simulated hour before this returns, so
   * the store mirrors settled values rather than the outgoing source's.
   */
  setWeatherSource(mode: WeatherSourceMode): void {
    this.weatherScenario.setMode(mode)
    if (this.weatherScenario.getMode() === 'forecast') {
      // Open on the forecast hour happening right now, not wherever the clock
      // happened to be left — replaying real data should start from today.
      this.syncClockToSiteNow()
      // Forecast Mode owns a refresh timer; it runs only while selected.
      // `start()` returns immediately — the fetch is asynchronous and never
      // blocks here.
      this.liveForecast.start()
    } else {
      this.liveForecast.stop()
    }
    this.applyScenarioWeather()
    this.envTier.trigger()
  }

  /**
   * "Return to now" — jump the clock back to the site's current wall clock after
   * the operator has scrubbed away from it. Identical to what entering Forecast
   * Mode does; the weather source, playback state and speed are all left alone,
   * so a paused twin stays paused and 10× keeps running at 10×.
   */
  returnToSiteNow(): void {
    this.syncClockToSiteNow()
    this.applyScenarioWeather()
    this.envTier.trigger()
  }

  /**
   * Point the clock at the site's current wall-clock date and time. The offset
   * is the building's own `timezone` — the same one the solar engine uses — so
   * the twin's clock, its sun position and the forecast all refer to one site.
   */
  private syncClockToSiteNow(): void {
    const siteNow = siteLocalNow(this.building.timezone)
    this.clock.date = new Date(siteNow.getUTCFullYear(), siteNow.getUTCMonth(), siteNow.getUTCDate())
    this.clock.timeHours = siteNow.getUTCHours() + siteNow.getUTCMinutes() / 60
    // The jump is not elapsed time: re-baseline the BEMS so it cannot integrate
    // a thermal step for an interval that never physically happened.
    this.lastEnergyTimeHours = this.clock.timeHours
  }
  setWeatherScenario(id: string): void {
    this.weatherScenario.setScenario(id)
    this.applyScenarioWeather()
    this.envTier.trigger()
  }
  /**
   * Pull this step's drivers from the Weather Scenario Engine. Only the five
   * driver fields are written; visibility, pressure, gust strength, wetness and
   * UV remain derived by `weather.ts` exactly as in Manual Mode. Written in
   * place — the playback path allocates nothing per tick.
   */
  private applyScenarioWeather(): void {
    const drivers = this.weatherScenario.update(this.clock.timeHours)
    if (drivers) Object.assign(this.weather, drivers)
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

  // -- AI Prediction Layer (read-only observation) ---------------------------
  /**
   * Assemble the read-only view the Prediction Engine observes through.
   *
   * The `Simulation` object itself is deliberately never handed over: the engine
   * receives only values the engines have already published, every one of them
   * `Readonly`-typed. There is therefore no path — not even an accidental one —
   * by which the advisory layer could write to solar physics, sensors, PBIF, the
   * servo, the façade, the PV chain, the battery or the grid.
   */
  private predictionContext(): PredictionContext {
    const mode = this.weatherScenario.getMode()
    const position = this.weatherScenario.getStatus()
    const forecastStatus = this.liveForecast.getStatus()
    const surfaces = this.skin.getAllSurfaces()

    // `getTimeline()` returns the LOADED scenario even in Manual Mode, where
    // nothing is driving the weather (CLAUDE.md §5.3). Gating on the engine's own
    // `isActive()` here — once, at the boundary — keeps that trap out of the
    // prediction layer entirely.
    const timeline = this.weatherScenario.isActive() ? this.weatherScenario.getTimeline() : null
    const timelineId =
      mode === 'forecast'
        ? `forecast:${forecastStatus.version}`
        : mode === 'scenario'
          ? this.weatherScenario.getScenarioId()
          : 'manual'

    return {
      clock: this.clock,
      building: this.building,
      weather: this.weather,
      sun: this.sun,

      timeline,
      timelineId,
      weatherMode: mode,
      timelineActiveIndex: position.activeIndex,
      timelineSegmentProgress: position.segmentProgress,
      forecastStatus,
      forecastAgeMinutes: this.liveForecast.getAgeMinutes(),

      facadeSurfaces: surfaces,
      // Sum of every module's real area, cached on the skin engine and rebuilt
      // only when the geometry changes — a reference read, not a traversal.
      facadeAreaM2: this.skin.getFacadeLayout().facadeArea,
      pvModules: this.pvArray.getModules(),
      inverterRatedKW: this.pvInverter.getMetrics().ratedCapacityKW,
      inverterBaseEfficiency: this.pvInverter.getBaseEfficiency(),

      floorAreaM2: this.buildingEnergy.getSnapshot().floorAreaM2,
      bus: this.buildingEnergy.getBusState(),
      battery: this.battery.getState(),
      batteryLimits: this.battery.getLimits(),

      parameters: {
        ...LIVE_PARAMETERS,
        // Seeded from the façade's CURRENT measured mean openness and held
        // constant across the projection — predicting how it evolves would mean
        // predicting PBIF, which this layer must never do.
        facadeOpenness: this.metrics.averageOpenness,
      },
    }
  }

  /**
   * The current AI prediction report. Cached inside the engine: an unchanged
   * twin returns the identical object, so polling this from the store's snapshot
   * loop costs a key comparison rather than a projection. Also reachable from
   * `tick()` itself, via `engineeringContext.update(this)` (see the `prediction`
   * field's own doc comment above) — the same caching applies either way, so
   * the marginal cost stays a key comparison except on an actual cache-key
   * rollover.
   */
  getPrediction(): PredictionReport {
    return this.prediction.getReport(this.predictionContext())
  }

  /**
   * Run one What-If study. Called ONLY from the operator's Run Analysis action —
   * never from `tick()` and never from the snapshot poll.
   *
   * The sandbox is a clone of the same read-only context the prediction uses, so
   * this cannot alter the live twin. The engines are read, never driven.
   */
  runWhatIf(scenarioId: WhatIfScenarioId): WhatIfResult | null {
    return this.whatIf.run(this.predictionContext(), scenarioId)
  }

  /** The cached study, or null when none has been run. */
  getWhatIf(): WhatIfResult | null {
    return this.whatIf.getResult()
  }

  /** True when the twin has moved on since the cached study was run. */
  isWhatIfStale(): boolean {
    return this.whatIf.isStale(this.predictionContext())
  }

  /**
   * The current AI Fault Detection & Diagnosis report (Stage 8.5). Cached
   * inside the engine: an unchanged twin returns the identical object, so
   * polling this from the store's snapshot loop costs a key comparison. Takes
   * the same `SimSnapshot` the rest of the UI reads — never called from
   * `tick()`.
   */
  getFaultDetection(snapshot: SimSnapshot): FaultDetectionReport {
    return this.faultDetection.getReport(snapshot)
  }

  // -- Snapshot for UI (throttled by the store's polling) --------------------
  snapshot(): SimSnapshot {
    const pvMetrics = this.pvElectrical.getArrayMetrics()
    const invMetrics = this.pvInverter.getMetrics()

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
      weatherSource: this.weatherScenario.getStatus(),
      forecast: this.liveForecast.getStatus(),
      metrics: this.metrics,
      surfaces: this.skin.getSurfaceSummaries(),
      // Cached on the skin engine and recomputed only when geometry changes —
      // this is a reference read, not a per-snapshot traversal of 1,620 panels.
      facade: this.skin.getFacadeLayout(),
      // BEMS / BESS — cached objects mutated in place on the environmental
      // tier, so these are reference reads and cost nothing per poll.
      energy: this.buildingEnergy.getSnapshot(),
      thermal: this.buildingThermal.getState(),
      lighting: this.buildingLighting.getState(),
      battery: this.battery.getState(),
      grid: this.grid.getState(),
      daily: this.energyLedger.getTotals(),
      pvStatus: 'Online',
      pvAverageIrradiance: Math.round(pvMetrics.averageIrradianceW),
      pvInstalledCapacity: pvMetrics.installedCapacityKW,
      pvCurrentDCOutput: pvMetrics.currentOutputKW,
      pvAverageModuleOutput: pvMetrics.averageModuleOutputW,
      pvOperatingModules: pvMetrics.operatingModules,
      pvUtilization: pvMetrics.utilization,
      invRatedCapacityKW: invMetrics.ratedCapacityKW,
      invCurrentDCOutput: invMetrics.currentDCPowerKW,
      invCurrentACOutput: invMetrics.currentACPowerKW,
      invEfficiency: invMetrics.currentEfficiency,
      invConversionLossKW: invMetrics.conversionLossKW,
      invOperatingState: invMetrics.operatingState,
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
