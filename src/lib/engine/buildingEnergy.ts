/**
 * Building Energy Management System (BEMS) — Stage 7.4, extended by Stage 7.5
 * (Battery), Stage 7.6 (Grid), Stage 7.9 (façade-driven solar cooling
 * addition) and Stage 7.10 (façade-driven artificial lighting addition).
 *
 * The Rooftop PV plant produces AC power; this subsystem gives it a
 * destination:
 *
 *   Environment → Solar Physics → PV Plant → AC Output
 *                                              │
 *                                              ▼
 *                                    Building Energy Bus ──► Battery (storage)
 *                                              │
 *                                              ▼
 *                                       Building Load
 *                                              │
 *                                              ▼
 *                                     Utility Grid (`grid.ts`, balancing)
 *
 * ── Subsystem boundaries (guide §6, §11) ─────────────────────────────────────
 * This engine is pure, framework-free and renders nothing. It consumes only
 * scalars it is handed — time of day, outdoor temperature, the inverter's
 * already-computed AC output, the façade-driven solar cooling addition from
 * `BuildingThermalEngine` (Stage 7.9), and the façade-driven artificial
 * lighting addition from `BuildingLightingEngine` (Stage 7.10) — and never
 * reaches into the solar, façade, PBIF or PV engines. In particular it NEVER
 * re-derives PV power: `pvACOutputKW` comes straight from
 * `PVInverterEngine.getMetrics().currentACPowerKW`, so there is exactly one
 * authority for generation, exactly as `SolarPhysicsEngine` is the one
 * authority for irradiance, `BuildingThermalEngine` is the one authority for
 * the façade's thermal effect on cooling demand, and `BuildingLightingEngine`
 * is the one authority for the façade's daylight effect on lighting demand.
 *
 * ── Scope ────────────────────────────────────────────────────────────────────
 * Storage connects through the `StoragePort` interface (`connectStorage()`,
 * dispatched inside `update()` and settled by `settleBus()` below) — this
 * engine knows there is *a* store, never which one, so `BatteryEnergyEngine`
 * is never imported here. The bus reports `requiredGridImportKW`/`surplusKW`
 * as whatever storage could not cover; `grid.ts`'s `GridEnergyEngine` (Stage
 * 7.6) reads those two numbers and classifies them — it performs no dispatch
 * of its own, so this engine remains the single settlement authority.
 */

import { clamp, smoothstep } from './math'
import type { BuildingConfig } from './types'

// ---------------------------------------------------------------------------
// Load model — commercial office, tropical climate
// ---------------------------------------------------------------------------
/**
 * The five demand categories of a commercial office, each expressed as a peak
 * **electrical power density** in W/m² of gross floor area, plus the fraction of
 * that peak still drawn overnight (the unoccupied base load).
 *
 * Sources for the intensities:
 *  • Lighting — ASHRAE 90.1 Lighting Power Density allowance for office space
 *    (≈0.61–0.9 W/ft² ≈ 6.6–9.7 W/m²) totals 8 W/m² mid-range. Stage 7.10 splits
 *    that total into this category's OWN non-daylight-responsive share — egress,
 *    corridor and back-of-house circuits that stay occupancy-driven regardless
 *    of daylight — and a separate daylight-responsive share owned entirely by
 *    `BuildingLightingEngine` (`buildingLighting.ts`, `ARTIFICIAL_LIGHTING_DENSITY_WM2`).
 *    The two sum back to the original 8 W/m² total at full occupancy with zero
 *    daylight (night), so Stage 7.10 changes WHEN the peak is reached, not what
 *    the peak itself is.
 *  • Office equipment — ASHRAE 90.1 Appendix G / CIBSE Guide F typical office
 *    plug-load densities (7–10 W/m²).
 *  • HVAC — cooling-dominated tropical office; the largest single end use.
 *    Malaysian commercial Building Energy Index practice (MS 1525) puts HVAC at
 *    roughly half to three-fifths of total electrical demand, which 22 W/m² of
 *    the 37 W/m² peak (22+3+7+2+3, summed across `LOAD_CATEGORIES` below)
 *    reproduces.
 *  • Elevators / miscellaneous services — CIBSE Guide F typical allowances for
 *    vertical transport and landlord services (pumps, security, comms rooms).
 *
 * Night fractions follow the same references' unoccupied-hours schedules:
 * HVAC setback, emergency-only lighting, equipment standby, and largely
 * continuous landlord services.
 */
