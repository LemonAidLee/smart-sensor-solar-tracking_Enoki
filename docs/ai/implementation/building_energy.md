# BuildingEnergyEngine

**Subsystem ID:** BuildingEnergy (already registered in `src/lib/knowledge/types.ts` `SubsystemId` union and `src/lib/knowledge/subsystems.ts` — but see Design Rationale for a stale-content note)
**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

`BuildingEnergyEngine` (`src/lib/engine/buildingEnergy.ts`, Stage 7.4, extended through Stage 7.5/7.9/7.10) is the Building Energy Management System (BEMS). It gives the Rooftop PV plant's AC output somewhere to go: it models the building's own electrical demand across five load categories, then settles the single AC node — the Building Energy Bus — where PV generation, building load, battery storage and the utility grid all meet.

```
Environment → Solar Physics → PV Plant → AC Output
                                            │
                                            ▼
                                  Building Energy Bus
                                            │
                                            ▼
                                     Building Load
```

`building.ts` is a small, unrelated geometry helper (neighbour placement / bounding boxes for shading tests) bundled into this document because it lives in the same conceptual "Building" area of `src/lib/engine/`; it has no runtime relationship to `BuildingEnergyEngine`. `dailyEnergyBootstrap.ts` is documented here as a closely-coupled companion: it reconstructs a day's worth of `DailyEnergyLedger` history using the same bus-settlement physics this engine's projection twin (`buildingDemandKW` via `projectAt`) computes.

## Responsibilities

- Model five commercial-office demand categories (HVAC, Lighting, Office Equipment, Elevators, Building Services) as occupancy- and (for HVAC) weather-driven electrical loads.
- Own the **non-daylight-responsive** lighting baseline (egress/corridor/back-of-house, `LOAD_CATEGORIES` `'lighting'` entry) — distinct from [BuildingLighting](./building_lighting.md)'s daylight-responsive share.
- Own occupancy scheduling (`occupancyFraction`) — reused by `BuildingLightingEngine`, not reimplemented there.
- Own `grossFloorArea()` — the one floor-area authority both this engine's own load model and `BuildingLightingEngine`'s rated capacity scale against.
- Add [BuildingThermal](./building_thermal.md)'s already-electrical `coolingLoadKW` straight onto the HVAC category, and [BuildingLighting](./building_lighting.md)'s already-electrical `lightingElectricalKW` straight onto the Lighting category — no further unit conversion.
- Settle the Building Energy Bus: route PV generation to load first, surplus to an optional storage port, and report whatever residual would need grid import/export (`settleBus`).
- Publish per-category demand, the bus state, and a UI-ready snapshot every environmental tick.
- It never re-derives PV power — `pvACOutputKW` is a straight read of `PVInverterEngine.getMetrics().currentACPowerKW`.

## Inputs

Passed positionally to `BuildingEnergyEngine.update()`, called once per environmental tick from `Simulation.tick()`, immediately after the inverter and after `BuildingThermalEngine`/`BuildingLightingEngine`:

| Parameter | Type | Source |
|---|---|---|
| `timeHours` | number, 0–24 | Local simulated time of day |
| `outdoorTempC` | number, °C | `WeatherState.temperature` |
| `pvACOutputKW` | number, kW | `PVInverterEngine.getMetrics().currentACPowerKW` — **never recomputed here** |
| `dtSimSeconds` | number, simulated seconds | Shared `simSeconds` step, same value fed to `BuildingThermalEngine`/`BuildingLightingEngine` that tick |
| `solarCoolingLoadKW` (default `0`) | number, **kW electrical** | `BuildingThermalEngine.getState().coolingLoadKW` — already converted via the cooling plant's COP |
| `artificialLightingKW` (default `0`) | number, **kW electrical** | `BuildingLightingEngine.getState().lightingElectricalKW` — already electrical and already occupancy-scaled |

Constructor input: `BuildingConfig` (`rebuild(cfg)`), from which `grossFloorArea(cfg) = cfg.width * cfg.depth * max(1, cfg.floorCount)` is derived. Optional runtime input: `connectStorage(port: StoragePort | null)` — wires a battery (or future storage) into the bus's dispatch decision.

## Outputs

`BuildingEnergySnapshot` (from `getSnapshot()`):

```ts
interface BuildingEnergySnapshot {
  bus: EnergyBusState
  categories: BuildingLoadCategoryState[]
  floorAreaM2: number       // gross floor area the model is scaled to, m²
  loadIntensityWm2: number  // current demand intensity, W/m²
  occupancy: number         // 0–1
}
```

