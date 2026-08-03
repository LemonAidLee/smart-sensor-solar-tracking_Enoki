/**
 * AI Prediction Layer — Stage 8.1 type contract.
 *
 * ── What this subsystem is ───────────────────────────────────────────────────
 * An engineering ADVISOR that observes the Digital Twin, projects what the
 * existing engines would produce over the next twelve hours, and explains why.
 * It is not a controller. PBIF remains the sole authority over the adaptive
 * façade; nothing here writes to solar physics, virtual sensors, PBIF, the
 * servo, the façade, the PV chain, the battery or the grid.
 *
 * ── Read-only by construction ────────────────────────────────────────────────
 * The engine never receives the `Simulation` object. It receives a
 * {@link PredictionContext}: a flat, `Readonly`-typed view assembled by the
 * Simulation from values the engines have already published. There is no handle
 * in this subsystem through which simulation state could be mutated, so the
 * observer guarantee is enforced by the type system rather than by convention.
 *
 * ── Explainability is structural, not decorative ─────────────────────────────
 * Every {@link Prediction} carries `statement → evidence → source`. The evidence
 * quotes values the simulation itself produced, and the source names where the
 * driving data came from. A statement that cannot be traced is not emitted.
 */

// ---------------------------------------------------------------------------
// Read-only observation context
// ---------------------------------------------------------------------------

import type { SimClock, BuildingConfig, WeatherState, SunState, BuildingSurface, PVModule } from '../engine/types'
import type { WeatherKeyframe, WeatherSourceMode } from '../engine/weatherScenario'
import type { ForecastStatus } from '../engine/liveForecast'
import type { BatteryState, StorageLimits } from '../engine/battery'
import type { EnergyBusState } from '../engine/buildingEnergy'

/**
 * Physical parameters of the plant the projection runs against.
 *
 * In the live context every one of these carries its **true** value — a derate
 * of 1, no temperature offset, the grid connected. They exist as fields rather
 * than constants because Stage 8.2's What-If sandbox is defined as *one* of them
 * being changed: a sandbox is a structural clone of the context with a single
 * parameter overridden, which is what makes "the sandbox and the live twin ran
 * identical code" a checkable statement rather than an aspiration.
 */
export interface ProjectionParameters {
  /**
   * Multiplier on module DC output — the soiling/degradation hook
   * `moduleDcPowerW` already accepts. 1 = nameplate performance.
   */
  readonly pvDerate: number
  /** Offset added to every projected air temperature, °C. 0 = as scheduled. */
  readonly temperatureOffsetC: number
  /** Forced cloud coverage 0–1, or null to use whatever the timeline schedules. */
  readonly cloudOverride: number | null
  /**
   * Hours by which the whole weather pattern arrives EARLIER. 0 = as scheduled.
   * The entire driver sample is shifted, not the rain channel alone — shifting
   * rain by itself would schedule rain under a clear sky.
   */
  readonly weatherShiftHours: number
  /**
   * False models an islanded site. The utility is the balancing component, so
   * removing it does not change any dispatch decision — it reclassifies the
   * import the bus already computed as unserved load.
   */
  readonly gridAvailable: boolean
  /**
   * Mean blade openness held across the projection, 0–1.
   *
   * The live context seeds this from the façade's CURRENT measured mean, held
   * constant, because predicting how it evolves would mean predicting PBIF. A
   * What-If that locks the façade sets it explicitly — which is not a prediction
   * of PBIF but a hypothesis that overrides it.
   */
  readonly facadeOpenness: number
}

/**
 * Everything the Prediction Engine is allowed to observe — and nothing else.
 *
 * **Pure data.** No engine, no method, no setter, no mutable array reaches this
 * type. `Simulation.predictionContext()` resolves every value up front, which
 * buys two things: the read-only guarantee stops depending on which getters
 * happen to be safe to call, and a What-If sandbox becomes an ordinary object
 * spread rather than a fake engine.
 */
export interface PredictionContext {
  readonly clock: Readonly<SimClock>
  readonly building: Readonly<BuildingConfig>
  /** Weather as it stands right now — the projection's starting point. */
  readonly weather: Readonly<WeatherState>
  /** Sun as it stands right now. */
  readonly sun: Readonly<SunState>

