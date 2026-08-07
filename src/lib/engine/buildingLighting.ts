/**
 * Building Lighting Response Engine — Stage 7.10.
 *
 * The second subsystem of the Building Physics Layer, sibling to
 * `BuildingThermalEngine` (Stage 7.9). Before Stage 7.10, "Lighting" was a
 * single occupancy-only load in `BuildingEnergyEngine` — 8 W/m² whenever the
 * building was occupied, blind to whether the sky outside was clear or the
 * blades were open or shut. This engine gives Lighting the same daylight
 * awareness Stage 7.9 gave HVAC:
 *
 *   Effective Solar Irradiance → Outdoor Illuminance → Envelope Visible
 *   Transmission → Façade Openness → Indoor Illuminance → Daylight-Harvesting
 *   Controller → Artificial Lighting Demand (electrical, occupancy-scaled)
 *
 * ── Subsystem boundaries (guide §6) ──────────────────────────────────────────
 * This engine computes ONLY the daylight-to-lighting chain above. It never
 * touches occupancy scheduling, HVAC, equipment, elevators or services demand —
 * those remain entirely `BuildingEnergyEngine`'s. It never re-derives the
 * façade's effective irradiance itself: `metrics.averageSolarExposure` (the
 * SAME normalised effective-irradiance quantity `facadeSolarGainKW` already
 * consumes — see `metrics.ts`) is the one input this engine takes from the
 * façade, reusing the physics exactly as `BuildingThermalEngine` does.
 * `occupancyFraction` is likewise reused from `buildingEnergy.ts`, not
 * reimplemented, and `grossFloorArea` is the same floor-area authority the
 * BEMS itself scales against.
 *
 * ── Why Base Lighting stayed in BuildingEnergyEngine ─────────────────────────
 * Mirrors Stage 7.9's HVAC split exactly: `LOAD_CATEGORIES`'s own 'lighting'
 * entry (`buildingEnergy.ts`) is the occupancy-driven, non-daylight-responsive
 * share — egress, corridors, back-of-house — that a photosensor never dims.
 * This engine owns the REMAINING, daylight-responsive share
 * (`ARTIFICIAL_LIGHTING_DENSITY_WM2`), sized so the two sum back to the
 * original 8 W/m² total office LPD at full occupancy with zero daylight
 * (night) — Stage 7.10 changes WHEN the peak is reached, not what it is.
 *
 * ── Determinism & performance ────────────────────────────────────────────────
 * One `BuildingLightingState` object is allocated in the constructor and
 * mutated in place every tick — zero allocations in the hot path, matching
 * `BuildingThermalEngine`'s own convention. The only persistent state is the
 * lagged control level; everything else is recomputed from this tick's inputs.
 */

import { clamp } from './math'
import { occupancyFraction } from './buildingEnergy'
import { EXPOSURE_REFERENCE_WM2 } from './metrics'

