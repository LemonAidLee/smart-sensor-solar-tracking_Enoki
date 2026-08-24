# Environment: Weather, Solar Physics & Virtual Sensing

I built this layer to answer three questions the rest of the twin depends on every tick: what is the weather doing right now, where is the sun, and what does a physical light sensor mounted on the façade actually read given both of those. Three engines answer them in a fixed order — `WeatherScenarioEngine`, `SolarPhysicsEngine`, `VirtualSensorEngine` — and nothing downstream (PBIF, the servo, the façade, PV, BEMS) knows or cares which weather source fed the first one.

Source: [`src/lib/engine/weatherScenario.ts`](../../src/lib/engine/weatherScenario.ts), [`weather.ts`](../../src/lib/engine/weather.ts), [`liveForecast.ts`](../../src/lib/engine/liveForecast.ts), [`forecastProvider.ts`](../../src/lib/engine/forecastProvider.ts), [`solar.ts`](../../src/lib/engine/solar.ts), [`solarPosition.ts`](../../src/lib/engine/solarPosition.ts), [`solarPhysics.ts`](../../src/lib/engine/solarPhysics.ts), [`virtualSensor.ts`](../../src/lib/engine/virtualSensor.ts), [`ldrPhysics.ts`](../../src/lib/engine/ldrPhysics.ts).

## Purpose

- Produce one continuous, deterministic weather state — five driver variables — regardless of whether it's hand-set, played back from a built-in day profile, or replayed from a real Open-Meteo forecast.
- Compute the sun's true astronomical position and the clear-sky irradiance it delivers at the site, then attenuate that irradiance by the current cloud cover.
- Convert the irradiance actually landing on each façade panel into what a real light-dependent-resistor circuit would output on a 12-bit ADC — the same signal PBIF's solar-resource tier reads.

## Inputs

| Input | Source | Units / range |
|---|---|---|
| Manual weather sliders | Operator, Weather panel | temperature °C, humidity %, cloud 0–1, rain 0–1, wind km/h |
| Built-in scenario timeline | `WEATHER_SCENARIOS` (`weatherScenario.ts`) | 7 hand-authored day profiles, each a `WeatherKeyframe[]` |
| Live forecast timeline | `LiveForecastEngine` via `OpenMeteoProvider` | same 5 drivers, converted from Open-Meteo's hourly series |
| Site latitude / longitude / timezone | `BuildingConfig` (default: Kuala Lumpur, 3.14° N, 101.69° E, UTC+8) | degrees, UTC offset hours |
| Simulated clock | `SimClock.timeHours`, `SimClock.date` | hour of day 0–24, calendar date |
| Effective panel/module irradiance | `SolarPhysicsEngine.getModuleEffectiveIrradiance()` | W/m² |

## Processing

### 1. WeatherScenarioEngine — the sole producer of current weather

`WeatherScenarioEngine` is the only thing that writes the five weather driver fields — `temperature`, `humidity`, `cloudCoverage`, `rainIntensity`, `windSpeed` — whenever the operator isn't driving them by hand. It owns a `WeatherSourceMode`: `'manual' | 'scenario' | 'forecast'`. In Manual Mode `isActive()` is false and `update()` returns `null` immediately — the sliders are the only writer. In Scenario or Forecast Mode, every tick it samples a `WeatherKeyframe[]` timeline at the current simulated hour and writes the interpolated result into `WeatherState`.

Everything else about `WeatherState` — visibility, pressure, gust strength, ground wetness, UV index — is derived from those five drivers by `weather.ts`'s `updateWeather()`/`updateWind()`, identically in every mode:

```
visibility = max(1.5, 40 × (1 − 0.45·haze) × (1 − 0.2·cloud) × (1 − 0.7·rain))   km   [weather.ts:15]
pressure  → relaxes toward 1013 − 12·rain − 4·cloud + 3·(1−haze) hPa, at rate min(1, dt·0.5)  [weather.ts:18-19]
groundWetness → rises toward clamp(1.15·rain) at rate min(1, dt·0.8), dries at 0.03/s   [weather.ts:24-27]
windStrength = clamp(windSpeed/60 × (0.6 + gust·0.4))   [weather.ts:33-35]
```

