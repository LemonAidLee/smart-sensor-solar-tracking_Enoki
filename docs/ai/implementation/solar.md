# Solar Physics Subsystem

**Subsystem ID:** SolarPhysics
**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

The Solar Physics subsystem is the twin's single source of truth for everything astronomical and irradiance-related. It has three layered parts:

- **`computeSolarPosition`** (`solarPosition.ts`) — topocentric sun altitude/azimuth for a given instant and site, via the NOAA Solar Calculator methodology (Meeus, *Astronomical Algorithms*, 1998).
- **`computeSun`** (`solar.ts`) — wraps the position result with the ASHRAE Clear Sky irradiance model (DNI/DHI/GHI, cloud modification) and a WHO/WMO UV Index model, producing the `SunState` the rest of the twin reads.
- **`SolarPhysicsEngine`** (`solarPhysics.ts`) — takes the global `SunState` and, per façade panel and per rooftop PV module, computes incident angle, cosine projection, neighbour occlusion, diffuse-sky contribution and effective plane-of-array irradiance. It owns `planeIrradiance`, the single shared irradiance formula the façade, the rooftop array and the AI Prediction layer all call.

## Responsibilities

- Compute topocentric solar altitude and azimuth from local civil time, latitude, longitude and timezone offset — a property of the **site + instant only** (`solarPosition.ts`).
- Decompose clear-sky Global Horizontal Irradiance into Direct Normal and Diffuse Horizontal components using the ASHRAE τb/τd model, apply a linear cloud-cover correction, and derive a WHO/WMO erythemal UV Index (`solar.ts`).
- Convert the global sun state into a world-space direction vector and a display colour temperature.
- For every façade panel and every rooftop PV module: compute the incidence angle, the cosine projection against the surface normal, whether a neighbouring building occludes the direct beam, the diffuse-sky contribution, and the resulting effective irradiance (`solarPhysics.ts`).
- Provide `planeIrradiance` / `attenuatedGHI` as reusable pure functions so the façade, the rooftop array, and the AI Prediction layer's forward projection all compute irradiance identically (CLAUDE.md §11.1).

## Inputs

- `computeSolarPosition(date, latitude, longitude, timezoneHoursFromUtc)` — a `Date` whose calendar fields are read as **local civil time**, plus the site's latitude (°N+), longitude (°E+), and UTC offset in hours (no DST).
- `computeSun(clock: SimClock, building: BuildingConfig, cloudCoverage: number)` — the simulation clock, the building's `latitude`/`longitude`/`timezone`, and `weather.cloudCoverage` (0–1) from the [Weather](./weather.md) subsystem — the **only** cross-subsystem input.
- `SolarPhysicsEngine.update(surfaces: BuildingSurface[], pvModules: PVModule[], sun: SunState, neighbors: NeighborBuilding[])` — the façade surfaces (each carrying `FacadePanel[]`), the rooftop PV module list, a **building-local** `SunState` (world `worldDir` rotated by `building.orientation` before this call), and neighbouring buildings for occlusion testing.

## Outputs

- **`SolarPositionResult`** (`solarPosition.ts`): `elevation`, `azimuth`, `declination`, `hourAngle`, `equationOfTime`, `isDaytime`.
- **`SunState`** (`solar.ts` → `types.ts`): the full irradiance/position/UV state consumed everywhere downstream (see Live Outputs).
- **Per-module maps** inside `SolarPhysicsEngine`, keyed by panel/module `id`: incident angle, cosine projection, occlusion factor, diffuse-sky contribution, effective irradiance, and (when occluded) the blocking neighbour's id and distance. Plus two global scalars: raw clear-sky GHI and the current cloud attenuation factor.

## Internal Calculation Pipeline

