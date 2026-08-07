/**
 * Building Thermal Response Engine — Stage 7.9, extended in Stage 7.9.2 to the
 * complete cycle.
 *
 * The bridge between the Adaptive Façade and the Building Energy Management
 * System. Before Stage 7.9 the two were thermally independent (CLAUDE.md
 * §11.5): closing the blades changed the façade's OWN displayed cooling-load
 * estimate (`metrics.ts`, a comfort/display figure) but never moved a single
 * watt of the BEMS's real HVAC electrical demand. This engine is what makes
 * that connection physical instead of asserted — and Stage 7.9.2 completes the
 * story past the cooling load itself, to what an occupant actually feels:
 *
 *   Solar Heat → Building Heat → Cooling Requirement → HVAC Response
 *     → Conditioned Indoor Environment
 *
 *   Façade solar gain (thermal, kW) → Envelope transmission → Indoor heat
 *   accumulation (thermal inertia) → Cooling requirement (thermal, kW)
 *     → HVAC electrical demand (kW, via COOLING_PLANT_COP)
 *     → Conditioned indoor temperature (°C, via HVAC_SETPOINT_C)
 *                          │
 *                          ▼ (electrical demand only)
 *              BuildingEnergyEngine's HVAC term
 *
 * ── Subsystem boundaries (guide §6) ──────────────────────────────────────────
 * This engine computes ONLY the thermal chain above. It never touches
 * occupancy, lighting, equipment, elevators or building-services demand — those
 * remain entirely `BuildingEnergyEngine`'s (`buildingEnergy.ts`). It never
 * re-derives façade solar gain itself: `facadeSolarGainKW` (`metrics.ts`) is
 * still the ONE place the façade's optical/thermal effect is defined, and this
 * engine consumes its output exactly as the AI Prediction layer does — reusing
 * the physics, never re-implementing it (guide §11.1).
 *
 * ── Three authorities, three units ───────────────────────────────────────────
 * `facadeSolarGainKW` / `envelopeHeatGainKW` / `indoorHeatGainKW` /
 * `coolingRequiredKW` are THERMAL kW — heat, not electricity. `coolingLoadKW`
 * is ELECTRICAL kW: the power the cooling plant draws to reject that heat, via
 * `COOLING_PLANT_COP`. This is the one field `BuildingEnergyEngine` is allowed
 * to add straight onto its HVAC category, because it is already expressed in
 * the same unit that category is. `conditionedIndoorTemperatureC` is a THIRD,
 * separate quantity — °C, an occupant-comfort estimate — and, like
 * `indoorTemperatureProxy` before it, is DISPLAY ONLY: nothing electrical is
 * ever derived from a temperature in this engine.
 *
 * ── Determinism & performance ────────────────────────────────────────────────
 * One `BuildingThermalState` object is allocated in the constructor and
 * mutated in place every tick — zero allocations in the hot path, matching
 * `BuildingEnergyEngine`'s own convention. The only persistent state is the
 * lagged radiant-release term; everything else is recomputed from this tick's
 * inputs, so a given input tuple always produces the same output modulo that
 * one carried number (exactly how the BEMS's own `hvacFactor` lag works).
 *
 * ── Forward compatibility: HVAC capacity is not yet limited (guide §9) ───────
 * `coolingRequiredKW` exists as its OWN field — identical to `indoorHeatGainKW`
 * today — specifically so a future HVAC capacity limit has somewhere to apply
 * itself without moving a single UI label: today `coolingRequiredKW` always
 * equals the heat gain (capacity is assumed sufficient to remove all of it);
 * a future stage would cap it at a `MAX_HVAC_CAPACITY_KW`-style constant, and
 * `coolingLoadKW` / `conditionedIndoorTemperatureC` — both already derived FROM
 * `coolingRequiredKW`, not from `indoorHeatGainKW` directly — would inherit the
 * capacity limit automatically. Nothing here fabricates that limit now.
 */

import { clamp } from './math'

