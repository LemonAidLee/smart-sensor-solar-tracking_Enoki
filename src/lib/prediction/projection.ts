/**
 * Forward projection — Stage 8.1.
 *
 * Answers one question: *what would the existing engines produce N hours from
 * now?* It answers it by calling those engines' own pure functions, in the same
 * order the Simulation calls them:
 *
 *   Weather Timeline → computeSun → planeIrradiance → moduleDcPowerW
 *     → convertDcToAc → equilibriumThermalState → buildingDemandKW
 *     → settleBus → planStorage → grid
 *
 * Every one of those is imported from the engine that owns it. There is no
 * second solar model, no second PV curve, no second load profile and no second
 * dispatch rule anywhere in this file — which is exactly why a projection can be
 * trusted as a statement about *this* twin rather than about a similar one.
 *
 * ── Deliberate simplifications, and why they are safe ────────────────────────
 * 1. **Neighbour occlusion is not ray-cast forward.** The projection assumes an
 *    unobstructed sky (visibility 1). The case-study site declares no
 *    neighbours, so this changes nothing today; when it does, a projection would
 *    read slightly optimistic at low sun angles. Ray-casting 1,620 panels twelve
 *    times per recompute is not a cost the advisory layer may impose on the
 *    simulation loop.
 * 2. **Blade rotation is not projected.** Façade exposure is reported against
 *    the fixed *surface* normals, not the rotated blades — because predicting
 *    blade angles would mean predicting PBIF's decisions, and PBIF is the
 *    controller. The AI states the solar resource arriving at each elevation and
 *    stops there.
 * 3. **The HVAC thermal lag uses its equilibrium value.** The fabric's response
 *    time is 15 simulated minutes against a 1–12 hour horizon.
 * 4. **The façade thermal-mass lag (Stage 7.9) likewise uses its equilibrium
 *    value**, via `equilibriumThermalState` — the SAME reasoning as #3: its
 *    20-simulated-minute time constant is negligible against a 1–12 hour
 *    horizon, so the projection reads the settled cooling load rather than
 *    integrating the lag hour-by-hour.
 *
 * All four are surfaced to the operator as assumptions, never hidden.
 */

import { computeSun } from '../engine/solar'
import { attenuatedGHI, planeIrradiance } from '../engine/solarPhysics'
import { moduleDcPowerW, PV_MODULE_RATED_POWER_W } from '../engine/pvElectrical'
import { convertDcToAc } from '../engine/pvInverter'
import { buildingDemandKW, hvacDemandFactor, settleBus, type EnergyBusState } from '../engine/buildingEnergy'
import { equilibriumThermalState } from '../engine/buildingThermal'
import { planStorage } from '../engine/battery'
import { facadeDaylightPercent, facadeSolarGainKW, normalisedExposure } from '../engine/metrics'
import { sampleTimeline, type WeatherDrivers, type WeatherKeyframe } from '../engine/weatherScenario'
import { clamp, deg2rad, dot, rotateY } from '../engine/math'
import type { SimClock } from '../engine/types'
import type { PredictionContext, ProjectionParameters, TwinProjection } from './types'

/** The projection walks one hour at a time out to the furthest horizon. */
export const PROJECTION_STEP_HOURS = 1

/** Visibility assumed for the forward projection — see the header, note 1. */
const ASSUMED_VISIBILITY = 1

const MS_PER_HOUR = 3_600_000

/**
 * Reusable bus buffer — `settleBus` writes into a caller-owned object.
 * Exported so other callers walking `projectAt` over a custom horizon (the
 * Daily Energy bootstrap, Stage 7.9.5) share this one shape rather than
 * hand-rolling a second zeroed `EnergyBusState` literal.
 */
export function emptyBus(): EnergyBusState {
  return {
    pvGenerationKW: 0,
    buildingLoadKW: 0,
    selfConsumptionKW: 0,
    pvToLoadKW: 0,
    pvSurplusKW: 0,
    deficitKW: 0,
    batteryChargeKW: 0,
    batteryDischargeKW: 0,
    surplusKW: 0,
    requiredGridImportKW: 0,
    selfConsumptionRatio: 0,
    buildingCoverage: 0,
    batteryKW: 0,
    gridKW: 0,
  }
}