1. **Weather resolves first.** `Simulation.tick()`'s environmental tier calls `applyScenarioWeather()` before anything solar, so `weather.cloudCoverage` is settled for this step.
2. **`computeSun(clock, building, weather.cloudCoverage)`** runs:
   - `simDate(clock)` builds a concrete `Date` from `clock.date` + `clock.timeHours`.
   - `computeSolarPosition(date, building.latitude, building.longitude, building.timezone)` computes the NOAA/Meeus position: Julian Day → Julian century `T` → geometric mean longitude `L0` and anomaly `M` → orbital eccentricity `e` → equation of centre `C` → true/apparent longitude → obliquity of the ecliptic `ε` → declination → equation of time → true solar time → hour angle → zenith/altitude (with atmospheric refraction correction near the horizon) → azimuth.
   - The current month indexes `ASHRAE_TAU_B[month]` / `ASHRAE_TAU_D[month]` (Kuala Lumpur, WMOID 486470).
   - `airMassKastenYoung(altitude)` and `extraterrestrialIrradiance(dayOfYear)` (Spencer 1971 eccentricity correction) are computed.
   - The ASHRAE pseudo-optical-depth exponents `ab`, `ad` are derived from `tauB`/`tauD`, then `dniClearSky`, `dhiClearSky`, `ghiClearSky` are computed (only if `altitude > 0`).
   - `cloudModificationFactor = 1 − cloudCoverage × 0.75` attenuates `ghiClearSky` into `ghi`; `irradiance = round(ghi)` is the alias downstream code reads.
   - The WHO/WMO UV pipeline computes `uvErythemalClearSky` from `cos(zenith)^1.4`, applies its own cloud modification factor (Bodeker & McKenzie 1996), and derives `uvIndex`.
   - `colorTemperature` is a `smoothstep`-eased lerp between 2200 K and 6500 K over 0–45° altitude; `worldDir` is `compassToWorld(azimuth, max(altitude, −6))`.
3. **Building-local rotation.** `Simulation` rotates `sun.worldDir` by `building.orientation` (`rotateY`) to get `localSun` — the solar model itself never sees the building; the rotation happens strictly downstream (`SOLAR_MODEL.md` §7).
4. **`SolarPhysicsEngine.update(surfaces, pvModules, localSun, localNeighbors)`** runs:
   - `attenuatedGHI(sun) = sun.ghiClearSky × sun.cloudModificationFactor` re-derives the attenuated GHI from the stored intermediates (equivalent to but computed independently of the rounded `sun.irradiance` alias, avoiding double-rounding).
   - **Per façade panel:** `cosProj = clamp(dot(sun.worldDir, panel.normal), 0, 1)`; `incidentAngleDeg = round(rad2deg(acos(cosProj)))`; neighbour occlusion is tested only `if (sun.isDaytime)` via `neighborOcclusion(panel.worldPosition, sun.worldDir, boxes)` against precomputed neighbour AABBs (`neighborAabb`) — at night the panel is treated as fully occluded (`{ occluded: true }`) since there is no beam to block; `occlusionFactor` is `0.0` (occluded) or `1.0` (clear); `diffuseSky = ghi × DIFFUSE_SKY_FRACTION`; `effectiveIrradiance = planeIrradiance(ghi, cosProj, occlusionFactor, sun.isDaytime)`.
   - **Per rooftop PV module:** identical incident-angle/cosine-projection math, but occlusion is not ray-cast — `futureShadingFactor` is hardcoded to `1.0` ("Stage 2 prepares the architecture but leaves it at 1.0 for now"), and only front-side irradiance is computed (no bifacial rear irradiance).

## Engineering Equations