export interface LoadCategorySpec {
  id: BuildingLoadCategoryId
  label: string
  /** Peak demand, W per m² of gross floor area. */
  peakDensity: number
  /** Fraction of peak still drawn when the building is unoccupied, 0–1. */
  nightFraction: number
  /** True when this category's demand rises with outdoor temperature. */
  weatherSensitive: boolean
}

export type BuildingLoadCategoryId = 'hvac' | 'lighting' | 'equipment' | 'elevators' | 'services'

export const LOAD_CATEGORIES: readonly LoadCategorySpec[] = [
  { id: 'hvac', label: 'HVAC', peakDensity: 22, nightFraction: 0.15, weatherSensitive: true },
  // Non-daylight-responsive share only (egress/corridor/back-of-house) — see
  // the header note above. The daylight-responsive remainder is
  // `BuildingLightingEngine`'s `ARTIFICIAL_LIGHTING_DENSITY_WM2` (5 W/m²).
  { id: 'lighting', label: 'Lighting', peakDensity: 3, nightFraction: 0.1, weatherSensitive: false },
  { id: 'equipment', label: 'Office Equipment', peakDensity: 7, nightFraction: 0.25, weatherSensitive: false },
  { id: 'elevators', label: 'Elevators', peakDensity: 2, nightFraction: 0.05, weatherSensitive: false },
  { id: 'services', label: 'Building Services', peakDensity: 3, nightFraction: 0.55, weatherSensitive: false },
] as const

/**
 * Weekday occupancy schedule, local hours. Transitions are smoothstepped rather
 * than stepped so the load curve is C¹-continuous — no discontinuity can appear
 * in the energy balance when the clock crosses an edge.
 * Shape follows the ASHRAE 90.1 Appendix G / CIBSE Guide F office schedule.
 */
const OCCUPANCY = {
  /** Arrival ramp, hours. */
  ARRIVE_START: 6.5,
  ARRIVE_END: 8.5,
  /** Departure ramp, hours. */
  LEAVE_START: 17,
  LEAVE_END: 19.5,
  /** Lunch period and how far occupancy dips across it. */
  LUNCH_START: 12,
  LUNCH_END: 13.5,
  LUNCH_DIP: 0.25,
} as const

/**
 * HVAC cooling response. Below the balance point the plant only has to handle
 * ventilation and internal gains; above it, cooling demand rises roughly
 * linearly with the outdoor dry-bulb excess (the degree-hour approximation used
 * by CIBSE Guide A / ASHRAE Fundamentals for a first-order plant model).
 */
const HVAC_THERMAL = {
  /** Outdoor temperature at which cooling demand is at its modelled minimum, °C. */
  BALANCE_POINT_C: 24,
  /** Outdoor temperature at which cooling demand reaches its modelled peak, °C. */
  DESIGN_C: 34,
  /** Demand multiplier at the balance point (i.e. ventilation + internal gains). */
  MIN_FACTOR: 0.55,
  /** Demand multiplier at the design condition. */
  MAX_FACTOR: 1,
  /**
   * First-order thermal-mass lag, **simulated** seconds. A building's cooling
   * plant cannot follow a step change in outdoor temperature — the fabric's
   * thermal inertia smooths it. Without this the HVAC term would track weather
   * noise directly.
   *
   * This MUST be simulated time, not wall-clock: the occupancy profile is driven
   * by `clock.timeHours`, and the twin compresses a day into ~2 real minutes at
   * 1×. A lag measured in real seconds would be several simulated days long and
   * the HVAC would never respond to the diurnal temperature swing at all.
   * 15 simulated minutes is a representative first-order response time for a
   * commercial cooling plant plus building fabric (CIBSE Guide A, dynamic
   * thermal response).
   */
  LAG_SIM_SECONDS: 15 * 60,
} as const

