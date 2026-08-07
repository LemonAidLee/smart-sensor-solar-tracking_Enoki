# Utility Grid Engine

**Subsystem ID:** UtilityGrid
**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

Project the already-settled Building Energy Bus into utility-grid terms: import, export, net exchange, operating state and connection specification. The grid is the site's **balancing component** — it supplies whatever cannot be sourced on-site and absorbs whatever cannot be used on-site, and is therefore the terminal node of the energy architecture.

## Responsibilities

- Read the bus's already-settled residual (`requiredGridImportKW`, `surplusKW`) and classify it into grid import/export/idle state.
- Report the point-of-common-coupling connection specification (voltage, frequency, type).
- Perform **no routing or settlement arithmetic of its own** — import and export are exactly what `settleBus()` in `buildingEnergy.ts` already computed after PV and battery had their turn; this engine only projects and classifies those two numbers.

## Inputs

`GridEnergyEngine.update(bus: EnergyBusState)` (`grid.ts:114`) reads, from the bus:

| Field | Meaning |
|---|---|
| `bus.requiredGridImportKW` | Deficit the battery could not cover — `deficit - batteryDischargeKW`, computed in `settleBus()` |
| `bus.surplusKW` | PV surplus the battery could not absorb — `pvSurplus - batteryChargeKW`, computed in `settleBus()` |

No irradiance, PV metrics, battery internals or building geometry are read (`grid.ts:23-26`).

## Outputs

`GridEnergyEngine.getState(): GridState` — see Live Outputs for the full shape. Headline fields: `importKW`, `exportKW`, `netKW`, `state`, `reason`, plus the static connection spec (`connectionType`, `nominalVoltageV`, `frequencyHz`).

## Internal Calculation Pipeline

1. **Building Energy Bus settlement** happens first and entirely outside this engine, in `settleBus()` (`src/lib/engine/buildingEnergy.ts:565-606`), following the documented self-consumption-priority order:
   1. PV serves the building load directly (`pvToLoad = min(generation, load)`).
   2. Any PV surplus (`pvSurplus = generation - pvToLoad`) is offered to storage as a charge dispatch, clamped to what is actually available: `charge = clamp(dispatch.chargeKW, 0, pvSurplus)`.
   3. Any remaining deficit (`deficit = load - pvToLoad`) is offered to storage as a discharge dispatch, clamped similarly: `discharge = clamp(dispatch.dischargeKW, 0, deficit)`.
   4. What storage could not cover becomes the residual the grid engine reads:
      ```
      bus.surplusKW            = pvSurplus - charge
      bus.requiredGridImportKW = deficit - discharge
      ```
   The bus's own comment states the conservation invariant explicitly (`buildingEnergy.ts:558-560`):
   ```
   generation = pvToLoad + batteryCharge + surplus
   load       = pvToLoad + batteryDischarge + requiredGridImport
   ```
2. **`Simulation.tick()`** calls `this.grid.update(bus)` immediately after the bus and battery have settled for the step (`simulation.ts:388-391`: "The grid is the balancing component: it projects the settled bus...").
3. **`GridEnergyEngine.update(bus)`** (`grid.ts:114-132`) classifies the residual with no further arithmetic beyond `Math.max(0, ...)` clamping and a signed-net subtraction:
   ```
   importKW = max(0, bus.requiredGridImportKW)
   exportKW = max(0, bus.surplusKW)
   netKW    = importKW - exportKW
   ```
   Then sets `state`/`reason`:
   - `importKW > IDLE_THRESHOLD_KW (0.01)` → `state = 'Importing'`
   - else `exportKW > IDLE_THRESHOLD_KW` → `state = 'Exporting'`
   - else → `state = 'Idle'`, "Balanced — the site is neither drawing from nor feeding the grid."

At most one of `importKW`/`exportKW` is ever non-zero, because `bus.requiredGridImportKW` and `bus.surplusKW` are themselves mutually exclusive by construction in `settleBus()`.

## Engineering Equations

Transcribed verbatim.

**Bus-level residual** (`buildingEnergy.ts:592, 594, 603` — the true settlement arithmetic, owned by Building Energy, not this engine):
```
bus.surplusKW            = pvSurplus - charge
bus.requiredGridImportKW = deficit - discharge
bus.gridKW                = bus.requiredGridImportKW - bus.surplusKW
```

