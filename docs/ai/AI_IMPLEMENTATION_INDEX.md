# AI Implementation Knowledge Layer Index

**Version:** 1.0.0
**Last updated:** 2026-08-06

This is the master index of all subsystem implementation documentation for the SOLIS AI Digital Twin. 

## Subsystems

| Name | Documentation File | Source Files | Dependencies | Consumers | Version | Last Updated |
|---|---|---|---|---|---|---|
| Adaptive Façade | [adaptive_facade.md](./implementation/adaptive_facade.md) | `adaptiveSkin.ts` | Weather, Solar, PV | Context, Simulation | 1.0.0 | 2026-08-06 |
| Battery | [battery.md](./implementation/battery.md) | `battery.ts` | PV, Building Energy | Grid, Prediction | 1.0.0 | 2026-08-06 |
| Building Energy | [building_energy.md](./implementation/building_energy.md) | `buildingEnergy.ts` | Building Thermal, Lighting | Battery, Grid | 1.0.0 | 2026-08-06 |
| Building Lighting | [building_lighting.md](./implementation/building_lighting.md) | `buildingLighting.ts` | Adaptive Façade | Building Energy | 1.0.0 | 2026-08-06 |
| Building Thermal | [building_thermal.md](./implementation/building_thermal.md) | `buildingThermal.ts` | Adaptive Façade | Building Energy | 1.0.0 | 2026-08-06 |
| Cyber-Physical Pipeline | [cyber_physical_pipeline.md](./implementation/cyber_physical_pipeline.md) | `virtualSensor.ts`, `embedded/*`, `vec/*` | Solar, Weather | PBIF, Simulation | 1.0.0 | 2026-08-06 |
| Energy Ledger | [energy_ledger.md](./implementation/energy_ledger.md) | `energyLedger.ts` | Battery, Grid, PV | UI, Prediction | 1.0.0 | 2026-08-06 |
| Engineering Assistant | [engineering_assistant.md](./implementation/engineering_assistant.md) | `contextBuilder.ts`, `reasoningEngine.ts` | Knowledge Base | AI Tools | 1.0.0 | 2026-08-06 |
| Fault Detection | [fault_detection.md](./implementation/fault_detection.md) | `faultDetectionEngine.ts` | Knowledge Base | UI | 1.0.0 | 2026-08-06 |
| Utility Grid | [grid.md](./implementation/grid.md) | `grid.ts` | Battery, PV | UI, Ledger | 1.0.0 | 2026-08-06 |
| PBIF | [pbif.md](./implementation/pbif.md) | `pbif/*` | Sensors, Weather | Adaptive Façade | 1.0.0 | 2026-08-06 |
| Prediction | [prediction.md](./implementation/prediction.md) | `predictionEngine.ts` | All Physical Engines | UI | 1.0.0 | 2026-08-06 |
| PV | [pv.md](./implementation/pv.md) | `pvElectrical.ts`, `pvInverter.ts` | Solar, Weather | Battery | 1.0.0 | 2026-08-06 |
| Solar Physics | [solar.md](./implementation/solar.md) | `solarPhysics.ts` | Weather | Cyber-Physical, PV | 1.0.0 | 2026-08-06 |
| Weather | [weather.md](./implementation/weather.md) | `weatherScenario.ts`, `liveForecast.ts` | Forecast Provider | Solar, Sensors, PBIF | 1.0.0 | 2026-08-06 |
| What-If | [what_if.md](./implementation/what_if.md) | `whatIfEngine.ts` | Prediction | UI | 1.0.0 | 2026-08-06 |