`EnergyBusState` (from `getBusState()`), all kW unless noted:

| Field | Meaning |
|---|---|
| `pvGenerationKW` | AC power arriving from the inverter |
| `buildingLoadKW` | Total building electrical demand |
| `selfConsumptionKW` | Generation retained on site — direct-to-load **plus** battery charging |
| `pvToLoadKW` | `min(generation, load)` |
| `pvSurplusKW` | `max(0, generation − load)` |
| `deficitKW` | `max(0, load − generation)` |
| `batteryChargeKW` | PV surplus routed into the battery |
| `batteryDischargeKW` | Battery power delivered to the load |
| `surplusKW` | Generation still uncommitted after storage — `pvSurplus − batteryCharge` |
| `requiredGridImportKW` | Import a grid connection would have to supply — `deficit − batteryDischarge` |
| `selfConsumptionRatio` | 0–1, zero when nothing generated |
| `buildingCoverage` | 0–1, `(pvToLoad + batteryDischarge) / load`, zero when no demand |
| `batteryKW` | Net battery exchange: **+ charging / − discharging** |
| `gridKW` | Net grid exchange: **+ importing / − exporting** = `requiredGridImportKW − surplusKW` |

`BuildingLoadCategoryState[]` (from `getLoadBreakdown()`), one per category: `{ id, label, powerKW, share }`.

## Internal Calculation Pipeline

Per `BuildingEnergyEngine.update()` (`buildingEnergy.ts` lines 468–521):

1. `occupancy = occupancyFraction(timeHours)`.
2. HVAC thermal-mass lag: `targetHvacFactor = hvacDemandFactor(outdoorTempC)`; exponential-approach `alpha = dtSimSeconds > 0 ? 1 - exp(-dtSimSeconds / HVAC_THERMAL.LAG_SIM_SECONDS) : 1`; `hvacFactor += (targetHvacFactor - hvacFactor) * alpha`. This persistent instance field is the engine's only carried state (besides the battery/bus objects).
3. For each of the five `LOAD_CATEGORIES`: `powerKW = categoryDemandKW(spec, floorAreaM2, occupancy, hvacFactor)`; if `spec.id === 'hvac'`, add `solarAddition = max(0, solarCoolingLoadKW)`; if `spec.id === 'lighting'`, add `lightingAddition = max(0, artificialLightingKW)`.
4. Sum `totalKW` across all five categories (post-addition); compute each category's `share = powerKW / totalKW`.
5. Storage dispatch: if a `StoragePort` is connected, offer it `chargeKW = max(0, pvACOutputKW - totalKW)` and `deficitKW = max(0, totalKW - pvACOutputKW)`; otherwise use `NO_STORAGE` (`{chargeKW: 0, dischargeKW: 0}`).
6. `settleBus(bus, pvACOutputKW, totalKW, dispatch)` — the single place the energy balance is resolved (see below).
7. Update `snapshotCache.loadIntensityWm2 = floorAreaM2 > 0 ? (totalKW * 1000) / floorAreaM2 : 0` and `snapshotCache.occupancy`.

`settleBus()` (`buildingEnergy.ts` lines 565–606), strict priority order:
1. `pvToLoad = min(generation, load)`; `pvSurplus = generation - pvToLoad`; `deficit = load - pvToLoad`.
2/3. `charge = clamp(dispatch.chargeKW, 0, pvSurplus)`; `discharge = clamp(dispatch.dischargeKW, 0, deficit)` — clamped to the imbalance offered, so a misbehaving storage implementation can never break conservation.
4. `selfConsumptionKW = pvToLoad + charge`; `surplusKW = pvSurplus - charge`; `requiredGridImportKW = deficit - discharge`.
5. `gridKW = requiredGridImportKW - surplusKW` — the grid is the balancing component and adds no routing of its own.

The equivalent stateless projection path, `buildingDemandKW()`, computes steps 1, 3–4 only (no lag — takes `hvacFactor` as a parameter) and is the function the AI Prediction layer and `dailyEnergyBootstrap.ts` call instead of the live, lagged engine.

## Engineering Equations

All transcribed verbatim from `src/lib/engine/buildingEnergy.ts`:

```
grossFloorArea(cfg) = cfg.width * cfg.depth * max(1, cfg.floorCount)

bump(x, start, end):
  mid = (start + end) / 2
  return smoothstep(start, mid, x) * (1 - smoothstep(mid, end, x))

occupancyFraction(hours):
  h = ((hours % 24) + 24) % 24
  arrived = smoothstep(ARRIVE_START, ARRIVE_END, h)
  left    = 1 - smoothstep(LEAVE_START, LEAVE_END, h)
  lunch   = 1 - LUNCH_DIP * bump(h, LUNCH_START, LUNCH_END)
  return clamp(arrived * left * lunch)

hvacDemandFactor(outdoorTempC):
  excess = smoothstep(BALANCE_POINT_C, DESIGN_C, outdoorTempC)
  return MIN_FACTOR + (MAX_FACTOR - MIN_FACTOR) * excess

categoryDemandKW(spec, floorAreaM2, occupancy, hvacFactor):
  dutyFraction = spec.nightFraction + (1 - spec.nightFraction) * occupancy
  weather = spec.weatherSensitive ? hvacFactor : 1
  return (spec.peakDensity * floorAreaM2 * dutyFraction * weather) / 1000

buildingDemandKW(floorAreaM2, timeHours, hvacFactor, solarCoolingLoadKW = 0, artificialLightingKW = 0):
  occupancy = occupancyFraction(timeHours)
  totalKW = Σ categoryDemandKW(spec, ...) over LOAD_CATEGORIES
  hvacKW, lightingKW extracted from the per-category loop
  hvacKW += max(0, solarCoolingLoadKW); totalKW += max(0, solarCoolingLoadKW)
  lightingKW += max(0, artificialLightingKW); totalKW += max(0, artificialLightingKW)
  return { totalKW, hvacKW, lightingKW, occupancy, hvacFactor }
```

Live engine's HVAC lag (`update()`):
```
targetHvacFactor = hvacDemandFactor(outdoorTempC)
alpha = dtSimSeconds > 0 ? 1 - exp(-dtSimSeconds / HVAC_THERMAL.LAG_SIM_SECONDS) : 1
hvacFactor += (targetHvacFactor - hvacFactor) * alpha
```

`settleBus(bus, generationKW, loadKW, dispatch)`:
```
generation = max(0, generationKW); load = max(0, loadKW)
pvToLoad = min(generation, load)
pvSurplus = generation - pvToLoad
deficit   = load - pvToLoad
charge    = clamp(dispatch.chargeKW, 0, pvSurplus)
discharge = clamp(dispatch.dischargeKW, 0, deficit)
selfConsumptionKW    = pvToLoad + charge
surplusKW            = pvSurplus - charge
requiredGridImportKW = deficit - discharge
selfConsumptionRatio = generation > 0 ? selfConsumptionKW / generation : 0
buildingCoverage     = load > 0 ? (pvToLoad + discharge) / load : 0
batteryKW = charge - discharge
gridKW    = requiredGridImportKW - surplusKW
```

Conservation identities the caller may assert (module comment): `generation = pvToLoad + batteryCharge + surplus`; `load = pvToLoad + batteryDischarge + requiredGridImport`.

## Constants

Load category table, `LOAD_CATEGORIES` (`buildingEnergy.ts`):

| id | label | `peakDensity` (W/m²) | `nightFraction` | `weatherSensitive` |
|---|---|---|---|---|
| `hvac` | HVAC | `22` | `0.15` | `true` |
| `lighting` | Lighting | `3` | `0.1` | `false` |
| `equipment` | Office Equipment | `7` | `0.25` | `false` |
| `elevators` | Elevators | `2` | `0.05` | `false` |
| `services` | Building Services | `3` | `0.55` | `false` |

`lighting`'s `3` W/m² is explicitly the **non-daylight-responsive share only** — see [BuildingLighting](./building_lighting.md)'s `ARTIFICIAL_LIGHTING_DENSITY_WM2` (`5` W/m²) for the complementary daylight-responsive share; the two sum to the original `8` W/m² office LPD.

`OCCUPANCY` schedule constants:

| Constant | Value | Meaning |
|---|---|---|
| `ARRIVE_START` | `6.5` | Arrival ramp start, hours |
| `ARRIVE_END` | `8.5` | Arrival ramp end, hours |
| `LEAVE_START` | `17` | Departure ramp start, hours |
| `LEAVE_END` | `19.5` | Departure ramp end, hours |
| `LUNCH_START` | `12` | Lunch dip start, hours |
| `LUNCH_END` | `13.5` | Lunch dip end, hours |
| `LUNCH_DIP` | `0.25` | Fractional depth of the lunch occupancy dip |

`HVAC_THERMAL` constants:

| Constant | Value | Meaning |
|---|---|---|
| `BALANCE_POINT_C` | `24` | Outdoor temperature at which cooling demand is at its modelled minimum, °C |
| `DESIGN_C` | `34` | Outdoor temperature at which cooling demand reaches its modelled peak, °C |
| `MIN_FACTOR` | `0.55` | Demand multiplier at the balance point (ventilation + internal gains) |
| `MAX_FACTOR` | `1` | Demand multiplier at the design condition |
| `LAG_SIM_SECONDS` | `15 * 60` (900) | First-order thermal-mass lag, simulated seconds — 15 simulated minutes |

## Engineering References

`buildingEnergy.ts` cites its intensity sources in comments rather than a structured `*_REFERENCES` array (unlike `buildingThermal.ts` / `buildingLighting.ts`); these are **code-cited in prose comments**, transcribed here verbatim in substance:

| Reference | Applies to |
|---|---|
| ASHRAE 90.1 Lighting Power Density allowance for office space (≈0.61–0.9 W/ft² ≈ 6.6–9.7 W/m²) | Total 8 W/m² lighting peak density, split across `lighting` category + `BuildingLightingEngine` |
| ASHRAE 90.1 Appendix G / CIBSE Guide F typical office plug-load densities (7–10 W/m²) | `equipment` category `peakDensity` (7 W/m²) |
| Malaysian commercial Building Energy Index practice (MS 1525) — HVAC ≈ half of total electrical demand | `hvac` category `peakDensity` (22 W/m² of a 42 W/m² peak) |
| CIBSE Guide F typical allowances for vertical transport and landlord services | `elevators` / `services` categories |
| ASHRAE 90.1 Appendix G / CIBSE Guide F office occupancy schedule shape | `OCCUPANCY` breakpoints |
| CIBSE Guide A / ASHRAE Fundamentals degree-hour approximation for a first-order plant model | `HVAC_THERMAL.BALANCE_POINT_C` / `DESIGN_C` / `MIN_FACTOR` / `MAX_FACTOR` |
| CIBSE Guide A, dynamic thermal response | `HVAC_THERMAL.LAG_SIM_SECONDS` |

The knowledge base entry (`src/lib/knowledge/subsystems.ts`, id `BuildingEnergy`) separately lists `'ASHRAE 90.1 Load Profiles'` as its single `engineeringReferences` entry — consistent with, but less granular than, the above.

## Assumptions

- Building is strictly cooling-dominant — no heating load is modelled (also stated by the knowledge-base entry).
- Occupancy transitions are smoothstepped, not stepped, so the load curve is C¹-continuous — "no discontinuity can appear in the energy balance when the clock crosses an edge" (module comment).
- `hvacFactor` is passed into `buildingDemandKW()` rather than derived inside it, because the live engine carries a *lagged* value while a projection uses the equilibrium one — "the demand arithmetic itself is identical either way" (module comment).
- The HVAC thermal-mass lag (`HVAC_THERMAL.LAG_SIM_SECONDS`) must be simulated time, not wall-clock, because the twin compresses a day into ~2 real minutes at 1×; a wall-clock lag would never let HVAC respond to the diurnal swing.
- Storage is optional and pluggable via the `StoragePort` interface — `buildingEnergy.ts` imports nothing from the battery module itself; "the router knows there is *a* store, not *which* store."
- The dispatch a `StoragePort` returns is always clamped to the imbalance it was offered inside `settleBus`, so conservation cannot be broken by a misbehaving storage implementation.

## Limitations

- (Stage 7.10.2 — resolved) The knowledge base's `BuildingEnergy` entry (`src/lib/knowledge/subsystems.ts`) previously described the façade/HVAC coupling as absent; it now states `solarCoolingLoadKW` (from [BuildingThermal](./building_thermal.md)) and `artificialLightingKW` (from [BuildingLighting](./building_lighting.md)) are wired into `update()`'s HVAC and Lighting categories respectively (verified in `buildingEnergy.ts` lines 380–387 of `simulation.ts` and lines 468–521 of `buildingEnergy.ts` itself), matching this document.
- Grid import/export is reported (`requiredGridImportKW`, `surplusKW`) but the actual utility grid exchange, tariffs and any demand-charge logic live in a separate `GridEnergyEngine`, not in this file.
- The five-category load model is a fixed-shape diurnal profile (occupancy × weather-sensitivity), not a stochastic or measured-data-driven load; no day-to-day variability beyond what weather and occupancy schedule already provide.
- HVAC responds through a single first-order lag against outdoor temperature alone — no humidity, solar-independent internal gain schedule variation, or economizer/free-cooling mode is modelled beyond what `BuildingThermalEngine`'s separate chain contributes.