// ---------------------------------------------------------------------------
// Engineering assumptions — every constant documented, nothing magic.
// ---------------------------------------------------------------------------
export const BUILDING_THERMAL = {
  /**
   * Fraction of the glazing-transmitted solar heat (`facadeSolarGainKW`, which
   * already carries the glazing's Solar Heat Gain Coefficient — see
   * `metrics.ts` `GLAZING_SHGC`) that actually crosses the FULL envelope
   * assembly into conditioned space, net of secondary losses: frame/edge-of-
   * glass conduction back outside and re-radiation through the façade's
   * blade cavity. Representative of a curtain-wall assembly's frame/edge loss
   * allowance (ASHRAE Fundamentals, fenestration U-factor practice, ~8–12%).
   */
  ENVELOPE_TRANSMISSION_EFFICIENCY: 0.9,

  /**
   * Convective/radiant split of the heat that crosses the envelope — the
   * ASHRAE Radiant Time Series (RTS) method's treatment of solar gain through
   * glazing. The convective share loads the room air immediately; the radiant
   * share is first ABSORBED by the building's thermal mass (slab, furnishings,
   * interior surfaces) and released gradually, which is the physical reason a
   * cloud passing over does not instantly change the cooling load. Typical RTS
   * value for glazing without interior shading is ~0.4 convective / 0.6
   * radiant; this façade shades the glazing from outside, so its cavity
   * ventilates a little of that radiant share back out faster the more open
   * the blades are — modelled as a small bonus on the convective fraction.
   */
  SOLAR_CONVECTIVE_FRACTION_BASE: 0.4,
  /** Additional convective fraction at fully-open blades (cavity ventilation). */
  OPENNESS_CONVECTIVE_BONUS: 0.2,

  /**
   * First-order thermal-mass time constant, SIMULATED seconds — same
   * convention as `buildingEnergy.ts`'s `HVAC_THERMAL.LAG_SIM_SECONDS` (must be
   * simulated time, not wall-clock, because the twin compresses a day into
   * ~2 real minutes at 1×). 20 simulated minutes represents a heavyweight
   * concrete-frame commercial structure (CIBSE Guide A "heavyweight" thermal
   * response class) — slightly slower than the BEMS's own 15-minute plant lag,
   * because the building's fabric mass responds more slowly than the cooling
   * plant that chases it.
   */
  TIME_CONSTANT_SIM_SECONDS: 20 * 60,

  /**
   * Electrical power a cooling plant draws to reject one kW of thermal heat —
   * i.e. the plant's Coefficient of Performance. 3.5 is a representative
   * mid-range value for a commercial chiller/VRF plant (ASHRAE 90.1 minimum
   * efficiency tables span roughly 3–6 depending on equipment class and size).
   * This is what converts the thermal chain's output into the electrical kW
   * `BuildingEnergyEngine` adds to its HVAC demand.
   */
  COOLING_PLANT_COP: 3.5,

  /**
   * Effective thermal capacitance relating indoor heat gain to the indoor
   * temperature proxy, kW of heat gain per °C the proxy sits above outdoor
   * temperature. A DISPLAY estimate only — see `indoorTemperatureProxy` below —
   * not fed into any electrical calculation.
   */
  THERMAL_CAPACITANCE_KW_PER_C: 25,

  /**
   * Small residual contribution of raw (façade-unmediated) solar irradiance to
   * the indoor temperature proxy, °C per W/m². Represents solar effects on
   * envelope surfaces the adaptive façade does not cover (roof, opaque
   * spandrels) — a minor, bounded, display-only nudge, never part of the
   * electrical cooling-load chain.
   */
  IRRADIANCE_PROXY_COEFFICIENT_C_PER_WM2: 0.003,

  /**
   * The indoor air temperature the HVAC system is commanded to hold, °C.
   * 24.0 sits centrally in ASHRAE 55's typical commercial cooling comfort band
   * (≈23–26 °C). Display-only — see `conditionedIndoorTemperatureC` — never fed
   * into the electrical cooling-load chain, which is driven by heat gain alone.
   */
  HVAC_SETPOINT_C: 24.0,

  /**
   * Steady-state proportional-control offset, °C per kW of cooling requirement
   * — the classical "throttling range" of a simple proportional-only (P-only)
   * terminal-unit controller, which can drive its output arbitrarily close to
   * setpoint but never fully eliminates a load-proportional offset the way a
   * full PID/DDC loop's integral term would. Assumed sufficient HVAC capacity
   * (guide §9) keeps this the ONLY source of deviation from `HVAC_SETPOINT_C`
   * today — a few tenths of a degree at this building's typical load, never
   * exactly zero and never fabricated to look emptier than the model is.
   */
  HVAC_PROPORTIONAL_DROOP_C_PER_KW: 0.0015,

  /** Below this indoor heat gain the HVAC is treated as idle, kW thermal. */
  COOLING_STATUS_STANDBY_KW: 1,

  /**
   * `|thermalLag|` below which the response is considered settled rather than
   * still loading into (or releasing from) thermal mass, kW thermal — the
   * threshold `coolingStatus()` uses to distinguish "Maintaining Setpoint" from
   * "Cooling" / "Recovering".
   */
  COOLING_STATUS_SETTLED_BAND_KW: 2,
} as const