**Grid-level classification** (`grid.ts:115-120` — the entirety of this engine's own arithmetic):
```
importKW = max(0, bus.requiredGridImportKW)
exportKW = max(0, bus.surplusKW)
netKW    = importKW - exportKW
```

## Constants

| Constant | Value | File | Note |
|---|---|---|---|
| `GRID_CONNECTION.type` | `'Three-Phase AC'` | `grid.ts:39` | Static connection spec |
| `GRID_CONNECTION.nominalVoltageV` | 415 V | `grid.ts:40` | Malaysian commercial LV supply — TNB distribution practice, MS IEC 60038 |
| `GRID_CONNECTION.frequencyHz` | 50 Hz | `grid.ts:41` | Malaysian grid frequency |
| `IDLE_THRESHOLD_KW` | 0.01 kW | `grid.ts:45` | Power floor below which the connection is reported `Idle` |

No capacity or curtailment limit constant exists — the grid is modelled as unlimited (see Assumptions/Limitations).

## Engineering References

- **TNB (Tenaga Nasional Berhad) distribution practice / MS IEC 60038 standard voltages** — the 415 V three-phase, 50 Hz point-of-common-coupling spec is described in-code as "a Malaysian commercial low-voltage supply" per this convention (`grid.ts:33-37`). Genuine, code-cited reference to real utility practice for the project's Malaysian site.
- **IEEE 1547 Interconnection Standards** — named in `src/lib/knowledge/subsystems.ts`'s `UtilityGrid` entry as a related reference for grid interconnection. Not implemented in `grid.ts` itself (no interconnection protection, anti-islanding or ride-through logic exists in code) — treat as an **inferred/contextual reference** for the general engineering domain, not a code-cited implementation.

## Assumptions

- The grid has infinite capacity to supply or absorb power — no curtailment limit is enforced (`src/lib/knowledge/subsystems.ts`, `UtilityGrid.engineeringAssumptions`).
- No transmission/distribution losses are modelled between the site and the utility.
- The connection is always available — `'Offline'` is a declared state (see below) but never entered.

## Limitations

- **`'Offline'` is declared but never entered.** `GridOperatingState` includes `'Offline'` explicitly as "the seam a future outage / islanding mode will use, at which point the battery's reserve becomes the backup source" (`grid.ts:51-54`) — but no code path in `grid.ts` sets it.
- **No net-metering, tariff or carbon-intensity modelling yet.** `netMeteringEnabled` is pinned `false`, `tariffPeriod` is pinned `null`, `carbonIntensity` is pinned `null` — all declared as "FUTURE HOOKS... deliberately not simulated" (`grid.ts:73-80`).
- **No outage or islanding-frequency-control simulation** (`src/lib/knowledge/subsystems.ts`, `UtilityGrid.knownLimitations`).
- **Removing/disconnecting the grid changes no dispatch.** Per CLAUDE.md §11.5 and confirmed by this engine's own header comment: "the grid is the balancing component, so islanding reclassifies the residual the bus already settled — it never re-settles it" (`grid.ts:8-11`). An islanding feature would need to change PV/battery dispatch upstream in `buildingEnergy.ts`/`battery.ts`, not this file.
- No reactive power, voltage support or frequency regulation modelled.
- Energy accumulation (import/export kWh) is **not** owned here — it lives in `src/lib/engine/energyLedger.ts`, "the single authority for everything day-scoped" (`grid.ts:20-21`).

## Dependencies

- **Building Energy** — the sole input is `EnergyBusState`, read from `buildingEnergy.getBusState()` via `Simulation`; `GridEnergyEngine` performs no routing of its own (`grid.ts:13-26`). (Building Energy is not part of this doc batch — named in prose only.)
- Indirectly downstream of [Battery](./battery.md), since the bus's residual already reflects the battery's dispatch — but `GridEnergyEngine` never reads battery state directly.
- Indirectly downstream of [PV](./pv.md) generation, likewise only through the bus.

## Consumers

Confirmed via grep:

- `src/lib/engine/simulation.ts` — instantiates `GridEnergyEngine`, calls `this.grid.update(this.buildingEnergy.getBusState())` both at initial bootstrap (`simulation.ts:290`) and every environmental tick (`simulation.ts:388-391`); reads `grid.getState()` into `SimSnapshot.grid` (`simulation.ts:680`).
- `src/lib/engine/energyLedger.ts` — accumulates `gridImportKWh`/`gridExportKWh` and `peakImportKW` from the bus's `requiredGridImportKW`/`surplusKW` fields directly (`energyLedger.ts:230-234`), not from `GridEnergyEngine`'s own state — the ledger reads the same upstream bus values the grid engine classifies.
- `src/lib/ai/faultDetection/rules.ts` — `evaluateUtilityGrid()` (`rules.ts:420-446`) re-derives the full site power balance (`supplied = pvGeneration + import + batteryDischarge`, `consumed = buildingLoad + batteryCharge + export`) and flags a mismatch beyond `GRID_BALANCE_TOLERANCE_KW` (0.5 kW) or simultaneous import+export as findings.
- `src/lib/engine/pvEquipment.ts` — imports `GRID_CONNECTION` to build the static `GRID_SPEC` shown in the equipment UI (`pvEquipment.ts:26, 81-89`).
- `src/components/twin3d/ui/RooftopPvPanel.tsx` — renders `grid.state`, `grid.importKW`, `grid.exportKW`, `grid.reason` (`RooftopPvPanel.tsx:348-381`).
- `src/lib/prediction/*` — the bus's `gridKW`/residual terms flow through `PredictionContext`/projection, though `GridEnergyEngine` itself is not re-instantiated in the projection path (the projection reads the bus residual directly, per `projection.ts`'s pipeline comment: "... → settleBus → planStorage → grid").

