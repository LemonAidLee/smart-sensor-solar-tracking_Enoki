# PBIF & Adaptive Façade Kinematics

PBIF — the Predictive Building Intelligence Framework — is the decision layer I built to answer one question, deterministically, every simulation tick: **what should the façade be trying to do right now?** It never touches a panel angle directly. It hands down a high-level objective, and a separate kinematics solver turns that objective into a physical rotation. Splitting "what" from "how" is the single design decision this whole subsystem is built around, and it's what makes the safety logic auditable independently of the geometry.

Source: [`src/lib/pbif/`](../../src/lib/pbif/) (`decisionEngine.ts`, `situationAssessment.ts`, `thresholds.ts`, `trackingPolicy.ts`, `operationalObjective.ts`, `solarResourceAssessment.ts`, `thermalDemandAssessment.ts`) and [`src/lib/kinematics/`](../../src/lib/kinematics/) (`rotationSolver.ts`).

## Why a rule table instead of a weighted score or a learned policy

A façade louvre is a structural element exposed to real wind and rain loads. I didn't want a blended optimisation score where a strong-but-wrong lighting signal could out-vote a wind reading and leave the blades open in a storm. So I implemented PBIF as an ordered table of rules, evaluated top to bottom, first match wins. That gives me two properties I cared about more than optimality: a higher-priority rule can *never* be overridden by a lower one, and every decision the twin makes is traceable to one named rule (`ruleTriggered` in `PbifDecision`) rather than an opaque score. `confidence` is always `100` for this reason — it exists as a field only so a future predictive PBIF could report a real confidence value without any change to the UI or the layers below it; today, it's rule-based and certain by construction.

## The priority hierarchy

PBIF resolves conditions into **four priority tiers**, evaluated in this order — each tier's rules are exhausted before the next tier is even considered:

| Priority | Concern | Driven by |
|---|---|---|
| 1. Structural Safety | protect the actuator and structural mounting from wind load | `windSpeed` |
| 2. Weather Protection | protect the façade and glazing from rain | `rainIntensity` |
| 3. Solar Availability | avoid wearing out the actuator moving for negligible optical gain | solar resource (from the LDR ADC reading) |
| 4. Thermal Demand | bias the tracking mode toward cooling-load reduction | `outdoorTemperature` |

### Tier 1 — Structural Safety (wind)

| Wind speed | State | Façade | Rule |
|---|---|---|---|
| ≥ `EXTREME` (50 km/h) | `SAFE_MODE` | `CLOSED` (0°) | Tracking suspends outright; the façade fully closes. |
| ≥ `HIGH` (35 km/h) | `ECONOMY_TRACKING` | `TRACKING` | Tracking continues, but under the same wide deadband as low solar resource, to cut actuator movement under load. |

### Tier 2 — Weather Protection (rain)

| Rain intensity | State | Façade | Rule |
|---|---|---|---|
| ≥ `HEAVY` (0.65) | `WEATHER_PROTECTION` | `CLOSED` (135°) | Fully closes to the rain-safe angle to shed water off the glazing. |
| ≥ `MODERATE` (0.35) | `WEATHER_PROTECTION` | `CLOSED` (135°) | Same rain-safe posture; sun tracking is not worth the exposure. |
| ≥ `LIGHT` (0.05) | `ECONOMY_TRACKING` | `TRACKING` | Tracking continues, at reduced movement frequency. |

### Tier 3 — Solar Availability

The virtual LDR's filtered ADC reading (0–4095) is classified into `HIGH` / `MEDIUM` / `LOW` solar resource. When resource is `MEDIUM` or `LOW` (and thermal demand isn't already `HIGH` — that's Tier 4's territory), PBIF drops into `ECONOMY_TRACKING`: the façade still tracks the sun, but only commits to a new angle once the theoretical target drifts past a dynamic deadband, rather than chasing every small change.

### Tier 4 — Thermal Demand

When outdoor temperature crosses 30°C, PBIF's `objective` becomes `Reduce Cooling Load` (below 30°C it's `Maintain Balanced Solar Performance`). With solar resource `HIGH`, the façade stays in `NORMAL_TRACKING` — full sun tracking under the default `shade` intent already tracks the sun to intercept the beam, which is the correct response to reject heat. With resource `LOW`/`MEDIUM`, it falls back to `ECONOMY_TRACKING` for the same actuator-wear reason as Tier 3.

I want to be precise about what this tier does and doesn't do today: it changes *which tracking mode* fires (normal vs. economy) and it's surfaced to the UI/reasoning layer as an explicit objective, but it doesn't yet reach into the panel's shade/daylight `Intent` — that's a separate, independently configurable parameter (`trackingIntent`, defaulted to `shade`) that sits alongside PBIF rather than being driven by it. Coupling thermal demand to intent selection is a natural next step, not something the current rule table does.