**Solar position** (`solarPosition.ts`, Meeus §25 / NOAA methodology):
```
L0 = 280.46646 + T(36000.76983 + 0.0003032T)                       // geometric mean longitude
M  = 357.52911 + T(35999.05029 − 0.0001537T)                       // geometric mean anomaly
e  = 0.016708634 − T(0.000042037 + 0.0000001267T)                  // orbit eccentricity
C  = sin(M)(1.914602 − T(0.004817+0.000014T)) + sin(2M)(0.019993−0.000101T) + sin(3M)(0.000289)
apparentLong = (L0 + C) − 0.00569 − 0.00478·sin(125.04 − 1934.136T)
ε  = ε0 + 0.00256·cos(125.04 − 1934.136T)                          // ε0 = mean obliquity
declination = asin( sin(ε)·sin(apparentLong) )
eqTime(min) = 4·[ y·sin(2L0) − 2e·sin(M) + 4ey·sin(M)cos(2L0) − 0.5y²sin(4L0) − 1.25e²sin(2M) ],  y = tan²(ε/2)
hourAngle = trueSolarTime/4 − 180                                  // trueSolarTime from local time + eqTime + longitude − timezone offset
cos(zenith) = sin(lat)sin(dec) + cos(lat)cos(dec)cos(hourAngle)
elevation = (90 − zenith) + refractionCorrection(90 − zenith)
azimuth = hourAngle > 0 ? (acos(cosAz) + 180) mod 360 : (540 − acos(cosAz)) mod 360
```

**Atmospheric refraction correction** (`solarPosition.ts`, NOAA polynomial after Meeus §16), arc-seconds → degrees:
```
if elevation > 85°:        r = 0
elif elevation > 5°:       r = 58.1/tan(e) − 0.07/tan(e)³ + 0.000086/tan(e)⁵
elif elevation > −0.575°:  r = 1735 + e(−518.2 + e(103.4 + e(−12.79 + e·0.711)))
else:                      r = −20.772/tan(e)
```

**Air mass** (`solar.ts`, Kasten & Young 1989):
```
m = 1 / ( sin(altitude) + 0.50572 × (altitude + 6.07995)^−1.6364 )     // capped at 40 for altitude ≤ 0
```

**Extraterrestrial irradiance** (`solar.ts`, Spencer 1971 eccentricity):
```
B = 2π(dayOfYear − 1) / 365
eccentricity = 1.000110 + 0.034221cos(B) + 0.001280sin(B) + 0.000719cos(2B) + 0.000077sin(2B)
E0 = SOLAR_CONSTANT × eccentricity
```

**ASHRAE Clear Sky model** (`solar.ts`, Handbook — Fundamentals 2021, Eq. 14.7–14.8):
```
ab = 1.454 − 0.406τb − 0.268τd − 0.021τbτd
ad = 0.507 + 0.205τb − 0.080τd − 0.190τbτd
DNI = E0 × exp(−τb × m^ab)
DHI = E0 × exp(−τd × m^ad)
GHI = DNI × sin(altitude) + DHI
```

**Cloud modification** (`solar.ts`, ASHRAE linear simplification):
```
cloudModificationFactor = 1 − cloudCoverage × 0.75
ghi = max(0, ghiClearSky × cloudModificationFactor)
```

**WHO/WMO UV Index** (`solar.ts`):
```
uvErythemalClearSky = E_UV_PEAK × max(0, cos(zenith))^1.4
uvCMF = 1 − 0.73 × cloudCoverage^3.4                     // Bodeker & McKenzie 1996
uvIndex = round( K_ERYTHEMA × uvErythemalClearSky × uvCMF × 10 ) / 10
```

**Colour temperature** (`solar.ts`):
```
colorTemperature = round( lerp(2200, 6500, smoothstep(0, 45, altitude)) )
```

**Effective plane irradiance — the shared authority** (`solarPhysics.ts`, `planeIrradiance`):
```
attenuatedGHI(sun) = sun.ghiClearSky × sun.cloudModificationFactor
diffuseSky = ghi × DIFFUSE_SKY_FRACTION
direct     = isDaytime ? ghi × cosProjection × visibility : 0
planeIrradiance = round(direct + diffuseSky)
```

**Incident angle / cosine projection** (`solarPhysics.ts`), identical for façade panels and PV modules:
```
cosProjection = clamp( dot(sun.worldDir, surfaceNormal), 0, 1 )
incidentAngleDeg = round( rad2deg( acos(cosProjection) ) )
```

## Constants

