/**
 * Environmental Influence Model — which environmental parameter influences which
 * stage of the Cyber-Physical Pipeline, and by what mechanism.
 *
 * The Digital Twin tells ONE primary engineering story:
 *
 *     Sun → Environment → Sensor → Embedded Controller → Servo → Adaptive Façade
 *
 * Cloud cover, temperature, rain and wind are NOT parallel pipelines. Each one
 * enters the existing pipeline at exactly the stage it genuinely acts on, and
 * nowhere else. This module is the single, authoritative declaration of that
 * mapping so the UI can render it without inventing couplings of its own:
 *
 *   | Parameter    | Stage influenced       | Why (mechanism in this codebase)          |
 *   |--------------|------------------------|-------------------------------------------|
 *   | Cloud cover  | Environment            | Attenuates clear-sky GHI *before* sensing |
 *   | Temperature  | Embedded Controller    | Sets the Operational Objective            |
 *   | Rain         | Embedded Controller    | Changes the operational strategy           |
 *   | Wind         | Embedded Controller    | Structural-safety override (top priority) |
 *   | Wind         | Actuation (Servo)      | Constrains movement / suspends tracking   |
 *
 * Every entry is traceable to real code — no influence is asserted here that the
 * simulation does not actually implement. Each descriptor therefore also carries
 * a `doesNotAffect` line, because half of the educational value is preventing the
 * wrong mental model (e.g. "wind reduces sunlight", "rain dims the sensor").
 *
 * Pure, framework-free and side-effect free (guide §6, §11). It reads live values
 * and the current PBIF evaluation; it owns no thresholds of its own — every band
 * edge is imported from `src/lib/pbif/thresholds.ts`.
 */

import {
  DYNAMIC_DEADBAND_DEG,
  RAIN_LEVEL,
  STATE_LABELS,
  TEMPERATURE_C,
  WIND_KMH,
  type PbifEvaluation,
} from '@/lib/pbif'

/** The five stages of the primary Cyber-Physical Pipeline, in signal order. */
export type PipelineStage = 'environment' | 'sensor' | 'controller' | 'actuation' | 'facade'

/** The four environmental parameters presented as secondary influences. */
export type InfluenceParameter = 'cloud' | 'temperature' | 'rain' | 'wind'

/**
 * How strongly this influence is currently acting. Drives visual weight only —
 * an `idle` influence is still shown (so the user can watch it engage) but is
 * rendered muted so it never competes with the primary pipeline.
 */
export type InfluenceStatus = 'idle' | 'active' | 'overriding'

export interface EnvironmentalInfluence {
  /** Unique per card — a parameter may influence more than one stage (wind). */
  key: string
  parameter: InfluenceParameter
  /** The ONE pipeline stage this card attaches to. */
  stage: PipelineStage
  label: string
  /** Live value with unit, e.g. `"62%"`, `"31°C"`, `"44 km/h"`. */
  display: string
  /** Engineering state from the PBIF assessment layers, when one exists. */
  state?: string
  status: InfluenceStatus
  /** What it is doing to this stage *right now* — one short live line. */
  effect: string
  /** The concise, always-visible explanation (progressive disclosure level 1). */
  summary: string
  /** The engineering detail (progressive disclosure level 2). */
  detail: {
    /** How the parameter physically/logically enters this stage. */
    mechanism: string
    /** The traceable path through the codebase, stage by stage. */
    path: string[]
    /** Named thresholds that govern it, `[label, value]`. */
    thresholds?: [string, string][]
    /** What this parameter explicitly does NOT do — guards the mental model. */
    doesNotAffect: string
    /** Scientific / engineering citation. */
    reference?: string
  }
}

/** Live environmental readings the influence model describes. */
export interface InfluenceInputs {
  /** Cloud cover, 0–1. */
  cloudCoverage: number
  /** Cloud Modification Factor actually applied to GHI, 0.25–1. */
  cloudAttenuation: number
  /** Clear-sky Global Horizontal Irradiance, W/m². */
  rawGHI: number
  /** Outdoor air temperature, °C. */
  temperature: number
  /** Rain intensity, 0–1. */
  rainIntensity: number
  /** Wind speed, km/h. */
  windSpeed: number
  /** The live PBIF evaluation, or null before the first tick. */
  pbif: PbifEvaluation | null
}