### Default

If none of the above fire — calm wind, dry weather, decent solar resource, moderate temperature — the façade runs `NORMAL_TRACKING`: full continuous sun tracking with a tight deadband, no compromise applied.

## Constants (single source: `thresholds.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `WIND_KMH.HIGH` / `.EXTREME` | 35 / 50 km/h | Wind bands that trigger Tier 1 |
| `RAIN_LEVEL.LIGHT` / `.MODERATE` / `.HEAVY` | 0.05 / 0.35 / 0.65 | Normalised rain bands that trigger Tier 2 |
| `RAIN_SAFE_ANGLE` | 135° | The one rain-safe blade angle, shared by the PBIF control path and the non-PBIF preset path — changing it here changes both |
| `TEMPERATURE_C.HIGH` | 30°C | Threshold for `Reduce Cooling Load` |
| `ADC_TO_SOLAR_RESOURCE.HIGH_THRESHOLD` / `.MEDIUM_THRESHOLD` | 4000 / 2000 | ADC bands (0–4095) for solar resource classification |
| `DYNAMIC_DEADBAND_DEG.HIGH` / `.MEDIUM` / `.LOW` | 2° / 5° / 8° | Deadband width used by `ECONOMY_TRACKING`, widening as solar resource drops |
| `WIND_SAFE_ANGLE` | 90° | Defined for a feathered wind-safe posture, but not yet wired into `SAFE_MODE`'s arithmetic — `SAFE_MODE` currently closes to a flat 0°, same as it always has. Kept as a named constant so wiring it in later is a one-line change rather than a hunt for a hardcoded literal. |

## The kinematics solver

PBIF hands the tracking policy layer an operational state; the state either resolves to a fixed safe angle (Tiers 1–2) or defers entirely to `solveForNormal()` in [`rotationSolver.ts`](../../src/lib/kinematics/rotationSolver.ts) — the same analytic geometry solver regardless of which PBIF tier called it.

Given a flat blade on a vertical rotation axis, only azimuth matters, so I derive the aligning angle directly from a bearing identity instead of searching for it:

```
panelNormal(θ) = rotateY(n, −θ)  ⇒  bearing(panelNormal) = bearing(n) − θ
```

Setting that equal to the sun's horizontal bearing and solving for θ gives the principal alignment angle:

```
θ* = bearing(n) − bearing(sun_horizontal)
```

That single closed-form angle is enough to derive every tracking behaviour the twin needs:

- **`shade` intent** (the default) commands θ*: the blade's face points at the sun, maximising projected exposure — the correct behaviour for a shading louvre that's meant to intercept the beam.
- **`daylight` intent** commands θ* + 90°: edge-on to the sun, minimising projected exposure and admitting light past the blade.
- A flat blade is symmetric under 180° rotation (θ and θ+180° present the same plane), so every target is really a family `{θ* + 180°·k}`. The solver always commands the member of that family closest to the panel's current angle, so motion is continuous — it never jumps 359°→0° or reverses unnecessarily to reach an angle it's already equivalent to.
- Exposure has a hard physical ceiling of `cos(altitude)` regardless of blade angle — the solver reports this as `maxExposure` so the UI can show how close the commanded angle gets to what the sun's position actually permits.
- Two edge cases fall back to resting the blade edge-on (open) rather than tracking: the sun below the horizon, and the surface being back-lit (sun behind the façade plane) — there's no beam to respond to in either case.

`SAFE_MODE` and `WEATHER_PROTECTION` don't call this solver at all; they route their configured safe angle (0° or 135°) through the same shortest-path helper (`nearestCongruent`) so the animation is driven by identical logic regardless of which state commanded it — a protection state never produces a discontinuous jump any more than a tracking state does.

## Physical design context

This page documents the decision logic as implemented. For the architectural reasoning behind why a kinetic façade at all — the climate problem, real-world precedent, and the full-scale physical specification (blade material, servo, sensor hardware) this logic is designed to eventually drive — see [Façade Design Concept](design_concept.md).

## How a PBIF decision reaches building physics

PBIF's output doesn't stop at the blade angle. The commanded rotation changes each panel's `solarExposure`, which `metrics.ts` turns into `facadeSolarGainKW` — the one number both `BuildingThermalEngine` and `BuildingLightingEngine` read to compute envelope heat gain, cooling load, and daylight-driven artificial lighting demand. See [Building Thermal & Lighting](../building-physics/thermal_and_daylighting.md) for that half of the chain.