## Dependencies

- [BuildingThermal](./building_thermal.md) — `coolingLoadKW`, added straight onto the HVAC category.
- [BuildingLighting](./building_lighting.md) — `lightingElectricalKW`, added straight onto the Lighting category; also the *source* engine reused by `BuildingLighting` for `occupancyFraction()` and `floorAreaM2`.
- PV Inverter (`PVInverterEngine`) — `currentACPowerKW`, the sole generation authority.
- Weather (`WeatherState.temperature`).
- Optional: a connected `StoragePort` implementation (typically `BatteryEnergyEngine`, wired via `Simulation`'s `buildingEnergy.connectStorage(this.battery)`).

## Consumers

Verified via `Grep` across `src/`:

- **`Simulation.tick()`** (`src/lib/engine/simulation.ts`) — instantiates the engine (`this.buildingEnergy = new BuildingEnergyEngine(this.building)`, line 248), connects storage (`connectStorage(this.battery)`, line 252), calls `update(...)` once per environmental tick (lines 380–387, plus a zero-`dt` seed call at line 281), then reads `getBusState()` to drive `GridEnergyEngine.update()` and [EnergyLedger](./energy_ledger.md)'s `update()` (lines 390–392).
- **`SimSnapshot.energy`** — `simulation.ts` line 676 publishes `this.buildingEnergy.getSnapshot()`.
- **`RooftopPvPanel.tsx`** (`src/components/twin3d/ui/RooftopPvPanel.tsx`) — reads `snapshot.energy`/`snapshot.daily` for bus and daily-energy display sections.
- **AI Prediction layer** (`src/lib/prediction/projection.ts`) — calls the exported pure functions `occupancyFraction`, `hvacDemandFactor`, `buildingDemandKW`, and `settleBus` directly to project the bus forward without touching live engine state.
- **`dailyEnergyBootstrap.ts`** (`src/lib/engine/dailyEnergyBootstrap.ts`) — indirectly, via `projectAt()` walking the same `buildingDemandKW`/`settleBus` pair from midnight to reconstruct the ledger.
- **`src/lib/knowledge/subsystems.ts`** — the static knowledge-base entry `id: 'BuildingEnergy'` documents this engine (see Limitations for the stale-content caveat).

## Public API

From `src/lib/engine/buildingEnergy.ts`:

```ts
export function grossFloorArea(cfg: BuildingConfig): number
export function occupancyFraction(hours: number): number
export function hvacDemandFactor(outdoorTempC: number): number
export function categoryDemandKW(spec: LoadCategorySpec, floorAreaM2: number, occupancy: number, hvacFactor: number): number
export function buildingDemandKW(
  floorAreaM2: number,
  timeHours: number,
  hvacFactor: number,
  solarCoolingLoadKW?: number,
  artificialLightingKW?: number,
): BuildingDemand
export function settleBus(
  bus: EnergyBusState,
  generationKW: number,
  loadKW: number,
  dispatch?: StorageDispatch,
): EnergyBusState

export class BuildingEnergyEngine {
  constructor(cfg: BuildingConfig)
  rebuild(cfg: BuildingConfig): void
  connectStorage(port: StoragePort | null): void
  update(
    timeHours: number,
    outdoorTempC: number,
    pvACOutputKW: number,
    dtSimSeconds: number,
    solarCoolingLoadKW?: number,
    artificialLightingKW?: number,
  ): void
  getBusState(): EnergyBusState
  getLoadBreakdown(): BuildingLoadCategoryState[]
  getTotalLoadKW(): number
  getSnapshot(): BuildingEnergySnapshot
}

export const LOAD_CATEGORIES: readonly LoadCategorySpec[]
export type BuildingLoadCategoryId = 'hvac' | 'lighting' | 'equipment' | 'elevators' | 'services'
export interface LoadCategorySpec { id, label, peakDensity, nightFraction, weatherSensitive }
export interface BuildingDemand { totalKW, hvacKW, lightingKW, occupancy, hvacFactor }
export interface EnergyBusState { /* see Outputs */ }
export interface StorageDispatch { chargeKW: number; dischargeKW: number }
export interface StoragePort { dispatch(surplusKW: number, deficitKW: number, dtSimSeconds: number): StorageDispatch }
export interface BuildingEnergySnapshot { bus, categories, floorAreaM2, loadIntensityWm2, occupancy }
```

`building.ts`'s public API (unrelated geometry helper, documented for completeness since it shares this module's directory):

