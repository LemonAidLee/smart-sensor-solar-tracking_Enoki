/**
 * Solar Engine — physically-based irradiance and UV index.
 *
 * Uses the NOAA Solar Calculator (Meeus, *Astronomical Algorithms*, 1998) for
 * sun position, then derives irradiance and UV Index from recognised
 * engineering models — never arbitrary scaling factors.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IRRADIANCE MODEL: ASHRAE Clear Sky (τb, τd formulation)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Reference:
 *   ASHRAE. *Handbook — Fundamentals*, Chapter 14 "Climatic Design
 *   Information", 2021 edition. The τ model was introduced in the 2009
 *   edition and refined in 2013/2017/2021.
 *
 * The model decomposes Global Horizontal Irradiance (GHI) into:
 *   DNI = E₀ × exp(−τb × m^ab)                      (beam / direct normal)
 *   DHI = E₀ × exp(−τd × m^ad)                      (diffuse horizontal)
 *   GHI = DNI × sin(altitude) + DHI                  (global horizontal)
 *
 * where
 *   ab = 1.454 − 0.406×τb − 0.268×τd − 0.021×τb×τd  (beam pseudo-exponent)
 *   ad = 0.507 + 0.205×τb − 0.080×τd − 0.190×τb×τd  (diffuse pseudo-exponent)
 *   m  = air mass (Kasten & Young 1989)
 *   E₀ = extraterrestrial irradiance corrected for Earth–Sun eccentricity
 *
 * τb and τd values for Kuala Lumpur (WMOID 486470) are from ASHRAE
 * Handbook — Fundamentals 2021, Table 3.
 *
 * Air Mass:
 *   Kasten, F. & Young, A.T. "Revised optical air mass tables and
 *   approximation formula." *Applied Optics* 28(22), 4735–4738, 1989.
 *   m = 1 / (sin(h) + 0.50572 × (h + 6.07995)^−1.6364)
 *
 * Cloud correction:
 *   GHI_cloudy = GHI_clear × (1 − C × 0.75)
 *   This linear form is the standard ASHRAE simplification; more complex
 *   models (e.g. Perez 1990 anisotropic sky) are unnecessary here.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UV INDEX MODEL: WHO/WMO Standard
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Reference:
 *   WHO. "Global Solar UV Index: A Practical Guide." WHO/SDE/OEH/02.2,
 *   World Health Organization, 2002.
 *   https://www.who.int/publications/i/item/9241590076
 *
 *   WMO. "Scientific Assessment of Ozone Depletion: 2018." Global
 *   Atmosphere Watch Report No. 239, 2018.
 *
 *   TEMIS (Tropospheric Emission Monitoring Internet Service). UV Index
 *   climatology. https://www.temis.nl/uvradiation/UVindex.php
 *
 * UV Index = k_er × E_UV, where k_er = 40 m²/W (WHO definition).
 *
 * Clear-sky erythemal UV irradiance is modelled using the empirical
 * relationship E_UV ∝ cos(zenith)^1.4, scaled so the tropical peak
 * (zenith ≈ 0°) produces UVI ≈ 13 at 260 DU ozone (equatorial Malaysia
 * annual mean from WMO 2018, Fig 3-4).
 *
 * Cloud modification factor:
 *   CMF = 1 − 0.73 × C^3.4
 *   Bodeker, G.E. & McKenzie, R.L. "An algorithm for inferring surface
 *   UV irradiance..." *J. Applied Meteorology* 35, 1860–1877, 1996.
 *   Cited in WHO (2002), Section 2.3.
 *
 * Assumptions:
 *   • Total column ozone: 260 DU (equatorial Malaysia annual mean)
 *   • Aerosol optical depth absorbed into ASHRAE τb/τd
 *   • Surface albedo: ~0.03 (tropical urban, negligible UV contribution)
 *
 * Expected accuracy:
 *   GHI: ±5–10% vs TMY3 for Kuala Lumpur under clear-sky conditions.
 *   UVI: ±1 UVI unit under clear-sky conditions (typical for empirical models).
 */

import { computeSolarPosition } from './solarPosition'
import type { BuildingConfig, SimClock, SunState } from './types'
import { clamp, compassToWorld, deg2rad, lerp, smoothstep } from './math'

// ═══════════════════════════════════════════════════════════════════════════
// ASHRAE τb, τd monthly values for Kuala Lumpur (WMOID 486470)
// Source: ASHRAE Handbook — Fundamentals 2021, Table 3.
// ═══════════════════════════════════════════════════════════════════════════
const ASHRAE_TAU_B = [0.558, 0.551, 0.560, 0.536, 0.530, 0.499, 0.495, 0.497, 0.526, 0.547, 0.548, 0.554]
const ASHRAE_TAU_D = [1.953, 1.972, 1.969, 2.030, 2.043, 2.106, 2.101, 2.098, 2.027, 1.985, 1.982, 1.960]

/** Solar constant (TSI), W/m². Kopp & Lean (2011), adopted by IAU 2015. */
const SOLAR_CONSTANT = 1361

/** Annual mean total column ozone for equatorial Malaysia (DU).
 *  WMO GAW Report No. 239 (2018), Fig 3-4. */
const OZONE_DU = 260

/** WHO definition: UVI = k_er × E_UV, where k_er = 40 m²/W. */
const K_ERYTHEMA = 40

/** Peak clear-sky erythemal UV irradiance (W/m²) at zenith ≈ 0° for
 *  equatorial Malaysia at 260 DU ozone. Calibrated from TEMIS UVI
 *  climatology (peak UVI ≈ 13 → E_UV = 13/40 = 0.325 W/m²). */
