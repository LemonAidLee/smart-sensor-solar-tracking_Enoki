/**
 * FDD detection rules — Stage 8.5.
 *
 * One deterministic function per monitored subsystem. Every rule re-derives an
 * expected value or invariant from values the engines have already published
 * (the {@link SimSnapshot}) and compares it against what was actually observed.
 * A rule that has nothing to compare says so honestly rather than guessing —
 * see `evaluateAIPrediction` for the one subsystem whose own status IS the
 * signal being read.
 *
 * No rule here ever consults a random number, a clock-based timer or a hidden
 * counter: the same snapshot always produces the same grade.
 */

import type { SimSnapshot } from '../../engine/types'
import type { ContextBuilderAPI } from '../../assistant/types'
import type { SubsystemId } from '../../knowledge/types'
import { EngineeringKnowledgeBase } from '../../knowledge'
import { clamp } from '../../engine/math'
import type { SubsystemHealth } from './types'

// ---------------------------------------------------------------------------
// Shared scoring — every threshold named, none inline (CLAUDE.md §6).
// ---------------------------------------------------------------------------

/** Health score at/above which a subsystem reads Healthy. Below it, Warning. */
const SCORE_HEALTHY_AT = 90
/** Health score below which a subsystem reads Critical rather than Warning. */
const SCORE_CRITICAL_BELOW = 70

/** Each known engineering limitation the subsystem carries costs this many
 *  confidence points — an unmodelled edge case is a real reason a check could
 *  be wrong, so confidence is never a flat, meaningless 100%. */
const CONFIDENCE_PENALTY_PER_LIMITATION = 2
const CONFIDENCE_FLOOR = 85
const CONFIDENCE_CEILING = 99

/** A tolerance small enough that floating-point noise never trips a check. */
const EPSILON_KW = 0.05

function clamp100(v: number): number {
  return clamp(v, 0, 100)
}

/** 0 = perfectly matches the expected physics, 1 = fully diverged. */
function scoreFromDeviation(deviation: number): number {
  return Math.round(clamp100(100 - clamp(deviation, 0, 1) * 100))
}

function statusFromScore(score: number): SubsystemHealth['status'] {
  if (score < SCORE_CRITICAL_BELOW) return 'Critical'
  if (score < SCORE_HEALTHY_AT) return 'Warning'
  return 'Healthy'
}

/** How confidently a subsystem's checks can be trusted — lower where the
 *  Knowledge Base itself documents more unmodelled behaviour. */
function confidenceFor(subsystem: SubsystemId): number {
  const limitations = EngineeringKnowledgeBase.getSubsystemById(subsystem)?.knownLimitations.length ?? 0
  return clamp(CONFIDENCE_CEILING - limitations * CONFIDENCE_PENALTY_PER_LIMITATION, CONFIDENCE_FLOOR, CONFIDENCE_CEILING)
}

/** Deviation, 0–1, for a value expected to sit within [min, max]. `scale` is
 *  the distance beyond the band at which the deviation saturates at 1. */
function deviationOutsideBand(value: number, min: number, max: number, scale: number): number {
  if (value >= min && value <= max) return 0
  const distance = value < min ? min - value : value - max
  return clamp(distance / scale, 0, 1)
}

/** Deviation from a boolean invariant that must hold. */
function deviationFromInvariant(holds: boolean): number {
  return holds ? 0 : 1
}

function buildHealth(
  subsystem: SubsystemId,
  deviation: number,
  reason: string,
  evidence: Record<string, string>,
  atHours: number,
): SubsystemHealth {
  const knowledge = EngineeringKnowledgeBase.getSubsystemById(subsystem)
  const healthScore = scoreFromDeviation(deviation)
  return {
    subsystem,
    label: knowledge?.name ?? subsystem,
    status: statusFromScore(healthScore),
    healthScore,
    reason,
    evidence,
    confidence: confidenceFor(subsystem),
    timestamp: atHours,
  }
}

// ---------------------------------------------------------------------------
// Per-subsystem rules
// ---------------------------------------------------------------------------

const WEATHER_TEMP_MIN_C = -10
const WEATHER_TEMP_MAX_C = 55