/**
 * Gross floor area of the building, m². Exported so `BuildingLightingEngine`
 * (Stage 7.10) scales its own daylight-responsive rated capacity off the SAME
 * floor area this engine's demand model uses — one authority, never a second
 * `width × depth × floorCount` computed elsewhere.
 */
export function grossFloorArea(cfg: BuildingConfig): number {
  return cfg.width * cfg.depth * Math.max(1, cfg.floorCount)
}

/**
 * Smooth 0 → 1 → 0 bump across `[start, end]`, used for the lunch dip. Built
 * from a rising and a falling smoothstep meeting at the midpoint, where both
 * equal 1 — so the product peaks at exactly 1 and needs no normalisation.
 */
function bump(x: number, start: number, end: number): number {
  const mid = (start + end) / 2
  return smoothstep(start, mid, x) * (1 - smoothstep(mid, end, x))
}

/**
 * Occupancy fraction, 0–1, for a local hour. 0 overnight, ~1 during working
 * hours, with a smooth arrival ramp, lunch dip and departure ramp.
 */
export function occupancyFraction(hours: number): number {
  const h = ((hours % 24) + 24) % 24
  const arrived = smoothstep(OCCUPANCY.ARRIVE_START, OCCUPANCY.ARRIVE_END, h)
  const left = 1 - smoothstep(OCCUPANCY.LEAVE_START, OCCUPANCY.LEAVE_END, h)
  const lunch = 1 - OCCUPANCY.LUNCH_DIP * bump(h, OCCUPANCY.LUNCH_START, OCCUPANCY.LUNCH_END)
  return clamp(arrived * left * lunch)
}

/**
 * Equilibrium HVAC demand multiplier for an outdoor dry-bulb temperature — the
 * value the lagged `hvacFactor` is always approaching.
 *
 * Exported pure so the Prediction Engine can project cooling demand hours ahead
 * through the SAME degree-hour response the live BEMS uses. A projection reads
 * the equilibrium rather than the lagged value because the fabric's 15-simulated
 * minute time constant is negligible over a one-to-twelve hour horizon.
 */
export function hvacDemandFactor(outdoorTempC: number): number {
  const excess = smoothstep(HVAC_THERMAL.BALANCE_POINT_C, HVAC_THERMAL.DESIGN_C, outdoorTempC)
  return HVAC_THERMAL.MIN_FACTOR + (HVAC_THERMAL.MAX_FACTOR - HVAC_THERMAL.MIN_FACTOR) * excess
}

/** Demand of one category at a given occupancy and HVAC multiplier, kW. */
export function categoryDemandKW(
  spec: LoadCategorySpec,
  floorAreaM2: number,
  occupancy: number,
  hvacFactor: number,
): number {
  // Occupancy interpolates between the unoccupied base and the full peak.
  const dutyFraction = spec.nightFraction + (1 - spec.nightFraction) * occupancy
  const weather = spec.weatherSensitive ? hvacFactor : 1
  return (spec.peakDensity * floorAreaM2 * dutyFraction * weather) / 1000
}

/** A projected demand split: the total, and the weather-sensitive part of it. */
export interface BuildingDemand {
  /** Total building electrical demand, kW. */
  totalKW: number
  /** The cooling (HVAC) share of it, kW. */
  hvacKW: number
  /** The lighting share of it, kW (Stage 7.10 — Base Lighting + Artificial Lighting). */
  lightingKW: number
  /** Occupancy fraction driving the profile, 0–1. */
  occupancy: number
  /** HVAC demand multiplier applied, 0–1. */
  hvacFactor: number
}