// ---------------------------------------------------------------------------
// Engineering assumptions — every constant documented, nothing magic.
// ---------------------------------------------------------------------------
export const BUILDING_LIGHTING = {
  /**
   * Target indoor illuminance the controller works to maintain, lux.
   * EN 12464-1 general office work-area recommendation.
   */
  TARGET_INDOOR_LUX: 500,

  /**
   * Fraction of outdoor daylight that survives the glazing assembly to reach
   * the indoor plane, before the façade blades are even accounted for.
   * Representative visible transmittance (VT) for a low-E curtain-wall
   * assembly (NFRC 200 rating practice; typical VT range ≈ 0.5–0.7). Distinct
   * from `GLAZING_SHGC` (`metrics.ts`) — visible transmittance and solar heat
   * gain are different glazing properties, never the same number.
   */
  VISIBLE_TRANSMISSION: 0.6,

  /**
   * Conversion from effective solar irradiance (W/m²) to outdoor illuminance
   * (lux) — the daylight luminous efficacy of global horizontal irradiance.
   * CIE 108-1994 / IESNA Lighting Handbook practice puts this in the
   * ~90–120 lm/W range depending on sky condition; 110 is representative of a
   * mixed sky and yields ≈110,000 lux at full clear-sky irradiance, in line
   * with typical outdoor daylight measurements.
   */
  DAYLIGHT_LUMINOUS_EFFICACY_LM_PER_W: 110,

  /**
   * Rated power density of the DAYLIGHT-RESPONSIVE lighting circuit alone,
   * W/m² of gross floor area — the remainder of the office's total 8 W/m²
   * Lighting Power Density (ASHRAE 90.1) after `buildingEnergy.ts`'s
   * `LOAD_CATEGORIES` 'lighting' entry (3 W/m²) claims the non-daylight-
   * responsive share. Perimeter / open-plan floor area typically falls within
   * a primary or secondary daylight zone eligible for photosensor dimming
   * control (ASHRAE 90.1 daylight-zone practice).
   */
  ARTIFICIAL_LIGHTING_DENSITY_WM2: 5,

  /**
   * Minimum commanded duty once ANY artificial lighting is needed, 0–1 — a
   * dimmable LED driver's typical minimum stable dimming level (IES RP-1 /
   * common driver datasheet practice). Below this the controller either drives
   * the light off entirely (fully daylit) rather than commanding an unstable
   * near-zero duty, which is also what keeps it from chattering right at the
   * threshold.
   */
  LIGHTING_CONTROL_MIN: 0.1,

  /**
   * First-order controller response time, SIMULATED seconds — same convention
   * as `buildingThermal.ts`'s `TIME_CONSTANT_SIM_SECONDS` and
   * `buildingEnergy.ts`'s `HVAC_THERMAL.LAG_SIM_SECONDS` (must be simulated
   * time, not wall-clock). A closed-loop photosensor dimming control responds
   * in seconds to under a minute in reality — far faster than the building's
   * thermal mass — so 20 simulated seconds keeps the response visibly smooth
   * (guide requirement: "avoid abrupt switching") without lagging behind a
   * passing cloud the way the HVAC's 15-simulated-minute plant lag properly
   * does.
   */
  RESPONSE_TIME_SIM_SECONDS: 20,

  /** At/below this lagged control level the space reads as fully daylit, 0–1. */
  DAYLIT_STATUS_THRESHOLD: 0.02,
  /** At/above this lagged control level daylight is contributing nothing, 0–1. */
  FULL_ARTIFICIAL_STATUS_THRESHOLD: 0.98,
  /** Below this occupancy the space reads as unoccupied regardless of daylight. */
  OCCUPIED_STATUS_THRESHOLD: 0.05,
} as const

/**
 * The engineering literature each constant above is drawn from — formalised as
 * data so the Engineering Panel can display them without retyping a second copy
 * that could drift from the real one. `constantId` names the exact
 * `BUILDING_LIGHTING` key the citation backs.
 */
export interface EngineeringReference {
  id: string
  citation: string
  appliesTo: string
  constantId: keyof typeof BUILDING_LIGHTING
}

export const BUILDING_LIGHTING_REFERENCES: readonly EngineeringReference[] = [
  {
    id: 'en-12464-1',
    citation: 'EN 12464-1:2011 — Light and Lighting: Lighting of Work Places',
    appliesTo: 'Target indoor illuminance for general office work areas.',
    constantId: 'TARGET_INDOOR_LUX',
  },
  {
    id: 'nfrc-200',
    citation: 'NFRC 200 — Visible transmittance rating practice for fenestration',
    appliesTo: 'Envelope visible transmission: the fraction of outdoor daylight that survives the glazing assembly.',
    constantId: 'VISIBLE_TRANSMISSION',
  },
  {
    id: 'cie-108',
    citation: 'CIE 108-1994 / IESNA Lighting Handbook — daylight luminous efficacy',
    appliesTo: 'Conversion from effective solar irradiance (W/m²) to outdoor illuminance (lux).',
    constantId: 'DAYLIGHT_LUMINOUS_EFFICACY_LM_PER_W',
  },
  {
    id: 'ashrae-90-1-lpd',
    citation: 'ASHRAE 90.1 — Lighting Power Density allowance, daylight-responsive zone share',
    appliesTo: 'Rated capacity of the daylight-responsive artificial lighting circuit.',
    constantId: 'ARTIFICIAL_LIGHTING_DENSITY_WM2',
  },
  {
    id: 'ies-rp-1',
    citation: 'IES RP-1 / common dimmable-driver datasheet practice — minimum stable dimming level',
    appliesTo: 'Lighting control minimum: the floor duty once any artificial lighting is commanded, to avoid chattering near zero.',
    constantId: 'LIGHTING_CONTROL_MIN',
  },
] as const

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
/** Plain-language lighting operating state — see `lightingStatus()`. */
export type LightingStatus = 'Unoccupied' | 'Fully Daylit' | 'Daylight Harvesting' | 'Full Artificial'

