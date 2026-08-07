/**
 * Engineering narration — Stage 8.1.
 *
 * Turns the projection walk into sentences. Two rules govern everything here:
 *
 * 1. **Nothing is fabricated.** Every sentence quotes a number the simulation
 *    produced — a driver the timeline scheduled, an irradiance `computeSun`
 *    returned, a load the BEMS model implies, a dispatch `planStorage` decided.
 *    If the walk does not support a statement, the statement is not emitted;
 *    there is no filler and no "typically" language.
 *
 * 2. **Every statement is traceable.** Each carries its own `evidence` (the
 *    values behind it) and `source` (where those values came from). That triple
 *    — statement → evidence → source — is what the panel renders, so the
 *    operator can always follow a claim back to the data.
 *
 * This module performs no physics. It reads the projections `projection.ts`
 * produced and describes them.
 */

import type {
  Confidence,
  CurrentSituation,
  Insight,
  Prediction,
  PredictionContext,
  ReasoningStage,
  Trend,
  TwinProjection,
} from './types'
import type { WeatherSourceMode } from '../engine/weatherScenario'

// ---------------------------------------------------------------------------
// Data-source labels — the single place a provenance string is written
// ---------------------------------------------------------------------------

/** Where a projection's environmental drivers came from. */
export function sourceLabel(mode: WeatherSourceMode, providerName: string): string {
  if (mode === 'forecast') return `${providerName} Forecast`
  if (mode === 'scenario') return 'Weather Scenario Timeline'
  return 'Manual Weather (held constant)'
}

/** Sources for quantities the twin derives rather than receives. */
const SOURCE = {
  solar: 'ASHRAE Clear-Sky Model · Solar Physics Engine',
  pv: 'PV Array + Inverter Model',
  building: 'Building Energy Model (BEMS)',
  battery: 'Battery Dispatch Model (BESS)',
  grid: 'Building Energy Bus residual',
} as const

// ---------------------------------------------------------------------------
// Trend thresholds — a change smaller than these reads as "steady"
// ---------------------------------------------------------------------------

const TREND = {
  /** °C */
  TEMPERATURE: 0.8,
  /** Fraction, 0–1 */
  CLOUD: 0.08,
  /** km/h */
  WIND: 3,
  /** W/m² */
  IRRADIANCE: 25,
  /** kW — one significant step on any of the power readouts. */
  POWER: 1,
  /** Fraction of state of charge. */
  SOC: 0.02,
} as const

/** Thresholds that decide whether an observation is worth reporting at all. */
const NOTABLE = {
  /** Cloud swing across the window that counts as a real change. */
  CLOUD_SWING: 0.2,
  /** Rain intensity, 0–1, at or above which rain is called out. */
  RAIN: 0.05,
  /** Rain intensity treated as heavy. */
  RAIN_HEAVY: 0.35,
  /** Wind speed, km/h, at or above which wind is called out. */
  WIND: 30,
  /** PV output, kW, below which the plant is effectively not producing. */
  PV_IDLE: 0.5,
  /** Grid import change, kW, worth reporting. */
  GRID_SWING: 5,
  /** Cooling-load change, kW, worth reporting. */
  COOLING_SWING: 5,
} as const

