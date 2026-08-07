# Weather Subsystem

**Subsystem ID:** Weather
**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

The Weather subsystem produces every environmental driver the rest of the digital twin consumes — temperature, humidity, cloud coverage, rain intensity and wind speed — plus the quantities derived from them (visibility, pressure, gust strength, ground wetness, UV index passthrough). It has three cooperating parts:

- **`WeatherScenarioEngine`** (`weatherScenario.ts`) — the **only** authority that writes the current weather whenever the operator is not driving it by hand. It plays back a `WeatherKeyframe[]` timeline, sourced either from a built-in scenario or from the Live Forecast Engine, through one shared interpolation path.
- **`LiveForecastEngine`** (`liveForecast.ts`) — fetches, caches and converts a real Open-Meteo forecast into the same `WeatherKeyframe[]` shape a scenario uses, and hands it to `WeatherScenarioEngine` through the small `WeatherTimelineProvider` interface. It never writes weather itself.
- **`ForecastProvider` / `OpenMeteoProvider`** (`forecastProvider.ts`) — the network boundary. A provider's only job is to return normalised `ForecastSample`s; swapping providers touches nothing else.
- **`weather.ts`** (`updateWeather`, `updateWind`) — derives every dependent field (visibility, pressure, UV passthrough, ground wetness, gust strength, wind vector) from the five drivers, identically regardless of which source produced them.

## Responsibilities

- Interpolate the five driver fields (temperature, humidity, cloudCoverage, rainIntensity, windSpeed) deterministically across simulated time, for both a built-in scenario and a real forecast, through one code path (`sampleTimeline` / `segmentAt` / `ease` / `blendInto`).
- Fetch, cache (in-memory and `localStorage`) and refresh a real hourly forecast without ever touching the network from the simulation's hot loop.
- Fold a 48-hour forecast bundle into a 24-hour, hour-of-day-indexed playback timeline compatible with the scenario interpolation contract.
- Derive visibility, pressure, ground wetness and gust/wind-vector fields from the five drivers — owned by `weather.ts` in **every** mode, never by the scenario or forecast engines.
- Report forecast provenance (issue time, coverage window, cache age, quality grade) for traceability against Open-Meteo's published data.

Responsibilities explicitly **not** held here (from `weatherScenario.ts` / `liveForecast.ts` header comments):

- No PBIF decisions, no solar calculations, no sensor simulation, no façade logic.
- No network access from `WeatherScenarioEngine` itself, and no provider/cache knowledge — that is `LiveForecastEngine`'s job alone.
- `LiveForecastEngine` never writes `Simulation.weather` directly.

## Inputs

- `timeHours` — the simulation clock's hour-of-day cursor (`WeatherScenarioEngine.update(timeHours)`), the sole driver of playback position.
- `WeatherSourceMode` — `'manual' | 'scenario' | 'forecast'`, set via `setMode()`.
- Scenario selection — a scenario `id` from `WEATHER_SCENARIOS`, set via `setScenario()`.
- `sunUv` — `SunState.uvIndex` from the Solar Physics subsystem, passed into `updateWeather()` as a straight passthrough (see [Solar Physics](./solar.md)).
- `dt` / `envDt` — elapsed simulated seconds since the last environmental-tier recompute, used by the first-order lag filters in `updateWeather`/`updateWind`.
- `ForecastRequest { latitude, longitude, hours }` — the site coordinates and requested horizon (`FORECAST_HORIZON_HOURS = 48`) passed to `OpenMeteoProvider.fetchForecast`.

## Outputs

- `WeatherDrivers` — `{ temperature, humidity, cloudCoverage, rainIntensity, windSpeed }`, returned by `WeatherScenarioEngine.update()` and written into `Simulation.weather` via `Object.assign`.
- The full `WeatherState` object (`types.ts`) after `weather.ts` has run: adds `pressure`, `visibility`, `uvIndex`, `windStrength`, `groundWetness`, `windVector`, plus the untouched `windDirection`.
- `WeatherKeyframe[]` — the active playback timeline, readable via `getTimeline()`.
- `ForecastStatus` — the full provenance/quality object the Weather panel's Forecast Data card renders.