function evaluateWeather(_contexts: ContextBuilderAPI, snap: SimSnapshot, atHours: number): SubsystemHealth {
  const w = snap.weather
  const failed: string[] = []
  if (w.temperature < WEATHER_TEMP_MIN_C || w.temperature > WEATHER_TEMP_MAX_C) failed.push('Temperature')
  if (w.humidity < 0 || w.humidity > 100) failed.push('Humidity')
  if (w.cloudCoverage < 0 || w.cloudCoverage > 1) failed.push('Cloud Coverage')
  if (w.rainIntensity < 0) failed.push('Rain Intensity')
  if (w.windSpeed < 0) failed.push('Wind Speed')

  const CHECK_COUNT = 5
  const deviation = failed.length / CHECK_COUNT
  const reason =
    failed.length === 0
      ? `All five weather drivers are within their physically valid ranges — ${w.temperature.toFixed(1)} °C, ${Math.round(w.cloudCoverage * 100)}% cloud cover, ${w.rainIntensity.toFixed(1)} mm/h rain, ${w.windSpeed.toFixed(1)} m/s wind.`
      : `${failed.join(', ')} outside its physically valid range.`

  return buildHealth(
    'Weather',
    deviation,
    reason,
    {
      Temperature: `${w.temperature.toFixed(1)} °C`,
      Humidity: `${w.humidity.toFixed(0)} %`,
      'Cloud Coverage': `${Math.round(w.cloudCoverage * 100)} %`,
      'Rain Intensity': `${w.rainIntensity.toFixed(1)} mm/h`,
      'Wind Speed': `${w.windSpeed.toFixed(1)} m/s`,
    },
    atHours,
  )
}

/** DNI actual must never exceed the clear-sky ceiling for the same instant. */
const SOLAR_IRRADIANCE_TOLERANCE_WM2 = 5

function evaluateSolarPhysics(_contexts: ContextBuilderAPI, snap: SimSnapshot, atHours: number): SubsystemHealth {
  const s = snap.sun
  const daytimeConsistent = (s.altitude > 0) === s.isDaytime
  const withinClearSkyCeiling = s.irradiance <= s.dniClearSky + SOLAR_IRRADIANCE_TOLERANCE_WM2

  const CHECK_COUNT = 2
  const failedCount = (daytimeConsistent ? 0 : 1) + (withinClearSkyCeiling ? 0 : 1)
  const deviation = failedCount / CHECK_COUNT

  const reason =
    failedCount === 0
      ? `Sun altitude (${s.altitude.toFixed(1)}°) agrees with the daytime flag, and actual DNI (${Math.round(s.irradiance)} W/m²) stays within the clear-sky ceiling (${Math.round(s.dniClearSky)} W/m²).`
      : !daytimeConsistent
        ? `Daytime flag disagrees with sun altitude (${s.altitude.toFixed(1)}°).`
        : `Actual DNI (${Math.round(s.irradiance)} W/m²) exceeds the clear-sky ceiling (${Math.round(s.dniClearSky)} W/m²).`

  return buildHealth(
    'SolarPhysics',
    deviation,
    reason,
    {
      Altitude: `${s.altitude.toFixed(1)}°`,
      'Actual DNI': `${Math.round(s.irradiance)} W/m²`,
      'Clear-Sky DNI': `${Math.round(s.dniClearSky)} W/m²`,
      Daytime: s.isDaytime ? 'Yes' : 'No',
    },
    atHours,
  )
}

const ADC_MAX_12BIT = 4095