/**
 * The complete daylight-to-lighting chain, published once per environmental
 * tick. These are the ONLY lighting quantities the rest of the twin should
 * read — nothing downstream re-derives any step of this chain.
 */
export interface BuildingLightingState {
  /** Façade openness this state was computed from, 0–1 (passthrough, for the dashboard). */
  facadeOpenness: number
  /** Occupancy fraction this state was computed from, 0–1 (passthrough — reused, not re-derived). */
  occupancy: number
  /** Estimated outdoor illuminance from the façade's effective irradiance, lux. */
  outdoorLux: number
  /** Estimated indoor illuminance after envelope transmission and façade openness, lux. */
  indoorLux: number
  /** Target indoor illuminance the controller works to maintain, lux — `BUILDING_LIGHTING.TARGET_INDOOR_LUX`. */
  targetLux: number
  /**
   * Lagged daylight-harvesting control level, 0–1 — 0 means daylight alone
   * meets the target, 1 means artificial lighting must supply all of it.
   * `artificialContribution` is this same value; `daylightContribution` is its
   * complement, so the two always sum to 1 by construction.
   */
  lightingLevel: number
  /** Artificial lighting electrical demand, kW — the ONE value `BuildingEnergyEngine` adds to its Lighting category. */
  lightingElectricalKW: number
  /**
   * Energy saved versus a no-daylight-harvesting baseline (artificial lighting
   * always at full rated power whenever occupied), kW —
   * `artificialRatedKW × occupancy − lightingElectricalKW`.
   */
  lightingSavingsKW: number
  /** Plain-language operating state, derived from `lightingLevel` and `occupancy` — see `lightingStatus()`. */
  lightingStatus: LightingStatus
  /** Fraction of the lighting requirement currently met by daylight, 0–1 — `1 − lightingLevel`. */
  daylightContribution: number
  /** Fraction of the lighting requirement currently met by artificial lighting, 0–1 — equal to `lightingLevel`. */
  artificialContribution: number
}

function initialState(): BuildingLightingState {
  return {
    facadeOpenness: 0,
    occupancy: 0,
    outdoorLux: 0,
    indoorLux: 0,
    targetLux: BUILDING_LIGHTING.TARGET_INDOOR_LUX,
    lightingLevel: 0,
    lightingElectricalKW: 0,
    lightingSavingsKW: 0,
    lightingStatus: 'Unoccupied',
    daylightContribution: 1,
    artificialContribution: 0,
  }
}

/**
 * Estimated outdoor illuminance, lux, from the façade's effective solar
 * exposure — the SAME normalised effective-irradiance quantity
 * `facadeSolarGainKW` consumes (`avgExposure`, 0–1 against
 * `EXPOSURE_REFERENCE_WM2`), denormalised back to W/m² and converted through
 * the daylight luminous efficacy. Exported pure so a future stage can reuse it
 * exactly as `envelopeHeatGainKW` is reused today.
 */
export function outdoorIlluminanceLux(avgExposure: number): number {
  return (
    Math.max(0, avgExposure) *
    EXPOSURE_REFERENCE_WM2 *
    BUILDING_LIGHTING.DAYLIGHT_LUMINOUS_EFFICACY_LM_PER_W
  )
}

/** Indoor illuminance after envelope visible transmission and façade openness, lux. */
export function indoorIlluminanceLux(outdoorLux: number, facadeOpenness: number): number {
  return outdoorLux * BUILDING_LIGHTING.VISIBLE_TRANSMISSION * clamp(facadeOpenness)
}

/**
 * Proportional daylight-harvesting control TARGET, 0–1 — the instantaneous
 * demand before the response-time lag smooths it. Linear proportional control
 * against `TARGET_INDOOR_LUX`, floored at `LIGHTING_CONTROL_MIN` once any
 * artificial contribution is needed at all (0 stays 0 — a fully daylit space
 * commands no floor).
 */