## Internal Calculation Pipeline

**Per-tick playback** (`Simulation.tick()`, environmental tier, resolved only at `envDt > 0`):

1. `applyScenarioWeather()` calls `weatherScenario.update(clock.timeHours)`. In Manual Mode this is a no-op (`isActive()` is false, returns `null`). In Scenario/Forecast Mode it locates the timeline segment (`segmentAt`), eases the position (`ease`), and blends the drivers (`blendInto`) into a reused buffer — zero allocation on the hot path.
2. If drivers were returned, they are `Object.assign`-ed onto `this.weather` — **only** the five driver fields change here.
3. `computeSun(clock, building, weather.cloudCoverage)` runs next, consuming the just-updated `cloudCoverage` (see [Solar Physics](./solar.md)).
4. `updateWeather(weather, sun.uvIndex, envDt)` derives visibility, pressure (lagged toward a target) and ground wetness (asymmetric wet/dry rates), and passes `uvIndex` straight through from the sun state.
5. `updateWind(weather, envDt)` advances a persistent gust-phase oscillator and derives `windStrength` and `windVector` from `windSpeed`/`windDirection`.

This ordering means Weather and Solar Physics are not circular despite each reading a value the other produces in the same tick: cloud coverage is finalised **before** `computeSun` runs, and `uvIndex` is finalised **before** `updateWeather` runs — a strict one-pass pipeline, not a cycle.

**Forecast acquisition** (`LiveForecastEngine`, never from `tick()`):

1. `start()` (called when Forecast Mode is selected) restores any `localStorage`-persisted bundle for the current site, rebuilds the timeline from it immediately, then kicks off an async `refresh()` and arms an hourly timer (`FORECAST_REFRESH_MINUTES = 60`).
2. `refresh()` calls `OpenMeteoProvider.fetchForecast()`. On success the bundle is cached (`ForecastCache.store`, mirrored to `localStorage`) and `rebuildTimeline()` runs. On failure, the error is absorbed: `lastAttemptFailed` flips true, and if a cached bundle already exists it is used to (re)build the timeline — a failed refresh never blanks a populated cache.
3. `rebuildTimeline()` folds the 48 h bundle into a 24-entry playback window: starting from the sample covering "now" (`epochMs >= now - 1h`), it walks the bundle circularly and keeps the **first** sample seen for each hour-of-day, until 24 distinct hours are collected or the bundle is exhausted. The result is sorted ascending by hour-of-day — the exact contract `segmentAt` expects.
4. `WeatherScenarioEngine.getTimeline()` in Forecast Mode simply calls `forecastProvider.getTimeline()` — i.e. `LiveForecastEngine.getTimeline()` — so the same interpolation code plays it back.

## Engineering Equations

**Visibility** (`weather.ts`):
```
haze = humidity / 100
vis  = 40 * (1 - haze * 0.45) * (1 - cloudCoverage * 0.2) * (1 - rainIntensity * 0.7)
visibility = max(1.5, round(vis * 10) / 10)
```

**Pressure** — first-order lag toward a weather-derived target (`weather.ts`):
```
targetPressure = 1013 - rainIntensity * 12 - cloudCoverage * 4 + (1 - haze) * 3
pressure += (targetPressure - pressure) * min(1, dt * 0.5)
```

**UV Index** — straight passthrough from the Solar Physics subsystem (`weather.ts`):
```
w.uvIndex = sunUv
```

**Ground wetness** — asymmetric rise/decay integrator (`weather.ts`):
```
wetTarget = clamp(rainIntensity * 1.15)
if wetTarget > groundWetness:
    groundWetness += (wetTarget - groundWetness) * min(1, dt * 0.8)
else:
    groundWetness = max(wetTarget, groundWetness - dt * 0.03)
groundWetness = clamp(groundWetness)
```