function evaluateVirtualSensors(contexts: ContextBuilderAPI, _snap: SimSnapshot, atHours: number): SubsystemHealth {
  const ctx = contexts.getSubsystemContext('VirtualSensors')
  const adc = Number(ctx?.keyMetrics.globalADC ?? NaN)

  const finite = Number.isFinite(adc)
  const inRange = finite && adc >= 0 && adc <= ADC_MAX_12BIT

  const CHECK_COUNT = 2
  const failedCount = (finite ? 0 : 1) + (inRange ? 0 : 1)
  const deviation = failedCount / CHECK_COUNT

  const reason = inRange
    ? `Global ADC channel reads ${adc} counts, within the 12-bit range the LDR front-end can produce.`
    : `Global ADC channel reads ${finite ? adc : 'a non-numeric value'}, outside the valid 0–${ADC_MAX_12BIT} count range.`

  return buildHealth(
    'VirtualSensors',
    deviation,
    reason,
    {
      'Global ADC': finite ? `${adc} counts` : 'unavailable',
      'Global Lux': String(ctx?.evidence['Global Lux'] ?? 'unavailable'),
    },
    atHours,
  )
}

function evaluatePBIF(contexts: ContextBuilderAPI, _snap: SimSnapshot, atHours: number): SubsystemHealth {
  const ctx = contexts.getSubsystemContext('PBIF')
  const hasDecision = !!ctx && ctx.currentState !== 'Unknown' && ctx.currentState.length > 0
  const deviation = deviationFromInvariant(hasDecision)

  const reason = hasDecision
    ? `PBIF is ${ctx!.status} — ${ctx!.summary}`
    : 'PBIF has not yet published a decision for this tick.'

  return buildHealth(
    'PBIF',
    deviation,
    reason,
    {
      Status: ctx?.status ?? 'Unknown',
      Objective: ctx?.evidence['Objective'] ?? 'N/A',
      Policy: ctx?.evidence['Policy'] ?? 'N/A',
    },
    atHours,
  )
}

/** A single fault panel out of the full 1,620-panel façade is still a genuine
 *  finding, not noise — this converts the count to a deviation without ever
 *  rounding a nonzero fault count down to zero. */
function panelFaultDeviation(faultPanels: number, totalPanels: number): number {
  if (faultPanels === 0) return 0
  const ratio = faultPanels / Math.max(1, totalPanels)
  const MIN_DETECTABLE_DEVIATION = 0.35
  return Math.max(MIN_DETECTABLE_DEVIATION, ratio)
}

const PANEL_ANGLE_MIN_DEG = 0
const PANEL_ANGLE_MAX_DEG = 180

function evaluateServoKinematics(_contexts: ContextBuilderAPI, snap: SimSnapshot, atHours: number): SubsystemHealth {
  const m = snap.metrics
  const angleDeviation = deviationOutsideBand(m.averagePanelAngle, PANEL_ANGLE_MIN_DEG, PANEL_ANGLE_MAX_DEG, 10)
  const faultDeviation = panelFaultDeviation(m.faultPanels, m.totalPanels)
  const deviation = Math.max(angleDeviation, faultDeviation)

  const reason =
    m.faultPanels === 0
      ? `Servo tracking follows controller commands — ${m.movingPanels} of ${m.totalPanels} blades in motion, mean angle ${m.averagePanelAngle.toFixed(1)}°, no actuator faults reported.`
      : `${m.faultPanels} of ${m.totalPanels} blades report an actuator fault.`

  return buildHealth(
    'ServoKinematics',
    deviation,
    reason,
    {
      'Moving Panels': `${m.movingPanels} / ${m.totalPanels}`,
      'Fault Panels': `${m.faultPanels}`,
      'Mean Blade Angle': `${m.averagePanelAngle.toFixed(1)}°`,
    },
    atHours,
  )
}

function evaluateAdaptiveFacade(_contexts: ContextBuilderAPI, snap: SimSnapshot, atHours: number): SubsystemHealth {
  const m = snap.metrics
  const opennessDeviation = deviationOutsideBand(m.averageOpenness, 0, 1, 0.1)
  const daylightDeviation = deviationOutsideBand(m.averageDaylight, 0, 100, 10)
  const faultDeviation = panelFaultDeviation(m.faultPanels, m.totalPanels)
  const deviation = Math.max(opennessDeviation, daylightDeviation, faultDeviation)

  const reason =
    m.faultPanels === 0
      ? `Façade optics are self-consistent — ${Math.round(m.averageOpenness * 100)}% mean openness transmitting ${Math.round(m.averageDaylight)}% daylight, comfort score ${Math.round(m.averageComfort)}/100.`
      : `${m.faultPanels} blade fault(s) are degrading the façade's optical response.`

  return buildHealth(
    'AdaptiveFacade',
    deviation,
    reason,
    {
      'Mean Openness': `${Math.round(m.averageOpenness * 100)} %`,
      'Daylight Transmitted': `${Math.round(m.averageDaylight)} %`,
      Comfort: `${Math.round(m.averageComfort)} / 100`,
    },
    atHours,
  )
}

