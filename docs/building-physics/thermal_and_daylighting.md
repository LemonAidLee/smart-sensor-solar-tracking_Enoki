# Building Thermal & Lighting Response

I built the Building Physics Layer to answer a question the façade alone can't: once PBIF has committed the blades to an angle, what does that angle actually cost or save *inside* the building? Two sibling engines answer it — `BuildingThermalEngine` turns admitted solar heat into an HVAC electrical load, and `BuildingLightingEngine` turns admitted daylight into an artificial-lighting electrical saving. Neither depends on the other; both read the same upstream façade quantity and diverge from there.

Source: [`src/lib/engine/buildingThermal.ts`](../../src/lib/engine/buildingThermal.ts) (Stage 7.9), [`src/lib/engine/buildingLighting.ts`](../../src/lib/engine/buildingLighting.ts) (Stage 7.10), and [`src/lib/engine/metrics.ts`](../../src/lib/engine/metrics.ts), which owns the shared input both engines consume. See [PBIF & Adaptive Façade Kinematics](../facade/pbif_and_kinematics.md) for how a blade angle is decided in the first place, and [Energy Model](../energy/energy_model.md) for where the electrical kW figures this layer produces end up in the building's overall energy balance.

## Shared input: `facadeSolarGainKW`

Before either engine runs, `metrics.ts` computes one number both of them read:

```
facadeSolarGainKW = avgExposure × avgOpenness × areaM2 × GLAZING_SHGC
```

`avgExposure` is `normalisedExposure(irradianceWm2)` — `clamp(irradiance / 1000)` — the *same* 0–1 quantity `FacadePanel.solarExposure` holds everywhere else in the twin, so it already carries cloud attenuation; it is never the bare geometric cosine. `avgOpenness` is the building-mean blade openness PBIF's kinematics solver just produced. `GLAZING_SHGC` is `0.45`, the assumed solar heat-gain coefficient of the glazing behind the skin. This is the one place the façade's thermal effect on the interior is defined — the live thermal chain, the lighting chain, and the AI Prediction/What-If layers all read this same function rather than re-deriving it.

Both engines are handed this quantity (or its exposure component directly) by `Simulation.tick()`; neither recomputes it.

---

## Building Thermal Response

### Purpose

I use this engine to carry solar heat the rest of the way from "admitted through the glazing" to "electrical kW the cooling plant draws," including the lag a real building's thermal mass imposes between a heat gain and the load it eventually produces.

### Inputs

| Input | Source |
|---|---|
| `facadeOpenness` | `BuildingMetrics.averageOpenness` |
| `facadeSolarGainKW` | `metrics.ts` `facadeSolarGainKW()` — thermal kW |
| `outdoorTempC` | `WeatherState.temperature` |
| `irradianceWm2` | `SunState.irradiance` |
| `dtSimSeconds` | elapsed simulated seconds since the last tick (`0` on init/scrub, which snaps the lag to its target instead of integrating) |

### Processing / equations

1. **Envelope transmission** — the fraction of the glazing-admitted heat that survives frame/edge-of-glass conduction and cavity re-radiation losses to actually cross into conditioned space:
   ```
   envelopeHeatGainKW = max(0, facadeSolarGainKW) × ENVELOPE_TRANSMISSION_EFFICIENCY   (0.9)
   ```
2. **Convective/radiant split** — the ASHRAE Radiant Time Series treatment of solar gain through glazing: part of the admitted heat loads the room air immediately, part is absorbed by the building's thermal mass and released gradually. The façade shades the glazing from outside, so I model a small extra convective bonus that grows with openness (an open cavity ventilates more of the radiant share back out):
   ```
   convectiveFraction  = clamp(SOLAR_CONVECTIVE_FRACTION_BASE + OPENNESS_CONVECTIVE_BONUS × openness, 0, 1)
                        = clamp(0.4 + 0.2 × openness, 0, 1)
   convectiveKW        = envelopeHeatGainKW × convectiveFraction
   radiantTargetKW     = envelopeHeatGainKW × (1 − convectiveFraction)
   ```