**Wind gust strength and vector** (`weather.ts`, `updateWind`):
```
gustPhase += dt * (0.6 + windSpeed * 0.02)
base = clamp(windSpeed / 60)
gust = (sin(gustPhase) * 0.5 + sin(gustPhase * 2.3 + 1) * 0.25 + 0.75) / 1.5
windStrength = clamp(base * (0.6 + gust * 0.4))
windVector = compassToWorld((windDirection + 180) % 360, 0)   // wind blows FROM windDirection; travel is opposite
```

**Timeline segment location and easing** (`weatherScenario.ts`):
```
span    = to.timeHours - from.timeHours          (+24 if <= 0, wraps past midnight)
elapsed = hours - from.timeHours                 (+24 if < 0)
t       = clamp(elapsed / span)
ease(t) = t * t * (3 - 2 * t)                    // smoothstep easing
driver  = lerp(a[field], b[field], ease(t))       // per driver field, in blendInto
```

**Forecast rain normalisation** (`forecastProvider.ts`):
```
rainIntensity = clamp(precipitation_mm_per_hour / RAIN_MM_PER_HOUR_FULL_INTENSITY)   // RAIN_MM_PER_HOUR_FULL_INTENSITY = 10
```

**Forecast sample instant** (`forecastProvider.ts`, `OpenMeteoProvider.fetchForecast`):
```
epochMs = Date.parse(`${localTimeString}:00Z`) - utcOffsetSeconds * 1000
```
Reading the provider's local wall-clock string as if it were UTC, then subtracting the site's own offset, yields the true instant independent of the browser's timezone.

**Cache age** (`liveForecast.ts`, `ForecastCache.ageMinutes`):
```
ageMinutes = max(0, floor((now - fetchedAt) / 60000))
```

## Constants

| Constant | Value | File |
|---|---|---|
| `RAIN_MM_PER_HOUR_FULL_INTENSITY` | `10` | `forecastProvider.ts` |
| `FORECAST_HORIZON_HOURS` | `48` | `forecastProvider.ts` |
| `FORECAST_REFRESH_MINUTES` | `60` | `liveForecast.ts` |
| `QUALITY_GOOD_AFTER_MINUTES` | `= FORECAST_REFRESH_MINUTES` (60) | `liveForecast.ts` |
| `QUALITY_FAIR_AFTER_MINUTES` | `6 * 60 = 360` | `liveForecast.ts` |
| `QUALITY_STALE_AFTER_MINUTES` | `24 * 60 = 1440` | `liveForecast.ts` |
| `CACHE_STORAGE_KEY` | `'solis.forecast.cache.v2'` | `liveForecast.ts` |
| `CACHE_LOCATION_TOLERANCE_DEG` | `0.05` | `liveForecast.ts` |
| `RAIN_LABEL_HEAVY` | `0.35` | `liveForecast.ts` (label only, not physics) |
| `RAIN_LABEL_LIGHT` | `0.05` | `liveForecast.ts` (label only) |
| `CLOUD_LABEL_OVERCAST` | `0.75` | `liveForecast.ts` (label only) |
| `CLOUD_LABEL_PARTLY` | `0.35` | `liveForecast.ts` (label only) |
| Visibility model coefficients | `40`, `0.45`, `0.2`, `0.7`, floor `1.5` | `weather.ts` |
| Pressure baseline | `1013` hPa, coefficients `12`, `4`, `3`, lag rate `0.5` | `weather.ts` |
| Ground wetness | rain multiplier `1.15`, wetting rate `0.8`, drying rate `0.03` | `weather.ts` |
| Gust model | phase rate `0.6`/`0.02`, speed divisor `60`, gust weights `0.5`/`0.25`/`0.75÷1.5`, blend `0.6`/`0.4` | `weather.ts` |
| `LOCAL_TIMEZONE_ABBREVIATION` | `Asia/Kuala_Lumpur→MYT`, `Asia/Singapore→SGT`, `Asia/Dubai→GST` | `forecastProvider.ts` |
| `OPEN_METEO_ENDPOINT` | `https://api.open-meteo.com/v1/forecast` | `forecastProvider.ts` |
| `DEFAULT_WEATHER_SCENARIO_ID` | `'tropical-mixed'` | `weatherScenario.ts` |
| Driver envelope (documented, not enforced by an assertion) | temperature 16–44 °C, humidity 20–100 %, wind 0–60 km/h | `weatherScenario.ts` comment |

