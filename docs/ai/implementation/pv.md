# Rooftop PV Chain — Array, Electrical, Inverter

**Subsystem ID:** RooftopPV / PVElectrical / PVInverter (pv.md covers all three)
**Version:** 1.0.0
**Last updated:** 2026-08-06

This document covers the three-stage rooftop PV chain as one pipeline, because that is how the Simulation loop drives them and how the Prediction/What-If layers re-project them: **array geometry → DC electrical → AC inverter**. Each stage is a separate engine/module with a single responsibility; none re-derives the other's arithmetic.

---

## Purpose

Model the rooftop solar plant end to end — from the physical position/orientation of each of the 189 PV modules on the roof, through the DC power each module produces from plane-of-array irradiance, to the AC power the plant actually delivers to the building's energy bus after inverter conversion and capacity clipping.

## Responsibilities

**RooftopPVEngine** (`src/lib/engine/pvArray.ts`)
- Generate the rooftop module layout (position, normal) from `BuildingConfig`, keeping the geometry the Solar Physics Engine evaluates identical to what the 3D visualizer renders.
- Own module pitch, tilt and the HVAC-plant keep-out clearance that shapes the array footprint.

**PVElectricalEngine** (`src/lib/engine/pvElectrical.ts`)
- Convert each module's plane-of-array (POA) irradiance (read from `SolarPhysicsEngine`) into DC power via a linear STC model.
- Aggregate module power into 9 series strings and into array-level DC metrics (installed capacity, current output, utilization).
- Hold (but not yet drive) per-module temperature/soiling/shading derate hooks.

**PVInverterEngine** (`src/lib/engine/pvInverter.ts`)
- Convert the array's total DC power into AC power at a fixed base efficiency.
- Enforce rated-capacity clipping and report the resulting operating state (`Offline` / `Standby` / `Producing` / `Clipping` / `Fault`).

## Inputs

| Stage | Input | Source |
|---|---|---|
| RooftopPVEngine | `BuildingConfig` (`width`, `depth`, `height`) | `src/lib/engine/types.ts`, building config |
| PVElectricalEngine | `PVModule[]` (id, worldPosition, normal) | `RooftopPVEngine.getModules()` |
| PVElectricalEngine | Per-module POA irradiance, W/m² | `SolarPhysicsEngine.getModuleEffectiveIrradiance(moduleId)` |
| PVInverterEngine | Array DC output, kW | `PVElectricalEngine.getArrayMetrics().currentOutputKW` |

## Outputs

| Stage | Output | Accessor |
|---|---|---|
| RooftopPVEngine | `PVModule[]` (id, worldPosition, normal) | `getModules()` |
| PVElectricalEngine | Installed capacity, current DC output, average module output, average irradiance, operating modules, utilization | `getArrayMetrics()` |
| PVInverterEngine | Rated capacity, current DC input, current AC output, conversion loss, current efficiency, operating state | `getMetrics()` |

## Internal Calculation Pipeline

### Stage 1 — Array geometry & POA irradiance (`pvArray.ts`)

`RooftopPVEngine.rebuild(building)` lays modules out on a fixed pitch grid:

- Module footprint: `PV_MODULE_W = 1.134` m, `PV_MODULE_H = 2.278` m (`pvArray.ts:3-4`).
- Row/column pitch: `pitchX = 1.15` m (module width + 16 mm clamp gap), `pitchZ = 2.5` m (inter-row shading/maintenance clearance) (`pvArray.ts:27-28`).
- A rectangular scan from `startX=-11.0` to `endX=11.0`, `startZ=-16.0` to `endZ=14.0` generates candidate points; points falling inside the central HVAC plant footprint (`width*0.42`/`depth*0.42` plus 1.0 m clearance) are skipped (`pvArray.ts:30-49`).
- The first 189 valid points are kept (`validPoints.slice(0, 189)`, `pvArray.ts:51`) — this is where the "189 modules" figure in the building spec is enforced structurally, not just declared.
- Fixed tilt: `PV_TILT_DEG = 0` (`pvArray.ts:6`). Module normal is computed as `nx=0, ny=cos(tilt), nz=-sin(tilt)` (`pvArray.ts:63-65`) — with zero tilt this reduces to straight up `(0, 1, 0)`.
- Actual plane-of-array irradiance per module is **not** computed in this file. It is computed by `SolarPhysicsEngine` (`src/lib/engine/solarPhysics.ts`) via the shared `planeIrradiance()` function and stored per module id; `RooftopPVEngine` only supplies geometry (position + normal) that `SolarPhysicsEngine` projects the sun vector against.