3. **Thermal-mass lag** — the radiant share doesn't appear in the room instantly; it chases its target through a first-order exponential approach with a 20-simulated-minute time constant:
   ```
   α = 1 − exp(−dtSimSeconds / TIME_CONSTANT_SIM_SECONDS)      (dt > 0; else α = 1, snap)
   radiantReleaseKW += (radiantTargetKW − radiantReleaseKW) × α
   indoorHeatGainKW  = convectiveKW + radiantReleaseKW
   thermalLag        = envelopeHeatGainKW − indoorHeatGainKW
   ```
   `radiantReleaseKW` is the engine's one piece of persistent state — the only reason two calls with identical inputs can produce different output.
4. **Cooling requirement and electrical conversion** — I treat HVAC capacity as sufficient to remove all of the lagged heat gain today, so `coolingRequiredKW` is currently just `indoorHeatGainKW` read through its own field name (kept separate specifically so a future HVAC-capacity cap has one place to apply itself without moving any downstream calculation or UI label). Electrical demand comes from dividing by the cooling plant's COP:
   ```
   coolingRequiredKW = indoorHeatGainKW
   coolingLoadKW     = coolingRequiredKW / COOLING_PLANT_COP      (3.5)
   ```
   `coolingLoadKW` is the only electrical-kW quantity this engine produces; everything upstream of it (`facadeSolarGainKW`, `envelopeHeatGainKW`, `convectiveKW`, `radiantReleaseKW`, `indoorHeatGainKW`, `coolingRequiredKW`) is thermal kW, not electricity.