export function lightingControlTarget(indoorLux: number): number {
  const raw = clamp(1 - indoorLux / BUILDING_LIGHTING.TARGET_INDOOR_LUX, 0, 1)
  return raw > 0 ? Math.max(raw, BUILDING_LIGHTING.LIGHTING_CONTROL_MIN) : 0
}

/**
 * Plain-language lighting operating state, derived from the SAME two
 * published quantities the panel already reads — no new physics, just a named
 * classification of numbers that already exist.
 */
export function lightingStatus(lightingLevel: number, occupancy: number): LightingStatus {
  if (occupancy < BUILDING_LIGHTING.OCCUPIED_STATUS_THRESHOLD) return 'Unoccupied'
  if (lightingLevel <= BUILDING_LIGHTING.DAYLIT_STATUS_THRESHOLD) return 'Fully Daylit'
  if (lightingLevel >= BUILDING_LIGHTING.FULL_ARTIFICIAL_STATUS_THRESHOLD) return 'Full Artificial'
  return 'Daylight Harvesting'
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
/**
 * BuildingLightingEngine — the live, stateful daylight-harvesting controller.
 *
 * Allocation-free in the hot path: `state` is created once and mutated in
 * place every tick, matching `BuildingThermalEngine`'s own convention so a
 * 20 Hz environmental tier produces no garbage.
 */
export class BuildingLightingEngine {
  private state: BuildingLightingState = initialState()
  /** Lagged control level currently commanded, 0–1 — the persistent integrator. */
  private lightingLevel = 0

  /**
   * Advance the lighting chain one environmental tick.
   *
   * @param avgExposure   Building-mean normalised effective solar exposure, 0–1
   *                       (`BuildingMetrics.averageSolarExposure` — the SAME
   *                       quantity `facadeSolarGainKW` consumes, NOT recomputed
   *                       here).
   * @param facadeOpenness Building-mean façade openness, 0–1
   *                       (`BuildingMetrics.averageOpenness`).
   * @param floorAreaM2    Gross floor area, m² (`grossFloorArea` —
   *                       `buildingEnergy.ts`'s own authority, NOT recomputed
   *                       here).
   * @param timeHours      Local time of day, 0–24 (occupancy scheduling).
   * @param dtSimSeconds   Elapsed SIMULATED seconds since the last call. 0
   *                       means "initialise": the control level snaps to its
   *                       target instead of integrating, so a seed call or a
   *                       timeline scrub produces no startup transient — the
   *                       same convention `BuildingThermalEngine.update` uses.
   */
  update(
    avgExposure: number,
    facadeOpenness: number,
    floorAreaM2: number,
    timeHours: number,
    dtSimSeconds: number,
  ): void {
    const outdoorLux = outdoorIlluminanceLux(avgExposure)
    const indoorLux = indoorIlluminanceLux(outdoorLux, facadeOpenness)
    const target = lightingControlTarget(indoorLux)

    // First-order controller response — same exponential-approach form the
    // thermal and HVAC lags use, stable for any dt, snaps to target on
    // initialisation (dt <= 0).
    const alpha =
      dtSimSeconds > 0 ? 1 - Math.exp(-dtSimSeconds / BUILDING_LIGHTING.RESPONSE_TIME_SIM_SECONDS) : 1
    this.lightingLevel += (target - this.lightingLevel) * alpha

    const occupancy = occupancyFraction(timeHours)
    const artificialRatedKW = (BUILDING_LIGHTING.ARTIFICIAL_LIGHTING_DENSITY_WM2 * floorAreaM2) / 1000
    const occupiedRatedKW = artificialRatedKW * occupancy
    const lightingElectricalKW = occupiedRatedKW * this.lightingLevel

    const s = this.state
    s.facadeOpenness = facadeOpenness
    s.occupancy = occupancy
    s.outdoorLux = outdoorLux
    s.indoorLux = indoorLux
    s.lightingLevel = this.lightingLevel
    s.lightingElectricalKW = lightingElectricalKW
    s.lightingSavingsKW = occupiedRatedKW - lightingElectricalKW
    s.lightingStatus = lightingStatus(this.lightingLevel, occupancy)
    s.daylightContribution = 1 - this.lightingLevel
    s.artificialContribution = this.lightingLevel
  }

  /** The live lighting state (mutated in place — treat as read-only). */
  getState(): BuildingLightingState {
    return this.state
  }
}