where `haze = humidity/100`. `uvIndex` is copied directly from the sun's `uvIndex` (§2 below) — weather.ts does not compute it itself.

**Timeline interpolation (`sampleTimeline`, `weatherScenario.ts:280-284`).** A timeline is an array of keyframes, each exact `WeatherDrivers` at a given `timeHours`. To sample an arbitrary hour `h`, `segmentAt()` finds the bracketing pair `[from, to]` and a linear position `t` within it, wrapping past midnight — the segment after the last keyframe interpolates into the first, so a 7-entry timeline (say, 7:00–20:00) is continuous across the whole 24 h including the overnight gap. `t` is then passed through smoothstep easing, `t²(3−2t)`, before the five fields are linearly interpolated — this is what keeps the weather from visibly kinking at each keyframe boundary.

**Determinism.** `sampleTimeline` is a pure function of `(timeline, hours)` — no RNG, no accumulated state, no frame-rate dependence. That means 1×, 5× and 10× playback all trace the identical curve, pausing freezes the weather exactly where it is, and scrubbing the clock jumps straight to the correct value. Running the same scenario twice produces byte-identical weather.

**Where the source is resolved.** `Simulation.tick()` calls `applyScenarioWeather()` — which calls `weatherScenario.update(clock.timeHours)` — at the top of the environmental tier, before `computeSun()` is invoked (`simulation.ts:329-330`). Solar physics, sensors, PBIF, the servo, the façade, PV and BEMS all read `this.weather` afterward with no awareness of which of the three modes produced it.

### 2. Weather sources: Manual / Scenario / Forecast

| Source | Owner of the drivers | Behaviour |
|---|---|---|
| **Manual** | operator sliders | unchanged from the original slider-driven model |
| **Scenario** | `WeatherScenarioEngine`, built-in timeline | one of 7 deterministic Kuala Lumpur day profiles (`sunny`, `partly-cloudy`, `tropical-mixed` [default], `rainy`, `thunderstorm`, `heat-wave`, `windy`) |
| **Forecast** | `WeatherScenarioEngine`, timeline supplied by `LiveForecastEngine` | real Open-Meteo hourly data, cached and replayed on the simulation clock |

Scenario and Forecast differ **only** in where the `WeatherKeyframe[]` came from — interpolation, easing, midnight wrap and determinism are the one shared code path in `sampleTimeline`.

Driver ranges in the built-in scenarios deliberately stay inside the Manual Mode slider envelopes (temperature 16–44 °C, humidity 20–100 %, wind 0–60 km/h — `weatherScenario.ts:108-110`), so switching source can never land the simulation outside a state the operator could have dialled in by hand.

### 2.1 Forecast Mode: fetch, cache, fold, replay

`LiveForecastEngine` fetches through the `ForecastProvider` interface (`OpenMeteoProvider` today) and hands `WeatherScenarioEngine` a `WeatherKeyframe[]` — it never writes weather itself, and it never touches `Simulation.weather`.

**Request.** `OpenMeteoProvider.fetchForecast()` requests exactly five hourly variables — `temperature_2m`, `relative_humidity_2m`, `cloud_cover`, `precipitation`, `wind_speed_10m` — with `timezone=auto` so the returned timestamps are already local to the site. Pressure is deliberately not requested: `weather.ts` derives it, and a fetched value would be a second, unused source of truth. Each sample is normalised into the twin's own units:

```
temperature  → °C, passed through
humidity     → clamp(%, 0, 100)
cloudCoverage → clamp(cloud_cover / 100)                         [0-1]
rainIntensity → clamp(precipitation_mm/h / 10)                    [10 mm/h ⇒ intensity 1.0]
windSpeed    → max(0, wind_speed_10m)                              km/h
```
(`forecastProvider.ts:170-184`, `RAIN_MM_PER_HOUR_FULL_INTENSITY = 10`.)

**Horizon and cache.** The engine requests and caches `FORECAST_HORIZON_HOURS = 48` hours. The bundle is mirrored to `localStorage` (`solis.forecast.cache.v2`) so a page reload — or a session that starts offline — still has a forecast to replay; a restored bundle is only reused if it's within `CACHE_LOCATION_TOLERANCE_DEG = 0.05°` of the current site.

