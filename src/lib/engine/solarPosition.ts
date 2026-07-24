/**
 * Physically-based Solar Position — NOAA Solar Calculator methodology.
 * ===================================================================
 *
 * MODEL
 *   NOAA Solar Position Calculations, which implement the low-precision solar
 *   position equations of Jean Meeus, *Astronomical Algorithms* (2nd ed., 1998).
 *   This is the same procedure published by the NOAA Global Monitoring Laboratory
 *   Solar Calculator, computing geocentric solar declination, the equation of
 *   time, the hour angle from true solar time, and from those the topocentric
 *   solar altitude and azimuth for any latitude / longitude / instant.
 *
 * WHY THIS MODEL
 *   • Recognised, citable engineering standard used by meteorology, PV and
 *     building-energy tools; far more rigorous than the Cooper (1969) declination
 *     + truncated equation-of-time approximation used in the legacy
 *     `simulation/algorithms.ts` (which is retained for the ESP32/PBIF layer).
 *   • Full astronomical basis (Julian date → Julian century → geometric mean
 *     longitude/anomaly → equation of centre → apparent longitude → obliquity →
 *     declination + equation of time), not an interpolated or hand-drawn curve.
 *   • Includes the standard atmospheric-refraction correction near the horizon.
 *
 * COORDINATE CONVENTION (WORLD / TRUE-NORTH REFERENCED — building-independent)
 *   • `elevation` : degrees above the local horizontal plane (solar altitude).
 *   • `azimuth`   : degrees measured CLOCKWISE from TRUE NORTH
 *                   (0° = N, 90° = E, 180° = S, 270° = W).
 *   The output is a property of the SITE + INSTANT only. The building's
 *   orientation offset is applied downstream (see `geometry.ts`), never here —
 *   exactly how professional BEM tools separate the sky model from the massing.
 *
 * ASSUMPTIONS
 *   • Calendar fields of `date` are read as LOCAL civil time at the site and
 *     converted to UTC with the supplied `timezoneHoursFromUtc` (no DST — the
 *     twin runs on standard time; Malaysia MYT = UTC+8 has no DST).
 *   • Longitude is degrees EAST-positive. Elevation is sea level; the small
 *     parallax/elevation terms of the full NREL SPA are omitted.
 *
 * EXPECTED ACCURACY
 *   Solar altitude & azimuth within ≈ ±0.01–0.1° for the years 1901–2099
 *   (the validity window Meeus / NOAA quote for these truncated series),
 *   dominated near the horizon by real atmospheric-refraction variability.
 *   For sub-arc-second work over ±6000 yr, the NREL SPA (Reda & Andreas, 2004)
 *   would be used instead; that precision is unnecessary for a façade twin.
 *
 * REFERENCES (source attribution)
 *   [1] NOAA Global Monitoring Laboratory — Solar Calculator & "Solar
 *       Calculation Details".  https://gml.noaa.gov/grad/solcalc/
 *       Spreadsheet: https://gml.noaa.gov/grad/solcalc/calcdetails.html
 *   [2] Meeus, J. *Astronomical Algorithms*, 2nd ed., Willmann-Bell, 1998
 *       (Chapters 7 "Julian Day", 22 "Nutation & Obliquity", 25 "Solar
 *       Coordinates"). The equations NOAA's calculator is derived from.
 *   [3] Reda, I. & Andreas, A. "Solar Position Algorithm for Solar Radiation
 *       Applications." NREL/TP-560-34302 (2004) — the higher-precision SPA,
 *       cited here as the accuracy reference we deliberately did not need.
 *   Atmospheric-refraction polynomial: NOAA Solar Calculator, after
 *   Meeus (1998), §16.
 */

const rad = (d: number): number => (d * Math.PI) / 180
const deg = (r: number): number => (r * 180) / Math.PI
const clampUnit = (x: number): number => (x < -1 ? -1 : x > 1 ? 1 : x)
const mod360 = (x: number): number => ((x % 360) + 360) % 360

export interface SolarPositionResult {
  /** Solar altitude, degrees above the local horizon (refraction-corrected). */
  elevation: number
  /** Solar azimuth, degrees clockwise from TRUE NORTH (0=N, 90=E, 180=S, 270=W). */
  azimuth: number
  /** Solar declination, degrees. */
  declination: number
  /** Hour angle, degrees (negative = morning, 0 = solar noon, positive = afternoon). */
  hourAngle: number
  /** Equation of time, minutes. */
  equationOfTime: number
  isDaytime: boolean
}