  /**
   * The timeline that OWNS the weather, already gated on the scenario engine's
   * `isActive()`. Null in Manual Mode, where the operator's sliders own it and
   * the projection persists them. Resolving this at context-assembly time is
   * what keeps `getTimeline()`'s Manual-Mode trap (CLAUDE.md §5.3) out of the
   * prediction layer entirely.
   */
  readonly timeline: readonly WeatherKeyframe[] | null
  readonly weatherMode: WeatherSourceMode
  /**
   * Identity of the active timeline — the scenario id, `forecast:<version>`, or
   * `manual`. It is what the prediction cache keys on, so swapping scenarios or
   * refreshing the forecast invalidates while an unchanged timeline does not.
   */
  readonly timelineId: string
  /** Position along that timeline, for forecast provenance. */
  readonly timelineActiveIndex: number
  readonly timelineSegmentProgress: number
  readonly forecastStatus: Readonly<ForecastStatus>
  /** Minutes since the forecast was retrieved; -1 when there is none. */
  readonly forecastAgeMinutes: number

  /** Façade surfaces, for the geometric exposure projection. */
  readonly facadeSurfaces: readonly BuildingSurface[]
  /** Total glazed façade area the thermal gain is scaled to, m². */
  readonly facadeAreaM2: number
  /** Rooftop PV modules, for the generation projection. */
  readonly pvModules: readonly PVModule[]
  readonly inverterRatedKW: number
  readonly inverterBaseEfficiency: number

  /** Gross floor area the demand model is scaled to, m². */
  readonly floorAreaM2: number
  /** Live bus state — the "now" the projection is compared against. */
  readonly bus: Readonly<EnergyBusState>
  readonly battery: Readonly<BatteryState>
  readonly batteryLimits: Readonly<StorageLimits>

  /** Plant parameters — true values live, one of them overridden in a sandbox. */
  readonly parameters: ProjectionParameters
}