/**
 * Whole-building demand at a time of day and outdoor temperature — the single
 * authority for the load model, used by the live BEMS and by the Prediction
 * Engine's forward projection alike.
 *
 * `hvacFactor` is passed in rather than derived here because the live engine
 * carries a *lagged* value (thermal mass) while a projection uses the
 * equilibrium one; the demand arithmetic itself is identical either way.
 *
 * `solarCoolingLoadKW` (Stage 7.9) is the façade-driven addition to the HVAC
 * term, published by `BuildingThermalEngine` — see `buildingThermal.ts`. It is
 * already electrical kW (converted via the cooling plant's COP), so it adds
 * straight onto the category's occupancy-driven baseline with no further
 * conversion. Defaults to 0 so any other caller is unaffected.
 *
 * `artificialLightingKW` (Stage 7.10) is the equivalent addition to the
 * Lighting term, published by `BuildingLightingEngine` — see
 * `buildingLighting.ts`. Already electrical kW and already occupancy-scaled,
 * so it too adds straight onto the category's baseline. Defaults to 0 so the
 * AI Prediction / What-If layers (unmodified this stage — CLAUDE.md §11)
 * continue to see exactly the behaviour they already validated.
 */
export function buildingDemandKW(
  floorAreaM2: number,
  timeHours: number,
  hvacFactor: number,
  solarCoolingLoadKW = 0,
  artificialLightingKW = 0,
): BuildingDemand {
  const occupancy = occupancyFraction(timeHours)
  let totalKW = 0
  let hvacKW = 0
  let lightingKW = 0
  for (const spec of LOAD_CATEGORIES) {
    const kW = categoryDemandKW(spec, floorAreaM2, occupancy, hvacFactor)
    totalKW += kW
    if (spec.id === 'hvac') hvacKW = kW
    if (spec.id === 'lighting') lightingKW = kW
  }
  const solarAddition = Math.max(0, solarCoolingLoadKW)
  hvacKW += solarAddition
  totalKW += solarAddition
  const lightingAddition = Math.max(0, artificialLightingKW)
  lightingKW += lightingAddition
  totalKW += lightingAddition
  return { totalKW, hvacKW, lightingKW, occupancy, hvacFactor }
}

// ---------------------------------------------------------------------------
// Live state
// ---------------------------------------------------------------------------
/** One demand category's live contribution. */
export interface BuildingLoadCategoryState {
  id: BuildingLoadCategoryId
  label: string
  /** Current demand, kW. */
  powerKW: number
  /** Share of the building's total demand, 0–1. */
  share: number
}

/**
 * The Building Energy Bus — the single AC node every energy source and sink
 * connects to.
 *
 *   ┌── PV Inverter ──►┐                         ├──► Building Load
 *   │          Battery ┤  Building Energy Bus    ├──► Battery charge
 *   └──────────Grid────┘                         └──► Grid export
 *
 * Stage 7.4 connected PV in and load out. Stage 7.5 connects storage, with the
 * standard self-consumption-priority routing:
 *
 *   1. PV serves the building load directly.
 *   2. Any PV surplus charges the battery.
 *   3. Any remaining deficit is met by discharging the battery.
 *   4. Whatever the battery cannot cover is `requiredGridImportKW` — read and
 *      classified (not re-derived) by `grid.ts`'s `GridEnergyEngine` (Stage 7.6).
 */