/** How many insights the panel shows. Beyond this the list stops being read. */
export const MAX_INSIGHTS = 6

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function trendOf(from: number, to: number, threshold: number): Trend {
  const d = to - from
  if (d > threshold) return 'rising'
  if (d < -threshold) return 'falling'
  return 'steady'
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const kw = (v: number) => `${v.toFixed(1)} kW`
const wm2 = (v: number) => `${Math.round(v)} W/m²`
const degC = (v: number) => `${v.toFixed(1)} °C`

/** "increase" / "decrease" / "hold" — reads naturally after "is expected to". */
function verb(trend: Trend, rise = 'increase', fall = 'decrease', flat = 'hold steady'): string {
  return trend === 'rising' ? rise : trend === 'falling' ? fall : flat
}

/** The extreme of a series, with the hour it occurs. */
function extremeOf(
  walk: readonly TwinProjection[],
  pick: (p: TwinProjection) => number,
  mode: 'max' | 'min',
): { value: number; at: TwinProjection } | null {
  if (walk.length === 0) return null
  let best = walk[0]
  let bestVal = pick(best)
  for (const p of walk) {
    const v = pick(p)
    if (mode === 'max' ? v > bestVal : v < bestVal) {
      best = p
      bestVal = v
    }
  }
  return { value: bestVal, at: best }
}

// ---------------------------------------------------------------------------
// Current situation
// ---------------------------------------------------------------------------

/** Plain-language sky condition from the drivers the twin is running on. */
function describeSky(cloud: number, rain: number): string {
  if (rain >= NOTABLE.RAIN_HEAVY) return 'Heavy rain'
  if (rain >= NOTABLE.RAIN) return 'Light rain'
  if (cloud >= 0.75) return 'Overcast'
  if (cloud >= 0.35) return 'Partly cloudy'
  return 'Clear'
}

export function describeCurrent(ctx: PredictionContext, source: string): CurrentSituation {
  const w = ctx.weather
  const bus = ctx.bus
  const ghi = ctx.sun.irradiance
  const sky = describeSky(w.cloudCoverage, w.rainIntensity)

  const solar = ctx.sun.isDaytime
    ? `The sun is ${ctx.sun.altitude.toFixed(0)}° above the horizon delivering ${wm2(ghi)} global horizontal irradiance, and the rooftop array is producing ${kw(bus.pvGenerationKW)} AC.`
    : 'The sun is below the horizon, so the rooftop array is offline and the building is running entirely on stored energy and the grid.'

  const balance =
    bus.requiredGridImportKW > TREND.POWER
      ? `Demand of ${kw(bus.buildingLoadKW)} exceeds on-site supply, so ${kw(bus.requiredGridImportKW)} is being imported.`
      : bus.surplusKW > TREND.POWER
        ? `Generation exceeds the ${kw(bus.buildingLoadKW)} demand, leaving ${kw(bus.surplusKW)} uncommitted.`
        : `Generation and the ${kw(bus.buildingLoadKW)} demand are balanced — nothing is being drawn from the grid.`

  return {
    headline: `${sky} · ${degC(w.temperature)} · ${pct(w.cloudCoverage)} cloud`,
    summary: `${solar} ${balance} The battery is at ${pct(ctx.battery.soc)} state of charge. Environmental drivers come from ${source}.`,
    ghi,
    pvAcKW: bus.pvGenerationKW,
    buildingLoadKW: bus.buildingLoadKW,
    gridImportKW: bus.requiredGridImportKW,
    batterySoc: ctx.battery.soc,
  }
}

// ---------------------------------------------------------------------------
// Per-horizon predictions
// ---------------------------------------------------------------------------

/**
 * Every predicted quantity at one horizon, each as an explainable statement.
 *
 * The list is fixed rather than conditional: the operator sees the same eleven
 * rows at every horizon, so a quantity is never silently absent. What varies is
 * the content, which is always derived from `now → projection`.
 */
export function buildPredictions(
  ctx: PredictionContext,
  p: TwinProjection,
  /** The same projection evaluated for right now — see `projectBaseline`. */
  baseline: TwinProjection,
  confidence: Confidence,
  source: string,
): Prediction[] {
  const now = ctx.weather
  const bus = ctx.bus
  const at = `by ${p.clockLabel}`
  const out: Prediction[] = []

  const add = (
    id: string,
    domain: Prediction['domain'],
    metric: string,
    statement: string,
    trend: Trend,
    value: number,
    currentValue: number,
    unit: string,
    evidence: string,
    src: string,
  ) => {
    out.push({ id, domain, metric, statement, trend, value, currentValue, unit, evidence, source: src, confidence })
  }

  // ── Environmental ────────────────────────────────────────────────────────
  const tTrend = trendOf(now.temperature, p.temperature, TREND.TEMPERATURE)
  add(
    'temperature', 'environment', 'Temperature',
    `Outdoor temperature is expected to ${verb(tTrend, 'rise', 'fall')} to ${degC(p.temperature)} ${at}.`,
    tTrend, p.temperature, now.temperature, '°C',
    `${degC(now.temperature)} now → ${degC(p.temperature)} at ${p.clockLabel}.`,
    source,
  )

  const cTrend = trendOf(now.cloudCoverage, p.cloudCoverage, TREND.CLOUD)
  add(
    'cloud', 'environment', 'Cloud Cover',
    `Cloud cover is expected to ${verb(cTrend)} to ${pct(p.cloudCoverage)} ${at}.`,
    cTrend, p.cloudCoverage * 100, now.cloudCoverage * 100, '%',
    `${pct(now.cloudCoverage)} now → ${pct(p.cloudCoverage)} at ${p.clockLabel}.`,
    source,
  )

  const rTrend = trendOf(now.rainIntensity, p.rainIntensity, TREND.CLOUD)
  add(
    'rain', 'environment', 'Rain',
    p.rainIntensity >= NOTABLE.RAIN
      ? `Rain of ${pct(p.rainIntensity)} intensity is scheduled ${at}.`
      : `No significant rain is scheduled ${at}.`,
    rTrend, p.rainIntensity * 100, now.rainIntensity * 100, '%',
    `Rain intensity ${pct(now.rainIntensity)} now → ${pct(p.rainIntensity)} at ${p.clockLabel}.`,
    source,
  )

  const wTrend = trendOf(now.windSpeed, p.windSpeed, TREND.WIND)
  add(
    'wind', 'environment', 'Wind Speed',
    `Wind is expected to ${verb(wTrend, 'strengthen', 'ease')} to ${p.windSpeed.toFixed(0)} km/h ${at}.`,
    wTrend, p.windSpeed, now.windSpeed, 'km/h',
    `${now.windSpeed.toFixed(0)} km/h now → ${p.windSpeed.toFixed(0)} km/h at ${p.clockLabel}.`,
    source,
  )

  // ── Solar ────────────────────────────────────────────────────────────────
  const gTrend = trendOf(ctx.sun.irradiance, p.ghi, TREND.IRRADIANCE)
  add(
    'irradiance', 'solar', 'Solar Irradiance',
    p.isDaytime
      ? `Global horizontal irradiance is expected to ${verb(gTrend, 'rise', 'fall')} to ${wm2(p.ghi)} ${at}.`
      : `The sun sets before ${p.clockLabel}, so irradiance falls to zero.`,
    gTrend, p.ghi, ctx.sun.irradiance, 'W/m²',
    `Sun altitude ${ctx.sun.altitude.toFixed(0)}° → ${p.sunAltitude.toFixed(0)}° with ${pct(p.cloudCoverage)} cloud attenuation.`,
    SOURCE.solar,
  )

  const fTrend = trendOf(baseline.facadeIrradiance, p.facadeIrradiance, TREND.IRRADIANCE)
  add(
    'facade-exposure', 'solar', 'Façade Exposure',
    `Façade exposure is expected to ${verb(fTrend, 'rise', 'fall')} to ${wm2(p.facadeIrradiance)} at ${pct(p.facadeExposure)} mean cosine projection ${at}.`,
    fTrend, p.facadeIrradiance, baseline.facadeIrradiance, 'W/m²',
    `Sun at ${p.sunAzimuth.toFixed(0)}° azimuth / ${p.sunAltitude.toFixed(0)}° altitude against the building's fixed elevations; area-weighted cosine projection ${p.facadeExposure.toFixed(2)}.`,
    SOURCE.solar,
  )

  // ── PV ───────────────────────────────────────────────────────────────────
  const pvTrend = trendOf(bus.pvGenerationKW, p.pvAcKW, TREND.POWER)
  add(
    'pv', 'pv', 'PV Generation',
    p.pvAcKW <= NOTABLE.PV_IDLE
      ? `The rooftop array is expected to be offline ${at}.`
      : `PV generation is expected to ${verb(pvTrend, 'rise', 'fall')} to ${kw(p.pvAcKW)} AC ${at}.`,
    pvTrend, p.pvAcKW, bus.pvGenerationKW, 'kW',
    `${wm2(p.pvPlaneIrradiance)} plane-of-array across ${ctx.pvModules.length} modules → ${kw(p.pvDcKW)} DC → ${kw(p.pvAcKW)} AC (${p.inverterState}).`,
    SOURCE.pv,
  )

  // ── Building ─────────────────────────────────────────────────────────────
  const lTrend = trendOf(bus.buildingLoadKW, p.buildingLoadKW, TREND.POWER)
  add(
    'load', 'building', 'Building Load',
    `Building demand is expected to ${verb(lTrend, 'rise', 'fall')} to ${kw(p.buildingLoadKW)} ${at}.`,
    lTrend, p.buildingLoadKW, bus.buildingLoadKW, 'kW',
    `Occupancy ${pct(p.occupancy)} at ${p.clockLabel} with ${degC(p.temperature)} outdoor temperature.`,
    SOURCE.building,
  )

  const coolTrend = trendOf(baseline.coolingLoadKW, p.coolingLoadKW, TREND.POWER)
  add(
    'cooling', 'building', 'Cooling Demand',
    `Cooling demand is expected to ${verb(coolTrend, 'rise', 'fall')} to ${kw(p.coolingLoadKW)} ${at}.`,
    coolTrend, p.coolingLoadKW, baseline.coolingLoadKW, 'kW',
    // Stage 7.9: HVAC now has two drivers, base plant response and the façade's
    // own solar-induced share — cited together so the evidence matches what
    // `equilibriumThermalState` actually adds to the number above.
    `HVAC responds to ${degC(p.temperature)} outdoor dry-bulb and ${pct(p.occupancy)} occupancy, plus ${kw(p.facadeSolarGainKW)} of façade solar gain at ${Math.round(p.facadeOpenness * 100)}% openness.`,
    SOURCE.building,
  )

  // ── Battery ──────────────────────────────────────────────────────────────
  const socTrend = trendOf(ctx.battery.soc, p.batterySoc, TREND.SOC)
  const batteryStatement =
    p.batteryChargeKW > TREND.POWER
      ? `The battery is expected to be charging at ${kw(p.batteryChargeKW)} ${at}.`
      : p.batteryDischargeKW > TREND.POWER
        ? `The battery is expected to be discharging at ${kw(p.batteryDischargeKW)} ${at}.`
        : `The battery is expected to be idle at ${pct(p.batterySoc)} state of charge ${at}.`
  add(
    'battery', 'battery', 'Battery',
    batteryStatement,
    socTrend, p.batterySoc * 100, ctx.battery.soc * 100, '% SoC',
    p.batteryChargeKW > TREND.POWER
      ? `PV surplus of ${kw(p.pvAcKW - p.buildingLoadKW)} is available to absorb.`
      : `PV generation ${kw(p.pvAcKW)} against ${kw(p.buildingLoadKW)} demand leaves no surplus; reserve floor is ${pct(ctx.batteryLimits.reserveFraction)}.`,
    SOURCE.battery,
  )

  // ── Grid ─────────────────────────────────────────────────────────────────
  const gridTrend = trendOf(bus.requiredGridImportKW, p.gridImportKW, TREND.POWER)
  add(
    'grid', 'grid', 'Grid Import',
    p.gridExportKW > TREND.POWER
      ? `The site is expected to export ${kw(p.gridExportKW)} ${at}.`
      : `Grid import is expected to ${verb(gridTrend, 'rise', 'fall')} to ${kw(p.gridImportKW)} ${at}.`,
    gridTrend, p.gridImportKW, bus.requiredGridImportKW, 'kW',
    `${kw(p.buildingLoadKW)} demand less ${kw(p.pvAcKW)} PV and ${kw(p.batteryDischargeKW)} from storage; building coverage ${pct(p.buildingCoverage)}.`,
    SOURCE.grid,
  )

  return out
}

// ---------------------------------------------------------------------------
// Horizon summary
// ---------------------------------------------------------------------------

/** The single most consequential thing about a horizon, in one line. */
export function summariseHorizon(ctx: PredictionContext, p: TwinProjection): string {
  const dPv = p.pvAcKW - ctx.bus.pvGenerationKW
  const dImport = p.gridImportKW - ctx.bus.requiredGridImportKW

  if (!p.isDaytime && ctx.sun.isDaytime) {
    return `The sun has set by ${p.clockLabel}; the building runs on storage and the grid.`
  }
  if (Math.abs(dPv) >= TREND.POWER) {
    const dir = dPv > 0 ? 'rises' : 'falls'
    return `PV ${dir} to ${kw(p.pvAcKW)} while demand reaches ${kw(p.buildingLoadKW)}, ${dImport > 0 ? 'increasing' : 'reducing'} grid import to ${kw(p.gridImportKW)}.`
  }
  return `Generation and demand hold near ${kw(p.pvAcKW)} and ${kw(p.buildingLoadKW)}, with ${kw(p.gridImportKW)} imported.`
}

// ---------------------------------------------------------------------------
// Cross-horizon insights
// ---------------------------------------------------------------------------

/**
 * The engineering observations worth surfacing across the whole window.
 *
 * Each candidate is emitted only when the walk actually supports it, so a calm
 * day produces a short list rather than a padded one.
 */
export function buildInsights(
  ctx: PredictionContext,
  walk: readonly TwinProjection[],
  baseline: TwinProjection,
  confidence: Confidence,
  source: string,
): Insight[] {
  const out: Insight[] = []
  if (walk.length === 0) return out

  const add = (
    id: string,
    domain: Insight['domain'],
    severity: Insight['severity'],
    text: string,
    evidence: string,
    src: string,
  ) => {
    out.push({ id, domain, severity, text, evidence, source: src, confidence })
  }

  // ── Cloud: does the sky change materially, and when? ──────────────────────
  const cloudMax = extremeOf(walk, (p) => p.cloudCoverage, 'max')
  const cloudMin = extremeOf(walk, (p) => p.cloudCoverage, 'min')
  if (cloudMax && cloudMin && cloudMax.value - cloudMin.value >= NOTABLE.CLOUD_SWING) {
    const increasing = cloudMax.at.hoursAhead > cloudMin.at.hoursAhead
    const turn = increasing ? cloudMax.at : cloudMin.at
    // The irradiance consequence is only claimed when the sun is actually up at
    // the turn — clearing skies at 03:00 change no façade irradiance, and saying
    // they do would be a statement the projection does not support.
    const consequence = turn.isDaytime
      ? increasing
        ? `, reducing façade irradiance to ${wm2(turn.facadeIrradiance)}`
        : `, raising façade irradiance to ${wm2(turn.facadeIrradiance)}`
      : ' — after dark, so façade irradiance is unaffected'
    add(
      'cloud-trend', 'environment', 'notice',
      increasing
        ? `Cloud cover is expected to increase to ${pct(cloudMax.value)} by ${turn.clockLabel}${consequence}.`
        : `Cloud cover is expected to clear to ${pct(cloudMin.value)} by ${turn.clockLabel}${consequence}.`,
      `Cloud ranges from ${pct(cloudMin.value)} at ${cloudMin.at.clockLabel} to ${pct(cloudMax.value)} at ${cloudMax.at.clockLabel}; façade irradiance at ${turn.clockLabel} is ${wm2(turn.facadeIrradiance)}.`,
      source,
    )
  }

  // ── Rain ─────────────────────────────────────────────────────────────────
  const rain = extremeOf(walk, (p) => p.rainIntensity, 'max')
  if (rain && rain.value >= NOTABLE.RAIN) {
    // "Cutting irradiance" is only asserted when the irradiance at that hour is
    // genuinely below the window's own average. Rain at the sunniest hour of the
    // day still leaves the highest irradiance in the window, and claiming a cut
    // there would contradict the very numbers quoted as evidence.
    const meanGhi = walk.reduce((s, p) => s + p.ghi, 0) / walk.length
    const suppresses = rain.at.isDaytime && rain.at.ghi < meanGhi
    add(
      'rain', 'environment', rain.value >= NOTABLE.RAIN_HEAVY ? 'alert' : 'notice',
      `${rain.value >= NOTABLE.RAIN_HEAVY ? 'Heavy rain' : 'Rain'} is expected around ${rain.at.clockLabel}` +
        (suppresses
          ? `, holding irradiance down to ${wm2(rain.at.ghi)}.`
          : `, with irradiance at ${wm2(rain.at.ghi)}.`),
      `Rain intensity peaks at ${pct(rain.value)} with ${pct(rain.at.cloudCoverage)} cloud; PV output at that hour is ${kw(rain.at.pvAcKW)} against a ${wm2(meanGhi)} window average.`,
      source,
    )
  }

  // ── Wind — reported as an observation, never as a façade instruction ──────
  const wind = extremeOf(walk, (p) => p.windSpeed, 'max')
  if (wind && wind.value >= NOTABLE.WIND) {
    add(
      'wind', 'environment', 'notice',
      `Wind is expected to reach ${wind.value.toFixed(0)} km/h around ${wind.at.clockLabel} — a condition PBIF weighs when setting blade angle.`,
      `Wind rises to ${wind.value.toFixed(0)} km/h at ${wind.at.clockLabel}. The façade response remains PBIF's decision; this layer only reports the driver.`,
      source,
    )
  }

  // ── PV peak ──────────────────────────────────────────────────────────────
  const pvPeak = extremeOf(walk, (p) => p.pvAcKW, 'max')
  if (pvPeak && pvPeak.value > NOTABLE.PV_IDLE) {
    add(
      'pv-peak', 'pv', 'info',
      `PV generation is expected to peak at ${kw(pvPeak.value)} around ${pvPeak.at.clockLabel}.`,
      `Plane-of-array irradiance reaches ${wm2(pvPeak.at.pvPlaneIrradiance)} with the sun at ${pvPeak.at.sunAltitude.toFixed(0)}° altitude; inverter state ${pvPeak.at.inverterState}.`,
      SOURCE.pv,
    )
  } else {
    add(
      'pv-idle', 'pv', 'info',
      `The rooftop array is expected to stay offline for the whole ${walk.length} h window.`,
      `Peak projected AC output is ${kw(pvPeak?.value ?? 0)} — the sun is below the horizon across the window.`,
      SOURCE.pv,
    )
  }

  // ── Battery ──────────────────────────────────────────────────────────────
  const charges = walk.some((p) => p.batteryChargeKW > TREND.POWER)
  const last = walk[walk.length - 1]
  if (!charges) {
    add(
      'battery-no-charge', 'battery', 'info',
      'Battery charging is unlikely — building demand exceeds PV generation for the whole window.',
      `Demand stays above generation at every projected hour (e.g. ${kw(last.buildingLoadKW)} against ${kw(last.pvAcKW)} at ${last.clockLabel}), so no PV surplus is offered to storage.`,
      SOURCE.battery,
    )
  } else {
    const charge = extremeOf(walk, (p) => p.batteryChargeKW, 'max')!
    add(
      'battery-charge', 'battery', 'info',
      `The battery is expected to charge at up to ${kw(charge.value)} around ${charge.at.clockLabel}, reaching ${pct(last.batterySoc)} state of charge by ${last.clockLabel}.`,
      `PV surplus of ${kw(charge.at.pvAcKW - charge.at.buildingLoadKW)} is available at ${charge.at.clockLabel}, within the ${kw(ctx.batteryLimits.maxPowerKW)} power limit.`,
      SOURCE.battery,
    )
  }

  // ── Grid ─────────────────────────────────────────────────────────────────
  const importPeak = extremeOf(walk, (p) => p.gridImportKW, 'max')
  if (importPeak && importPeak.value - ctx.bus.requiredGridImportKW >= NOTABLE.GRID_SWING) {
    // Import can rise because generation fell OR because demand climbed — the
    // overnight-into-morning case is entirely the latter. The cause is read off
    // the projection rather than assumed, so the sentence stays true in both.
    const pvFalls = importPeak.at.pvAcKW < ctx.bus.pvGenerationKW
    const loadRises = importPeak.at.buildingLoadKW > ctx.bus.buildingLoadKW
    const cause = pvFalls && loadRises
      ? 'as demand climbs while solar production declines'
      : pvFalls
        ? 'as solar production declines'
        : loadRises
          ? 'as building demand climbs'
          : 'as the balance between generation and demand shifts'
    add(
      'grid-import', 'grid', 'notice',
      `Grid import is expected to increase to ${kw(importPeak.value)} by ${importPeak.at.clockLabel} ${cause}.`,
      `Import is ${kw(ctx.bus.requiredGridImportKW)} now against ${kw(ctx.bus.buildingLoadKW)} demand and ${kw(ctx.bus.pvGenerationKW)} generation; at ${importPeak.at.clockLabel} demand of ${kw(importPeak.at.buildingLoadKW)} meets only ${kw(importPeak.at.pvAcKW)} of generation.`,
      SOURCE.grid,
    )
  }

  // ── Cooling ──────────────────────────────────────────────────────────────
  const cooling = extremeOf(walk, (p) => p.coolingLoadKW, 'max')
  if (cooling && cooling.value - baseline.coolingLoadKW >= NOTABLE.COOLING_SWING) {
    add(
      'cooling', 'building', 'notice',
      `Cooling demand is expected to peak at ${kw(cooling.value)} around ${cooling.at.clockLabel}.`,
      `Outdoor temperature reaches ${degC(cooling.at.temperature)} with ${pct(cooling.at.occupancy)} occupancy at that hour.`,
      SOURCE.building,
    )
  }

  // Alerts first, then notices — the operator reads top-down.
  const rank: Record<Insight['severity'], number> = { alert: 0, notice: 1, info: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, MAX_INSIGHTS)
}

// ---------------------------------------------------------------------------
// Reasoning chain
// ---------------------------------------------------------------------------

/**
 * The Forecast → Solar → Energy → Prediction chain, each stage quoting the value
 * it actually contributed. This is the audit trail for the whole report: read
 * top to bottom it is the derivation of every number above it.
 */
export function buildReasoning(
  ctx: PredictionContext,
  walk: readonly TwinProjection[],
  source: string,
): ReasoningStage[] {
  const end = walk[walk.length - 1]
  const pvPeak = extremeOf(walk, (p) => p.pvAcKW, 'max')

  return [
    {
      id: 'forecast',
      label: 'Forecast',
      detail: end
        ? `${source} supplies the drivers: ${degC(end.temperature)}, ${pct(end.cloudCoverage)} cloud, ${pct(end.rainIntensity)} rain and ${end.windSpeed.toFixed(0)} km/h wind at ${end.clockLabel}.`
        : `${source} supplies the environmental drivers.`,
    },
    {
      id: 'solar',
      label: 'Solar',
      detail: end
        ? `The ASHRAE clear-sky model turns the sun's position and that cloud cover into ${wm2(end.ghi)} global horizontal, giving ${wm2(end.facadeIrradiance)} on the façade at ${pct(end.facadeExposure)} exposure.`
        : 'Sun position and clear-sky irradiance are evaluated for each projected hour.',
    },
    {
      id: 'energy',
      label: 'Energy',
      detail: pvPeak
        ? `Irradiance drives the array to a peak of ${kw(pvPeak.value)} AC; the bus settles that against demand, offers any surplus to the battery and reports the residual as grid exchange.`
        : 'Irradiance drives the PV chain; the bus settles generation against demand and reports the residual.',
    },
    {
      id: 'prediction',
      label: 'Prediction',
      detail: `Each horizon is a sample of the hour-by-hour walk, graded by how far ahead it reaches, how fresh the data is and how settled the weather is across the interval.`,
    },
  ]
}