```ts
export interface Aabb { id?: string; min: Vec3; max: Vec3 }
export function neighborPosition(n: NeighborBuilding): Vec3
export function neighborAabb(n: NeighborBuilding): Aabb
```

`dailyEnergyBootstrap.ts`'s public API — see [EnergyLedger](./energy_ledger.md) for full documentation:

```ts
export function bootstrapDailyEnergy(
  ledger: DailyEnergyLedger,
  ctx: PredictionContext,
  landingHours: number,
  batteryStartKWh: number,
): void
```

## Live Outputs

`BuildingEnergySnapshot` fields (`bus`, `categories`, `floorAreaM2`, `loadIntensityWm2`, `occupancy`) and `EnergyBusState` fields (`pvGenerationKW`, `buildingLoadKW`, `selfConsumptionKW`, `pvToLoadKW`, `pvSurplusKW`, `deficitKW`, `batteryChargeKW`, `batteryDischargeKW`, `surplusKW`, `requiredGridImportKW`, `selfConsumptionRatio`, `buildingCoverage`, `batteryKW`, `gridKW`) — exactly as named in `buildingEnergy.ts`. Published at `SimSnapshot.energy`.

## Source Files

- `src/lib/engine/buildingEnergy.ts` — the engine, load model, occupancy schedule, HVAC response, bus settlement.
- `src/lib/engine/building.ts` — unrelated geometry helper (neighbour placement/AABBs), bundled here only by directory convention.
- `src/lib/engine/dailyEnergyBootstrap.ts` — historical reconstruction of a day's bus flows using this engine's projection twin.
- `src/lib/engine/simulation.ts` — instantiation, per-tick invocation, storage wiring, snapshot publication (lines 248, 252, 281, 380–392, 676).
- `src/lib/knowledge/subsystems.ts` — static knowledge-base entry, id `'BuildingEnergy'` (lines 303–333).
- `src/components/twin3d/ui/RooftopPvPanel.tsx` — UI consumer.
- `src/lib/prediction/projection.ts` — AI layer's projection consumer.

## Design Rationale

- **Bus as an architectural node, not incidental arithmetic** (module comment on `settleBus`): "Written as a standalone pure function... because the bus is a real architectural node... Stage 7.5 added storage here and nowhere else, exactly as Stage 7.4 said it would; the grid will follow the same way."
- **Single authority for generation** (guide §6): "it NEVER re-derives PV power: `pvACOutputKW` comes straight from `PVInverterEngine.getMetrics().currentACPowerKW`, so there is exactly one authority for generation, exactly as `SolarPhysicsEngine` is the one authority for irradiance and `BuildingThermalEngine` is the one authority for the façade's thermal effect on cooling demand."
- **Storage as a pluggable port**: `StoragePort` is an interface so `buildingEnergy.ts` never imports the battery module directly — "the router knows there is *a* store, not *which* store" — the same pattern a future grid connection could plug into.
- **Why the additive HVAC/Lighting terms are safe defaults**: `solarCoolingLoadKW` and `artificialLightingKW` both default to `0` in `update()` and `buildingDemandKW()`, "so any other caller is unaffected" / "so the AI Prediction / What-If layers... continue to see exactly the behaviour they already validated" (module comments) — a deliberate backward-compatibility seam.
- **Determinism/performance**: category array, category state objects, bus object and snapshot object are all created once in `rebuild()`/the constructor and mutated in place every tick — "a 20 Hz environmental tier produces no garbage."
- **Stale knowledge base**: see Limitations — the `BuildingEnergy` knowledge-base entry has not been updated since Stage 7.9/7.10 wired in the thermal and lighting coupling it still describes as missing.

## Future Extension Points

- Updating `src/lib/knowledge/subsystems.ts`'s `BuildingEnergy` entry to remove the now-false `knownLimitations`/`futureExtensions` statements about thermal/lighting coupling.
- A demand-charge or time-of-use-aware dispatch strategy at the `StoragePort` level (currently strictly greedy self-consumption priority, per the Battery knowledge-base entry).
- Extending the load model beyond a fixed diurnal shape (e.g. day-type variation, stochastic occupancy).
- A grid connection implemented as a `StoragePort`-analogous pluggable port, per the module comment's own forward note ("the grid will follow the same way").