/** The parameters of the real plant: every hook at its true, un-hypothetical value. */
export const LIVE_PARAMETERS: Omit<ProjectionParameters, 'facadeOpenness'> = {
  pvDerate: 1,
  temperatureOffsetC: 0,
  cloudOverride: null,
  weatherShiftHours: 0,
  gridAvailable: true,
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

/** Confidence grade. Never random — see `confidence.ts` for the derivation. */
export type Confidence = 'High' | 'Medium' | 'Low'

/** The three independent factors a confidence grade is built from. */
export interface ConfidenceBreakdown {
  /** Combined score, 0–1. */
  score: number
  grade: Confidence
  /** How far ahead the projection reaches, 0–1 (nearer = higher). */
  horizonScore: number
  /** How recently the driving data was obtained, 0–1. */
  freshnessScore: number
  /** How settled the weather is across the interval, 0–1. */
  stabilityScore: number
  /** One-line explanation of what limited the grade. */
  reason: string
}

// ---------------------------------------------------------------------------
// Projected twin state
// ---------------------------------------------------------------------------

/**
 * The twin as the engines would produce it at one future hour. Every field is
 * computed by the SAME pure functions the live engines use — `computeSun`,
 * `planeIrradiance`, `moduleDcPowerW`, `convertDcToAc`, `buildingDemandKW`,
 * `settleBus`, `planStorage`. Nothing here is a second physics model.
 */
export interface TwinProjection {
  /** Hours ahead of the simulation clock, ≥ 0. */
  hoursAhead: number
  /** Simulated hour of day this projection lands on, 0–24. */
  atHours: number
  /** "15:30" */
  clockLabel: string
  /** The real forecast instant replayed at this hour — Forecast Mode only. */
  atEpochMs: number | null

  // ── Environment (from the active weather timeline) ────────────────────────
  temperature: number
  humidity: number
  cloudCoverage: number
  rainIntensity: number
  windSpeed: number

  // ── Solar ────────────────────────────────────────────────────────────────
  sunAltitude: number
  sunAzimuth: number
  isDaytime: boolean
  /** Global horizontal irradiance after cloud attenuation, W/m². */
  ghi: number
  /** Area-weighted mean cosine projection across the façade, 0–1. */
  facadeExposure: number
  /** Mean effective irradiance on the façade, W/m². */
  facadeIrradiance: number
  /** Blade openness assumed across the projection, 0–1. */
  facadeOpenness: number
  /**
   * Solar heat admitted through the skin to the glazing, kW **thermal**.
   * From `facadeSolarGainKW` in `metrics.ts` — the same authority the live
   * surface metrics use. Note this is a façade thermal load, NOT the BEMS's
   * electrical HVAC demand; the two are separate quantities in this twin.
   */
  facadeSolarGainKW: number
  /** Daylight reaching the interior, percent. */
  facadeDaylight: number

  // ── PV plant ─────────────────────────────────────────────────────────────
  /** Plane-of-array irradiance on the rooftop modules, W/m². */
  pvPlaneIrradiance: number
  pvDcKW: number
  pvAcKW: number
  inverterState: string

  // ── Building ─────────────────────────────────────────────────────────────
  occupancy: number
  buildingLoadKW: number
  /** The cooling (HVAC) share of the load, kW. */
  coolingLoadKW: number

  // ── Bus / storage / grid ─────────────────────────────────────────────────
  batterySoc: number
  batteryChargeKW: number
  batteryDischargeKW: number
  batteryState: string
  gridImportKW: number
  gridExportKW: number
  /**
   * Demand that nothing on site could meet and no grid was available to supply,
   * kW. Always zero while the connection exists — with an unlimited utility the
   * residual IS the import. It becomes non-zero only in an islanded What-If,
   * where the same residual is reclassified rather than recomputed.
   */
  unservedLoadKW: number
  /** Share of demand met without grid import, 0–1. */
  buildingCoverage: number
}

// ---------------------------------------------------------------------------
// Explainable predictions
// ---------------------------------------------------------------------------

export type PredictionDomain = 'environment' | 'solar' | 'pv' | 'battery' | 'grid' | 'building'

export type Trend = 'rising' | 'falling' | 'steady'

/**
 * One explainable statement. The `statement → evidence → source` triple is the
 * whole point: the operator should never have to take a number on trust.
 */
export interface Prediction {
  id: string
  domain: PredictionDomain
  /** Canonical quantity name, e.g. "PV Generation". */
  metric: string
  /** What is predicted, in plain language. */
  statement: string
  trend: Trend
  /** Projected value at this horizon. */
  value: number
  /** The same quantity right now, so the delta is visible. */
  currentValue: number
  unit: string
  /** Why — quotes values the simulation itself produced. */
  evidence: string
  /** Where the driving data came from. */
  source: string
  confidence: Confidence
}

/** Severity ranks insights; it never implies an action the AI would take. */
export type InsightSeverity = 'info' | 'notice' | 'alert'

/** A cross-horizon engineering observation drawn from the projected walk. */
export interface Insight {
  id: string
  domain: PredictionDomain
  severity: InsightSeverity
  /** The observation, e.g. "Cloud cover increases after 15:00…". */
  text: string
  evidence: string
  source: string
  confidence: Confidence
}

/** One horizon of the report. */
export interface HorizonForecast {
  hoursAhead: number
  /** "Next 3 Hours" */
  label: string
  projection: TwinProjection
  predictions: Prediction[]
  confidence: Confidence
  confidenceBreakdown: ConfidenceBreakdown
  /** One-line headline for the horizon. */
  summary: string
}

/** A stage of the Forecast → Solar → Energy → Prediction reasoning chain. */
export interface ReasoningStage {
  id: string
  label: string
  /** What this stage contributed, quoting the value it produced. */
  detail: string
}

/** A snapshot of where the twin is right now, in the AI's own words. */
export interface CurrentSituation {
  /** "Clear · 32.4 °C · 18% cloud" */
  headline: string
  /** Two or three sentences describing the operating point. */
  summary: string
  /** The live values the summary quotes. */
  ghi: number
  pvAcKW: number
  buildingLoadKW: number
  gridImportKW: number
  batterySoc: number
}

/** Whether the engine could produce a projection at all. */
export type PredictionStatus =
  /** A full projection is available. */
  | 'Ready'
  /** No timeline to project — Forecast Mode with an empty cache. */
  | 'Holding'

/** The complete, cached output of one prediction pass. */
export interface PredictionReport {
  /** Bumped on every recompute; a stable value means nothing changed. */
  revision: number
  /** "Engineering Prediction Engine v1" */
  model: string
  status: PredictionStatus
  /** Why the status is what it is. */
  statusReason: string

  /** Simulated hour of day the report was generated for. */
  generatedAtHours: number
  /** Which weather source drove the projection. */
  weatherSource: WeatherSourceMode
  /** Human label for that source, e.g. "Open-Meteo Forecast". */
  sourceLabel: string
  /** The furthest horizon projected, hours. */
  horizonHours: number

  /** Forecast instant being replayed right now, epoch ms — Forecast Mode only. */
  forecastTimestampMs: number | null
  /** Site timezone for rendering every timestamp in this report. */
  utcOffsetSeconds: number
  timezoneAbbreviation: string
  /** Minutes since the forecast was retrieved; -1 when not applicable. */
  forecastAgeMinutes: number

  current: CurrentSituation
  horizons: HorizonForecast[]
  insights: Insight[]
  reasoning: ReasoningStage[]
  /** The full hour-by-hour walk, for charting. Index 0 is +1 h. */
  walk: TwinProjection[]
}