5. **Display-only comfort estimates** — two more quantities are derived for the panel but never feed back into any electrical calculation: a free-floating indoor temperature proxy (what indoor air would drift toward with no HVAC at all) and a conditioned estimate that tracks the setpoint with a small proportional-control droop (a P-only controller's classic non-zero steady-state offset, proportional to load):
   ```
   indoorTemperatureProxy      = outdoorTempC + indoorHeatGainKW / THERMAL_CAPACITANCE_KW_PER_C
                                  + max(0, irradianceWm2) × IRRADIANCE_PROXY_COEFFICIENT_C_PER_WM2
   conditionedIndoorTemperatureC = HVAC_SETPOINT_C + max(0, coolingRequiredKW) × HVAC_PROPORTIONAL_DROOP_C_PER_KW
   ```
6. **Operating status** — a plain-language classification of the same two published numbers, no new physics: `Standby` below `COOLING_STATUS_STANDBY_KW`; `Cooling`/`Recovering` when `|thermalLag|` exceeds `COOLING_STATUS_SETTLED_BAND_KW` (mass still loading vs. still releasing); otherwise `Maintaining Setpoint`.

### Constants

| Constant | Value | Meaning | Reference |
|---|---|---|---|
| `GLAZING_SHGC` (`metrics.ts`) | 0.45 | Glazing solar heat-gain coefficient applied before this engine sees the heat | — |
| `ENVELOPE_TRANSMISSION_EFFICIENCY` | 0.9 | Fraction of glazing-admitted heat that survives frame/edge losses | ASHRAE Fundamentals — fenestration U-factor / frame-and-edge loss practice |
| `SOLAR_CONVECTIVE_FRACTION_BASE` | 0.4 | Baseline convective share of envelope heat gain | ASHRAE Radiant Time Series (RTS) Method |
| `OPENNESS_CONVECTIVE_BONUS` | 0.2 | Extra convective share at fully-open blades (cavity ventilation) | ASHRAE RTS |
| `TIME_CONSTANT_SIM_SECONDS` | 1200 (20 simulated minutes) | Thermal-mass first-order lag time constant | CIBSE Guide A — "heavyweight" dynamic thermal response class |
| `COOLING_PLANT_COP` | 3.5 | Electrical kW drawn per kW of heat rejected | ASHRAE 90.1 — minimum efficiency tables for commercial cooling equipment |
| `THERMAL_CAPACITANCE_KW_PER_C` | 25 | kW of heat gain per °C the free-floating proxy sits above outdoor temp | display-only |
| `IRRADIANCE_PROXY_COEFFICIENT_C_PER_WM2` | 0.003 | Residual raw-irradiance nudge to the free-floating proxy (roof/spandrel effects the façade doesn't cover) | display-only |
| `HVAC_SETPOINT_C` | 24.0 | Commanded indoor air temperature | ASHRAE 55 — Thermal Environmental Conditions for Human Occupancy |
| `HVAC_PROPORTIONAL_DROOP_C_PER_KW` | 0.0015 | P-only controller steady-state offset per kW of cooling requirement | display-only |
| `COOLING_STATUS_STANDBY_KW` | 1 | Below this, HVAC reads as idle | — |
| `COOLING_STATUS_SETTLED_BAND_KW` | 2 | `\|thermalLag\|` band for "settled" vs. still loading/releasing | — |

### Outputs

`BuildingThermalState` publishes every step of the chain (`facadeSolarGainKW`, `envelopeHeatGainKW`, `convectiveKW`, `radiantReleaseKW`, `indoorHeatGainKW`, `coolingRequiredKW`, `coolingLoadKW`, `indoorTemperatureProxy`, `conditionedIndoorTemperatureC`, `coolingStatus`, `thermalLag`). Of these, exactly one — `coolingLoadKW`, already electrical kW — is consumed downstream.

### Data flow

`Simulation.tick()` computes `facadeSolarGainKW` from the façade's most recently settled metrics, calls `buildingThermal.update()`, then reads `buildingThermal.getState().coolingLoadKW` and passes it into `buildingEnergy.update()` as `solarCoolingLoadKW`. `BuildingEnergyEngine` adds it straight onto its own occupancy-driven `hvac` load category (22 W/m² peak density) — it never recomputes it. See [Energy Model](../energy/energy_model.md) for how that category then flows into the building's PV/battery/grid balance.

The AI Prediction layer (Stage 8.1) reuses the same physics rather than a parallel model: `equilibriumThermalState()` runs the identical envelope/convective/COP chain but with the thermal-mass lag assumed fully settled (`indoorHeatGainKW === envelopeHeatGainKW`, `thermalLag === 0`) instead of integrated tick-by-tick. That's a deliberate simplification for a multi-hour forward projection, not a second implementation of the thermal chain — the live `BuildingThermalEngine` calls the same `envelopeHeatGainKW()` / `convectiveFraction()` functions every tick and is what actually integrates the lag.

---

## Building Lighting Response

### Purpose

Before this engine existed, "Lighting" in the BEMS was a flat occupancy-only load, blind to whether the sky outside was clear or the blades were open or shut. I built this engine to give Lighting the same daylight awareness the thermal engine gives HVAC: it estimates how much daylight is actually reaching the workplane, and dims (or brightens) a daylight-harvesting artificial circuit to make up the difference.

### Inputs

| Input | Source |
|---|---|
| `avgExposure` | `BuildingMetrics.averageSolarExposure` — the same normalised effective-irradiance quantity `facadeSolarGainKW` consumes |
| `facadeOpenness` | `BuildingMetrics.averageOpenness` |
| `floorAreaM2` | `BuildingEnergyEngine`'s own `grossFloorArea` snapshot — not recomputed here |
| `timeHours` | simulation clock (occupancy scheduling) |
| `dtSimSeconds` | elapsed simulated seconds since the last tick (`0` snaps to target) |

### Processing / equations

1. **Outdoor illuminance** — the effective exposure fraction denormalised back to W/m² and converted through daylight luminous efficacy:
   ```
   outdoorLux = max(0, avgExposure) × EXPOSURE_REFERENCE_WM2 × DAYLIGHT_LUMINOUS_EFFICACY_LM_PER_W
              = max(0, avgExposure) × 1000 × 110
   ```
2. **Indoor illuminance** — outdoor light passing through the glazing's visible transmittance and the current blade openness (openness is treated as a direct 0–1 daylight admission factor, the same control variable the thermal chain uses):
   ```
   indoorLux = outdoorLux × VISIBLE_TRANSMISSION × clamp(facadeOpenness)     (VISIBLE_TRANSMISSION = 0.6)
   ```
3. **Daylight-harvesting control target** — linear proportional control against the target illuminance, floored at a minimum stable dimming level once *any* artificial contribution is needed (a fully daylit space commands no floor at all):
   ```
   raw    = clamp(1 − indoorLux / TARGET_INDOOR_LUX, 0, 1)      (TARGET_INDOOR_LUX = 500 lux)
   target = raw > 0 ? max(raw, LIGHTING_CONTROL_MIN) : 0         (LIGHTING_CONTROL_MIN = 0.1)
   ```
4. **Controller response lag** — the same exponential-approach form the thermal engine uses, but with a much shorter time constant: a closed-loop photosensor dimming control responds in seconds in reality, far faster than the building's thermal mass, so I use 20 simulated *seconds* here against the thermal chain's 20 simulated *minutes*:
   ```
   α = 1 − exp(−dtSimSeconds / RESPONSE_TIME_SIM_SECONDS)     (dt > 0; else α = 1, snap)
   lightingLevel += (target − lightingLevel) × α
   ```
   `lightingLevel` (0–1) is the engine's persistent state: `0` means daylight alone meets the target, `1` means artificial lighting must supply all of it. `artificialContribution` is this same value; `daylightContribution` is `1 − lightingLevel`.
5. **Electrical demand** — occupancy is reused from `buildingEnergy.ts`'s `occupancyFraction()`, not reimplemented. The daylight-responsive circuit's rated capacity is scaled by floor area, then by occupancy, then by the lagged control level:
   ```
   occupancy       = occupancyFraction(timeHours)
   artificialRatedKW = ARTIFICIAL_LIGHTING_DENSITY_WM2 × floorAreaM2 / 1000      (5 W/m²)
   occupiedRatedKW = artificialRatedKW × occupancy
   lightingElectricalKW = occupiedRatedKW × lightingLevel
   lightingSavingsKW    = occupiedRatedKW − lightingElectricalKW
   ```
   `lightingSavingsKW` is the saving relative to a no-daylight-harvesting baseline where the same circuit would run at full rated power whenever occupied.
6. **Operating status** — again a plain-language read of numbers already computed: `Unoccupied` below `OCCUPIED_STATUS_THRESHOLD`; `Fully Daylit` at/below `DAYLIT_STATUS_THRESHOLD`; `Full Artificial` at/above `FULL_ARTIFICIAL_STATUS_THRESHOLD`; otherwise `Daylight Harvesting`.

### Why the non-daylight baseline lives elsewhere

This engine owns only the daylight-responsive share of lighting. Egress, corridor and back-of-house circuits that a photosensor never dims stay in `BuildingEnergyEngine`'s own `LOAD_CATEGORIES` `'lighting'` entry, at `3 W/m²`, occupancy-driven and weather-insensitive. This engine's `ARTIFICIAL_LIGHTING_DENSITY_WM2` (`5 W/m²`) is sized so the two sum back to the office's original `8 W/m²` total Lighting Power Density at full occupancy with zero daylight (night) — this split changes *when* the peak is reached, not what the peak itself is.

### Constants

| Constant | Value | Meaning | Reference |
|---|---|---|---|
| `TARGET_INDOOR_LUX` | 500 | Target workplane illuminance the controller maintains | EN 12464-1:2011 — general office work-area recommendation |
| `VISIBLE_TRANSMISSION` | 0.6 | Fraction of outdoor daylight surviving the glazing assembly | NFRC 200 — visible transmittance rating practice |
| `DAYLIGHT_LUMINOUS_EFFICACY_LM_PER_W` | 110 | Irradiance (W/m²) → illuminance (lux) conversion | CIE 108-1994 / IESNA Lighting Handbook |
| `ARTIFICIAL_LIGHTING_DENSITY_WM2` | 5 | Rated power density of the daylight-responsive circuit alone | ASHRAE 90.1 LPD allowance, daylight-zone share |
| `LIGHTING_CONTROL_MIN` | 0.1 | Minimum stable dimming duty once any artificial light is commanded | IES RP-1 / dimmable-driver datasheet practice |
| `RESPONSE_TIME_SIM_SECONDS` | 20 (simulated seconds) | Controller first-order response lag | — |
| `DAYLIT_STATUS_THRESHOLD` | 0.02 | `lightingLevel` at/below which the space reads "Fully Daylit" | — |
| `FULL_ARTIFICIAL_STATUS_THRESHOLD` | 0.98 | `lightingLevel` at/above which the space reads "Full Artificial" | — |
| `OCCUPIED_STATUS_THRESHOLD` | 0.05 | Occupancy below which the space reads "Unoccupied" regardless of daylight | — |
| `EXPOSURE_REFERENCE_WM2` (`metrics.ts`) | 1000 | Irradiance the 0–1 exposure scale is normalised against | — |

### Outputs

`BuildingLightingState` publishes the full chain (`outdoorLux`, `indoorLux`, `targetLux`, `lightingLevel`, `lightingElectricalKW`, `lightingSavingsKW`, `lightingStatus`, `daylightContribution`, `artificialContribution`). Exactly one — `lightingElectricalKW`, already electrical kW — is consumed downstream.

### Data flow

`Simulation.tick()` calls `buildingLighting.update()` with `metrics.averageSolarExposure`, `metrics.averageOpenness`, the BEMS's own floor-area snapshot, and the clock — independently of the thermal engine's call, in the same tick. It then reads `buildingLighting.getState().lightingElectricalKW` and passes it into `buildingEnergy.update()` as `artificialLightingKW`. `BuildingEnergyEngine` adds it straight onto its `lighting` category's occupancy-driven baseline (3 W/m² peak density) — again, never recomputed, just added.

---

## Combined data flow

```
metrics.ts: facadeSolarGainKW(avgExposure, avgOpenness, areaM2)
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
  BuildingThermalEngine        BuildingLightingEngine
  (envelope → convective/      (outdoor lux → indoor lux →
   radiant split → thermal-     daylight-harvesting control →
   mass lag → COP)              response lag → occupancy scale)
             │                         │
     coolingLoadKW (kW elec)   lightingElectricalKW (kW elec)
             │                         │
             └───────────┬─────────────┘
                          ▼
              BuildingEnergyEngine.update()
        (added onto the 'hvac' and 'lighting'
         LOAD_CATEGORIES baselines respectively)
                          │
                          ▼
        Battery → Grid → EnergyLedger  (see Energy Model)
```

The two engines never call each other and never share mutable state — each is handed the façade's published metrics fresh every tick and produces one electrical-kW number that `BuildingEnergyEngine` folds into its own load categories. This is the same "reuse the physics, never re-implement it" boundary the AI Prediction and What-If layers rely on when they read `equilibriumThermalState()` and the façade metrics instead of maintaining a parallel model.

## Engineering assumptions

- **HVAC capacity is assumed sufficient.** `coolingRequiredKW` is defined identically to `indoorHeatGainKW` today — kept as its own field specifically so a future capacity cap (a `MAX_HVAC_CAPACITY_KW`-style constant) has one place to apply itself, without moving `coolingLoadKW` or `conditionedIndoorTemperatureC`, both of which are already derived from `coolingRequiredKW` rather than from `indoorHeatGainKW` directly.
- **The AI Prediction layer reads the thermal chain at equilibrium.** `equilibriumThermalState()` assumes the 20-simulated-minute thermal-mass lag is negligible over a multi-hour forward projection and evaluates the chain as fully settled, rather than integrating the lag hour-by-hour. This mirrors the same simplification the BEMS's own HVAC lag (`hvacDemandFactor`) already makes for its projection. The live `BuildingThermalEngine` is the one that actually integrates the lag tick-by-tick; both call the same underlying `envelopeHeatGainKW()` / `convectiveFraction()` functions.
- **A cooling-plant COP of 3.5 is a modeling choice, not a measured value.** It converts the thermal cooling requirement into the electrical kW the rest of the twin adds to HVAC demand, representative of a mid-range commercial chiller/VRF plant per ASHRAE 90.1's efficiency tables — there is no physical chiller behind this number.
- **Indoor temperature figures are display estimates, not part of the electrical chain.** `indoorTemperatureProxy` (free-floating, no HVAC) and `conditionedIndoorTemperatureC` (with a small proportional-control droop) are both derived quantities for the comfort panel; nothing electrical is ever computed from a temperature in this layer.
- **The lighting controller intentionally lags much faster than the thermal chain.** 20 simulated seconds versus 20 simulated minutes reflects that a real photosensor dimming loop responds in seconds while a building's thermal mass responds over tens of minutes — both time constants are stated design choices, not measured from hardware.
- **Non-daylight lighting stays outside this layer by design.** Egress, corridor and back-of-house circuits are occupancy-driven and never dimmed by daylight in reality, so I kept them in `BuildingEnergyEngine`'s own load model rather than folding them into a daylight-responsive engine that has no basis for varying them.
- **Every named constant traces to a published reference**, cited alongside the constant it backs in `BUILDING_THERMAL_REFERENCES` and `BUILDING_LIGHTING_REFERENCES` (ASHRAE Fundamentals, ASHRAE RTS, CIBSE Guide A, ASHRAE 90.1, ASHRAE 55, EN 12464-1, NFRC 200, CIE 108-1994/IESNA, IES RP-1) — representative values from engineering literature, since there is no physical building or chiller plant to calibrate against.