`planeIrradiance()` (`solarPhysics.ts:29-38`), the function that actually produces module irradiance consumed downstream:

```
diffuseSky = ghi * DIFFUSE_SKY_FRACTION
direct = isDaytime ? ghi * cosProjection * visibility : 0
effectiveIrradiance = round(direct + diffuseSky)
```

`SolarPhysicsEngine.getModuleEffectiveIrradiance(moduleId)` (`solarPhysics.ts:142`) is the read-only accessor `PVElectricalEngine` calls per module.

### Stage 2 — DC electrical (`pvElectrical.ts`)

`PVElectricalEngine.rebuild(modules)`:
- Initializes one `PVModuleElectricalState` per module with `ratedPower = PV_MODULE_RATED_POWER_W = 550` (`pvElectrical.ts:30, 91`) and derate hooks pinned to `1.0` (`pvElectrical.ts:94-96`).
- Wires modules into 9 series strings of 21 modules each — `modulesPerString = 21` — with any remainder forming a final short string (`pvElectrical.ts:100-125`). For the built 189-module array this divides evenly: `189 / 21 = 9` full strings.
- Computes `installedCapacityKW = (modules.length * 550) / 1000` (`pvElectrical.ts:129`) — for 189 modules this is **103.95 kW DC**, not the 104.02 kW DC the equipment spec/report states (see Constants and Limitations below).

`PVElectricalEngine.update(modules, solarPhysics)` (`pvElectrical.ts:132-175`), called once per environmental tick from `Simulation.tick()` (`simulation.ts:373`):
- For each module, reads `solarPhysics.getModuleEffectiveIrradiance(mod.id)` and computes DC power via `moduleDcPowerW()`.
- Sums per-string power, then array totals: `currentOutputKW`, `averageModuleOutputW` (over active modules), `averageIrradianceW` (over all modules), `utilization = currentOutputKW / installedCapacityKW * 100`.

`moduleDcPowerW()` (`pvElectrical.ts:45-58`) — the single authority for one module's DC output, exported as a **pure function** specifically so the Prediction Engine can reuse the identical curve (guide §11.1, "it re-uses the engines' physics; it never re-implements it"):

```
power = (irradianceWm2 / PV_STC_IRRADIANCE_WM2) * ratedPowerW
power = clamp(power, 0, ratedPowerW)
return power * temperatureFactor * soilingFactor * shadingFactor
```

This is a **linear Standard Test Conditions (STC) model** — power scales proportionally with irradiance relative to the 1000 W/m² STC reference, is floored at 0 and capped at nameplate rating, with three multiplicative derate hooks applied afterward. There is no panel-area term and no temperature-dependent efficiency curve in the arithmetic itself (see Limitations).

### Stage 3 — DC → AC inversion (`pvInverter.ts`)

`PVInverterEngine.update(electrical)` (`pvInverter.ts:106-115`), called immediately after `pvElectrical.update()` each tick (`simulation.ts:373-374`):
- Reads `electrical.getArrayMetrics().currentOutputKW` as `dcInputKW`.
- Delegates the actual conversion to `convertDcToAc()`.

`convertDcToAc()` (`pvInverter.ts:30-69`) — the single authority for the power-electronics model, also exported as a pure function for the Prediction Engine:

```
if dcInputKW <= INVERTER_STANDBY_KW (0.05 kW):
    acKW = 0
    lossKW = dcInputKW
    efficiency = 0
    state = dcInputKW > INVERTER_OFFLINE_KW (0.01 kW) ? 'Standby' : 'Offline'
else:
    theoreticalACPower = dcInputKW * baseEfficiency        // baseEfficiency = 0.98
    if theoreticalACPower > ratedCapacityKW (80 kW):
        acKW = ratedCapacityKW
        lossKW = dcInputKW - ratedCapacityKW
        efficiency = ratedCapacityKW / dcInputKW
        state = 'Clipping'
    else:
        acKW = theoreticalACPower
        lossKW = dcInputKW - theoreticalACPower
        efficiency = baseEfficiency
        state = 'Producing'
```

`'Fault'` is a declared `InverterState` value never entered by this logic — reserved for a future fault-injection path.

## Engineering Equations

All transcribed verbatim from source, not paraphrased.

**Plane-of-array irradiance** (`solarPhysics.ts:29-38`):
```
diffuseSky = ghi * DIFFUSE_SKY_FRACTION
direct = isDaytime ? ghi * cosProjection * visibility : 0
effectiveIrradiance = round(direct + diffuseSky)
```

**Module DC power** (`pvElectrical.ts:45-58`):
```
power = (irradianceWm2 / PV_STC_IRRADIANCE_WM2) * ratedPowerW
power = clamp(power, 0, ratedPowerW)
result = power * temperatureFactor * soilingFactor * shadingFactor
```

**Array installed capacity** (`pvElectrical.ts:129`):
```
installedCapacityKW = (modules.length * 550) / 1000
```

**Array utilization** (`pvElectrical.ts:174`):
```
utilization = installedCapacityKW > 0 ? (currentOutputKW / installedCapacityKW) * 100 : 0
```

**DC → AC conversion / clipping** (`pvInverter.ts:30-69`), see pipeline above for the full branch structure. Core relations:
```
theoreticalACPower = dcInputKW * baseEfficiency
acKW = min(theoreticalACPower, ratedCapacityKW)
lossKW = dcInputKW - acKW
efficiency = (theoreticalACPower > ratedCapacityKW) ? ratedCapacityKW / dcInputKW : baseEfficiency
```

## Constants

| Constant | Value | File | Note |
|---|---|---|---|
| `PV_MODULE_W` | 1.134 m | `pvArray.ts:3` | Module width, geometry only |
| `PV_MODULE_H` | 2.278 m | `pvArray.ts:4` | Module height, geometry only |
| `PV_MODULE_THICKNESS` | 0.035 m | `pvArray.ts:5` | Visualization only |
| `PV_TILT_DEG` | 0 | `pvArray.ts:6` | Fixed-tilt array |
| `pitchX` | 1.15 m | `pvArray.ts:27` | Module width + 16 mm clamp gap |
| `pitchZ` | 2.5 m | `pvArray.ts:28` | Inter-row shading/maintenance clearance |
| Module count | 189 | `pvArray.ts:51` | `validPoints.slice(0, 189)` — matches CLAUDE.md §7 |
| `PV_MODULE_RATED_POWER_W` | 550 W | `pvElectrical.ts:30` | LONGi LR5-72HBD 550M nameplate — matches CLAUDE.md §7 |
| `PV_STC_IRRADIANCE_WM2` | 1000 W/m² | `pvElectrical.ts:33` | Standard Test Conditions reference |
| `modulesPerString` | 21 | `pvElectrical.ts:102` | 189 ÷ 21 = 9 full strings |
| Installed capacity (computed) | 103.95 kW DC | `pvElectrical.ts:127-129` | `189 × 550 W / 1000` |
| Installed capacity (report/spec) | 104.02 kW DC | `pvEquipment.ts:45,92` (`NAMEPLATE_DC_KW`) | **Discrepancy, see Limitations** |
| `INVERTER_RATED_CAPACITY_KW` | 80 kW | `pvInverter.ts:6` | Huawei SUN2000-80KTL-M1 — matches CLAUDE.md §7 and `pvEquipment.ts` `NAMEPLATE_AC_KW` |
| `INVERTER_BASE_EFFICIENCY` | 0.98 (98%) | `pvInverter.ts:8` | Matches `PV_INVERTER_SPEC` nominal efficiency in `pvEquipment.ts:56` |
| `INVERTER_OFFLINE_KW` | 0.01 kW | `pvInverter.ts:10` | Below this: `Offline` |
| `INVERTER_STANDBY_KW` | 0.05 kW (50 W) | `pvInverter.ts:12` | Below this: `Standby`/`Offline` |