export interface EnergyBusState {
  /** AC power arriving from the PV inverter, kW. */
  pvGenerationKW: number
  /** Total building electrical demand, kW. */
  buildingLoadKW: number
  /**
   * PV generation retained on site, kW — direct-to-load **plus** battery
   * charging. This is the industry definition of self-consumption: generation
   * that was not exported.
   */
  selfConsumptionKW: number
  /** PV consumed directly by the building, kW — `min(generation, load)`. */
  pvToLoadKW: number
  /** PV surplus before storage, kW — `max(0, generation − load)`. */
  pvSurplusKW: number
  /** Demand PV alone could not meet, kW — `max(0, load − generation)`. */
  deficitKW: number
  /** PV surplus routed into the battery, kW. */
  batteryChargeKW: number
  /** Battery power delivered to the load, kW. */
  batteryDischargeKW: number
  /**
   * Generation still uncommitted after storage, kW — what a grid export would
   * carry. `pvSurplus − batteryCharge`.
   */
  surplusKW: number
  /**
   * Import a grid connection would have to supply, kW —
   * `deficit − batteryDischarge`, exactly as Stage 7.4 reserved this field for.
   */
  requiredGridImportKW: number
  /** Self-consumed share of generation, 0–1. Zero when nothing is generated. */
  selfConsumptionRatio: number
  /**
   * Share of demand met without grid import, 0–1 —
   * `(pvToLoad + batteryDischarge) / load`. Zero when there is no demand.
   */
  buildingCoverage: number
  /** Net battery exchange, kW: **+ charging / − discharging**. */
  batteryKW: number
  /**
   * Net grid exchange, kW: **+ importing / − exporting**. The grid balances
   * whatever the site cannot source or absorb, so this is exactly
   * `requiredGridImportKW − surplusKW` (at most one is ever non-zero).
   */
  gridKW: number
}

/**
 * What a storage subsystem decides to do in one step. Both figures are AC power
 * at the bus; at most one is ever non-zero.
 */
export interface StorageDispatch {
  /** AC power drawn from PV surplus to charge, kW. */
  chargeKW: number
  /** AC power delivered to the load, kW. */
  dischargeKW: number
}

/**
 * The bus's storage port. Any subsystem that can store energy implements this;
 * the bus hands it the PV-only imbalance and receives a dispatch back. Keeping
 * it an interface means `buildingEnergy.ts` imports nothing from the battery —
 * the router knows there is *a* store, not *which* store. The grid needed no
 * equivalent port: it is unconditional and unlimited, so `grid.ts` simply
 * reads the bus's already-settled `requiredGridImportKW`/`surplusKW` rather
 * than being offered a dispatch decision.
 */
export interface StoragePort {
  dispatch(surplusKW: number, deficitKW: number, dtSimSeconds: number): StorageDispatch
}

/** Shared no-storage dispatch — a module constant, never allocated per tick. */
const NO_STORAGE: StorageDispatch = { chargeKW: 0, dischargeKW: 0 }

/** Everything the Engineering UI needs, published once per environmental tick. */
export interface BuildingEnergySnapshot {
  bus: EnergyBusState
  categories: BuildingLoadCategoryState[]
  /** Gross floor area the model is scaled to, m². */
  floorAreaM2: number
  /** Current demand intensity, W/m² — the comparable engineering figure. */
  loadIntensityWm2: number
  /** Occupancy fraction driving the profile right now, 0–1. */
  occupancy: number
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
/**
 * BuildingEnergyEngine — building demand, the AC bus and the energy balance.
 *
 * Allocation-free in the hot path: the category array, each category state
 * object, the bus object and the snapshot object are created once in `rebuild()`
 * and mutated in place on every tick, so a 20 Hz environmental tier produces no
 * garbage.
 */
export class BuildingEnergyEngine {
  private floorAreaM2 = 0
  private occupancy = 0
  /** Lagged HVAC demand multiplier — carries the building's thermal inertia. */
  private hvacFactor = HVAC_THERMAL.MIN_FACTOR