/**
 * Cloud cover below this fraction leaves the clear-sky irradiance essentially
 * untouched, so the influence is reported as `idle`. Matches the "CLEAR" end of
 * the sky-condition scale used throughout the twin.
 */
const CLOUD_NEGLIGIBLE = 0.05

/** Build every influence descriptor for the current instant. */
export function describeEnvironmentalInfluences(input: InfluenceInputs): EnvironmentalInfluence[] {
  return [
    cloudInfluence(input),
    temperatureInfluence(input),
    rainInfluence(input),
    windOnController(input),
    windOnActuation(input),
  ]
}

/** All influences that attach to one pipeline stage, in declaration order. */
export function influencesForStage(
  all: EnvironmentalInfluence[],
  stage: PipelineStage,
): EnvironmentalInfluence[] {
  return all.filter((i) => i.stage === stage)
}

// ---------------------------------------------------------------------------
// CLOUD COVER → ENVIRONMENT
// ---------------------------------------------------------------------------
/**
 * Cloud is the only parameter that changes how much light exists. It multiplies
 * clear-sky GHI in `SolarPhysicsEngine.update()` *before* the sensor ever runs,
 * which is precisely why it belongs to the Environment stage and to no other.
 */
function cloudInfluence({ cloudCoverage, cloudAttenuation, rawGHI }: InfluenceInputs): EnvironmentalInfluence {
  const attenuated = Math.round(rawGHI * cloudAttenuation)
  const lostPct = Math.round((1 - cloudAttenuation) * 100)
  const status: InfluenceStatus = cloudCoverage > CLOUD_NEGLIGIBLE ? 'active' : 'idle'

  return {
    key: 'cloud@environment',
    parameter: 'cloud',
    stage: 'environment',
    label: 'Cloud Cover',
    display: `${Math.round(cloudCoverage * 100)}%`,
    status,
    effect:
      status === 'idle'
        ? `Clear sky — full ${Math.round(rawGHI)} W/m² reaches the façade`
        : `${Math.round(rawGHI)} W/m² × ${cloudAttenuation.toFixed(2)} → ${attenuated} W/m² (−${lostPct}%)`,
    summary: 'Reduces effective solar irradiance before sensor measurement.',
    detail: {
      mechanism:
        'Cloud attenuates the clear-sky beam in the atmosphere, so the light is already reduced by the time it arrives at the module. The Solar Physics Engine multiplies clear-sky GHI by the Cloud Modification Factor (CMF = 1 − cover × 0.75) before any panel geometry, occlusion or diffuse term is applied.',
      path: [
        'weather.cloudCoverage',
        'computeSun() → cloudModificationFactor',
        'SolarPhysicsEngine.update() → attenuated GHI',
        '→ effective irradiance → Sensor',
      ],
      thresholds: [['Cloud Modification Factor', 'CMF = 1 − cover × 0.75 (0.25 … 1.00)']],
      doesNotAffect:
        'The sensor and the controller never read cloud cover. They only ever see the smaller number that results from it — which is exactly why the sensor cannot tell a cloud from nightfall or from a neighbouring building’s shadow.',
      reference: 'ASHRAE Fundamentals — Clear-Sky model with linear cloud modification (src/lib/engine/solar.ts).',
    },
  }
}

// ---------------------------------------------------------------------------
// TEMPERATURE → EMBEDDED CONTROLLER
// ---------------------------------------------------------------------------
/**
 * Temperature is a *decision* input, never a measurement input. It classifies to
 * a Thermal Demand state, which selects the building's Operational Objective.
 */