| Constant | Value | File |
|---|---|---|
| `SOLAR_CONSTANT` | `1361` W/m² (Kopp & Lean 2011, adopted IAU 2015) | `solar.ts` |
| `OZONE_DU` | `260` DU (equatorial Malaysia annual mean, WMO GAW Report 239, 2018) | `solar.ts` |
| `K_ERYTHEMA` | `40` m²/W (WHO definition) | `solar.ts` |
| `E_UV_PEAK` | `0.325` W/m² (calibrated so peak UVI ≈ 13 at 260 DU) | `solar.ts` |
| `ASHRAE_TAU_B` (Jan–Dec) | `[0.558, 0.551, 0.560, 0.536, 0.530, 0.499, 0.495, 0.497, 0.526, 0.547, 0.548, 0.554]` | `solar.ts` |
| `ASHRAE_TAU_D` (Jan–Dec) | `[1.953, 1.972, 1.969, 2.030, 2.043, 2.106, 2.101, 2.098, 2.027, 1.985, 1.982, 1.960]` | `solar.ts` |
| Cloud coefficient (GHI) | `0.75` | `solar.ts` |
| Cloud coefficient/exponent (UV) | `0.73`, `3.4` | `solar.ts` |
| Colour-temperature range | `2200`–`6500` K over `0`–`45°` altitude | `solar.ts` |
| World-direction altitude floor | `−6°` (keeps the sun sprite slightly below horizon at night rather than at the geometric minimum) | `solar.ts` |
| Air-mass cap | `40` (at/below horizon) | `solar.ts` |
| `DIFFUSE_SKY_FRACTION` | `0.15` | `solarPhysics.ts` |
| Rooftop PV shading placeholder | `futureShadingFactor = 1.0` (not yet modelled) | `solarPhysics.ts` |
| Solar-position series coefficients | `L0`: `280.46646, 36000.76983, 0.0003032`; `M`: `357.52911, 35999.05029, −0.0001537`; `e`: `0.016708634, −0.000042037, −0.0000001267`; equation-of-centre: `1.914602, 0.004817, 0.000014, 0.019993, 0.000101, 0.000289`; apparent-longitude correction: `−0.00569, −0.00478, 125.04, 1934.136`; obliquity: `23, 26, 21.448, 46.815, 0.00059, 0.001813, 0.00256` | `solarPosition.ts` |
| Refraction polynomial coefficients | `58.1, 0.07, 0.000086` (elevation > 5°); `1735, −518.2, 103.4, −12.79, 0.711` (−0.575°–5°); `−20.772` (≤ −0.575°) | `solarPosition.ts` |

## Engineering References

All explicitly cited in source (not inferred):

- **NOAA Global Monitoring Laboratory — Solar Calculator** and *Solar Calculation Details* (`solarPosition.ts`).
- **Meeus, J.** *Astronomical Algorithms*, 2nd ed., Willmann-Bell, 1998 — Ch. 7 (Julian Day), 22 (Nutation & Obliquity), 25 (Solar Coordinates) (`solarPosition.ts`).
- **Reda, I. & Andreas, A.** "Solar Position Algorithm for Solar Radiation Applications," NREL/TP-560-34302 (2004) — cited explicitly as the higher-precision alternative **deliberately not used** (`solarPosition.ts`).
- **ASHRAE Handbook — Fundamentals**, Ch. 14 "Climatic Design Information," 2021 ed. — the τb/τd clear-sky model (`solar.ts`).
- **Kasten, F. & Young, A.T.** "Revised optical air mass tables and approximation formula." *Applied Optics* 28(22), 4735–4738, 1989 (`solar.ts`).
- **Spencer, J.W.** "Fourier series representation of the position of the sun." *Search* 2(5), 172, 1971 (`solar.ts`).
- **WHO.** "Global Solar UV Index: A Practical Guide." WHO/SDE/OEH/02.2, 2002 (`solar.ts`).
- **WMO.** "Scientific Assessment of Ozone Depletion: 2018," GAW Report No. 239 (`solar.ts`).
- **TEMIS** UV Index climatology (`solar.ts`).
- **Bodeker, G.E. & McKenzie, R.L.** "An algorithm for inferring surface UV irradiance…" *J. Applied Meteorology* 35, 1860–1877, 1996 (`solar.ts`, cloud modification factor for UV).

