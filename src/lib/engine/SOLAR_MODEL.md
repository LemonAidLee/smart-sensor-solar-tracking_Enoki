# Solar Position Model — Digital Twin

## 1. Selected model

**NOAA Solar Calculator methodology**, implementing the low-precision solar
equations of **Jean Meeus, _Astronomical Algorithms_ (2nd ed., 1998)**.
Implemented in [`solarPosition.ts`](./solarPosition.ts) as `computeSolarPosition()`
and consumed by the engine in [`solar.ts`](./solar.ts).

The pipeline is: local civil time → Julian Day/Century → Sun's geometric mean
longitude & anomaly → equation of centre → apparent longitude → obliquity of the
ecliptic → **declination** + **equation of time** → true solar time → **hour
angle** → **solar altitude** (with atmospheric-refraction correction) and
**solar azimuth** (clockwise from true north).

## 2. Why this model

- A **recognised, citable engineering standard** (meteorology, PV, building-energy
  simulation) — not interpolation or a hand-drawn curve.
- Full astronomical basis, correct year-round and across latitudes (it correctly
  reproduces the Malaysian mid-year **north-of-zenith noon sun**, which a fixed
  sinusoid cannot).
- Much simpler than the full NREL SPA while easily accurate enough for a façade
  twin.
- **Replaces** the legacy simplified model (Cooper 1969 declination +
  truncated equation of time) in `src/lib/simulation/algorithms.ts`. That file is
  **left untouched** so the ESP32 / PBIF layer is unaffected — the twin's sky
  model and the firmware's are cleanly decoupled.

## 3. Assumptions

- `date` calendar fields are **local civil time** at the site; converted to UTC
  with the site time-zone (**no DST** — Malaysia MYT = UTC+8 has none).
- Longitude east-positive; observer at sea level (the small elevation/parallax
  terms of the full SPA are omitted).
- Atmospheric refraction via NOAA's standard polynomial (matters only near the
  horizon).

## 4. Expected accuracy

Solar **altitude and azimuth within ≈ ±0.01–0.1°** for **1901–2099** (the validity
window Meeus/NOAA quote for these truncated series), with near-horizon error
dominated by real refraction variability. Sub-arc-second precision over ±6000 yr
would require the NREL SPA — unnecessary here.

## 5. References / source attribution

1. **NOAA Global Monitoring Laboratory — Solar Calculator** and _Solar Calculation
   Details_. https://gml.noaa.gov/grad/solcalc/ ·
   https://gml.noaa.gov/grad/solcalc/calcdetails.html
2. **Meeus, J. _Astronomical Algorithms_, 2nd ed., Willmann-Bell, 1998** — Ch. 7
   (Julian Day), 22 (Nutation & Obliquity), 25 (Solar Coordinates). The equations
   NOAA's calculator derives from.
3. **Reda, I. & Andreas, A. _Solar Position Algorithm for Solar Radiation
   Applications_, NREL/TP-560-34302 (2004)** — the higher-precision SPA, cited as
   the accuracy reference we deliberately did not need.

## 6. Mathematical validation — Kuala Lumpur (3.14°N, 101.69°E, UTC+8), 2026-07-21

| Local time | Altitude | Azimuth | Sector | Notes |
|-----------:|---------:|--------:|:------:|-------|
| 07:00 | −3.4° | 69.2° | E | just before sunrise, east |
| 09:00 | 24.6° | 68.9° | E | climbing in the east |
| 11:00 | 51.8° | 60.2° | E | — |
| 13:00 | 72.0° | 15.1° | N | approaching solar noon |
| **13:15** | **72.6°** | **3.7°** | **N** | **solar noon — max altitude** |
| 15:00 | 60.1° | 307.3° | W | descending in the west |
| 17:00 | 33.7° | 292.6° | W | — |
| 19:00 | 5.9° | 290.2° | W | near sunset, west |

Declination ≈ **+20.5°** and equation of time ≈ **−6.4 min** both match published
late-July values. The noon azimuth swinging to **~North** is physically correct:
in the northern-hemisphere summer the solar declination (+20.5°) exceeds KL's
latitude (3.14°), so the midday sun sits slightly **north** of the zenith. This is
the daily/annual behaviour actually observed in Malaysia.

**Result:** morning → low altitude, **east**; solar noon → **maximum altitude**,
correct near-north azimuth for Malaysia; afternoon → decreasing altitude, **west**.

## 7. Architecture — separation of astronomical vs building orientation

```
World Coordinate System (fixed)      compassToWorld(): +X=E, +Z=S, −Z=N, −X=W
  ├── True North / East / South / West     → OrientationOverlay.tsx (world compass)
        │
        ▼
Solar Model (site + instant only)    solarPosition.ts  (NOAA/Meeus)
  ├── Latitude, Longitude, Date, Time, Time-zone
  └── → Solar Altitude, Solar Azimuth   (true-north referenced, building-independent)
        │
        ▼
Building
  └── Orientation Offset (currently 0°)     → geometry.ts rotates the massing only
        │
        ▼
Façade Surfaces (N / E / S / W)      normals derived from the offset massing
```

The solar model **never** sees the building. Adding a Building-Orientation control
later only rotates the massing relative to the fixed world frame — exactly how
professional BEM tools are structured — with **zero changes to the solar
calculations**.
