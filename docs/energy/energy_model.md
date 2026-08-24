# Rooftop PV, Building Energy & Microgrid Settlement

I built the Energy layer as the settlement point of the Digital Twin — the place where a solar irradiance number finally turns into kilowatts flowing between a PV array, a building, a battery and the utility grid. Everything upstream of it (solar geometry, the façade) produces physics; everything in this layer produces an energy balance that has to close exactly, every tick, at any playback speed or scrub position.

Source: [`src/lib/engine/pvElectrical.ts`](../../src/lib/engine/pvElectrical.ts), [`pvInverter.ts`](../../src/lib/engine/pvInverter.ts), [`pvArray.ts`](../../src/lib/engine/pvArray.ts), [`pvEquipment.ts`](../../src/lib/engine/pvEquipment.ts), [`buildingEnergy.ts`](../../src/lib/engine/buildingEnergy.ts), [`battery.ts`](../../src/lib/engine/battery.ts), [`grid.ts`](../../src/lib/engine/grid.ts), [`energyLedger.ts`](../../src/lib/engine/energyLedger.ts), [`dailyEnergyBootstrap.ts`](../../src/lib/engine/dailyEnergyBootstrap.ts).

## Purpose

Six engines, one settlement:

| Engine | Owns |
|---|---|
| `PVElectricalEngine` | Plane-of-array irradiance → per-module DC power → string/array aggregation |
| `PVInverterEngine` | DC → AC conversion, rated-capacity clipping |
| `BuildingEnergyEngine` | The five load categories, occupancy scheduling, HVAC thermal lag, and the AC bus settlement itself |
| `BatteryEnergyEngine` | State of charge, charge/discharge dispatch, the `StoragePort` the bus calls into |
| `GridEnergyEngine` | Classifying the bus's already-settled residual as import/export — no dispatch of its own |
| `DailyEnergyLedger` | Integrating every bus flow into a day's kWh, immune to scrubbing or replay |

Each is pure and framework-free where it can be (`moduleDcPowerW`, `convertDcToAc`, `categoryDemandKW`/`buildingDemandKW`, `settleBus`, `planStorage` are all exported standalone functions), which is what lets the AI Prediction layer (`src/lib/prediction/`) project the same physics forward without a second implementation — see CLAUDE.md §11.1.

## Inputs

| Input | From | Consumed by |
|---|---|---|
| Per-module effective irradiance, W/m² | `SolarPhysicsEngine.getModuleEffectiveIrradiance()` | `PVElectricalEngine` |
| PV array DC output, kW | `PVElectricalEngine` | `PVInverterEngine` |
| Inverter AC output, kW | `PVInverterEngine.getMetrics().currentACPowerKW` | `BuildingEnergyEngine` (as `pvACOutputKW`) |
| Time of day, outdoor dry-bulb °C | `Simulation` clock / `weather.ts` | `BuildingEnergyEngine` (occupancy schedule, HVAC response) |
| Façade-driven solar cooling load, electrical kW | `BuildingThermalEngine.getState().coolingLoadKW` | `BuildingEnergyEngine` (added to the HVAC category) |
| Façade-driven artificial lighting demand, electrical kW | `BuildingLightingEngine.getState().lightingElectricalKW` | `BuildingEnergyEngine` (added to the Lighting category) |
| Simulated elapsed seconds (`dtSimSeconds`) | `Simulation.energyStepSimSeconds()` | HVAC lag, battery integration, daily ledger — the one shared step every lagged integrator advances by |
| Settled bus (`EnergyBusState`) | `BuildingEnergyEngine.getBusState()` | `GridEnergyEngine`, `DailyEnergyLedger` |

The thermal and lighting additions arrive already converted to electrical kW by their owning engines — `buildingEnergy.ts` adds them straight onto the HVAC/Lighting categories with no further conversion. See [Building Thermal & Lighting](../building-physics/thermal_and_daylighting.md) for how those two numbers are produced, and [PBIF & Adaptive Façade Kinematics](../facade/pbif_and_kinematics.md) for the blade motion that ultimately drives `facadeSolarGainKW`.