**Note on `src/lib/knowledge/subsystems.ts`:** the knowledge-base entry for `SolarPhysics` cites "NREL Solar Position Algorithm (SPA)" as *the* reference. That is not what the live code implements — the actual position algorithm is the NOAA/Meeus low-precision method; NREL SPA is cited in `solarPosition.ts` only as the higher-precision alternative the codebase explicitly chose **not** to use, because ±0.01–0.1° is already sufficient for a façade twin. Treat the knowledge-base entry as an imprecise shorthand, not a second implementation.

## Assumptions

- `date` calendar fields in `computeSolarPosition` are read as **local civil time**, converted to UTC via the supplied timezone offset — no DST modelling (Malaysia MYT = UTC+8 has none) (`solarPosition.ts`).
- Longitude is east-positive; the observer is at sea level — the small parallax/elevation terms of the full NREL SPA are omitted.
- Aerosol optical depth is absorbed into the ASHRAE τb/τd values rather than modelled separately; surface albedo is assumed ≈0.03 (tropical urban, negligible UV contribution) — stated assumptions, not live variables (`solar.ts` header).
- Total column ozone is fixed at 260 DU (annual equatorial-Malaysia mean) rather than varying seasonally or being fetched (`solar.ts`).
- Cloud attenuation uses the ASHRAE **linear** simplification (`1 − 0.75C`), not a more complex anisotropic sky model (e.g. Perez 1990) — explicitly called "unnecessary here" in the source comment.
- Neighbour occlusion is only ray-cast for panels; rooftop PV modules assume `futureShadingFactor = 1.0` (no self-shading, row-to-row shading, or cloud shading yet) and no rear-side (bifacial) irradiance is computed — both explicitly flagged "Stage 2… leaves it at 1.0 for now" in `solarPhysics.ts`.
- At night (`sun.isDaytime === false`), façade panels are treated as fully occluded (`occluded: true`) without running the ray-cast, since there is no direct beam to test.

## Limitations

- Solar altitude/azimuth accuracy is **≈ ±0.01–0.1°** for the years 1901–2099 (the Meeus/NOAA truncated-series validity window), with near-horizon error dominated by real atmospheric-refraction variability (`solarPosition.ts`).
- GHI accuracy is **≈ ±5–10% vs TMY3** for Kuala Lumpur under clear-sky conditions; UVI accuracy is **≈ ±1 UVI unit** under clear-sky conditions — both stated as "typical for empirical models" (`solar.ts`).
- No dynamic ozone or aerosol modelling — both are fixed constants/assumptions folded into τb/τd.
- Rooftop PV has no row-to-row self-shading and no bifacial rear-irradiance calculation ("Stage 2 only calculates front incident irradiance").
- The cloud model is the ASHRAE linear simplification, not an anisotropic sky model — acceptable per the source comment but a real precision ceiling.
- `SolarPhysicsEngine`'s per-module state is exposed only as internal `Map`s reached through getters keyed by module `id` — there is no single serialisable "solar physics snapshot" type; callers must know the ids to query.

## Dependencies

- [Weather](./weather.md) — `computeSun`'s only external input is `weather.cloudCoverage` (0–1). No other Weather field reaches Solar Physics.
- No dependency on PBIF, the façade, sensors, or the energy chain — Solar Physics sits upstream of essentially the entire simulation pipeline (CLAUDE.md §3: Environment → … → Solar Physics → Virtual Sensors → PBIF → …).

## Consumers

Grep-confirmed callers of `computeSun`, `computeSolarPosition`, `SolarPhysicsEngine`, or its exported pure functions:

- **`AdaptiveSkinEngine`** (`src/lib/engine/adaptiveSkin.ts`) — reads `solarPhysics.getModuleEffectiveIrradiance`/`getModuleIncidentAngle` per panel and the raw `SunState` for solar-tracking targets.
- **AI Prediction / What-If** (`src/lib/prediction/projection.ts`, `insights.ts`) — imports `attenuatedGHI` and `planeIrradiance` directly from `solarPhysics.ts` and reuses `computeSun`/`sampleTimeline` for its forward walk (CLAUDE.md §11.1's "never re-implements it" rule made concrete).
- **Virtual sensors** — `src/lib/engine/virtualSensor.ts` (`getGlobalRawGHI`, `getGlobalCloudAttenuation`, `getModuleEffectiveIrradiance`), `src/lib/embedded/sensors.ts`, `src/lib/vec/sensorLayer.ts`, `src/lib/engine/integration/sensors.ts`.
- **PV chain** — `src/lib/engine/pvElectrical.ts` (`getModuleEffectiveIrradiance` per module), `src/components/twin3d/RoofSolarArray.tsx`.
- **Fault Detection** (`src/lib/ai/faultDetection/faultDetectionEngine.ts`) — cross-checks observed irradiance/position against expected physics.
- **Engineering Assistant context** (`src/lib/assistant/contextBuilder.ts`).
- **UI / debug** — `MetricsHUD.tsx`, `PbifPanel.tsx`, `KinematicsInspector.tsx`, `CyberPhysicalPipeline.tsx`, `UVIndexInspector.tsx`, `IrradianceInspector.tsx`, `OcclusionDebug.tsx` (reads incident angle, cosine projection, occlusion factor, diffuse contribution, blocker), `KinematicsDebug.tsx` (`getSunVector`), `CityLife.tsx`.
- **`Simulation`** (`src/lib/engine/simulation.ts`) — orchestrates `computeSun` → building-local rotation → `SolarPhysicsEngine.update` every environmental tick.

## Public API

**`solarPosition.ts`**:
```ts
computeSolarPosition(date: Date, latitude: number, longitude: number, timezoneHoursFromUtc: number): SolarPositionResult
```

**`solar.ts`**:
```ts
computeSun(clock: SimClock, building: BuildingConfig, cloudCoverage: number): SunState
```

**`solarPhysics.ts`** (module-level, reused by the Prediction layer):
```ts
export const DIFFUSE_SKY_FRACTION: number
attenuatedGHI(sun: SunState): number
planeIrradiance(ghi: number, cosProjection: number, visibility: number, isDaytime: boolean): number
```

**`SolarPhysicsEngine`** class (`solarPhysics.ts`):
```ts
update(surfaces: BuildingSurface[], pvModules: PVModule[], sun: SunState, neighbors: NeighborBuilding[]): void
getGlobalRawGHI(): number
getGlobalCloudAttenuation(): number
getModuleIncidentAngle(moduleId: string): number
getModuleCosineProjection(moduleId: string): number
getModuleOcclusionFactor(moduleId: string): number
getModuleDiffuseContribution(moduleId: string): number
getModuleEffectiveIrradiance(moduleId: string): number
getModuleBlocker(moduleId: string): { id: string; distance: number } | null
getSunVector(): Vec3
```

## Live Outputs

**`SunState`** (`types.ts`): `azimuth`, `altitude`, `irradiance`, `uvIndex`, `colorTemperature`, `worldDir` (`Vec3`), `isDaytime`, plus ASHRAE intermediates — `zenithAngle`, `airMass`, `extraterrestrialIrradiance`, `tauB`, `tauD`, `dniClearSky`, `dhiClearSky`, `ghiClearSky`, `cloudModificationFactor` — and WHO UV intermediates — `uvErythemalClearSky`, `uvCloudModificationFactor`, `ozoneDU`.

**Per-module state** (not a single struct — reached via the getters above, keyed by panel/module `id`): incident angle (°), cosine projection (0–1), occlusion factor (0 or 1 for façade panels, `1.0` placeholder for PV modules), diffuse-sky contribution (W/m²), effective irradiance (W/m², rounded), and the occluding blocker's id/distance when applicable.

**`FacadePanel` fields populated from this subsystem** (`types.ts`, written by `AdaptiveSkinEngine` from the getters above): `incidentAngle`, `irradiance`, and `solarExposure` (= `irradiance / 1000`, the normalised quantity CLAUDE.md §11.5 requires all façade-metric consumers to use instead of re-deriving a geometric cosine).

## Source Files

- `src/lib/engine/solarPosition.ts`
- `src/lib/engine/solar.ts`
- `src/lib/engine/solarPhysics.ts`
- `src/lib/engine/SOLAR_MODEL.md` (hand-written derivation doc, authoritative for the math, cross-checked against source above)
- `src/lib/engine/types.ts` (`SunState`, `PVModule`, `BuildingSurface`, `FacadePanel`)
- `src/lib/engine/simulation.ts` (tick-order orchestration, building-local rotation)
- `src/lib/engine/shading.ts` (`neighborOcclusion`, `verticalGradient` — used by `solarPhysics.ts`)
- `src/lib/engine/building.ts` (`neighborAabb` — used by `solarPhysics.ts`)

## Design Rationale

- **NOAA/Meeus over the legacy Cooper (1969) model** — the codebase explicitly replaces the simpler declination + truncated equation-of-time approximation still used by the ESP32/PBIF firmware layer (`src/lib/simulation/algorithms.ts`, left untouched) because the twin needs a full astronomical basis that "correctly reproduces the Malaysian mid-year north-of-zenith noon sun," which a fixed sinusoid cannot (`SOLAR_MODEL.md` §2, validated numerically in §6).
- **The solar model never sees the building.** `solarPosition.ts`/`solar.ts` output is true-north-referenced and site-instant-only; the building's orientation offset is applied strictly downstream (`Simulation`'s `rotateY` step). This is deliberately how professional BEM tools separate the sky model from the massing, and it is what keeps the architecture geometry-agnostic (CLAUDE.md §6, `SOLAR_MODEL.md` §7).
- **ASHRAE τb/τd over a full anisotropic sky model** — real, published site-specific optical depths for Kuala Lumpur give citable clear-sky accuracy without the complexity of Perez (1990); the source comment calls the more complex alternative "unnecessary here."
- **`planeIrradiance`/`attenuatedGHI` are centralised, exported pure functions**, not private engine internals, specifically so the façade, the rooftop PV array, and the AI Prediction layer's forward projection all compute irradiance through the exact same formula — the concrete mechanism behind CLAUDE.md §11.1's "it re-uses the engines' physics; it never re-implements it" rule.
- **Occlusion is skipped (not ray-cast) at night** because a below-horizon sun cannot cast a beam to occlude — treating it as `{ occluded: true }` is both correct and cheaper than running the ray test.

## Future Extension Points

- **Rooftop PV self/row shading and bifacial gain** — explicitly staged but not implemented: `futureShadingFactor` is hardcoded `1.0` with the comment "Stage 2 prepares the architecture but leaves it at 1.0 for now," and only front-side irradiance is computed ("Stage 2 only calculates front incident irradiance") (`solarPhysics.ts`).
- **Higher-precision position** — `solarPosition.ts` names the NREL SPA (Reda & Andreas, 2004) as the drop-in upgrade path if sub-arc-second accuracy over millennia is ever needed; explicitly judged unnecessary today.
- **Anisotropic sky / Perez transposition** for cloud correction — named in `solar.ts` as a more complex alternative to the current linear ASHRAE simplification, not adopted because the added complexity is judged unneeded for this twin.
- Spectral irradiance modelling is listed only in the shallow `src/lib/knowledge/subsystems.ts` catalogue entry as a "future extension" — it has no supporting code or staged architecture in `solar.ts`/`solarPhysics.ts`, so it should be treated as aspirational rather than an in-progress capability.
