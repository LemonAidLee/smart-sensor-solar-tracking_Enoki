# Battery Energy Storage System (BESS)

**Subsystem ID:** Battery
**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

Model the site's battery energy storage system: state of charge (SOC) tracking, and the charge/discharge dispatch that sits between PV generation and building demand, absorbing surplus PV and covering demand PV alone cannot meet, ahead of the utility grid.

## Responsibilities

- Track stored energy (`storedKWh`) and derived state of charge (`soc`, 0–1) over simulated time.
- Decide, once per tick, whether to charge, discharge or idle, given the **PV-only imbalance** the Building Energy Bus already computed (`buildingEnergy.ts`'s `settleBus`) — never irradiance, PV metrics, building geometry or the load model directly.
- Enforce the battery's fixed electrical envelope: capacity, reserve floor, C-rate power limit, one-way charge/discharge efficiencies.
- Report a plain-language `reason` for the current behaviour on every step.
- Accumulate cumulative AC throughput (`throughputKWh`) as the input a future ageing model would need.

This engine implements `StoragePort` (defined in `src/lib/engine/buildingEnergy.ts`) — the bus knows there is *a* store, not *which* store; the battery is plugged in through `connectStorage()`.

## Inputs

Per `BatteryEnergyEngine.dispatch(surplusKW, deficitKW, dtSimSeconds)` (`battery.ts:315`):

| Input | Meaning | Source |
|---|---|---|
| `surplusKW` | PV generation the building could not directly absorb (pre-storage) | `EnergyBusState.pvSurplusKW`, computed in `settleBus()` (`buildingEnergy.ts`) |
| `deficitKW` | Demand PV alone could not meet (pre-storage) | `EnergyBusState.deficitKW`, computed in `settleBus()` |
| `dtSimSeconds` | Elapsed **simulated** seconds since the last dispatch | `Simulation` tick clock |

Exactly one of `surplusKW`/`deficitKW` is ever non-zero per the bus's own contract, so the battery can never charge and discharge in the same step.

## Outputs

`dispatch()` returns a `StorageDispatch` (reused object, mutated in place):
```
{ chargeKW: number, dischargeKW: number }
```

`getState()` returns the full `BatteryState` (`battery.ts:94-126`) — see Live Outputs.

`getLimits()` returns the fixed `StorageLimits` envelope — read by the Prediction Engine so a projected SOC walk uses the real limits rather than assumed ones (`battery.ts:338-341`).

## Internal Calculation Pipeline

1. **Simulation tick** computes the settled bus (`settleBus()` in `buildingEnergy.ts`), which yields `pvSurplusKW` and `deficitKW` *before* storage is considered (self-consumption already applied: `pvToLoad = min(generation, load)`).
2. **`BatteryEnergyEngine.dispatch(surplusKW, deficitKW, dtSimSeconds)`** (`battery.ts:315-336`):
   - Converts `dtSimSeconds` to `dtHours = max(0, dtSimSeconds) / 3600`.
   - Calls the pure function `planStorage(limits, storedKWh, surplusKW, deficitKW, dtHours)` to decide the step.
   - Accumulates `throughputKWh += (chargeKW + dischargeKW) * dtHours`.
   - Advances `storedKWh` to the plan's result and updates the mutable `state` object.
   - Calls `refreshDerived()` to recompute `soc`, `availableKWh`, `headroomKWh` from the new `storedKWh`.
3. **`planStorage()`** (`battery.ts:170-246`) — the single authority for storage dispatch, pure so `BatteryEnergyEngine.dispatch()` and the Prediction Engine's hour-by-hour SOC walk run *identical* logic (`projection.ts` imports this same function):
   - `dtHours <= 0` → hold state, `Idle`, no reason (initialisation/pause/scrub).
   - `surplusKW > 0` → **charge** branch, bounded by headroom and by `maxPowerKW`.
   - else `deficitKW > 0` → **discharge** branch, bounded by the reserve floor and by `maxPowerKW`.
   - else → `Idle`, "generation and demand are balanced."
4. **`settleBus()`** back in `buildingEnergy.ts` then clamps the dispatch it receives to the imbalance it offered (`charge = clamp(dispatch.chargeKW, 0, pvSurplus)`, `discharge = clamp(dispatch.dischargeKW, 0, deficit)`) and computes `bus.surplusKW = pvSurplus - charge` and `bus.requiredGridImportKW = deficit - discharge` — the residual the [Grid](./grid.md) engine reads (see CLAUDE.md §11.5: "removing the grid changes no dispatch — islanding reclassifies the residual the bus already settled — it never re-settles it").

## Engineering Equations

Transcribed verbatim from `planStorage()` (`battery.ts:170-246`).

**Charge branch** (`surplusKW > 0`):
```
headroomKWh = max(0, capacityKWh - storedKWh)
headroomLimitKW = headroomKWh / (chargeEfficiency * dtHours)
chargeKW = min(surplusKW, maxPowerKW, headroomLimitKW)

if chargeKW > IDLE_THRESHOLD_KW (0.01):
    absorbed = chargeKW * chargeEfficiency * dtHours
    storedKWh' = min(capacityKWh, storedKWh + absorbed)
    state = 'Charging'
else:
    state = 'Idle'   // "Full — surplus cannot be absorbed."
```

**Discharge branch** (`deficitKW > 0`):
```
reserveKWh = capacityKWh * reserveFraction
availableKWh = max(0, storedKWh - reserveKWh)
availableLimitKW = (availableKWh * dischargeEfficiency) / dtHours
dischargeKW = min(deficitKW, maxPowerKW, availableLimitKW)

if dischargeKW > IDLE_THRESHOLD_KW (0.01):
    drawn = dischargeKW / dischargeEfficiency
    storedKWh' = max(reserveKWh, storedKWh - drawn * dtHours)
    state = 'Discharging'
else:
    state = 'Idle'   // "Holding at reserve — no PV surplus available to recharge."
```

**Neither surplus nor deficit** → `state = 'Idle'`, `storedKWh' = storedKWh` unchanged.

**Derived readouts** (`refreshDerived()`, `battery.ts:358-365`):
```
reserveKWh = capacityKWh * reserveFraction
soc = capacityKWh > 0 ? storedKWh / capacityKWh : 0
availableKWh = max(0, storedKWh - reserveKWh)
headroomKWh = max(0, capacityKWh - storedKWh)
```

**Max power (C-rate) limit** (constructor, `battery.ts:275`):
```
maxPowerKW = capacityKWh * cRate
```

**Round-trip efficiency** (constructor, `battery.ts:292`):
```
roundTripEfficiency = chargeEfficiency * dischargeEfficiency
```

## Constants

| Constant | Value | File | Note |
|---|---|---|---|
| `BATTERY_CAPACITY_KWH` | 39.56 kWh | `battery.ts:53` | From the project report. Matches CLAUDE.md §7 exactly. |
| `DEFAULT_RESERVE_FRACTION` | 0.1 (10%) | `battery.ts:61` | Engineering assumption — common commercial BESS setting |
| `DEFAULT_C_RATE` | 0.5 | `battery.ts:69` | Engineering assumption — "usual pairing for a commercial LiFePO₄ BESS of this size"; gives `39.56 × 0.5 ≈ 19.8 kW` charge/discharge power |
| `DEFAULT_CHARGE_EFFICIENCY` | 0.96 (96%) | `battery.ts:76` | Engineering assumption |
| `DEFAULT_DISCHARGE_EFFICIENCY` | 0.96 (96%) | `battery.ts:77` | Engineering assumption; combined round-trip ≈ 92% |
| `DEFAULT_INITIAL_SOC` | 0.5 (50%) | `battery.ts:84` | Commissioned SOC — chosen so discharge is exercised from hour 1 |
| `IDLE_THRESHOLD_KW` | 0.01 kW | `battery.ts:87` | Power floor below which the battery reports `Idle` |

**On the 39.56 kWh figure**: this is stated by the project report with **no chemistry, manufacturer, C-rate, efficiency or reserve specified** (`battery.ts:47-52`, corroborated by `pvEquipment.ts:60-75`'s `BATTERY_SPEC`, which shows `Battery Capacity: 39.56 kWh` and explicitly labels every other parameter as "engineering assumptions" rather than datasheet values). No discrepancy exists here — the code value and CLAUDE.md §7 agree exactly.

## Engineering References

- **LiFePO₄ (Lithium Iron Phosphate) commercial BESS conventions** — the 0.5C rate and 96%/96% efficiency pairing are stated in comments as "typical of a modern LiFePO₄ system with its inverter" (`battery.ts:63-69, 71-77`). This is an **inferred/typical-practice reference**, not traceable to a specific datasheet — the report does not name a chemistry or manufacturer.
- **10% reserve floor** — described as "a common commercial BESS setting" (`battery.ts:56-60`); inferred convention, not code-cited to a standard.
- No external standard (e.g. IEEE 1547, UL 1973) is cited in code for the battery itself.

## Assumptions

- Round-trip efficiency is symmetric in the sense that charge and discharge each use their own constant (96%/96%), not a state-of-charge-dependent curve.
- Reserve floor and C-rate are constant, not temperature- or SOC-dependent.
- The battery is commissioned at 50% SOC; there is no cold-start-at-0% path exercised by default.
- Dispatch is strictly self-consumption-priority (charge from surplus, discharge to deficit) — no forecasting or scheduling.

## Limitations

- **`temperatureFactor` and `ageingFactor` are declared future hooks, pinned to `1`** (`battery.ts:122-125, 294-295`) — no thermal derating and no capacity-fade/cycle-ageing model is implemented despite the fields existing on `BatteryState`.
- **No smart dispatch arbitrage.** The engine "strictly follows a greedy self-consumption strategy" (`src/lib/knowledge/subsystems.ts`, `Battery.knownLimitations`) — no time-of-use (TOU) price arbitrage, no scheduled pre-charging, no demand-charge management.
- **The battery rarely charges for this building's sizing.** For the modelled office building, PV generation never exceeds demand during generation hours (per `walkthrough.md`, Stage 7.4), so under normal operation the battery discharges to its reserve floor and then idles, reporting why via `reason` rather than fabricating charge activity (`battery.ts:26-38`). This is a sizing result of the specific building/PV/load combination, not an engine defect — the dispatch code itself is generic and will charge the moment any scenario produces real surplus.
- No degradation/ageing model — `throughputKWh` is accumulated as the input a future model would need, but nothing currently consumes it to reduce capacity.
- No reactive power or grid-forming/islanding backup behaviour modelled (battery's reserve is described as "leaving energy available for a future backup/islanding mode", `battery.ts:56-58`, but no islanding logic exists yet in this file).

## Dependencies

- **Building Energy** — `BatteryEnergyEngine` implements `StoragePort` from `src/lib/engine/buildingEnergy.ts` and is handed only `EnergyBusState`-derived `surplusKW`/`deficitKW`; it never reads irradiance, PV metrics or building geometry directly (`battery.ts:17-24`). (Building Energy is not part of this doc batch — named in prose only.)
- No dependency on [PV](./pv.md) or [Grid](./grid.md) — the battery only ever sees the bus's pre-storage imbalance, and the grid never routes through the battery.

## Consumers

Confirmed via grep:

- `src/lib/engine/simulation.ts` — instantiates `BatteryEnergyEngine`, calls `buildingEnergy.connectStorage(this.battery)` (`simulation.ts:251-252`), reads `battery.getState()` in both `predictionContext()` (`simulation.ts:580`) and `snapshot()` (`simulation.ts:679`), and `battery.getState().storedKWh` to seed `bootstrapDailyEnergy()` (`simulation.ts:300`).
- `src/lib/engine/dailyEnergyBootstrap.ts` — consumes battery state to seed the day's energy ledger.
- `src/lib/prediction/projection.ts` — imports `planStorage` directly (`projection.ts:46, 272-275`) to project SOC forward with the identical dispatch logic.
- `src/lib/prediction/types.ts`, `insights.ts` — carry `BatteryState`/`StorageLimits` through `PredictionContext`.
- `src/lib/ai/faultDetection/rules.ts` — `evaluateBattery()` (`rules.ts:375-413`) cross-checks `battery.chargeKW`/`dischargeKW` against the bus's *planned* `batteryChargeKW`/`batteryDischargeKW`, and flags simultaneous charge+discharge or an out-of-range SOC as findings.
- `src/lib/engine/pvEquipment.ts` — imports `BATTERY_CAPACITY_KWH` to build the static `BATTERY_SPEC` shown in the equipment UI (`pvEquipment.ts:25, 70-75`).
- `src/lib/engine/energyLedger.ts` — accumulates `batteryChargeKWh`/`batteryDischargeKWh` from the bus's `batteryChargeKW`/`batteryDischargeKW` fields (which reflect the battery's actual dispatch) each tick.
- UI: battery state is rendered in the Rooftop PV / BEMS panels (via `SimSnapshot.battery`).

## Public API

`BatteryEnergyEngine` (`battery.ts`):
- `constructor(options?: BatteryOptions)` — `{ capacityKWh?, reserveFraction?, cRate?, chargeEfficiency?, dischargeEfficiency?, initialSoc? }`
- `dispatch(surplusKW: number, deficitKW: number, dtSimSeconds: number): StorageDispatch`
- `getLimits(): StorageLimits`
- `getState(): BatteryState` (mutated in place — treat as read-only)

Pure function:
- `planStorage(limits: StorageLimits, storedKWh: number, surplusKW: number, deficitKW: number, dtHours: number): StoragePlan`

## Live Outputs

`BatteryState` (`battery.ts:94-126`), returned by `getState()`:
```
capacityKWh: number
storedKWh: number
soc: number                  // 0-1
reserveFraction: number
availableKWh: number
headroomKWh: number
chargeKW: number
dischargeKW: number
maxPowerKW: number
state: 'Charging' | 'Discharging' | 'Idle'
reason: string
roundTripEfficiency: number
throughputKWh: number
temperatureFactor: number     // pinned to 1
ageingFactor: number          // pinned to 1
```

Exposed on `SimSnapshot.battery` (`simulation.ts:679`) and on `PredictionContext.battery` / `PredictionContext.batteryLimits` (`simulation.ts:580-581`).

## Source Files

- `src/lib/engine/battery.ts`
- `src/lib/engine/buildingEnergy.ts` (`StoragePort`, `StorageDispatch`, `settleBus` — dispatch context)
- `src/lib/engine/simulation.ts` (orchestration)
- `src/lib/prediction/projection.ts` (reuse)
- `src/lib/ai/faultDetection/rules.ts` (monitoring)
- `src/lib/engine/pvEquipment.ts` (`BATTERY_SPEC`)
- `src/lib/engine/energyLedger.ts` (day-scoped accumulation)

## Design Rationale

- The engine is "pure, framework-free and renders nothing" and is handed **only** the PV-only imbalance the bus already computed — "it never sees irradiance, PV metrics, building geometry or the load model, and it never recomputes any of them" (`battery.ts:17-24`). This is the project's single-source-of-truth/no-duplicated-calculations rule (guide §6) applied to storage.
- `planStorage()` is a pure, standalone function specifically so `BatteryEnergyEngine.dispatch()` and the Prediction Engine's SOC walk "run identical logic" (`battery.ts:160-168`) rather than the AI layer approximating a second dispatch model.
- The dispatch rule is stated purely in terms of surplus/deficit, not in terms of "this building's PV never exceeds demand" — so "the moment any future operating mode produces surplus... this same code charges with no architectural change whatsoever" (`battery.ts:34-38`).
- State object and dispatch object are allocated once in the constructor and mutated in place — "the 20 Hz environmental tier produces no garbage" (`battery.ts:255-257`).
- Every idle/discharge/charge branch always populates a human-readable `reason` rather than leaving the UI to infer behaviour from numbers alone — a step with `dtHours <= 0` deliberately retains the last real explanation instead of overwriting it with a placeholder (`battery.ts:330-332`).

## Future Extension Points

- Wire `temperatureFactor` to a thermal derating model for charge/discharge power.
- Wire `ageingFactor` to a cycle/calendar degradation model consuming the already-tracked `throughputKWh`.
- Time-of-use (TOU) price arbitrage dispatch (`src/lib/knowledge/subsystems.ts` `Battery.futureExtensions`).
- An islanding/backup mode that would draw on the reserve floor the 10% margin is explicitly reserved for (`battery.ts:56-58`).