function temperatureInfluence({ temperature, pbif }: InfluenceInputs): EnvironmentalInfluence {
  const thermal = pbif?.thermalDemand
  const objective = pbif?.decision.objective
  const status: InfluenceStatus = thermal?.state === 'HIGH' ? 'active' : 'idle'

  return {
    key: 'temperature@controller',
    parameter: 'temperature',
    stage: 'controller',
    label: 'Temperature',
    display: `${Math.round(temperature)}°C`,
    state: thermal ? `${thermal.state} thermal demand` : undefined,
    status,
    effect:
      status === 'active'
        ? `Thermal demand HIGH → objective “${objective ?? 'Reduce Cooling Load'}”`
        : `Thermal demand ${thermal?.state.toLowerCase() ?? 'nominal'} — no change to the objective`,
    summary: 'Influences thermal optimisation objectives within the controller.',
    detail: {
      mechanism:
        'Outdoor temperature is classified into a Thermal Demand state, which sets the controller’s Operational Objective — what the building is *trying to achieve*. Above the HIGH band the objective becomes “Reduce Cooling Load”, which keeps the façade tracking for solar heat exclusion (tighter deadbands) rather than for daylighting. Temperature is a decision input, not a measurement.',
      path: [
        'weather.temperature',
        'assessThermalDemand() → LOW · NORMAL · HIGH',
        'determineObjective() → Operational Objective',
        'decisionEngine rules (Thermal Demand tier)',
      ],
      thresholds: [
        ['NORMAL band', `≥ ${TEMPERATURE_C.NORMAL}°C`],
        ['HIGH band', `≥ ${TEMPERATURE_C.HIGH}°C`],
      ],
      doesNotAffect:
        'Temperature never enters the light-sensing chain. Illuminance, LDR resistance, the voltage divider and the ADC count are computed without it — a hot day does not change the measured light level.',
      reference: 'CIBSE Guide A (Environmental Design) · ASHRAE Fundamentals (Heat Balance) — PBIF guide §15.4.',
    },
  }
}

// ---------------------------------------------------------------------------
// RAIN → EMBEDDED CONTROLLER
// ---------------------------------------------------------------------------
/**
 * Rain changes operational *strategy*, not measurement. It is the Weather
 * Protection tier of the decision hierarchy.
 */
function rainInfluence({ rainIntensity, pbif }: InfluenceInputs): EnvironmentalInfluence {
  const rain = pbif?.situation.rain
  const protecting = pbif?.decision.state === 'WEATHER_PROTECTION'
  const status: InfluenceStatus = protecting ? 'overriding' : rain && rain.state !== 'NONE' ? 'active' : 'idle'

  return {
    key: 'rain@controller',
    parameter: 'rain',
    stage: 'controller',
    label: 'Rain',
    display: `${Math.round(rainIntensity * 100)}%`,
    state: rain ? `${STATE_LABELS[rain.state]} rain` : undefined,
    status,
    effect: protecting
      ? 'Strategy overridden → Weather Protection (façade closes, tracking stops)'
      : rain && rain.state === 'LIGHT'
        ? 'Light rain → economised movement to limit exposure of moving parts'
        : 'Dry — solar strategy unchanged',
    summary: 'Changes the controller’s operating strategy to protect the façade.',
    detail: {
      mechanism:
        'Rain intensity is classified into a Rain state which sits in the Weather Protection tier — above solar optimisation, below structural safety. At MODERATE or HEAVY the operational objective becomes “Protect Building Envelope”: the façade is commanded to its closed, rain-safe configuration instead of following the sun.',
      path: [
        'weather.rainIntensity',
        'assessRain() → NONE · LIGHT · MODERATE · HEAVY',
        'decisionEngine (Weather Protection tier) → WEATHER_PROTECTION',
        'trackingPolicy → façade state CLOSED',
      ],
      thresholds: [
        ['LIGHT', `≥ ${Math.round(RAIN_LEVEL.LIGHT * 100)}%`],
        ['MODERATE', `≥ ${Math.round(RAIN_LEVEL.MODERATE * 100)}%`],
        ['HEAVY', `≥ ${Math.round(RAIN_LEVEL.HEAVY * 100)}%`],
      ],
      doesNotAffect:
        'Rain does not dim the light sensor in this model — only cloud cover changes irradiance. This is the clearest example of the split between environmental *measurement* and operational *strategy*: the sensor reading can be unchanged while the façade behaviour changes completely.',
      reference: 'PBIF v1 decision hierarchy — PBIF guide §15.5 / §15.7.',
    },
  }
}

// ---------------------------------------------------------------------------
// WIND → EMBEDDED CONTROLLER  (decision)
// ---------------------------------------------------------------------------
/**
 * Wind is the top of the decision hierarchy — a structural-safety input that can
 * override every optimisation objective.
 */