/** "15:30" from a fractional hour. */
export function clockLabel(hours: number): string {
  const h = ((hours % 24) + 24) % 24
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`
}

/**
 * The clock advanced by `hoursAhead`, rolling the calendar date over midnight.
 *
 * The date matters: `computeSun` reads it for the day of year, which sets the
 * declination and the ASHRAE optical depths. A twelve-hour horizon crossing
 * midnight must land on the next day's sun, not today's.
 */
function futureClock(clock: Readonly<SimClock>, hoursAhead: number): SimClock {
  const raw = clock.timeHours + hoursAhead
  const dayOffset = Math.floor(raw / 24)
  const date = new Date(clock.date)
  if (dayOffset !== 0) date.setDate(date.getDate() + dayOffset)
  return { date, timeHours: raw % 24, speed: clock.speed, playing: false }
}

/**
 * The weather drivers scheduled `hoursAhead` from now, with the projection's
 * parameters applied.
 *
 * Scenario and Forecast Mode both sample the ACTIVE timeline through
 * `sampleTimeline` — the same pure function the Weather Scenario Engine plays
 * back through, so a projection and the eventual playback cannot disagree.
 *
 * Manual Mode has no timeline: the operator's sliders are the weather and the
 * only defensible assumption is persistence. The current drivers are returned
 * unchanged and the report labels the source accordingly, so a held value is
 * never presented as a forecast.
 *
 * The parameters are applied AFTER sampling so a What-If modifies the weather the
 * twin would really have seen, rather than a separately-derived one. All three
 * are identities in the live context.
 */
export function projectDrivers(
  timeline: readonly WeatherKeyframe[] | null,
  current: WeatherDrivers,
  atHours: number,
  params: ProjectionParameters,
): WeatherDrivers {
  // A shifted pattern is simply the timeline read at a different hour.
  const sampleHours = atHours + params.weatherShiftHours
  const base =
    !timeline || timeline.length === 0 ? current : sampleTimeline(timeline, sampleHours)

  if (params.temperatureOffsetC === 0 && params.cloudOverride === null) return base
  return {
    ...base,
    temperature: base.temperature + params.temperatureOffsetC,
    cloudCoverage: params.cloudOverride ?? base.cloudCoverage,
  }
}

/**
 * The forecast instant a projected hour replays, epoch ms, or null when the
 * active timeline carries no forecast provenance (Manual or Scenario Mode).
 *
 * Derived from the keyframe whose hour of day the projection lands in, plus the
 * fractional offset into that hour — the same provenance rule
 * `replayInstantMs()` applies to live playback, evaluated for a future hour.
 */
export function projectedInstantMs(
  timeline: readonly WeatherKeyframe[] | null,
  atHours: number,
): number | null {
  if (!timeline || timeline.length === 0) return null
  const h = ((atHours % 24) + 24) % 24
  let from = timeline.length - 1
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].timeHours <= h) from = i
    else break
  }
  const kf = timeline[from]
  if (kf.sourceEpochMs == null) return null
  let elapsed = h - kf.timeHours
  if (elapsed < 0) elapsed += 24
  return kf.sourceEpochMs + elapsed * MS_PER_HOUR
}

/**
 * Area-weighted mean cosine projection of the sun onto the façade's surfaces.
 *
 * Surfaces are expressed in the building's own local frame, so the sun vector is
 * rotated by the building orientation exactly as `Simulation.tick()` does before
 * handing it to `SolarPhysicsEngine` — the same convention, not a new one.
 */
function facadeExposure(ctx: PredictionContext, sunWorldDir: { x: number; y: number; z: number }): number {
  const surfaces = ctx.facadeSurfaces
  if (surfaces.length === 0) return 0
  const localSun = rotateY(sunWorldDir, deg2rad(ctx.building.orientation))

  let weighted = 0
  let area = 0
  for (const s of surfaces) {
    const cos = clamp(dot(localSun, s.normal), 0, 1)
    weighted += cos * s.area
    area += s.area
  }
  return area > 0 ? weighted / area : 0
}

/** The rooftop array's shared module normal, or straight up if none exist. */
function pvNormal(ctx: PredictionContext): { x: number; y: number; z: number } {
  return ctx.pvModules[0]?.normal ?? { x: 0, y: 1, z: 0 }
}

/**
 * Project the twin at one future hour, carrying the battery's state of charge in
 * from the previous step.
 *
 * @param storedKWh Projected stored energy at the START of this step, kWh.
 * @param stepHours Simulated hours this step integrates. Zero evaluates the
 *                  instant without advancing storage, which is how the "now"
 *                  baseline is produced.
 * @returns The projection and the stored energy at the END of the step.
 */
export function projectAt(
  ctx: PredictionContext,
  hoursAhead: number,
  storedKWh: number,
  timeline: readonly WeatherKeyframe[] | null,
  bus: EnergyBusState,
  stepHours: number = PROJECTION_STEP_HOURS,
): { projection: TwinProjection; storedKWh: number } {
  const params = ctx.parameters
  const clock = futureClock(ctx.clock, hoursAhead)
  const atHours = clock.timeHours

  // ── 1. Environment ───────────────────────────────────────────────────────
  const drivers = projectDrivers(timeline, ctx.weather, atHours, params)

  // ── 2. Solar ─────────────────────────────────────────────────────────────
  const sun = computeSun(clock, ctx.building, drivers.cloudCoverage)
  const ghi = attenuatedGHI(sun)

  const exposure = facadeExposure(ctx, sun.worldDir)
  const facadeIrradiance = planeIrradiance(ghi, exposure, ASSUMED_VISIBILITY, sun.isDaytime)

  // Façade thermal + optical response, through `metrics.ts` — the same authority
  // the live surface metrics use, so a locked-façade What-If is evaluated with
  // the physics the twin already reports rather than a parallel model.
  //
  // `facadeSolarGainKW` is defined against `FacadePanel.solarExposure`, which is
  // NORMALISED IRRADIANCE (irradiance / 1000) — not the geometric cosine. Feeding
  // it the raw cosine would make façade gain blind to cloud, which is exactly the
  // weather effect a locked-façade study needs to see.
  const normalisedFacadeExposure = normalisedExposure(facadeIrradiance)
  const solarGainKW = facadeSolarGainKW(
    normalisedFacadeExposure,
    params.facadeOpenness,
    ctx.facadeAreaM2,
  )
  const daylight = facadeDaylightPercent(params.facadeOpenness, sun.isDaytime, ghi)

  // ── 3. PV plant ──────────────────────────────────────────────────────────
  const localSun = rotateY(sun.worldDir, deg2rad(ctx.building.orientation))
  const cosPv = clamp(dot(localSun, pvNormal(ctx)), 0, 1)
  const pvPlaneIrradiance = planeIrradiance(ghi, cosPv, ASSUMED_VISIBILITY, sun.isDaytime)
  // The derate rides the soiling hook `moduleDcPowerW` already exposes, so a
  // reduced-efficiency What-If adds no arithmetic of its own.
  const pvDcKW =
    (moduleDcPowerW(pvPlaneIrradiance, PV_MODULE_RATED_POWER_W, 1, params.pvDerate) *
      ctx.pvModules.length) /
    1000
  const inverter = convertDcToAc(pvDcKW, ctx.inverterRatedKW, ctx.inverterBaseEfficiency)

  // ── 4. Building Thermal Response, then building demand ───────────────────
  // Reuses the SAME equilibrium chain the live `BuildingThermalEngine` calls
  // every tick (see header note 4) — the live engine additionally integrates
  // the thermal-mass lag, which this horizon is long enough to ignore.
  const thermal = equilibriumThermalState(params.facadeOpenness, solarGainKW, drivers.temperature, facadeIrradiance)
  const demand = buildingDemandKW(
    ctx.floorAreaM2,
    atHours,
    hvacDemandFactor(drivers.temperature),
    thermal.coolingLoadKW,
  )

  // ── 5. Storage, then the bus ─────────────────────────────────────────────
  // The battery is offered the PV-only imbalance, exactly as the BEMS offers it.
  const plan = planStorage(
    ctx.batteryLimits,
    storedKWh,
    Math.max(0, inverter.acKW - demand.totalKW),
    Math.max(0, demand.totalKW - inverter.acKW),
    stepHours,
  )
  settleBus(bus, inverter.acKW, demand.totalKW, plan)

  // ── 6. Grid — the residual the bus already computed, never recomputed ─────
  const capacity = ctx.batteryLimits.capacityKWh

  return {
    storedKWh: plan.storedKWh,
    projection: {
      hoursAhead,
      atHours,
      clockLabel: clockLabel(atHours),
      atEpochMs: projectedInstantMs(timeline, atHours),

      temperature: drivers.temperature,
      humidity: drivers.humidity,
      cloudCoverage: drivers.cloudCoverage,
      rainIntensity: drivers.rainIntensity,
      windSpeed: drivers.windSpeed,

      sunAltitude: sun.altitude,
      sunAzimuth: sun.azimuth,
      isDaytime: sun.isDaytime,
      ghi: Math.round(ghi),
      facadeExposure: exposure,
      facadeIrradiance,
      facadeOpenness: params.facadeOpenness,
      facadeSolarGainKW: solarGainKW,
      facadeDaylight: daylight,

      pvPlaneIrradiance,
      pvDcKW,
      pvAcKW: inverter.acKW,
      inverterState: inverter.state,

      occupancy: demand.occupancy,
      buildingLoadKW: demand.totalKW,
      coolingLoadKW: demand.hvacKW,

      batterySoc: capacity > 0 ? plan.storedKWh / capacity : 0,
      batteryChargeKW: bus.batteryChargeKW,
      batteryDischargeKW: bus.batteryDischargeKW,
      batteryState: plan.state,
      // With the utility present the residual IS the import. Islanded, the very
      // same residual is demand nothing could serve — a reclassification of one
      // number the bus already settled, never a second calculation.
      gridImportKW: params.gridAvailable ? bus.requiredGridImportKW : 0,
      gridExportKW: params.gridAvailable ? bus.surplusKW : 0,
      unservedLoadKW: params.gridAvailable ? 0 : bus.requiredGridImportKW,
      buildingCoverage: bus.buildingCoverage,
    },
  }
}

/**
 * The projection evaluated at the CURRENT instant.
 *
 * Its purpose is comparison, not display: quantities the engines publish live
 * (PV output, building load, grid exchange) are always read from the engines
 * themselves, but a few — mean façade irradiance, the cooling share of the load
 * — have no live equivalent on the snapshot. Deriving their "now" value through
 * the same code path that derives the "then" value is what makes a stated delta
 * a real delta rather than a comparison between two different models.
 *
 * The step integrates zero hours, so the battery's state of charge is read, not
 * advanced.
 */
export function projectBaseline(ctx: PredictionContext): TwinProjection {
  return projectAt(ctx, 0, ctx.battery.storedKWh, ctx.timeline, emptyBus(), 0).projection
}

/**
 * Walk the twin forward hour by hour to `hours`, returning one projection per
 * step (index 0 is +1 h).
 *
 * One walk serves every horizon: the 1/3/6/12-hour cards are *samples* of it, so
 * the state of charge at +12 h is the result of twelve real dispatch decisions
 * rather than a single extrapolated guess, and the insight generator gets the
 * hour-resolved series it needs to say *when* something changes.
 */
export function projectWalk(ctx: PredictionContext, hours: number): TwinProjection[] {
  const timeline = ctx.timeline
  const bus = emptyBus()
  const out: TwinProjection[] = []

  let storedKWh = ctx.battery.storedKWh
  for (let h = PROJECTION_STEP_HOURS; h <= hours; h += PROJECTION_STEP_HOURS) {
    const step = projectAt(ctx, h, storedKWh, timeline, bus)
    storedKWh = step.storedKWh
    out.push(step.projection)
  }
  return out
}