/** Julian Day for a UTC instant (Meeus, Ch. 7 — Gregorian calendar). */
function julianDay(year: number, month: number, day: number, utcDayFraction: number): number {
  let y = year
  let m = month
  if (m <= 2) {
    y -= 1
    m += 12
  }
  const A = Math.floor(y / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5 + utcDayFraction
}

/** NOAA atmospheric-refraction correction (degrees) for a true altitude. */
function refractionCorrection(elevationDeg: number): number {
  if (elevationDeg > 85) return 0
  const te = Math.tan(rad(elevationDeg))
  let r: number // arc-seconds
  if (elevationDeg > 5) r = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5
  else if (elevationDeg > -0.575)
    r = 1735 + elevationDeg * (-518.2 + elevationDeg * (103.4 + elevationDeg * (-12.79 + elevationDeg * 0.711)))
  else r = -20.772 / te
  return r / 3600
}

/**
 * Compute the topocentric solar position (NOAA methodology).
 *
 * @param date   Local civil time at the site (calendar fields read as local).
 * @param latitude  Degrees north-positive.
 * @param longitude Degrees east-positive.
 * @param timezoneHoursFromUtc  e.g. +8 for Malaysia (MYT). No DST applied.
 */
export function computeSolarPosition(
  date: Date,
  latitude: number,
  longitude: number,
  timezoneHoursFromUtc: number,
): SolarPositionResult {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const localMinutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60

  // Julian date/century at the corresponding UTC instant.
  const utcDayFraction = localMinutes / 1440 - timezoneHoursFromUtc / 24
  const jd = julianDay(year, month, day, utcDayFraction)
  const T = (jd - 2451545.0) / 36525.0

  // Sun's geometric mean longitude & anomaly, orbit eccentricity (Meeus §25).
  const L0 = mod360(280.46646 + T * (36000.76983 + 0.0003032 * T))
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)

  // Equation of centre → true & apparent longitude.
  const C =
    Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) +
    Math.sin(rad(3 * M)) * 0.000289
  const trueLong = L0 + C
  const apparentLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(125.04 - 1934.136 * T))

  // Obliquity of the ecliptic (mean + nutation correction) and declination.
  const epsilon0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const epsilon = epsilon0 + 0.00256 * Math.cos(rad(125.04 - 1934.136 * T))
  const declination = deg(Math.asin(Math.sin(rad(epsilon)) * Math.sin(rad(apparentLong))))

  // Equation of time (minutes).
  const y = Math.tan(rad(epsilon / 2)) ** 2
  const eqTime =
    4 *
    deg(
      y * Math.sin(2 * rad(L0)) -
        2 * e * Math.sin(rad(M)) +
        4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) -
        0.5 * y * y * Math.sin(4 * rad(L0)) -
        1.25 * e * e * Math.sin(2 * rad(M)),
    )

  // True solar time (minutes) → hour angle (degrees).
  const trueSolarTime = (localMinutes + eqTime + 4 * longitude - 60 * timezoneHoursFromUtc + 1440) % 1440
  let hourAngle = trueSolarTime / 4 - 180
  if (hourAngle < -180) hourAngle += 360

  // Solar zenith → altitude (Meeus §13, spherical triangle).
  const latR = rad(latitude)
  const decR = rad(declination)
  const haR = rad(hourAngle)
  const cosZenith = clampUnit(Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR))
  const zenith = deg(Math.acos(cosZenith))
  const trueElevation = 90 - zenith
  const elevation = trueElevation + refractionCorrection(trueElevation)

  // Solar azimuth, clockwise from true north (NOAA form).
  let azimuth: number
  const denom = Math.cos(latR) * Math.sin(rad(zenith))
  if (Math.abs(denom) < 1e-9) {
    azimuth = declination > latitude ? 0 : 180 // sun at the zenith/nadir edge case
  } else {
    const cosAz = clampUnit((Math.sin(latR) * Math.cos(rad(zenith)) - Math.sin(decR)) / denom)
    const az = deg(Math.acos(cosAz))
    azimuth = hourAngle > 0 ? mod360(az + 180) : mod360(540 - az)
  }

  return {
    elevation,
    azimuth,
    declination,
    hourAngle,
    equationOfTime: eqTime,
    isDaytime: elevation > 0,
  }
}