  private categories: BuildingLoadCategoryState[] = []
  private bus: EnergyBusState = {
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
  /** Optional storage connected to the bus. Null until `connectStorage()`. */
  private storage: StoragePort | null = null
  private snapshotCache: BuildingEnergySnapshot

  constructor(cfg: BuildingConfig) {
    this.categories = LOAD_CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      powerKW: 0,
      share: 0,
    }))
    this.snapshotCache = {
      bus: this.bus,
      categories: this.categories,
      floorAreaM2: 0,
      loadIntensityWm2: 0,
      occupancy: 0,
    }
    this.rebuild(cfg)
  }

  /** Re-scale the load model when the building geometry changes. */
  rebuild(cfg: BuildingConfig): void {
    this.floorAreaM2 = grossFloorArea(cfg)
    this.snapshotCache.floorAreaM2 = this.floorAreaM2
  }

  /**
   * Connect a storage subsystem to the bus. Passing `null` disconnects it and
   * the bus settles exactly as it did before Stage 7.5 — the PV-only balance.
   */
  connectStorage(port: StoragePort | null): void {
    this.storage = port
  }

  /**
   * Advance the BEMS one environmental tick.
   *
   * @param timeHours        Local time of day, 0–24.
   * @param outdoorTempC     Outdoor dry-bulb temperature, °C (HVAC response).
   * @param pvACOutputKW     AC power from the inverter — NEVER recomputed here.
   * @param dtSimSeconds     Elapsed **simulated** seconds since the last call.
   *                         0 means "initialise": the HVAC lag snaps to its
   *                         target instead of integrating, so a seed call or a
   *                         timeline scrub produces no startup transient.
   * @param solarCoolingLoadKW Façade-driven addition to HVAC demand, electrical
   *                         kW, published by `BuildingThermalEngine` (Stage
   *                         7.9) — NEVER recomputed here, added to the HVAC
   *                         category's occupancy-driven baseline only.
   * @param artificialLightingKW Daylight-responsive addition to Lighting
   *                         demand, electrical kW, published by
   *                         `BuildingLightingEngine` (Stage 7.10) — NEVER
   *                         recomputed here, added to the Lighting category's
   *                         occupancy-driven baseline only.
   */
  update(
    timeHours: number,
    outdoorTempC: number,
    pvACOutputKW: number,
    dtSimSeconds: number,
    solarCoolingLoadKW = 0,
    artificialLightingKW = 0,
  ): void {
    this.occupancy = occupancyFraction(timeHours)

    // ── HVAC thermal response, lagged by the fabric's thermal mass ──────────
    const targetHvacFactor = hvacDemandFactor(outdoorTempC)
    // Exponential approach — stable for any dt. dt <= 0 snaps (initialisation).
    const alpha =
      dtSimSeconds > 0 ? 1 - Math.exp(-dtSimSeconds / HVAC_THERMAL.LAG_SIM_SECONDS) : 1
    this.hvacFactor += (targetHvacFactor - this.hvacFactor) * alpha

    // ── Per-category demand ─────────────────────────────────────────────────
    const solarAddition = Math.max(0, solarCoolingLoadKW)
    const lightingAddition = Math.max(0, artificialLightingKW)
    let totalKW = 0
    for (let i = 0; i < LOAD_CATEGORIES.length; i++) {
      const spec = LOAD_CATEGORIES[i]
      let powerKW = categoryDemandKW(spec, this.floorAreaM2, this.occupancy, this.hvacFactor)
      // Base HVAC + Solar Cooling Load (guide §9) and Base Lighting + Artificial
      // Lighting (Stage 7.10) — the ONE additive step both this live path and
      // `buildingDemandKW`'s projection path apply.
      if (spec.id === 'hvac') powerKW += solarAddition
      if (spec.id === 'lighting') powerKW += lightingAddition
      const state = this.categories[i]
      state.powerKW = powerKW
      totalKW += powerKW
    }
    for (const state of this.categories) {
      state.share = totalKW > 0 ? state.powerKW / totalKW : 0
    }

    // ── Settle the bus ──────────────────────────────────────────────────────
    // Storage is offered the PV-only imbalance first, then the bus settles with
    // its decision folded in. `settleBus` computes that imbalance itself, so it
    // is derived in exactly one place.
    const dispatch = this.storage
      ? this.storage.dispatch(
          Math.max(0, pvACOutputKW - totalKW),
          Math.max(0, totalKW - pvACOutputKW),
          dtSimSeconds,
        )
      : NO_STORAGE
    settleBus(this.bus, pvACOutputKW, totalKW, dispatch)

    this.snapshotCache.loadIntensityWm2 =
      this.floorAreaM2 > 0 ? (totalKW * 1000) / this.floorAreaM2 : 0
    this.snapshotCache.occupancy = this.occupancy
  }

  /** The live bus state (mutated in place — treat as read-only). */
  getBusState(): EnergyBusState {
    return this.bus
  }

  /** Live per-category demand breakdown (mutated in place — read-only). */
  getLoadBreakdown(): BuildingLoadCategoryState[] {
    return this.categories
  }

  /** Total building electrical demand, kW. */
  getTotalLoadKW(): number {
    return this.bus.buildingLoadKW
  }

  /** Everything the Engineering UI reads, as one cached object. */
  getSnapshot(): BuildingEnergySnapshot {
    return this.snapshotCache
  }
}