function windOnController({ windSpeed, pbif }: InfluenceInputs): EnvironmentalInfluence {
  const wind = pbif?.situation.wind
  const safe = pbif?.decision.state === 'SAFE_MODE'
  const status: InfluenceStatus = safe ? 'overriding' : wind?.state === 'HIGH' ? 'active' : 'idle'

  return {
    key: 'wind@controller',
    parameter: 'wind',
    stage: 'controller',
    label: 'Wind — safety decision',
    display: `${Math.round(windSpeed)} km/h`,
    state: wind ? `${STATE_LABELS[wind.state]} wind` : undefined,
    status,
    effect: safe
      ? 'Extreme wind → SAFE MODE overrides every other objective'
      : wind?.state === 'HIGH'
        ? 'High wind → objective “Protect Structure”, movement economised'
        : 'Within limits — no safety constraint imposed',
    summary: 'Introduces mechanical safety constraints that may limit movement.',
    detail: {
      mechanism:
        'Wind speed is evaluated first in the decision hierarchy, so a structural-safety rule can never be overridden by a comfort or energy objective. EXTREME wind commands SAFE_MODE; HIGH wind keeps tracking but switches to economised movement to limit cyclic actuator load.',
      path: [
        'weather.windSpeed',
        'assessWind() → LOW · MODERATE · HIGH · EXTREME',
        'decisionEngine (Structural Safety tier — evaluated first)',
        '→ SAFE_MODE / ECONOMY_TRACKING',
      ],
      thresholds: [
        ['MODERATE', `≥ ${WIND_KMH.MODERATE} km/h`],
        ['HIGH', `≥ ${WIND_KMH.HIGH} km/h`],
        ['EXTREME', `≥ ${WIND_KMH.EXTREME} km/h`],
      ],
      doesNotAffect:
        'Wind does not change solar irradiance and is never read by the sensor. On a bright, windy day the light reading stays high — it is the controller that chooses to stop tracking.',
      reference: 'Band edges loosely aligned to the Beaufort scale for kinetic louvre façades — PBIF guide §15.3.',
    },
  }
}

// ---------------------------------------------------------------------------
// WIND → ACTUATION  (mechanical constraint)
// ---------------------------------------------------------------------------
/**
 * The wind decision reaches the servo as a *movement constraint*, not as a
 * different target: SAFE_MODE suspends tracking at the closed posture, and
 * deadband control suppresses commands smaller than the dynamic threshold.
 */
function windOnActuation({ windSpeed, pbif }: InfluenceInputs): EnvironmentalInfluence {
  const wind = pbif?.situation.wind
  const state = pbif?.decision.state
  const deadband = pbif ? DYNAMIC_DEADBAND_DEG[pbif.solarResource.state] : null
  const suspended = state === 'SAFE_MODE'
  const economised = state === 'ECONOMY_TRACKING' && (wind?.state === 'HIGH' || wind?.state === 'EXTREME')
  const status: InfluenceStatus = suspended ? 'overriding' : economised ? 'active' : 'idle'

  return {
    key: 'wind@actuation',
    parameter: 'wind',
    stage: 'actuation',
    label: 'Wind — movement limit',
    display: `${Math.round(windSpeed)} km/h`,
    state: wind ? `${STATE_LABELS[wind.state]} wind` : undefined,
    status,
    effect: suspended
      ? 'Tracking suspended — blades held at the closed (0°) minimum-load posture'
      : economised
        ? `Movement economised — commands under ${deadband ?? DYNAMIC_DEADBAND_DEG.MEDIUM}° are suppressed`
        : 'Full travel available — no mechanical restriction',
    summary: 'Restricts how far and how often the servo is allowed to move.',
    detail: {
      mechanism:
        'The safety decision arrives at the servo as a constraint on movement rather than as a new tracking goal. SAFE_MODE routes the target to the fully closed configuration (0°, blade parallel to the surface normal) and suspends tracking — the minimum-load posture. Under economised tracking the dynamic deadband suppresses any commanded change smaller than the threshold, cutting actuator duty cycle and preventing wind-driven hunting.',
      path: [
        'PBIF decision (Structural Safety)',
        'trackingPolicy.resolveTarget() → closed geometry or deadband hold',
        'targetRotation → shared easing pipeline',
        '→ blade angle',
      ],
      thresholds: [
        ['Deadband — HIGH solar', `${DYNAMIC_DEADBAND_DEG.HIGH}°`],
        ['Deadband — MEDIUM solar', `${DYNAMIC_DEADBAND_DEG.MEDIUM}°`],
        ['Deadband — LOW solar', `${DYNAMIC_DEADBAND_DEG.LOW}°`],
      ],
      doesNotAffect:
        'No separate aerodynamic torque model runs on the blade: wind limits movement through the control policy, it does not push the blade around. The servo still receives exactly one target angle, as it does in every other state.',
      reference: 'Deadband / hysteresis control (ISA-18.2) — PBIF guide §15.11.',
    },
  }
}