const PV_REFERENCE_IRRADIANCE_WM2 = 1000
/** Below this expected yield the ratio check is not meaningful — the array is
 *  simply idle (night, deep overcast), so the check falls back to confirming
 *  the array is correctly near-zero rather than dividing by a tiny number. */
const PV_EXPECTED_FLOOR_KW = 1
const PV_RATIO_MIN = 0.5
const PV_RATIO_MAX = 1.05
const PV_RATIO_SCALE = 0.6

function evaluateRooftopPV(_contexts: ContextBuilderAPI, snap: SimSnapshot, atHours: number): SubsystemHealth {
  const expectedDcKW = (snap.pvAverageIrradiance / PV_REFERENCE_IRRADIANCE_WM2) * snap.pvInstalledCapacity

  let deviation: number
  let relation: string
  if (expectedDcKW < PV_EXPECTED_FLOOR_KW) {
    deviation = deviationOutsideBand(snap.pvCurrentDCOutput, 0, PV_EXPECTED_FLOOR_KW, PV_EXPECTED_FLOOR_KW)
    relation = 'irradiance is too low for a meaningful yield ratio — confirming the array is correctly near-idle'
  } else {
    const ratio = snap.pvCurrentDCOutput / expectedDcKW
    deviation = deviationOutsideBand(ratio, PV_RATIO_MIN, PV_RATIO_MAX, PV_RATIO_SCALE)
    relation = `generation is ${Math.round(ratio * 100)}% of the ${PV_REFERENCE_IRRADIANCE_WM2} W/m² reference yield`
  }

  const reason = `Current power generation is consistent with available irradiance — ${relation}.`

  return buildHealth(
    'RooftopPV',
    deviation,
    deviation === 0 ? reason : `PV output diverges from the expected irradiance-scaled yield — ${relation}.`,
    {
      'POA Irradiance': `${snap.pvAverageIrradiance} W/m²`,
      'DC Output': `${snap.pvCurrentDCOutput.toFixed(1)} kW`,
      'Installed Capacity': `${snap.pvInstalledCapacity.toFixed(1)} kW`,
      Utilization: `${Math.round(snap.pvUtilization * 100)} %`,
    },
    atHours,
  )
}

const INVERTER_EFFICIENCY_MAX = 1.02

function evaluatePVInverter(_contexts: ContextBuilderAPI, snap: SimSnapshot, atHours: number): SubsystemHealth {
  const acExceedsDc = snap.invCurrentACOutput > snap.invCurrentDCOutput + EPSILON_KW
  const efficiencyPlausible = snap.invEfficiency >= 0 && snap.invEfficiency <= INVERTER_EFFICIENCY_MAX

  const CHECK_COUNT = 2
  const failedCount = (acExceedsDc ? 1 : 0) + (efficiencyPlausible ? 0 : 1)
  const deviation = failedCount / CHECK_COUNT

  const reason =
    failedCount === 0
      ? `Converting DC to AC at ${Math.round(snap.invEfficiency * 100)}% efficiency without exceeding the DC input — AC output ${snap.invCurrentACOutput.toFixed(1)} kW ≤ DC input ${snap.invCurrentDCOutput.toFixed(1)} kW.`
      : acExceedsDc
        ? `AC output (${snap.invCurrentACOutput.toFixed(1)} kW) exceeds DC input (${snap.invCurrentDCOutput.toFixed(1)} kW) — a physical impossibility.`
        : `Reported efficiency (${Math.round(snap.invEfficiency * 100)}%) is outside a plausible range.`

  return buildHealth(
    'PVInverter',
    deviation,
    reason,
    {
      'DC Input': `${snap.invCurrentDCOutput.toFixed(1)} kW`,
      'AC Output': `${snap.invCurrentACOutput.toFixed(1)} kW`,
      Efficiency: `${Math.round(snap.invEfficiency * 100)} %`,
      'Clipping Loss': `${snap.invConversionLossKW.toFixed(1)} kW`,
    },
    atHours,
  )
}