**48 h → 24 h playback fold (`rebuildTimeline()`, `liveForecast.ts:384-413`).** The simulation clock is an hour-of-day cursor, not a real-time clock, so the 48 h bundle has to be folded down to one keyframe per hour of day. The engine walks the cached samples in chronological order starting from the hour currently in progress (`epochMs >= now − 1 h`) and keeps the **first** sample it sees for each `hourOfDay`, stopping once 24 distinct hours are filled. Because the walk starts at "now," the sample kept for each hour of day is always the one nearest in time — the fold can't accidentally pick tomorrow's 14:00 reading over today's just because of array order. The result is sorted ascending by `timeHours` — the exact contract `segmentAt()` interpolates against — and only then converted to keyframes and handed to `WeatherScenarioEngine`. If fewer than 2 distinct hours survive the fold, the timeline is `null` rather than a degenerate one-point timeline.

**Refresh cadence.** `FORECAST_REFRESH_MINUTES = 60`. `start()` (called when Forecast Mode is selected) restores any persisted cache immediately, fires an initial `refresh()` in the background, and arms the hourly timer — the network is never touched from `tick()`, only from `start()`, the timer, or the operator's Refresh button.

**Graceful degradation.** A failed fetch is absorbed: `lastAttemptFailed` flips, the status turns amber (`'cached'`), and the existing timeline keeps playing untouched. If nothing has ever been cached, `getTimeline()` returns `null`; `WeatherScenarioEngine.update()` then returns `null` too, which means the weather is *held* exactly at its last value rather than reset — no null weather ever reaches `Simulation.weather`, by construction of `applyScenarioWeather()`'s `if (drivers) Object.assign(...)` guard.

**Provenance for side-by-side verification.** Each forecast-derived keyframe carries `sourceEpochMs` — the real forecast instant it replays. `replayInstantMs()` combines the active keyframe's `sourceEpochMs` with the segment's linear progress to report the exact forecast hour being replayed right now; `chronologicalOrder()` re-sorts the *display* of a stored timeline (which is ordered by hour-of-day, not real time) back into true calendar order without touching the stored array `segmentAt()` interpolates against. Timestamps are formatted with `src/lib/dt/forecastTime.ts` in the **forecast site's own UTC offset and timezone abbreviation** (from Open-Meteo's response, e.g. `MYT`), never the viewer's browser timezone — that's what makes a side-by-side check against Open-Meteo's published forecast meaningful.

### 3. SolarPhysicsEngine