/**
 * The Building Energy Bus settlement — the single place the energy balance is
 * resolved. Written as a standalone pure function (mutating a caller-owned
 * object so the hot path allocates nothing) because the bus is a real
 * architectural node, not incidental arithmetic. Stage 7.5 added storage here
 * and nowhere else, exactly as Stage 7.4 said it would; Stage 7.6's grid reads
 * this function's output rather than adding a step to it.
 *
 * Routing, in strict priority order:
 *   1. PV → load          `pvToLoad = min(generation, load)`
 *   2. PV surplus → battery
 *   3. battery → remaining load
 *   4. whatever is left is the grid's problem — settled here as
 *      `requiredGridImportKW`/`surplusKW`, classified (not re-derived) by
 *      `grid.ts`'s `GridEnergyEngine`
 *
 * Conservation, which the caller may assert:
 *   generation = pvToLoad + batteryCharge + surplus
 *   load       = pvToLoad + batteryDischarge + requiredGridImport
 *
 * The dispatch is clamped to the imbalance it was offered, so a misbehaving
 * storage implementation can never break conservation on the bus.
 */
export function settleBus(
  bus: EnergyBusState,
  generationKW: number,
  loadKW: number,
  dispatch: StorageDispatch = NO_STORAGE,
): EnergyBusState {
  const generation = Math.max(0, generationKW)
  const load = Math.max(0, loadKW)

  // 1. Direct self-consumption.
  const pvToLoad = Math.min(generation, load)
  const pvSurplus = generation - pvToLoad
  const deficit = load - pvToLoad

  // 2/3. Storage, clamped to what is actually available in each direction.
  const charge = clamp(dispatch.chargeKW, 0, pvSurplus)
  const discharge = clamp(dispatch.dischargeKW, 0, deficit)

  bus.pvGenerationKW = generation
  bus.buildingLoadKW = load
  bus.pvToLoadKW = pvToLoad
  bus.pvSurplusKW = pvSurplus
  bus.deficitKW = deficit
  bus.batteryChargeKW = charge
  bus.batteryDischargeKW = discharge
  // Generation retained on site = used directly + stored.
  bus.selfConsumptionKW = pvToLoad + charge
  bus.surplusKW = pvSurplus - charge
  // 4. Only what storage could not cover would have to be imported.
  bus.requiredGridImportKW = deficit - discharge
  bus.selfConsumptionRatio = generation > 0 ? bus.selfConsumptionKW / generation : 0
  bus.buildingCoverage = load > 0 ? (pvToLoad + discharge) / load : 0
  bus.batteryKW = charge - discharge
  // 5. The utility grid is the balancing component: it takes whatever is left
  //    over in either direction, by definition of an unlimited connection.
  //    `requiredGridImportKW` and `surplusKW` ARE the import and export — the
  //    grid adds no routing of its own, so there is nothing to recompute here.
  //    At most one of them is non-zero, so the signed net is their difference.
  bus.gridKW = bus.requiredGridImportKW - bus.surplusKW

  return bus
}