## Processing & equations

### 1. PV array — DC generation (`pvElectrical.ts`)

One module's DC power is a linear STC (Standard Test Conditions) model, anchored at 1000 W/m²:

```
power = clamp( irradiance / 1000 × ratedPowerW, 0, ratedPowerW )
       × temperatureFactor × soilingFactor × shadingFactor
```

`moduleDcPowerW()` is the single authority for this curve — the Prediction Engine projects future generation through the same function rather than re-deriving it. `ratedPowerW` defaults to `PV_MODULE_RATED_POWER_W = 550` (the LONGi LR5-72HBD 550M's nameplate). `temperatureFactor`, `soilingFactor` and `shadingFactor` are each declared per-module and multiplied in, but every module is initialised to `1.0` in `rebuild()` and nothing in the codebase currently writes a different value — there is no NOCT/cell-temperature derating and no soiling model behind these hooks yet. I built them as multiplicative slots specifically so a future thermal or soiling model plugs in without touching this equation, not because the twin is currently applying one.

Irradiance itself is not re-derived here — `PVElectricalEngine.update()` reads `SolarPhysicsEngine.getModuleEffectiveIrradiance(moduleId)` per module, the same `planeIrradiance()` output the adaptive façade panels use:

```
effectiveIrradiance = round( ghi × cosIncidence × shadingFactor )                 [daytime]
                     + round( ghi × DIFFUSE_SKY_FRACTION )                        [always]
```

with `shadingFactor` fixed at `1.0` for the roof array — `solarPhysics.ts` explicitly stages this as a future self-/neighbour-shading hook (`futureShadingFactor`) and leaves it unused for now, unlike the façade panels, which do run a real neighbour-occlusion ray test.

**Wiring.** 189 modules are wired into 9 strings of 21 modules each (`modulesPerString = 21`; 189 ÷ 21 = 9 exactly, no partial string). Array power is the sum of every module's `moduleDcPowerW()`; string power is the sum of its 21 members'.

**Installed capacity.** `189 × 550 W = 103,950 W = 103.95 kW DC` is what the module arithmetic actually produces and is what `PVElectricalEngine.getArrayMetrics().installedCapacityKW` reports live. The project report's nameplate figure is `104.02 kW DC` (`NAMEPLATE_DC_KW` in `pvEquipment.ts`) — a 0.07 kW (0.07%) difference the code calls out explicitly rather than silently reconciling; the equipment-spec panel shows the report's number, the live telemetry shows the array's.

### 2. PV inverter — AC conversion & clipping (`pvInverter.ts`)

`convertDcToAc()` is the single authority for the power-electronics model:

```
if dcInputKW ≤ INVERTER_STANDBY_KW (0.05 kW):
    acKW = 0, state = dcInputKW > INVERTER_OFFLINE_KW (0.01 kW) ? 'Standby' : 'Offline'

theoreticalACPower = dcInputKW × INVERTER_BASE_EFFICIENCY   (0.98)

if theoreticalACPower > INVERTER_RATED_CAPACITY_KW (80 kW):
    acKW = 80, lossKW = dcInputKW − 80, efficiency = 80 / dcInputKW, state = 'Clipping'
else:
    acKW = theoreticalACPower, lossKW = dcInputKW − acKW, efficiency = 0.98, state = 'Producing'
```

The rated 80 kW AC comes from `INVERTER_RATED_CAPACITY_KW`, matching the Huawei SUN2000-80KTL-M1's nameplate; `INVERTER_BASE_EFFICIENCY = 0.98` is the inverter's flat conversion efficiency (no partial-load or temperature derating curve — a stated simplification, not a hidden one; the comment `// Future: hook in partial load and temperature derating here` marks exactly where that would go).

Because the array's DC capacity (103.95 kW) sits well above the inverter's AC rating (80 kW) — a DC:AC ratio of about 1.30 — clipping is a real, reachable state: the theoretical AC output crosses 80 kW once DC input exceeds `80 / 0.98 ≈ 81.63 kW`, which at this linear irradiance model corresponds to array-average effective irradiance around 785 W/m² (`81.63 / 103.95 × 1000`). That is a mid-morning-to-afternoon condition on a clear day in Kuala Lumpur, not an edge case, so `'Clipping'` is a state the live twin actually enters.

### 3. Building demand — the five load categories (`buildingEnergy.ts`)

Each category is a peak power density (W/m² of gross floor area) times an occupancy-interpolated duty fraction, times an HVAC weather multiplier for the one weather-sensitive category:

```
grossFloorArea = width × depth × max(1, floorCount)          # 25 × 40 × 5 = 5,000 m² (default config)

dutyFraction    = nightFraction + (1 − nightFraction) × occupancy
weather         = weatherSensitive ? hvacFactor : 1
categoryKW      = peakDensity × floorAreaM2 × dutyFraction × weather / 1000
```

`occupancyFraction(hours)` is a smoothstepped weekday profile — arrival ramp, a lunch dip, a departure ramp — never a step function, so the load curve is C¹-continuous and the energy balance never has a discontinuity at a schedule edge:

```
arrived = smoothstep(6.5, 8.5, h)
left    = 1 − smoothstep(17, 19.5, h)
lunch   = 1 − 0.25 × bump(h, 12, 13.5)
occupancy = clamp(arrived × left × lunch)
```

`hvacDemandFactor(outdoorTempC)` is the equilibrium cooling-demand multiplier — a degree-hour approximation between a balance point and a design condition:

```
excess = smoothstep(24°C, 34°C, outdoorTempC)
hvacFactor = 0.55 + (1 − 0.55) × excess
```

The **live** engine never jumps straight to this equilibrium value — it approaches it through a first-order exponential lag with a 15-simulated-minute time constant, so the HVAC term doesn't track weather noise directly:

```
alpha = 1 − exp(−dtSimSeconds / 900)
hvacFactor += (targetHvacFactor − hvacFactor) × alpha
```

(`dtSimSeconds ≤ 0` snaps straight to target — initialisation or a timeline scrub produces no startup transient.) The Prediction Engine's forward projection reads the equilibrium `hvacDemandFactor()` directly rather than integrating this lag hour-by-hour, since the 15-minute time constant is negligible over a 1–12 hour horizon — the same simplification `BuildingThermalEngine`'s `equilibriumThermalState` makes (CLAUDE.md §11.2, §11.5).

The façade's two additions — `solarCoolingLoadKW` from `BuildingThermalEngine` and `artificialLightingKW` from `BuildingLightingEngine` — are added straight onto the HVAC and Lighting categories' occupancy-driven baselines, clamped non-negative, with no further scaling:

```
hvacKW     = categoryKW('hvac')     + max(0, solarCoolingLoadKW)
lightingKW = categoryKW('lighting') + max(0, artificialLightingKW)
totalKW    = Σ all five categories, with the two additions folded in
```

`buildingDemandKW()` is the pure, standalone version of this same arithmetic (`hvacFactor` passed in rather than derived) — used identically by the live BEMS and by the Prediction/bootstrap projections, so there is exactly one load model in the codebase.

### 4. The Building Energy Bus — settlement (`settleBus`, in `buildingEnergy.ts`)

The bus is the single AC node PV, storage, load and the grid all connect to. Settlement runs in strict priority order and is written as one pure function so the routing logic exists exactly once:

```
generation = max(0, pvACOutputKW)
load       = max(0, totalDemandKW)

pvToLoad   = min(generation, load)          # 1. PV serves the load directly
pvSurplus  = generation − pvToLoad
deficit    = load − pvToLoad

charge     = clamp(dispatch.chargeKW,    0, pvSurplus)   # 2. surplus offered to storage
discharge  = clamp(dispatch.dischargeKW, 0, deficit)      # 3. deficit offered to storage

selfConsumptionKW    = pvToLoad + charge
surplusKW            = pvSurplus − charge                 # 4. uncommitted generation → grid export
requiredGridImportKW = deficit  − discharge                # 4. uncovered demand → grid import
gridKW               = requiredGridImportKW − surplusKW    # at most one term is ever non-zero
```

Conservation the caller may assert at every tick:

```
generation = pvToLoad + batteryCharge + surplus
load       = pvToLoad + batteryDischarge + requiredGridImport
```

`storage.dispatch(surplus, deficit, dtSimSeconds)` is offered the **PV-only** imbalance — before any grid involvement — through the `StoragePort` interface, so `buildingEnergy.ts` never imports `BatteryEnergyEngine` directly; it knows there is *a* store, never which one. The dispatch it gets back is clamped to the imbalance it was offered (`clamp(dispatch.chargeKW, 0, pvSurplus)`), so a misbehaving storage implementation can never break the bus's conservation.

### 5. Battery dispatch (`battery.ts`, `planStorage`)

`planStorage()` is the single authority for one charge/discharge step, called identically by the live `BatteryEnergyEngine.dispatch()` and by the Prediction Engine's forward state-of-charge walk:

```
CHARGE (surplusKW > 0):
    headroomKWh   = max(0, capacityKWh − storedKWh)
    headroomLimit = headroomKWh / (chargeEfficiency × dtHours)
    chargeKW      = min(surplusKW, maxPowerKW, headroomLimit)
    storedKWh    += chargeKW × chargeEfficiency × dtHours

DISCHARGE (deficitKW > 0):
    reserveKWh    = capacityKWh × reserveFraction
    availableKWh  = max(0, storedKWh − reserveKWh)
    availableLimit = availableKWh × dischargeEfficiency / dtHours
    dischargeKW   = min(deficitKW, maxPowerKW, availableLimit)
    storedKWh    -= (dischargeKW / dischargeEfficiency) × dtHours
```

Charging is bounded by power *and* remaining headroom; discharging is bounded by power *and* the reserve floor. Exactly one direction is ever non-zero, because the bus only ever offers a surplus or a deficit, never both. `dtHours ≤ 0` (a paused or scrubbed clock) holds the state exactly where it is and reports `state: 'Idle'` with `reason: null` — the engine keeps the last real explanation rather than overwriting it with a placeholder.

Below `IDLE_THRESHOLD_KW` (0.01 kW) in either direction the engine reports `Idle` with a plain-language reason rather than a near-zero power figure — including the honest case for this building's sizing: `"Holding at 10% reserve — no PV surplus available to recharge."` when the deficit can't be met and there is nothing to draw on.

### 6. Utility grid — classification, not dispatch (`grid.ts`)

`GridEnergyEngine.update(bus)` performs **no arithmetic of its own** beyond reading two numbers the bus already settled and labelling them:

```
importKW = max(0, bus.requiredGridImportKW)
exportKW = max(0, bus.surplusKW)
netKW    = importKW − exportKW
```

This is what CLAUDE.md §11.5 means by "removing the grid changes no dispatch": `requiredGridImportKW` and `surplusKW` are fields on `EnergyBusState`, computed entirely inside `settleBus()` — before `GridEnergyEngine.update()` is ever called, and with no reference to it. Concretely, in `simulation.ts`, `this.buildingEnergy.update(...)` settles the bus first; `this.grid.update(bus)` runs immediately after and only reads it. If the grid engine's `update()` call were removed from the tick loop entirely, the bus's residual would be numerically identical — nothing in `settleBus` or `planStorage` consults `GridEnergyEngine` or asks whether a grid connection exists. Islanding the site would change how that residual gets *interpreted* (an uncovered deficit becomes a shortfall rather than an import), not how it gets *computed*.

### 7. Daily energy ledger — bucketed integration (`energyLedger.ts`)

The ledger integrates six flows (`pvGenerationKWh`, `buildingConsumptionKWh`, `batteryChargeKWh`, `batteryDischargeKWh`, `gridImportKWh`, `gridExportKWh`) plus two daily peaks (`peakImportKW`, `peakExportKW`) from the settled bus. Because the twin's clock can be scrubbed, rewound or replayed, a running accumulator would double-count any interval revisited — so the ledger instead holds a fixed grid of `BUCKETS_PER_DAY = 24 / BUCKET_HOURS` one-simulated-second buckets (`BUCKET_HOURS = 1/3600`) and *overwrites* a bucket the first time the clock re-enters it after having left, while continuing to sum within it as playback moves forward. Displayed totals are `recompute()`'d as the sum of every bucket from `00:00` up to the clock's current position — literally the integral of bus power from day-start to "now" — so a rewind shrinks the total exactly as far as it should and a replay reproduces the same number.

A day rollover (`delta < 0` when the new `timeHours` is behind the last one) zeroes the whole grid and increments `dayCount`, crediting the wrapped sliver to the new day.

**Cold-start reconstruction.** A session opening mid-day has never ticked through `00:00`–"now", so `dailyEnergyBootstrap.ts` walks the twin's own `projectAt()` physics forward from midnight in 5-simulated-minute steps (`BOOTSTRAP_STEP_HOURS = 1/12`), feeding each step's bus into `ledger.writeHistorical()` before the first live tick runs. It reuses exactly the projection the AI Prediction layer uses forward-looking, with the same stated simplifications (façade openness pinned at its current measured mean, thermal lag read at equilibrium, weather sampled from whichever timeline is active) — nothing here is a second model, and nothing is averaged or estimated; every reconstructed instant is a real evaluation of the twin's physics at that hour.

## Constants

| Constant | Value | Source | Meaning |
|---|---|---|---|
| `PV_MODULE_RATED_POWER_W` | 550 W | `pvElectrical.ts` | LONGi LR5-72HBD 550M nameplate DC power |
| `PV_STC_IRRADIANCE_WM2` | 1000 W/m² | `pvElectrical.ts` | STC anchor for the linear DC power model |
| Modules / strings | 189 modules, 21/string → 9 strings | `pvElectrical.ts` | Array wiring; 189 ÷ 21 = 9 exactly |
| Installed capacity (as-built) | 103.95 kW DC | `pvElectrical.ts` (189 × 550 W) | Live telemetry authority |
| `NAMEPLATE_DC_KW` | 104.02 kW DC | `pvEquipment.ts` | Report specification, 0.07 kW above the as-built figure |
| `INVERTER_RATED_CAPACITY_KW` | 80 kW AC | `pvInverter.ts` | Huawei SUN2000-80KTL-M1 nameplate |
| `INVERTER_BASE_EFFICIENCY` | 0.98 | `pvInverter.ts` | Flat conversion efficiency, no partial-load curve |
| `INVERTER_STANDBY_KW` / `INVERTER_OFFLINE_KW` | 0.05 / 0.01 kW | `pvInverter.ts` | Below these, the inverter idles/is off rather than converting |
| `LOAD_CATEGORIES` peak densities | HVAC 22, Lighting 3, Equipment 7, Elevators 2, Services 3 W/m² (37 W/m² total) | `buildingEnergy.ts` | Peak electrical demand per category, at full occupancy |
| `LOAD_CATEGORIES` night fractions | HVAC 0.15, Lighting 0.10, Equipment 0.25, Elevators 0.05, Services 0.55 | `buildingEnergy.ts` | Fraction of peak still drawn unoccupied |
| Occupancy schedule | Arrive 6.5–8.5 h, Leave 17–19.5 h, Lunch 12–13.5 h (dip 0.25) | `buildingEnergy.ts` | Smoothstepped weekday profile |
| `HVAC_THERMAL.BALANCE_POINT_C` / `.DESIGN_C` | 24°C / 34°C | `buildingEnergy.ts` | Degree-hour response band |
| `HVAC_THERMAL.MIN_FACTOR` / `.MAX_FACTOR` | 0.55 / 1.0 | `buildingEnergy.ts` | Demand multiplier at balance point vs. design condition |
| `HVAC_THERMAL.LAG_SIM_SECONDS` | 900 s (15 simulated min) | `buildingEnergy.ts` | First-order thermal-mass lag on the HVAC multiplier |
| Gross floor area (default config) | 5,000 m² (25 × 40 m × 5 storeys) | `grossFloorArea()`, `simulation.ts` defaults | Scales every category's kW |
| `BATTERY_CAPACITY_KWH` | 39.56 kWh | `battery.ts` | Report-specified usable capacity |
| `DEFAULT_RESERVE_FRACTION` | 0.10 | `battery.ts` (assumption) | Reserve floor, not report-specified |
| `DEFAULT_C_RATE` | 0.5 C | `battery.ts` (assumption) | → 19.78 kW max charge/discharge power |
| `DEFAULT_CHARGE_EFFICIENCY` / `DEFAULT_DISCHARGE_EFFICIENCY` | 0.96 / 0.96 | `battery.ts` (assumption) | ≈92% round-trip |
| `DEFAULT_INITIAL_SOC` | 0.50 | `battery.ts` (assumption) | Commissioned state of charge |
| `IDLE_THRESHOLD_KW` (battery, grid) | 0.01 kW | `battery.ts`, `grid.ts` | Below this, reported `Idle` rather than active |
| `GRID_CONNECTION` | 415 V, 50 Hz, Three-Phase AC | `grid.ts` | Malaysian LV commercial supply (TNB / MS IEC 60038) |
| `BUCKET_HOURS` | 1/3600 h (1 simulated second) | `energyLedger.ts` | Ledger quantisation — worst-case error, per bucket |
| `BOOTSTRAP_STEP_HOURS` | 1/12 h (5 simulated min) | `dailyEnergyBootstrap.ts` | Cold-start reconstruction resolution |

Every "(assumption)" row above is exactly that in the code's own comments — the project report specifies battery capacity and nothing else about the BESS, so C-rate, efficiency and reserve fraction are engineering assumptions the code labels as such, not datasheet values I'm presenting as measured.

## Outputs

| Engine | Published state |
|---|---|
| `PVElectricalEngine.getArrayMetrics()` | `installedCapacityKW`, `currentOutputKW`, `averageModuleOutputW`, `averageIrradianceW`, `operatingModules`, `utilization` |
| `PVInverterEngine.getMetrics()` | `ratedCapacityKW`, `currentDCPowerKW`, `currentACPowerKW`, `conversionLossKW`, `currentEfficiency`, `operatingState` (`Offline`/`Standby`/`Producing`/`Clipping`/`Fault`) |
| `BuildingEnergyEngine.getBusState()` | The full `EnergyBusState` — generation, load, self-consumption, surplus, deficit, battery/grid split, `selfConsumptionRatio`, `buildingCoverage` |
| `BuildingEnergyEngine.getLoadBreakdown()` | Per-category `powerKW` and `share` for all five categories |
| `BatteryEnergyEngine.getState()` | `soc`, `storedKWh`, `availableKWh`, `headroomKWh`, `chargeKW`/`dischargeKW`, `state`, `reason`, `throughputKWh` |
| `GridEnergyEngine.getState()` | `importKW`, `exportKW`, `netKW`, `state`, `reason`, connection spec |
| `DailyEnergyLedger.getTotals()` | Six daily kWh totals, `peakImportKW`/`peakExportKW`, `elapsedHours`, `dayCount` |

## Data flow / dependencies

The settlement order in one tick — the same order every engine's header comment documents, and the order `simulation.ts`'s `tick()` actually calls them in:

```
SolarPhysicsEngine.getModuleEffectiveIrradiance()
        │
        ▼
PVElectricalEngine.update()   ── DC array power (moduleDcPowerW × 189, wired into 9 strings)
        │
        ▼
PVInverterEngine.update()     ── DC → AC, clipped at 80 kW (convertDcToAc)
        │
        ▼
BuildingEnergyEngine.update() ── categoryDemandKW × 5 + façade thermal/lighting additions
        │   reads pvACOutputKW from the inverter, NEVER recomputes it
        │   settles the bus (settleBus): PV → load → battery → grid residual
        ├──► BatteryEnergyEngine.dispatch()  (called synchronously, inside update())
        │
        ▼
GridEnergyEngine.update(bus)  ── classifies the already-settled residual, no routing
        │
        ▼
DailyEnergyLedger.update()    ── integrates the settled bus into today's kWh
```

`BuildingEnergyEngine` never imports `BatteryEnergyEngine` — it calls through the `StoragePort` interface connected via `connectStorage()`, so the bus knows there is *a* store, never which one. `GridEnergyEngine` never imports `BuildingEnergyEngine`'s internals either — it is handed the finished `EnergyBusState` and reads two fields off it. This is what makes the settlement a single, traceable chain rather than three engines each computing their own version of the same balance.

Upstream, `facadeSolarGainKW` (owned by `metrics.ts`) is what both `BuildingThermalEngine` and `BuildingLightingEngine` convert into the `solarCoolingLoadKW`/`artificialLightingKW` this layer adds to HVAC/Lighting — see [Building Thermal & Lighting](../building-physics/thermal_and_daylighting.md). The blade angle driving that exposure is PBIF's, not this layer's, to determine — see [PBIF & Adaptive Façade Kinematics](../facade/pbif_and_kinematics.md).

## Engineering assumptions

I want these stated plainly, the way the code's own comments state them, rather than discovered later:

- **The PV model is a simplified linear STC curve, not a full electrical model.** `moduleDcPowerW()` scales linearly with irradiance and clamps to nameplate — there is no I-V curve, no MPPT search, no cell-temperature derating (NOCT), and no soiling loss. The hooks for all three (`temperatureFactor`, `soilingFactor`, `shadingFactor`) exist and are wired through the arithmetic, but every module is initialised to `1.0` and nothing currently writes a different value. This is a deliberate simplification appropriate to a system-level digital twin, not an incomplete electrical model I'm presenting as finished.
- **Rooftop PV shading is staged but not active.** `futureShadingFactor = 1.0` is a named placeholder in `solarPhysics.ts` — self-shading between rows and shading from neighbouring buildings are not modelled for the roof array, unlike the façade panels, which do run a real neighbour-occlusion ray test. The pitch spacing (`pitchZ = 2.5 m`) is chosen with inter-row clearance in mind, but the irradiance model doesn't yet enforce it.
- **The 0.07 kW gap between as-built (103.95 kW) and report nameplate (104.02 kW) DC capacity is intentional and surfaced, not reconciled.** Both numbers are real: one is what 189 × 550 W actually is, the other is what the project report states. I show both rather than quietly picking one.
- **The inverter model is efficiency + hard clipping, not a partial-load curve.** 98% conversion efficiency is flat across all operating points below the 80 kW ceiling; the code marks exactly where a temperature/partial-load derating curve would be added if that fidelity were needed.
- **Every BESS parameter beyond capacity is a stated engineering assumption.** The project report specifies 39.56 kWh and nothing else about the battery — no chemistry, no manufacturer, no C-rate. The 0.5C power limit, 96%/96% efficiencies and 10% reserve floor are typical commercial LiFePO₄ figures I chose and the code labels as assumptions in both the comments and the equipment-spec panel, never presented as datasheet values.
- **The grid is unconditional and unlimited by construction.** It has no capacity limit, no outage state reachable in the current build (`Offline` is declared for a future islanding mode but never entered), and no tariff or carbon-intensity model yet (`tariffPeriod`, `carbonIntensity` are pinned `null`, `netMeteringEnabled` pinned `false` — Stage 7.7 hooks, not modelled today).
- **Financial analytics do not exist yet.** There is no cost or tariff model anywhere in this layer; the What-If layer's "Predicted Energy Cost" metric reports "not modelled" for exactly this reason (CLAUDE.md §10 roadmap), and this document makes no cost claims.
- **This is simulated behaviour, not measured performance.** Every number in this document — the array's kW, the inverter's clipping threshold, the battery's dispatch — is a physics model evaluated against the building/PV/inverter/battery specifications fixed in CLAUDE.md §7 (real datasheet nameplate figures for the LONGi module and Huawei inverter), not telemetry from installed hardware.