/**
 * The engineering literature each constant above is drawn from — the SAME
 * citations named in `BUILDING_THERMAL`'s own doc comments, formalised as data
 * so the Engineering Panel can display them without retyping a second copy
 * that could drift from the real one. `constantId` names the exact
 * `BUILDING_THERMAL` key the citation backs.
 */
export interface EngineeringReference {
  id: string
  citation: string
  appliesTo: string
  constantId: keyof typeof BUILDING_THERMAL
}

export const BUILDING_THERMAL_REFERENCES: readonly EngineeringReference[] = [
  {
    id: 'ashrae-fundamentals',
    citation: 'ASHRAE Fundamentals — fenestration U-factor / frame-and-edge loss practice',
    appliesTo: 'Envelope transmission efficiency: the fraction of glazing-transmitted solar heat that survives frame/edge conduction and cavity re-radiation losses.',
    constantId: 'ENVELOPE_TRANSMISSION_EFFICIENCY',
  },
  {
    id: 'ashrae-rts',
    citation: 'ASHRAE Radiant Time Series (RTS) Method',
    appliesTo: 'Convective / radiant split of solar heat gain through glazing — the physical basis for why cooling load lags the instantaneous gain.',
    constantId: 'SOLAR_CONVECTIVE_FRACTION_BASE',
  },
  {
    id: 'cibse-guide-a',
    citation: 'CIBSE Guide A — Environmental Design, "heavyweight" dynamic thermal response class',
    appliesTo: 'Thermal-mass time constant for a heavyweight concrete-frame commercial structure.',
    constantId: 'TIME_CONSTANT_SIM_SECONDS',
  },
  {
    id: 'ashrae-90-1',
    citation: 'ASHRAE 90.1 — minimum efficiency tables for commercial cooling equipment',
    appliesTo: 'Cooling-plant Coefficient of Performance used to convert thermal cooling load into the electrical kW added to HVAC demand.',
    constantId: 'COOLING_PLANT_COP',
  },
  {
    id: 'ashrae-55',
    citation: 'ASHRAE 55 — Thermal Environmental Conditions for Human Occupancy',
    appliesTo: 'HVAC setpoint: the indoor air temperature the cooling system is commanded to hold, drawn from the standard commercial comfort band.',
    constantId: 'HVAC_SETPOINT_C',
  },
] as const

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
/**
 * The complete building thermal chain, published once per environmental tick.
 * These are the ONLY thermal quantities the rest of the twin should read —
 * nothing downstream re-derives any step of this chain.
 */