## Engineering References

- **Standard Test Conditions (STC)** — `PV_STC_IRRADIANCE_WM2 = 1000 W/m²` is the industry-standard STC irradiance reference the linear power model is anchored to; genuine, code-cited convention (`pvElectrical.ts:32-33`).
- **LONGi LR5-72HBD 550M datasheet** — `PV_MODULE_RATED_POWER_W = 550` is transcribed from this module's nameplate rating (`pvElectrical.ts:29-30`, `pvEquipment.ts:38-47`). Genuine reference — code comment names the model explicitly.
- **Huawei SUN2000-80KTL-M1 datasheet** — `INVERTER_RATED_CAPACITY_KW = 80` and the equipment spec block are transcribed from this inverter's nameplate (`pvInverter.ts:5-6`, `pvEquipment.ts:50-58`). Genuine reference.
- **NOCT / cell-temperature derating models** (e.g. the `T_cell = T_ambient + (POA/800)*(NOCT-20)` style formula shown in `src/lib/knowledge/subsystems.ts`'s `PVElectrical` entry) — **not implemented in `pvElectrical.ts`**. The knowledge-base entry's equations describe a temperature-derated model that the code does not contain; treat that entry as an *inferred/aspirational* reference, not a code-cited one. See Limitations.
- **Bypass-diode / partial-shading IV-curve modelling** — not implemented; `src/lib/knowledge/subsystems.ts`'s `PVElectrical.knownLimitations` already states this.

## Assumptions

- Panels are fixed-tilt (`PV_TILT_DEG = 0`) and uniformly oriented; no row-to-row self-shading is geometrically modelled beyond the `pitchZ` spacing choice.
- Maximum Power Point Tracking (MPPT) is implicit/ideal — the linear STC model has no voltage/current curve, so there is no MPPT behaviour to model separately.
- All 189 modules are assumed electrically identical and always `'Online'` (`status` field is set once at `rebuild()` and never changed elsewhere in the read files).
- Inverter base efficiency (98%) is a constant, not a partial-load efficiency curve.
- `'Fault'` inverter state exists in the type but no code path enters it — treated as a future hook.

## Limitations

- **No temperature derating is actually applied.** `temperatureFactor`, `soilingFactor`, `shadingFactor` are declared as "future hooks" (`pvElectrical.ts:14-17`) and are hard-set to `1.0` in `rebuild()` (`pvElectrical.ts:94-96`) and never modified elsewhere in `pvElectrical.ts`. The knowledge-base summary's NOCT/temperature-coefficient equations do not exist in code today.
- **Installed capacity discrepancy**, explicitly flagged in both source files: the module arithmetic gives `189 × 550 W = 103,950 W = 103.95 kW DC` (`pvElectrical.ts:127-129`), while the project report / equipment spec states **104.02 kW DC** (`pvEquipment.ts:15-22,45,92`, a documented 0.07 kW / 0.07% difference). The live "Installed Capacity" telemetry always comes from `PVElectricalEngine`'s computed figure; `NAMEPLATE_DC_KW` (104.02) is shown separately in the spec block and neither value is silently adjusted to match the other.
- No bypass-diode activation or partial-shading IV-curve modelling (module power responds to irradiance uniformly; occlusion enters only through the per-module irradiance value itself).
- No panel soiling loss is geometrically modelled (hook exists, unused).
- Inverter efficiency is a constant average, not a dynamic partial-load curve; no reactive power (VAR) support or grid voltage stabilization is modelled (per `subsystems.ts`'s `PVInverter.knownLimitations`).
- No module-level mismatch modelling; all modules in a string are assumed to perform identically.

## Dependencies

- **Solar Physics** — `SolarPhysicsEngine.getModuleEffectiveIrradiance(moduleId)` and the `planeIrradiance()` function it wraps supply per-module POA irradiance to `PVElectricalEngine`. (Not part of this batch; named in prose only.)
- `PVElectricalEngine` depends on `RooftopPVEngine.getModules()` for geometry.
- `PVInverterEngine` depends on `PVElectricalEngine.getArrayMetrics()`.
- No dependency on Battery or Grid — the PV chain's output (`invCurrentACOutput`) feeds *into* the Building Energy Bus, which then routes to [Battery](./battery.md) and [Grid](./grid.md); the PV chain itself reads nothing from either.

## Consumers

Confirmed via grep across the codebase:

- `src/lib/engine/simulation.ts` — owns and ticks all three engines (`pvArray`, `pvElectrical`, `pvInverter`); feeds `pvInverter.getMetrics().currentACPowerKW` into `buildingEnergy` (bus generation) and into `predictionContext()`/`snapshot()`.
- `src/lib/engine/pvEquipment.ts` — imports `BATTERY_CAPACITY_KWH`/`GRID_CONNECTION` (not PV) but declares the static `PV_MODULE_SPEC`/`PV_INVERTER_SPEC`/`NAMEPLATE_DC_KW`/`NAMEPLATE_AC_KW` shown alongside live PV telemetry in the UI.
- `src/lib/prediction/projection.ts` — imports and calls `moduleDcPowerW()` and `convertDcToAc()` directly to project future DC/AC output (`projection.ts:42-43,252-256`), reusing the exact same curves rather than approximating them.
- `src/lib/prediction/types.ts`, `insights.ts` — carry PV-derived fields through `PredictionContext`/`PredictionReport`.
- `src/lib/engine/dailyEnergyBootstrap.ts` — reads PV/inverter metrics to seed the daily energy ledger.
- `src/lib/ai/faultDetection/rules.ts` — `evaluateRooftopPV()` and `evaluatePVInverter()` re-derive expected DC yield from `pvAverageIrradiance`/`pvInstalledCapacity` and compare against `pvCurrentDCOutput`/`invEfficiency` (`rules.ts:290-345`).
- `src/components/twin3d/ui/RooftopPvPanel.tsx` — UI panel rendering `pvCurrentDCOutput`, `pvInstalledCapacity`, `pvUtilization`, `invCurrentACOutput`, `invRatedCapacityKW`.

## Public API

`RooftopPVEngine` (`pvArray.ts`):
- `constructor(building: BuildingConfig)`
- `rebuild(building: BuildingConfig): void`
- `getModules(): PVModule[]`

`PVElectricalEngine` (`pvElectrical.ts`):
- `constructor(modules: PVModule[])`
- `rebuild(modules: PVModule[]): void`
- `update(modules: PVModule[], solarPhysics: SolarPhysicsEngine): void`
- `getArrayMetrics(): { installedCapacityKW, currentOutputKW, averageModuleOutputW, averageIrradianceW, operatingModules, utilization }`
- Pure function: `moduleDcPowerW(irradianceWm2, ratedPowerW?, temperatureFactor?, soilingFactor?, shadingFactor?): number`

`PVInverterEngine` (`pvInverter.ts`):
- `constructor(ratedCapacityKW?, baseEfficiency?)`
- `getBaseEfficiency(): number`
- `update(electrical: PVElectricalEngine): void`
- `getMetrics(): { ratedCapacityKW, currentDCPowerKW, currentACPowerKW, conversionLossKW, currentEfficiency, operatingState }`
- Pure function: `convertDcToAc(dcInputKW, ratedCapacityKW?, baseEfficiency?): InverterConversion`

## Live Outputs

Fields on `SimSnapshot` (per `simulation.ts` `snapshot()`, lines 682-694):
- `pvStatus: 'Online'`
- `pvAverageIrradiance: number` (W/m², rounded)
- `pvInstalledCapacity: number` (kW)
- `pvCurrentDCOutput: number` (kW)
- `pvAverageModuleOutput: number` (W)
- `pvOperatingModules: number`
- `pvUtilization: number` (%)
- `invRatedCapacityKW: number`
- `invCurrentDCOutput: number`
- `invCurrentACOutput: number`
- `invEfficiency: number`
- `invConversionLossKW: number`
- `invOperatingState: InverterState`

Also exposed on `PredictionContext` (`prediction/types.ts`): `pvModules: PVModule[]`, `inverterRatedKW: number`, `inverterBaseEfficiency: number`.

## Source Files

- `src/lib/engine/pvArray.ts`
- `src/lib/engine/pvElectrical.ts`
- `src/lib/engine/pvInverter.ts`
- `src/lib/engine/pvEquipment.ts`
- `src/lib/engine/solarPhysics.ts` (irradiance dependency, not owned by this chain)
- `src/lib/engine/simulation.ts` (orchestration)
- `src/lib/prediction/projection.ts` (reuse)
- `src/lib/ai/faultDetection/rules.ts` (monitoring)
- `src/components/twin3d/ui/RooftopPvPanel.tsx` (UI)

## Design Rationale

- `RooftopPVEngine` exists specifically so "the Solar Physics Engine evaluates the exact same module layout that the 3D visualizer renders" (`pvArray.ts:9-13`) — geometry has one authority.
- `moduleDcPowerW()` and `convertDcToAc()` are exported as pure functions explicitly so the Prediction Engine can project future generation "through exactly the same conversion the live inverter performs rather than approximating it" (`pvInverter.ts:24-29`) and so "re-deriving the same curve there would put two PV models in the codebase (guide §6, no duplicated calculations)" (`pvElectrical.ts:41-44`) — this is the project's single-source-of-truth rule made concrete.
- Derate hooks (`temperatureFactor`, `soilingFactor`, `shadingFactor`) are declared now, pinned at 1.0, so a future thermal/soiling model has a seam to plug into without touching the array/inverter arithmetic (`pvElectrical.ts:14-18`).
- `pvEquipment.ts` is deliberately a separate, pure-data module rather than an addition to `pvArray.ts`/`pvInverter.ts`, so nameplate *specification* (procured equipment) stays visibly distinct from live *telemetry* (simulated output) — "exactly as a real monitoring platform does" (`pvEquipment.ts:1-23`).
- The 103.95 vs 104.02 kW DC discrepancy is intentionally surfaced rather than reconciled — both values are shown, labelled by source, following "the same nominal-vs-as-built convention the adaptive façade already uses" (`pvEquipment.ts:14-23`).

## Future Extension Points

- Wire `temperatureFactor` to an actual NOCT/cell-temperature derating model (hook already exists in `moduleDcPowerW`'s signature).
- Wire `soilingFactor` to a soiling/cleaning schedule.
- Wire `shadingFactor` to a partial-shading/bypass-diode model (currently only whole-module occlusion is modelled via irradiance).
- Dynamic (partial-load) inverter efficiency curve instead of a constant `INVERTER_BASE_EFFICIENCY`.
- `'Fault'` inverter state currently unreachable — a fault-injection path could drive it.
- Row-to-row self-shading calculation (currently only spatial pitch, no ray-cast between rows).