## Engineering References

- **Open-Meteo API** — the actual, live external data source `OpenMeteoProvider` fetches (`forecastProvider.ts`, `OPEN_METEO_ENDPOINT`, `hourly=temperature_2m,relative_humidity_2m,cloud_cover,precipitation,wind_speed_10m`). This is a real, code-visible integration, not an inferred standard.
- The **derived-field formulas in `weather.ts`** (visibility, pressure lag, ground wetness, gust model) carry **no citation in source**. They read as hand-tuned empirical approximations built for a plausible, continuous demonstration climate — not a transcription of a named meteorological standard (e.g. no ISO/WMO visibility formula, no barometric model). State this plainly rather than attributing a standard that isn't there.
- The `ease(t) = t²(3−2t)` **smoothstep** used for timeline interpolation is the standard Hermite smoothstep (not separately cited in `weatherScenario.ts`, but the identical form is used — and is explicitly a "recognised" technique — elsewhere in the codebase, e.g. `solar.ts`'s colour-temperature blend).

## Assumptions

- Weather is geographically uniform across the site — a single scalar `WeatherState`, no spatial variation.
- Timeline **driver** sampling is a pure function of hour-of-day: no RNG, no accumulated state, no frame-rate dependence (`weatherScenario.ts` header). This guarantee applies specifically to `sampleTimeline`/`segmentAt`/`blendInto` — **not** to `updateWind`'s gust model, which intentionally integrates a persistent module-level `gustPhase` variable over `dt` and is therefore frame-rate-independent but not a pure function of hour-of-day alone.
- Pressure and ground wetness are modelled as first-order lag responses toward an instantaneous target, not as instantaneous values — a deliberate "physical response takes time" assumption.
- Pressure is deliberately **not** fetched from the forecast provider; `weather.ts` derives it from humidity/cloud/rain so there is exactly one source of truth (CLAUDE.md §5.3.1).
- The 24 h fold assumes the forecast's nearest-in-time sample for a given hour-of-day is an adequate stand-in for "today's" value at that hour, even though the source bundle spans two calendar days.
- Open-Meteo's free tier publishes no ensemble spread or probability, so forecast confidence is honestly reported as unavailable rather than estimated (`getConfidence()` returns `null`).

## Limitations

- **`windDirection` is not a scenario/forecast driver.** `WeatherDrivers` is `Pick<WeatherState, 'temperature'|'humidity'|'cloudCoverage'|'rainIntensity'|'windSpeed'>` — it excludes `windDirection`. Scenario and Forecast Mode therefore drive wind **speed** only; direction stays at whatever value Manual Mode last set (or the default), even while a timeline is actively playing.
- No microclimate or local wind-turbulence modelling around the building — a single site-wide weather state.
- Rain intensity saturates at `1.0` for any precipitation ≥ 10 mm/h (`RAIN_MM_PER_HOUR_FULL_INTENSITY`); heavier tropical downpours are indistinguishable from a 10 mm/h event once normalised.
- `getConfidence()` always returns `null` — stated as an honest limitation of the free Open-Meteo endpoint, not a placeholder for a future value that already exists elsewhere.
- A relocated site within `CACHE_LOCATION_TOLERANCE_DEG` (0.05°, roughly a few km) silently reuses the previous location's cached forecast rather than re-fetching.
- A failed refresh with **nothing** ever cached leaves `getTimeline()` returning `null`; `WeatherScenarioEngine.update()` then returns `null` too, and the simulation holds the last weather value rather than receiving anything invalid (never a crash, never fabricated data).

## Dependencies

- [Solar Physics](./solar.md) — `updateWeather()` takes `sun.uvIndex` as an input parameter (`sunUv`) and passes it straight through to `WeatherState.uvIndex`. This is the only cross-subsystem read Weather performs; everything else about Weather is self-contained and upstream of the rest of the twin.

## Consumers

Grep-confirmed readers of `WeatherState` fields, `WeatherScenarioEngine`, or `LiveForecastEngine`:

- **PBIF / façade decision logic** — `src/lib/engine/environmentalInfluence.ts` reads `weather.cloudCoverage`, `weather.temperature`, `weather.rainIntensity`, `weather.windSpeed` as façade-control influence factors.
- **`AdaptiveSkinEngine`** (`src/lib/engine/adaptiveSkin.ts`) — reads `weather.windStrength` (wave/oscillation timing), `weather.windSpeed`, `weather.rainIntensity`, `weather.temperature` for panel physics and the solar-tracking fallback.
- **Virtual sensors** — `src/lib/embedded/sensors.ts`, `src/lib/embedded/panel.ts`, `src/lib/vec/sensorLayer.ts`, `src/lib/engine/integration/sensors.ts` simulate rain/wind sensor channels from weather state.
- **Fault Detection** — `src/lib/ai/faultDetection/faultDetectionEngine.ts` cross-checks observed weather against expected subsystem behaviour.
- **AI Prediction / What-If** — `src/lib/prediction/*` reuse `sampleTimeline` and read `weather`/timeline data through `PredictionContext`.
- **Engineering Assistant context** — `src/lib/assistant/contextBuilder.ts` summarises weather for the AI assistant layer.
- **UI** — `ControlDeck.tsx`, `ForecastPanel.tsx`, `CyberPhysicalPipeline.tsx`, `UVIndexInspector.tsx`, `IrradianceInspector.tsx`, `RainFX.tsx` (visual rain effect), `BuildingLightingPanel.tsx`, `GroundScene.tsx`, `CityLife.tsx`, plus debug views (`OcclusionDebug.tsx`, `KinematicsDebug.tsx`).
- **`Simulation`** (`src/lib/engine/simulation.ts`, `src/lib/engine/store.ts`) — orchestrates the whole pipeline described above.

## Public API

**`WeatherScenarioEngine`** (`weatherScenario.ts`):
```ts
connectForecast(provider: WeatherTimelineProvider): void
setMode(mode: WeatherSourceMode): void
setScenario(id: string): void
isActive(): boolean
getTimeline(): readonly WeatherKeyframe[] | null
update(timeHours: number): WeatherDrivers | null
getMode(): WeatherSourceMode
getScenario(): WeatherScenario
getScenarioId(): string
getStatus(): WeatherTimelineStatus
getCurrent(): Readonly<WeatherDrivers>
getPrevious(): Readonly<WeatherDrivers>
getActiveKeyframe(): WeatherKeyframe | null
getNextKeyframe(): WeatherKeyframe | null
getUpcomingKeyframes(count?: number): WeatherKeyframe[]
getScheduledWeather(fromHours: number, hoursAhead: number): WeatherDrivers | null
```
Module-level: `sampleTimeline(timeline, hours)`, `sampleWeatherScenario(scenario, hours)`, `getWeatherScenario(id)`.

**`LiveForecastEngine`** (`liveForecast.ts`), implements `WeatherTimelineProvider`:
```ts
constructor(provider: ForecastProvider, location: { latitude, longitude, locationName }, cache?: ForecastCache)
start(): void
stop(): void
isRunning(): boolean
setLocation(latitude: number, longitude: number, locationName: string): void
refresh(): Promise<void>
getTimeline(): readonly WeatherKeyframe[] | null
getStatus(): ForecastStatus
getSamples(): readonly ForecastSample[]
getCurrentSample(atMs?: number): ForecastSample | null
getUpcomingSamples(count?: number, atMs?: number): ForecastSample[]
getAgeMinutes(): number
getConfidence(): number | null
```
Module-level: `replayInstantMs(timeline, activeIndex, segmentProgress)`, `chronologicalOrder(timeline)`.

**`ForecastCache`**: `get()`, `store(bundle)`, `restore(latitude, longitude)`, `clear()`, `ageMinutes(now?)`.

**`ForecastProvider`** interface / **`OpenMeteoProvider`** (`forecastProvider.ts`): `fetchForecast(request: ForecastRequest, signal?: AbortSignal): Promise<ForecastBundle>`.

**`weather.ts`**: `updateWeather(w: WeatherState, sunUv: number, dt: number): void`, `updateWind(w: WeatherState, dt: number): void`.

**`forecastTime.ts`**: `formatSiteDay`, `formatSiteDate`, `formatSiteClock`, `formatSiteTime`, `formatSiteStamp`, `formatCoverage`, `formatMinutes` — pure formatters, always render in the forecast site's own timezone.

## Live Outputs

**`WeatherState`** (`types.ts`): `temperature`, `humidity`, `windSpeed`, `windDirection`, `cloudCoverage`, `rainIntensity`, `pressure`, `visibility`, `uvIndex`, `windStrength`, `groundWetness`, `windVector` (`Vec3`).

**`WeatherTimelineStatus`**: `mode`, `scenarioId`, `activeIndex`, `nextIndex`, `segmentProgress`, `timelineMissing`.

**`ForecastStatus`**: `providerName`, `state`, `connection`, `locationName`, `latitude`, `longitude`, `horizonHours`, `resolution`, `lastUpdated`, `lastAttempt`, `coverageStart`, `coverageEnd`, `utcOffsetSeconds`, `timezone`, `timezoneAbbreviation`, `nextRefresh`, `cacheAgeMinutes`, `sampleCount`, `quality`, `error`, `version`.

**`WeatherKeyframe`**: `timeHours`, `label`, `icon?`, `sourceEpochMs?`, plus the `WeatherDrivers` fields.

## Source Files

- `src/lib/engine/weather.ts`
- `src/lib/engine/weatherScenario.ts`
- `src/lib/engine/liveForecast.ts`
- `src/lib/engine/forecastProvider.ts`
- `src/lib/dt/forecastTime.ts`
- `src/lib/engine/simulation.ts` (orchestration / tick ordering)
- `src/lib/engine/types.ts` (`WeatherState` definition)

## Design Rationale

- **Sampling is a pure function of hour-of-day** so playback speed, pausing and timeline scrubbing all need zero special-casing: 1×, 5×, 10× playback traverse the identical curve, pausing freezes it exactly, and scrubbing jumps straight to the correct weather (`weatherScenario.ts` header comment).
- **`WeatherScenarioEngine` is the sole producer of current weather**, and Scenario/Forecast differ only in where the `WeatherKeyframe[]` came from — this is what lets the entire rest of the pipeline (solar, sensors, PBIF, façade, PV, BEMS) stay unaware of which source is active (CLAUDE.md §5.3).
- **`WeatherTimelineProvider` is deliberately the smallest possible interface** (`getTimeline()` only) — this is what keeps the forecast provider, its cache and its network code entirely outside `WeatherScenarioEngine`.
- **Pressure is not fetched** even though Open-Meteo could supply it, specifically to avoid a second, unused source of truth alongside `weather.ts`'s own derivation (`forecastProvider.ts` comment).
- **The 48 h bundle is folded into a 24 h window** because the simulation clock is an hour-of-day cursor, not a real calendar clock — walking from "now" and keeping the first sample per hour-of-day guarantees every hour of the day is filled with the forecast nearest in time.
- **The cache is mirrored to `localStorage`** so a page reload — or a session that starts offline — still has a forecast to play rather than nothing.
- **A failed fetch never interrupts playback**: cached data keeps playing and the status turns amber (`connection: 'cached'`), because a demonstration twin should degrade gracefully, not freeze or crash on a flaky network.

## Future Extension Points

- `LiveForecastEngine.getConfidence()` is explicitly written to return `null` today with the comment "A provider that does expose one can surface it here" — the API shape is already in place for a provider with ensemble/probability data.
- The `ForecastProvider` interface is designed so that swapping Open-Meteo for another service, or a recorded fixture for testing, is a constructor argument to `LiveForecastEngine` and touches nothing else (CLAUDE.md §2).
- No live code currently models microclimates or per-façade-face wind turbulence; the architecture (single scalar `WeatherState`) would need to change to support it — this is a described limitation, not a committed roadmap item.