export interface BuildingThermalState {
  /** Façade openness this state was computed from, 0–1 (passthrough, for the dashboard). */
  facadeOpenness: number
  /** Outdoor dry-bulb temperature this state was computed from, °C (passthrough). */
  outdoorTempC: number
  /** Solar heat admitted through the skin to the glazing, kW THERMAL (input, from `metrics.ts`). */
  facadeSolarGainKW: number
  /** Heat that actually crosses the full envelope assembly, kW THERMAL. */
  envelopeHeatGainKW: number
  /** Convective share of `envelopeHeatGainKW` — loads the room air immediately, kW THERMAL. */
  convectiveKW: number
  /**
   * Radiant share currently released from thermal-mass storage, kW THERMAL —
   * chases `envelopeHeatGainKW − convectiveKW` (the radiant TARGET) through the
   * first-order lag; equal to it once settled. `indoorHeatGainKW − convectiveKW`.
   */
  radiantReleaseKW: number
  /** Heat currently loading the room air after thermal-mass lag, kW THERMAL — `convectiveKW + radiantReleaseKW`. */
  indoorHeatGainKW: number
  /**
   * The heat the HVAC system must remove, kW THERMAL — today always equal to
   * `indoorHeatGainKW` (capacity assumed sufficient). Its own field rather than
   * an inline read of `indoorHeatGainKW` so a FUTURE HVAC capacity limit has
   * exactly one place to apply itself; see the module header's "Forward
   * compatibility" note. `coolingLoadKW` and `conditionedIndoorTemperatureC`
   * are both derived from THIS field, not from `indoorHeatGainKW` directly.
   */
  coolingRequiredKW: number
  /** Electrical power the cooling plant draws to remove `coolingRequiredKW`, kW ELECTRICAL. */
  coolingLoadKW: number
  /**
   * Estimated FREE-FLOATING indoor air temperature, °C — what the indoor air
   * would drift toward if the HVAC provided no cooling at all. A DISPLAY
   * proxy, not authoritative and not what an occupant actually experiences —
   * see `conditionedIndoorTemperatureC` for that.
   */
  indoorTemperatureProxy: number
  /**
   * Estimated indoor air temperature AFTER HVAC conditioning, °C — what an
   * occupant actually experiences. Tracks `HVAC_SETPOINT_C` closely (capacity
   * is assumed sufficient) but is deliberately never pinned exactly to it: a
   * small proportional-control droop, proportional to `coolingRequiredKW`,
   * remains even at full capacity (`HVAC_PROPORTIONAL_DROOP_C_PER_KW`). A
   * DISPLAY estimate — nothing electrical is derived from a temperature here.
   */
  conditionedIndoorTemperatureC: number
  /**
   * Plain-language HVAC operating state, derived from `coolingRequiredKW` and
   * `thermalLag` — see `coolingStatus()`. Display only.
   */
  coolingStatus: CoolingStatus
  /**
   * How far thermal inertia is currently holding the response back from its
   * instantaneous target, kW THERMAL: `envelopeHeatGainKW − indoorHeatGainKW`.
   * Positive while heat is loading into the mass, negative while the mass is
   * still releasing stored heat after the gain has dropped (e.g. a cloud that
   * has already passed).
   */
  thermalLag: number
}

/** Plain-language HVAC operating state — see `coolingStatus()`. */
export type CoolingStatus = 'Standby' | 'Cooling' | 'Recovering' | 'Maintaining Setpoint'

function initialState(): BuildingThermalState {
  return {
    facadeOpenness: 0,
    outdoorTempC: 0,
    facadeSolarGainKW: 0,
    envelopeHeatGainKW: 0,
    convectiveKW: 0,
    radiantReleaseKW: 0,
    indoorHeatGainKW: 0,
    coolingRequiredKW: 0,
    coolingLoadKW: 0,
    indoorTemperatureProxy: 0,
    conditionedIndoorTemperatureC: BUILDING_THERMAL.HVAC_SETPOINT_C,
    coolingStatus: 'Standby',
    thermalLag: 0,
  }
}

/**
 * The envelope-transmitted heat gain and its convective/radiant split — the
 * unlagged, instantaneous step of the chain. Exported pure so the AI
 * Prediction layer's forward projection can evaluate the SAME physics at
 * equilibrium (see `equilibriumThermalState` below) instead of a parallel
 * model, exactly as it already does for `facadeSolarGainKW` and
 * `hvacDemandFactor`.
 */
export function envelopeHeatGainKW(facadeSolarGainKW: number): number {
  return Math.max(0, facadeSolarGainKW) * BUILDING_THERMAL.ENVELOPE_TRANSMISSION_EFFICIENCY
}

/** Convective share of the envelope heat gain — ventilates faster the more open the blades are. */
export function convectiveFraction(facadeOpenness: number): number {
  return clamp(
    BUILDING_THERMAL.SOLAR_CONVECTIVE_FRACTION_BASE +
      BUILDING_THERMAL.OPENNESS_CONVECTIVE_BONUS * clamp(facadeOpenness),
    0,
    1,
  )
}