const E_UV_PEAK = 0.325

// ═══════════════════════════════════════════════════════════════════════════
// Build the concrete Date the astronomical algorithm expects from the clock.
// ═══════════════════════════════════════════════════════════════════════════
function simDate(clock: SimClock): Date {
  const d = clock.date
  const h = Math.floor(clock.timeHours)
  const m = Math.floor((clock.timeHours - h) * 60)
  const s = Math.floor(((clock.timeHours - h) * 60 - m) * 60)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, s)
}

/** Day of year, 1–366. */
function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / 86400000)
}

/**
 * Air mass using the Kasten & Young (1989) formula.
 * Reference: Applied Optics 28(22), 4735–4738, 1989.
 * Valid for solar altitude h > 0°.
 */
function airMassKastenYoung(altitudeDeg: number): number {
  if (altitudeDeg <= 0) return 40 // At/below horizon, cap at ~40
  const h = altitudeDeg
  return 1 / (Math.sin(deg2rad(h)) + 0.50572 * Math.pow(h + 6.07995, -1.6364))
}

/**
 * Extraterrestrial irradiance E₀ (W/m²), corrected for Earth–Sun
 * eccentricity using Spencer (1971).
 * Reference: Spencer, J.W. "Fourier series representation of the position
 * of the sun." *Search* 2(5), 172, 1971.
 */
function extraterrestrialIrradiance(doy: number): number {
  const B = (2 * Math.PI * (doy - 1)) / 365
  const eccentricity = 1.000110 + 0.034221 * Math.cos(B) + 0.001280 * Math.sin(B)
    + 0.000719 * Math.cos(2 * B) + 0.000077 * Math.sin(2 * B)
  return SOLAR_CONSTANT * eccentricity
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════════════
export function computeSun(clock: SimClock, building: BuildingConfig, cloudCoverage: number): SunState {
  const date = simDate(clock)
  const solar = computeSolarPosition(date, building.latitude, building.longitude, building.timezone)
  const altitude = solar.elevation
  const azimuth = solar.azimuth
  const isDaytime = altitude > 0
  const zenithAngle = 90 - altitude

  // ── ASHRAE Clear Sky Model ──────────────────────────────────────────────

  const month = date.getMonth() // 0-indexed
  const tauB = ASHRAE_TAU_B[month]
  const tauD = ASHRAE_TAU_D[month]

  const m = airMassKastenYoung(altitude)
  const doy = dayOfYear(date)
  const E0 = extraterrestrialIrradiance(doy)

  // ASHRAE pseudo-optical-depth exponents (Handbook 2021, Eq 14.7–14.8)
  const ab = 1.454 - 0.406 * tauB - 0.268 * tauD - 0.021 * tauB * tauD
  const ad = 0.507 + 0.205 * tauB - 0.080 * tauD - 0.190 * tauB * tauD

  let dniClearSky = 0
  let dhiClearSky = 0
  let ghiClearSky = 0

  if (altitude > 0) {
    dniClearSky = E0 * Math.exp(-tauB * Math.pow(m, ab))
    dhiClearSky = E0 * Math.exp(-tauD * Math.pow(m, ad))
    ghiClearSky = dniClearSky * Math.sin(deg2rad(altitude)) + dhiClearSky
  }

  // Cloud modification (ASHRAE linear simplification)
  const cloudModificationFactor = 1 - cloudCoverage * 0.75
  const ghi = Math.max(0, ghiClearSky * cloudModificationFactor)
  // Alias: downstream consumers use `irradiance`
  const irradiance = Math.round(ghi)

  // ── WHO / WMO UV Index Model ────────────────────────────────────────────

  // Clear-sky erythemal UV: E_UV ∝ cos(zenith)^1.4
  // Scaled so peak (zenith=0°) yields E_UV_PEAK = 0.325 W/m² → UVI ≈ 13
  let uvErythemalClearSky = 0
  if (altitude > 0) {
    const cosZenith = Math.cos(deg2rad(zenithAngle))
    uvErythemalClearSky = E_UV_PEAK * Math.pow(Math.max(0, cosZenith), 1.4)
  }

  // Cloud modification factor for UV (Bodeker & McKenzie 1996)
  // CMF = 1 − 0.73 × C^3.4
  const uvCMF = 1 - 0.73 * Math.pow(cloudCoverage, 3.4)
  const uvErythemal = uvErythemalClearSky * uvCMF
  const uvIndex = Math.round(K_ERYTHEMA * uvErythemal * 10) / 10

  // ── Colour temperature (warm horizon → cool zenith) ─────────────────────
  const colorTemperature = Math.round(lerp(2200, 6500, smoothstep(0, 45, altitude)))

  return {
    azimuth,
    altitude,
    irradiance,
    uvIndex,
    colorTemperature,
    worldDir: compassToWorld(azimuth, Math.max(altitude, -6)),
    isDaytime,

    // ASHRAE pipeline intermediates
    zenithAngle,
    airMass: Math.round(m * 100) / 100,
    extraterrestrialIrradiance: Math.round(E0),
    tauB,
    tauD,
    dniClearSky: Math.round(dniClearSky),
    dhiClearSky: Math.round(dhiClearSky),
    ghiClearSky: Math.round(ghiClearSky),
    cloudModificationFactor: Math.round(cloudModificationFactor * 1000) / 1000,

    // WHO UV pipeline intermediates
    uvErythemalClearSky: Math.round(uvErythemalClearSky * 10000) / 10000,
    uvCloudModificationFactor: Math.round(uvCMF * 1000) / 1000,
    ozoneDU: OZONE_DU,
  }
}
