/**
 * Virtual Embedded System — calibration constants.
 *
 * The single place every sensor-model constant lives (mirrors the
 * `src/lib/pbif/thresholds.ts` convention: no magic numbers embedded in the
 * translation math itself). These calibrate the PHYSICS→ELECTRICAL-SIGNAL
 * models in `sensors.ts` — they do not change any environment, PBIF, or
 * kinematics behaviour, only how it is *read* and displayed.
 */

import { FW } from '@/lib/vec/types'

/** 12-bit ESP32 ADC span — the real firmware constant, reused (not redefined). */
export const ADC_MAX = FW.ADC_MAX
/** ESP32-S3 logic supply, V. */
export const VCC = 3.3

/**
 * Daylight luminous efficacy, η — converts the Engineering Inspector's Global
 * Horizontal Irradiance (radiometric, W/m²) into illuminance (photometric,
 * lux): Ev ≈ η × G. ≈90–120 lux per W/m² is the commonly cited range for
 * daylight (varies with solar altitude/spectral composition); 120 is used
 * here as a single representative constant, per the CIE's daylight luminous
 * efficacy literature (see PBIF_ENGINEERING_GUIDE.md's Sensor Physics
 * Pipeline §). This is the ONE place η is defined — never duplicated inline.
 */
export const LUX_PER_WM2 = 120

/**
 * LDR (GL5528-style CdS photoresistor) datasheet model:
 *   R_LDR(lux) = A · L^-B  ≡  R10 · (10 / lux)^GAMMA
 * R10 (= A·10^B, resistance at 10 lux) and GAMMA (= B, the datasheet's
 * log-log slope) are typical published GL5528 values (manufacturer datasheets
 * commonly cite R10 ≈ 8–20 kΩ and γ ≈ 0.7 over the 10–100 lux measurement
 * range). Wired as the VCC-side leg of a divider against a fixed resistor, so
 * brighter light → lower R_LDR → higher divider voltage. Extrapolating this
 * power law to full-daylight illuminance (tens of thousands of lux, well
 * beyond a CdS cell's typically-characterised range) is an explicit
 * engineering approximation — documented, not hidden — made so the Digital
 * Twin can demonstrate the full day/night dynamic range with one consistent
 * model.
 */
export const LDR_R10_OHMS = 10_000
export const LDR_GAMMA = 0.7
export const LDR_FIXED_RESISTOR_OHMS = 10_000

/**
 * Dark-condition resistance ceiling, Ω. The power law `R10 · (10/lux)^γ`
 * diverges to infinity as illuminance approaches zero, which no physical
 * component does — GL5528-class CdS cells are commonly datasheet-rated with
 * a finite (if large) dark resistance, typically in the hundreds-of-kΩ to
 * low-MΩ range. 1 MΩ is used here as that representative ceiling: it is the
 * one place the power law is clamped, applied identically by every consumer
 * of `src/lib/engine/ldrPhysics.ts` rather than each guarding lux<=0 with its
 * own fallback literal.
 */
export const LDR_DARK_RESISTANCE_OHMS = 1_000_000

/** Fraction of light the lower LDR loses to the blade's own shadow at fully closed. */
export const LDR_LOWER_SELF_SHADE_MAX = 0.35

/**
 * Cup-anemometer pulse calibration (3-cup rotor), Hz per km/h — chosen so
 * 18 km/h ≈ 4.6 Hz, a typical small anemometer's calibration constant.
 */
export const ANEMOMETER_HZ_PER_KMH = 4.6 / 18

/**
 * Resistive rain-sensor board (FC-37/YL-83-style): exposed traces bridge as
 * water covers them, LOWERING resistance and RAISING the divider output as
 * wetness increases — matching the firmware's own `FW.RAIN_THRESHOLD`
 * convention (`ADC > threshold ⇒ rain detected`, i.e. higher ADC = more rain).
 * `RAIN_DRY_BASELINE_FRACTION` is the small non-zero fraction of VCC still
 * read bone-dry (parasitic leakage across the board), not a hard 0 V.
 */
export const RAIN_DRY_BASELINE_FRACTION = 0.1

/** Firmware main-loop cadence, reused from the real firmware constant (5 Hz). */
export const LOOP_HZ = Math.round((1000 / FW.LOOP_MS) * 10) / 10