/** Illustrative FREE-FLOATING indoor temperature proxy, °C — display only (see the field's own doc comment). */
export function indoorTemperatureProxy(
  outdoorTempC: number,
  indoorHeatGainKW: number,
  irradianceWm2: number,
): number {
  return (
    outdoorTempC +
    indoorHeatGainKW / BUILDING_THERMAL.THERMAL_CAPACITANCE_KW_PER_C +
    Math.max(0, irradianceWm2) * BUILDING_THERMAL.IRRADIANCE_PROXY_COEFFICIENT_C_PER_WM2
  )
}

/**
 * Estimated indoor air temperature AFTER HVAC conditioning, °C — see the
 * `conditionedIndoorTemperatureC` field's own doc comment. A pure function of
 * `coolingRequiredKW` alone (not of the free-floating temperature) because a
 * proportional-control droop is a function of how hard the plant is working,
 * not of how far indoor air would otherwise have drifted.
 */
export function conditionedIndoorTemperatureC(coolingRequiredKW: number): number {
  return (
    BUILDING_THERMAL.HVAC_SETPOINT_C +
    Math.max(0, coolingRequiredKW) * BUILDING_THERMAL.HVAC_PROPORTIONAL_DROOP_C_PER_KW
  )
}

/**
 * Plain-language HVAC operating state, derived from the SAME two published
 * quantities the panel already reads — no new physics, just a named
 * classification of numbers that already exist:
 *
 *   - `coolingRequiredKW` below `COOLING_STATUS_STANDBY_KW` → **Standby**: no
 *     meaningful heat gain to remove.
 *   - `thermalLag` beyond `±COOLING_STATUS_SETTLED_BAND_KW` → **Cooling** (mass
 *     still loading, load rising) or **Recovering** (mass still releasing
 *     stored heat, load easing).
 *   - Otherwise → **Maintaining Setpoint**: load has settled.
 */
export function coolingStatus(coolingRequiredKW: number, thermalLag: number): CoolingStatus {
  if (coolingRequiredKW < BUILDING_THERMAL.COOLING_STATUS_STANDBY_KW) return 'Standby'
  if (thermalLag > BUILDING_THERMAL.COOLING_STATUS_SETTLED_BAND_KW) return 'Cooling'
  if (thermalLag < -BUILDING_THERMAL.COOLING_STATUS_SETTLED_BAND_KW) return 'Recovering'
  return 'Maintaining Setpoint'
}

/**
 * The chain evaluated AT EQUILIBRIUM — as if the thermal-mass lag had already
 * fully settled to this instant's inputs (`indoorHeatGainKW === envelopeHeatGainKW`,
 * `thermalLag === 0`).
 *
 * This is the SAME simplification `projection.ts` already applies to the
 * BEMS's own HVAC lag (`hvacDemandFactor` — "the fabric's response time is
 * negligible over a one-to-twelve hour horizon"): the façade thermal mass's
 * 20-simulated-minute time constant is likewise negligible next to a
 * multi-hour forward projection, so the AI layer reads the settled value
 * rather than integrating the lag hour-by-hour. The live `BuildingThermalEngine`
 * below calls this SAME function every tick and is what actually integrates
 * the lag — one physics, two consumers, exactly per guide §11.1.
 */