## Public API

`GridEnergyEngine` (`grid.ts`):
- `update(bus: EnergyBusState): void`
- `getState(): GridState` (mutated in place — treat as read-only)

No constructor options — capacity is unlimited by design, so there is nothing to configure beyond the static `GRID_CONNECTION` spec.

## Live Outputs

`GridState` (`grid.ts:57-80`), returned by `getState()`:
```
importKW: number
exportKW: number
netKW: number                    // + importing / - exporting
state: 'Importing' | 'Exporting' | 'Idle' | 'Offline'
reason: string

connectionType: string
nominalVoltageV: number
frequencyHz: number

netMeteringEnabled: boolean      // pinned false
tariffPeriod: string | null      // pinned null
carbonIntensity: number | null   // pinned null
```

Exposed on `SimSnapshot.grid` (`simulation.ts:680`).

## Source Files

- `src/lib/engine/grid.ts`
- `src/lib/engine/buildingEnergy.ts` (`settleBus`, `EnergyBusState` — the actual settlement this engine projects)
- `src/lib/engine/simulation.ts` (orchestration)
- `src/lib/ai/faultDetection/rules.ts` (monitoring)
- `src/lib/engine/energyLedger.ts` (day-scoped accumulation)
- `src/lib/engine/pvEquipment.ts` (`GRID_SPEC`)
- `src/components/twin3d/ui/RooftopPvPanel.tsx` (UI)

## Design Rationale

- The engine performs **no routing arithmetic** by design: "because the grid is unlimited and unconditional, its import and export are already what the bus computed... re-deriving them here would create a second authority for the same two numbers and risk the two drifting apart" (`grid.ts:13-17`). This is the clearest instance of the project's single-source-of-truth rule (guide §6) applied to the energy chain — the grid engine's entire `update()` body is four `Math.max`/subtraction lines.
- `'Offline'` is declared now specifically as a documented seam for a future outage/islanding mode, so that feature will not require a new `GridOperatingState` union member later (`grid.ts:51-54`).
- Energy accumulation is deliberately kept out of this file and centralized in `energyLedger.ts`, avoiding a second place where "a kW becomes a kWh" (`grid.ts:20-21`, corroborated by `energyLedger.ts`'s own header comment).
- The grid being the "terminal node of the energy architecture" — "every other subsystem gets first refusal, and the grid takes the residual" (`grid.ts:8-11`) — is the architectural framing that makes CLAUDE.md §11.5's islanding note correct: disconnecting the grid does not change how PV/battery dispatch, only how the already-settled residual is subsequently labelled/handled.

## Future Extension Points

- Net-metering scheme (`netMeteringEnabled` hook already declared).
- Time-of-use tariff period tracking (`tariffPeriod` hook already declared).
- Grid carbon intensity reporting (`carbonIntensity` hook already declared) for financial/emissions analytics (CLAUDE.md §10 roadmap item).
- Outage/islanding simulation entering the declared but unused `'Offline'` state, which per the file's own header would make "the battery's reserve... the backup source" (`grid.ts:52-54`) — this would require new dispatch logic upstream in `buildingEnergy.ts`/`battery.ts`, not in this file.
- Grid interconnection protection / anti-islanding logic per IEEE 1547 (currently unimplemented).