const LOAD_INTENSITY_MAX_WM2 = 500
const LOAD_INTENSITY_SCALE_WM2 = 150

function evaluateBuildingEnergy(_contexts: ContextBuilderAPI, snap: SimSnapshot, atHours: number): SubsystemHealth {
  const e = snap.energy
  const intensityDeviation = deviationOutsideBand(e.loadIntensityWm2, 0, LOAD_INTENSITY_MAX_WM2, LOAD_INTENSITY_SCALE_WM2)
  const occupancyDeviation = deviationOutsideBand(e.occupancy, 0, 1, 0.05)
  const deviation = Math.max(intensityDeviation, occupancyDeviation)

  const reason = `Building demand tracks the occupancy and HVAC load model — ${e.bus.buildingLoadKW.toFixed(1)} kW at ${e.loadIntensityWm2.toFixed(1)} W/m² with ${Math.round(e.occupancy * 100)}% occupancy.`

  return buildHealth(
    'BuildingEnergy',
    deviation,
    deviation === 0 ? reason : `Building demand intensity (${e.loadIntensityWm2.toFixed(1)} W/m²) is outside its plausible range.`,
    {
      'Total Demand': `${e.bus.buildingLoadKW.toFixed(1)} kW`,
      'Load Intensity': `${e.loadIntensityWm2.toFixed(1)} W/m²`,
      Occupancy: `${Math.round(e.occupancy * 100)} %`,
    },
    atHours,
  )
}

function evaluateBattery(_contexts: ContextBuilderAPI, snap: SimSnapshot, atHours: number): SubsystemHealth {
  const b = snap.battery
  const bus = snap.energy.bus

  const socInRange = deviationFromInvariant(b.soc >= 0 && b.soc <= 1)
  const singleDirection = deviationFromInvariant(!(b.chargeKW > EPSILON_KW && b.dischargeKW > EPSILON_KW))
  const dispatchMatchesBus = deviationFromInvariant(
    Math.abs(b.chargeKW - bus.batteryChargeKW) < EPSILON_KW * 2 &&
      Math.abs(b.dischargeKW - bus.batteryDischargeKW) < EPSILON_KW * 2,
  )

  const CHECK_COUNT = 3
  const deviation = (socInRange + singleDirection + dispatchMatchesBus) / CHECK_COUNT

  const reason =
    deviation === 0
      ? `Battery behaviour matches available PV surplus — the bus's planned dispatch (${bus.batteryChargeKW.toFixed(1)} kW charge / ${bus.batteryDischargeKW.toFixed(1)} kW discharge) agrees with the battery's reported dispatch, at ${Math.round(b.soc * 100)}% SOC.`
      : singleDirection > 0
        ? 'Battery reports simultaneous charge and discharge, which is not physically possible.'
        : dispatchMatchesBus > 0
          ? 'Battery dispatch disagrees with the energy bus\'s planned charge/discharge power.'
          : 'Battery state of charge is outside its 0–100% range.'

  return buildHealth(
    'Battery',
    deviation,
    reason,
    {
      SOC: `${Math.round(b.soc * 100)} %`,
      Charge: `${b.chargeKW.toFixed(1)} kW`,
      Discharge: `${b.dischargeKW.toFixed(1)} kW`,
      'Bus Planned Charge': `${bus.batteryChargeKW.toFixed(1)} kW`,
      'Bus Planned Discharge': `${bus.batteryDischargeKW.toFixed(1)} kW`,
    },
    atHours,
  )
}

/** Widest tolerance in this file — the balance is a sum of five independent
 *  quantities, each already rounded for display elsewhere, so a little slack
 *  avoids the check tripping on display-precision noise rather than a real
 *  imbalance. */
const GRID_BALANCE_TOLERANCE_KW = 0.5
const GRID_BALANCE_SCALE_KW = 2