export function equilibriumThermalState(
  facadeOpenness: number,
  facadeSolarGainKW: number,
  outdoorTempC: number,
  irradianceWm2: number,
): BuildingThermalState {
  const envelope = envelopeHeatGainKW(facadeSolarGainKW)
  const convective = convectiveFraction(facadeOpenness)
  const convectiveKW = envelope * convective
  const radiantKW = envelope * (1 - convective) // settled: released == target, no lag remaining
  const indoor = envelope // convectiveKW + radiantKW === envelope
  const coolingRequiredKW = indoor // capacity assumed sufficient — see module header
  const coolingLoadKW = coolingRequiredKW / BUILDING_THERMAL.COOLING_PLANT_COP
  return {
    facadeOpenness,
    outdoorTempC,
    facadeSolarGainKW: Math.max(0, facadeSolarGainKW),
    envelopeHeatGainKW: envelope,
    convectiveKW,
    radiantReleaseKW: radiantKW,
    indoorHeatGainKW: indoor,
    coolingRequiredKW,
    coolingLoadKW,
    indoorTemperatureProxy: indoorTemperatureProxy(outdoorTempC, indoor, irradianceWm2),
    conditionedIndoorTemperatureC: conditionedIndoorTemperatureC(coolingRequiredKW),
    coolingStatus: coolingStatus(coolingRequiredKW, 0),
    thermalLag: 0,
  }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
/**
 * BuildingThermalEngine — the live, stateful thermal-mass integrator.
 *
 * Allocation-free in the hot path: `state` is created once and mutated in
 * place every tick, matching `BuildingEnergyEngine`'s own convention so a
 * 20 Hz environmental tier produces no garbage.
 */
export class BuildingThermalEngine {
  private state: BuildingThermalState = initialState()
  /** The radiant share of envelope heat gain currently stored and being released, kW thermal. */
  private radiantReleaseKW = 0

  /**
   * Advance the thermal chain one environmental tick.
   *
   * @param facadeOpenness   Building-mean façade openness, 0–1 (from `BuildingMetrics.averageOpenness`).
   * @param facadeSolarGainKW Façade solar gain, kW thermal (from `metrics.ts` `facadeSolarGainKW` — NOT recomputed here).
   * @param outdoorTempC     Outdoor dry-bulb temperature, °C.
   * @param irradianceWm2    Raw global solar irradiance, W/m² (from `SunState.irradiance`).
   * @param dtSimSeconds     Elapsed SIMULATED seconds since the last call. 0 means
   *                         "initialise": the radiant-release lag snaps to its
   *                         target instead of integrating, so a seed call or a
   *                         timeline scrub produces no startup transient — the
   *                         same convention `BuildingEnergyEngine.update` uses.
   */
  update(
    facadeOpenness: number,
    facadeSolarGainKW: number,
    outdoorTempC: number,
    irradianceWm2: number,
    dtSimSeconds: number,
  ): void {
    const envelope = envelopeHeatGainKW(facadeSolarGainKW)
    const convective = convectiveFraction(facadeOpenness)
    const convectiveKW = envelope * convective
    const radiantTargetKW = envelope * (1 - convective)

    // Thermal inertia: the radiant share chases its target through the SAME
    // exponential-approach form `buildingEnergy.ts` uses for the HVAC lag —
    // stable for any dt, snaps to target on initialisation (dt <= 0).
    const alpha =
      dtSimSeconds > 0 ? 1 - Math.exp(-dtSimSeconds / BUILDING_THERMAL.TIME_CONSTANT_SIM_SECONDS) : 1
    this.radiantReleaseKW += (radiantTargetKW - this.radiantReleaseKW) * alpha

    const indoor = convectiveKW + this.radiantReleaseKW
    const lag = envelope - indoor
    const coolingRequiredKW = indoor // capacity assumed sufficient — see module header
    const coolingLoadKW = coolingRequiredKW / BUILDING_THERMAL.COOLING_PLANT_COP

    const s = this.state
    s.facadeOpenness = facadeOpenness
    s.outdoorTempC = outdoorTempC
    s.facadeSolarGainKW = Math.max(0, facadeSolarGainKW)
    s.envelopeHeatGainKW = envelope
    s.convectiveKW = convectiveKW
    s.radiantReleaseKW = this.radiantReleaseKW
    s.indoorHeatGainKW = indoor
    s.coolingRequiredKW = coolingRequiredKW
    s.coolingLoadKW = coolingLoadKW
    s.indoorTemperatureProxy = indoorTemperatureProxy(outdoorTempC, indoor, irradianceWm2)
    s.conditionedIndoorTemperatureC = conditionedIndoorTemperatureC(coolingRequiredKW)
    s.coolingStatus = coolingStatus(coolingRequiredKW, lag)
    s.thermalLag = lag
  }

  /** The live thermal state (mutated in place — treat as read-only). */
  getState(): BuildingThermalState {
    return this.state
  }
}