**Sun position.** `computeSolarPosition()` (`solarPosition.ts`) implements the NOAA Solar Calculator methodology — the low-precision solar-position series of Meeus, *Astronomical Algorithms* (2nd ed., 1998): Julian day → Julian century → geometric mean longitude/anomaly → equation of centre → apparent longitude → obliquity/nutation → declination + equation of time → hour angle → topocentric altitude/azimuth, with the standard atmospheric-refraction correction applied near the horizon. Declared accuracy is ≈ ±0.01–0.1° for 1901–2099 (the file documents NREL SPA, Reda & Andreas 2004, as the higher-precision alternative it deliberately doesn't need for a façade twin). Azimuth is measured clockwise from true north (0° = N, 90° = E) and is a property of site + instant only — the building's orientation offset is applied downstream, not inside this function.

**Clear-sky irradiance.** `computeSun()` (`solar.ts`) uses the ASHRAE clear-sky τb/τd model (*ASHRAE Handbook — Fundamentals*, 2021, Ch. 14):

```
DNI = E₀ · exp(−τb · m^ab)              direct normal
DHI = E₀ · exp(−τd · m^ad)              diffuse horizontal
GHI = DNI · sin(altitude) + DHI         global horizontal
ab  = 1.454 − 0.406τb − 0.268τd − 0.021τb·τd
ad  = 0.507 + 0.205τb − 0.080τd − 0.190τb·τd
```

`m` is air mass by Kasten & Young (1989): `m = 1 / (sin(h) + 0.50572·(h + 6.07995)^−1.6364)`, capped at 40 for `h ≤ 0`. `E₀` is extraterrestrial irradiance, `SOLAR_CONSTANT = 1361 W/m²` corrected for Earth–Sun eccentricity (Spencer 1971). `τb`/`τd` are monthly ASHRAE Table-3 values calibrated for Kuala Lumpur (WMOID 486470), indexed by calendar month. Cloud attenuation is ASHRAE's linear simplification: `GHI_cloudy = GHI_clear × (1 − cloudCoverage × 0.75)`.

UV Index follows the WHO/WMO model: `UVI = k_er × E_UV` with `k_er = 40 m²/W`, clear-sky erythemal irradiance modelled as `E_UV ∝ cos(zenith)^1.4` calibrated to a tropical peak of UVI ≈ 13, and a cloud modification factor `CMF = 1 − 0.73·C^3.4` (Bodeker & McKenzie 1996). This is a separate output from GHI — it isn't consumed by irradiance downstream, only displayed and fed back into `weather.uvIndex`.

**Effective plane irradiance (`planeIrradiance`, `solarPhysics.ts:29-38`)** is the single function every consumer — façade blades, rooftop PV modules, and the Stage 8 prediction engine's forward projection — calls for the irradiance actually striking a surface:

```
diffuseSky = GHI × DIFFUSE_SKY_FRACTION        (0.15 — always present, even fully shaded)
direct     = isDaytime ? GHI × cosProjection × visibility : 0
effective  = round(direct + diffuseSky)
```

`cosProjection` is `clamp(dot(sunWorldDir, panelNormal), 0, 1)`; `visibility` is `0` when a neighbouring building's AABB occludes the direct ray, `1` otherwise (rooftop PV modules currently always resolve `visibility = 1`, since self/neighbour shading for the roof array is a stated future extension, not yet implemented). This is computed independently per façade panel and per PV module every environmental tick.

### 4. VirtualSensorEngine / ldrPhysics.ts — the GL5528 sensing chain

`VirtualSensorEngine` converts each panel's effective irradiance into what the physical hardware's ADC would read, through `computeLdrChain()` — the one implementation of this chain shared with the Virtual Embedded Controller's `embedded/sensors.ts` (CLAUDE.md's Single Source of Truth rule):

```
Ev  = η · G                                   irradiance (W/m²) → lux, η = LUX_PER_WM2 = 120
R   = R10 · (10 / Ev)^γ, clamped ≤ R_dark     GL5528-style CdS photoresistor power law
V   = VCC · R_fixed / (R_fixed + R)           voltage divider (LDR is the VCC-side leg)
ADC = round((V / VCC) × 4095)                 12-bit ESP32-S3 SAR ADC
```

`R10 = 10 kΩ` and `γ = 0.7` are typical published GL5528 datasheet values (`R10 ≈ 8–20 kΩ`, `γ ≈ 0.7` over the 10–100 lux range); `R_fixed = 10 kΩ`; the dark-condition ceiling `R_dark = 1 MΩ` is the clamp that keeps the power law from diverging to infinity as illuminance approaches zero. `VCC = 3.3 V` (ESP32-S3 logic supply). Extrapolating the 10–100 lux datasheet power law up to full daylight (tens of thousands of lux) is a stated, deliberate engineering approximation — documented in `embedded/constants.ts` rather than hidden — made so the twin can demonstrate the full day/night dynamic range with one consistent model instead of switching models at high illuminance.

**Temporal behaviour — a single first-order low-pass filter.** `VirtualSensorEngine.update()` applies one exponential smoothing filter per sensor to the raw ADC value:

```
α = 1 − exp(−dt / τ),   τ = 0.5 s
filtered(t) = filtered(t−dt) + (raw(t) − filtered(t−dt)) · α
```

This τ = 0.5 s time constant is the *only* temporal behaviour the sensor model has. No electrical noise (shot noise, ADC quantisation jitter beyond the real 12-bit rounding, thermal/Johnson noise) and no thermal drift of the LDR's response curve are modelled — the chain from irradiance to filtered ADC counts is otherwise a pure, deterministic function of the instantaneous effective irradiance. I built it this way on purpose: the twin's job at this layer is to prove the sensing→PBIF→actuation chain against real physics-derived irradiance, not to reproduce a specific LDR's noise floor, and a deterministic sensor model keeps every downstream PBIF decision traceable back to an exact, reproducible irradiance value rather than a noisy one that would differ between runs.