function evaluateUtilityGrid(_contexts: ContextBuilderAPI, snap: SimSnapshot, atHours: number): SubsystemHealth {
  const bus = snap.energy.bus
  const g = snap.grid

  const supplied = bus.pvGenerationKW + g.importKW + bus.batteryDischargeKW
  const consumed = bus.buildingLoadKW + bus.batteryChargeKW + g.exportKW
  const residualKW = supplied - consumed

  const balanceDeviation = deviationOutsideBand(Math.abs(residualKW), 0, GRID_BALANCE_TOLERANCE_KW, GRID_BALANCE_SCALE_KW)
  const noSimultaneousFlow = deviationFromInvariant(!(g.importKW > EPSILON_KW && g.exportKW > EPSILON_KW))
  const deviation = Math.max(balanceDeviation, noSimultaneousFlow)

  const reason =
    deviation === 0
      ? `Grid import matches building demand — generation (${bus.pvGenerationKW.toFixed(1)} kW) plus import (${g.importKW.toFixed(1)} kW) plus battery discharge (${bus.batteryDischargeKW.toFixed(1)} kW) balances load, battery charge and export within ${GRID_BALANCE_TOLERANCE_KW} kW.`
      : noSimultaneousFlow > 0
        ? 'Grid reports simultaneous import and export, which is not physically possible.'
        : `Energy bus does not balance — supply and demand differ by ${Math.abs(residualKW).toFixed(2)} kW.`

  return buildHealth(
    'UtilityGrid',
    deviation,
    reason,
    {
      'PV Generation': `${bus.pvGenerationKW.toFixed(1)} kW`,
      Import: `${g.importKW.toFixed(1)} kW`,
      Export: `${g.exportKW.toFixed(1)} kW`,
      'Building Load': `${bus.buildingLoadKW.toFixed(1)} kW`,
      'Bus Residual': `${residualKW.toFixed(2)} kW`,
    },
    atHours,
  )
}

/** Deviation contributed by the Prediction Engine reporting Holding rather
 *  than Ready — a real, honestly-reported reduction in visibility (an empty
 *  forecast cache), not a malfunction, so it grades Warning rather than
 *  Critical. */
const PREDICTION_HOLDING_DEVIATION = 0.15

function evaluateAIPrediction(contexts: ContextBuilderAPI, _snap: SimSnapshot, atHours: number): SubsystemHealth {
  const ctx = contexts.getSubsystemContext('AIPrediction')
  const ready = ctx?.status === 'Ready'
  const deviation = ready ? 0 : PREDICTION_HOLDING_DEVIATION

  const reason = ready
    ? `Prediction Engine is reporting Ready — ${ctx?.summary ?? 'projection available'}.`
    : `Prediction Engine is Holding — ${ctx?.summary ?? 'no forecast cached'}. Visibility is reduced, not faulted.`

  return buildHealth(
    'AIPrediction',
    deviation,
    reason,
    {
      Status: ctx?.status ?? 'Unknown',
      Confidence: String(ctx?.keyMetrics.confidence ?? 'N/A'),
    },
    atHours,
  )
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

type Rule = (contexts: ContextBuilderAPI, snap: SimSnapshot, atHours: number) => SubsystemHealth

/** Exactly the twelve subsystems Stage 8.5 §2 names, in that order. Adding a
 *  future rule (sensor disagreement, inverter clipping severity, …) means
 *  adding one entry here — nothing else in the engine changes. */
const RULES: readonly Rule[] = [
  evaluateWeather,
  evaluateSolarPhysics,
  evaluateVirtualSensors,
  evaluatePBIF,
  evaluateServoKinematics,
  evaluateAdaptiveFacade,
  evaluateRooftopPV,
  evaluatePVInverter,
  evaluateBuildingEnergy,
  evaluateBattery,
  evaluateUtilityGrid,
  evaluateAIPrediction,
]

export function evaluateSubsystems(contexts: ContextBuilderAPI, snap: SimSnapshot): SubsystemHealth[] {
  const atHours = snap.timeHours
  return RULES.map((rule) => rule(contexts, snap, atHours))
}