Two sensor instances exist per module map: one **global reference** channel (roof-mounted, always unoccluded — driven by `getGlobalRawGHI() × getGlobalCloudAttenuation()`) and one **per-panel** channel driven by that panel's own `getModuleEffectiveIrradiance()`. The demonstration hardware's four-LDR quadrant array (ADC0–ADC3) is a presentation-layer relabelling of two real internal channels (`ldrUpper`, `ldrLower`) — this engine and `SolarPhysicsEngine` are unaffected by that display convention; see the twin-side hardware counterpart in [ESP32 Firmware](../embedded/esp32_firmware.md).

## Constants

| Constant | Value | Meaning | Source |
|---|---|---|---|
| `DIFFUSE_SKY_FRACTION` | 0.15 | Fraction of attenuated GHI a surface sees even with zero direct beam | `solarPhysics.ts:10` |
| `SOLAR_CONSTANT` | 1361 W/m² | Total solar irradiance (TSI), Kopp & Lean 2011 / IAU 2015 | `solar.ts:91` |
| `OZONE_DU` | 260 DU | Annual mean total column ozone, equatorial Malaysia (WMO GAW #239, 2018) | `solar.ts:95` |
| `K_ERYTHEMA` | 40 m²/W | WHO erythemal UV Index conversion constant | `solar.ts:98` |
| `E_UV_PEAK` | 0.325 W/m² | Peak clear-sky erythemal UV irradiance at zenith ≈ 0°, calibrated to UVI ≈ 13 | `solar.ts:103` |
| Cloud attenuation (GHI) | `1 − cloud × 0.75` | ASHRAE linear cloud correction | `solar.ts:183` |
| Cloud modification (UV) | `1 − 0.73·cloud^3.4` | Bodeker & McKenzie 1996 | `solar.ts:200` |
| `LUX_PER_WM2` (η) | 120 lux per W/m² | Daylight luminous efficacy, radiometric → photometric | `embedded/constants.ts:27` |
| `LDR_R10_OHMS` | 10,000 Ω | GL5528 resistance at 10 lux | `embedded/constants.ts:43` |
| `LDR_GAMMA` | 0.7 | GL5528 datasheet log-log slope | `embedded/constants.ts:44` |
| `LDR_FIXED_RESISTOR_OHMS` | 10,000 Ω | Divider's fixed leg | `embedded/constants.ts:45` |
| `LDR_DARK_RESISTANCE_OHMS` | 1,000,000 Ω | Dark-condition resistance ceiling | `embedded/constants.ts:57` |
| `VCC` | 3.3 V | ESP32-S3 logic supply | `embedded/constants.ts:16` |
| `ADC_MAX` | 4095 (12-bit) | ESP32 SAR ADC full span | `embedded/constants.ts:14`, from `FW.ADC_MAX` |
| LDR filter time constant τ | 0.5 s | First-order low-pass on every ADC reading | `virtualSensor.ts:42` |
| `FORECAST_HORIZON_HOURS` | 48 h | Forecast window requested and cached | `forecastProvider.ts:88` |
| `RAIN_MM_PER_HOUR_FULL_INTENSITY` | 10 mm/h | Precipitation rate that maps to `rainIntensity = 1.0` | `forecastProvider.ts:85` |
| `FORECAST_REFRESH_MINUTES` | 60 min | Cache refresh cadence while Forecast Mode is active | `liveForecast.ts:32` |
| `CACHE_LOCATION_TOLERANCE_DEG` | 0.05° | Max lat/long drift for a persisted cache to be reused | `liveForecast.ts:42` |
| Manual slider envelope | 16–44 °C, 20–100 % RH, 0–60 km/h wind | Bound every built-in scenario stays inside | `weatherScenario.ts:108-110` |

## Outputs

- `WeatherState` (`temperature`, `humidity`, `cloudCoverage`, `rainIntensity`, `windSpeed` plus the derived `visibility`, `pressure`, `uvIndex`, `groundWetness`, `windStrength`, `windVector`) — read by solar physics (cloud only), PBIF, the AI layer, and every weather-facing UI panel.
- `SunState` (`azimuth`, `altitude`, `irradiance`, `uvIndex`, `worldDir`, `isDaytime`, plus the ASHRAE intermediates — `zenithAngle`, `airMass`, `extraterrestrialIrradiance`, `tauB`/`tauD`, `dniClearSky`/`dhiClearSky`/`ghiClearSky`, `cloudModificationFactor`) — read by the Engineering Inspector, PBIF's solar-resource assessment, and the façade kinematics solver.
- Per-panel and per-PV-module: incident angle, cosine projection, occlusion factor, diffuse contribution, effective irradiance (W/m²) — the direct input to `VirtualSensorEngine` and to `metrics.ts`'s `facadeSolarGainKW`.
- Per-sensor: lux, LDR resistance (Ω), divider voltage (V), raw ADC counts, and the filtered ADC counts (0–4095) PBIF's Tier 3 solar-resource classification actually reads.
- `WeatherTimelineStatus` and `ForecastStatus` — read-only telemetry (active/next keyframe index, segment progress, cache age, coverage window, freshness quality) for the Weather panel and the Stage 8 AI layer.

## Data flow / dependencies

```
Environment
  ↓
Forecast Provider (OpenMeteoProvider) → Live Forecast Engine        [Forecast Mode only; async, never from tick()]
  ↓
Weather Scenario Engine   (resolves Manual / Scenario / Forecast; writes WeatherState's 5 drivers)
  ↓
weather.ts (updateWeather / updateWind — derives visibility, pressure, gust, wetness)
  ↓
Solar Physics   (computeSolarPosition → computeSun → planeIrradiance, per panel and per PV module)
  ↓
Virtual Sensors (computeLdrChain + τ=0.5s low-pass, per panel)
  ↓
PBIF → Servo → Adaptive Façade → …
```

This matches CLAUDE.md §3 exactly: the weather source is resolved once, at the top of the environmental tier in `Simulation.tick()`, strictly before `computeSun()` is called (`simulation.ts:329-330`). Nothing past this layer — PBIF, the servo, the façade, PV, BEMS, battery, grid — is aware of which of the three weather sources is currently active; they all consume the same `WeatherState` and `SunState` shapes regardless.

See [PBIF & Adaptive Façade Kinematics](../facade/pbif_and_kinematics.md) for how the filtered ADC reading this layer produces feeds PBIF's Tier 3 solar-resource classification, and [ESP32 Firmware](../embedded/esp32_firmware.md) for the physical/virtual embedded controller that reads the equivalent signal on real (and simulated) hardware.

## Engineering assumptions

- **This is simulated physics, not measured hardware data.** Sun position is a well-established astronomical algorithm (NOAA/Meeus), irradiance is a published clear-sky radiation model (ASHRAE τb/τd) calibrated with real tabulated coefficients for Kuala Lumpur, and Forecast Mode replays an actual live weather API (Open-Meteo). None of it is a recorded sensor log — it's grounded, cited engineering formulae producing believable numbers on demand, which is what a demonstration digital twin needs.
- **The sensor model is deterministic by design.** The GL5528 chain — irradiance → lux → resistance → divider voltage → ADC counts — is a pure function of instantaneous effective irradiance, then passed through exactly one first-order low-pass filter (τ = 0.5 s). No electrical noise and no thermal drift are modelled. That's a deliberate choice: it keeps every PBIF decision reproducible and traceable to an exact irradiance value, which matters more here than reproducing a specific LDR's noise floor.
- **The LDR power law is extrapolated beyond its characterised range.** GL5528-style datasheets characterise the 10–100 lux band; the twin needs the same model to span night through full tropical daylight (tens of thousands of lux), so the power law is deliberately extended past where a real component is normally specified — documented in `embedded/constants.ts`, not hidden.
- **Rooftop PV shading is a stated future extension.** `planeIrradiance`'s `visibility` term is fully wired for the façade (neighbour-building occlusion via AABB ray test), but rooftop PV modules currently always resolve `visibility = 1` — self-shading and neighbour shading for the roof array are prepared for architecturally but not yet computed.
- **Forecast confidence is honestly reported as unavailable.** Open-Meteo's free tier publishes no ensemble spread, so `LiveForecastEngine.getConfidence()` returns `null` rather than a fabricated number.
