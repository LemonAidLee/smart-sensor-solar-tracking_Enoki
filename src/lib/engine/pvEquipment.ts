/**
 * Rooftop PV Plant — nameplate equipment specification.
 *
 * Static engineering data transcribed from the project report. This is a pure
 * data module with no behaviour: it exists so the Engineering UI can present the
 * plant's *specification* (what was specified and procured) separately from its
 * *telemetry* (what the simulation is producing right now), exactly as a real
 * monitoring platform does.
 *
 * It is deliberately a NEW module rather than an addition to `pvArray.ts` /
 * `pvInverter.ts`: those files own simulation behaviour, and this stage must not
 * modify them.
 *
 * ── Note on installed capacity ───────────────────────────────────────────────
 * The report states **104.02 kW DC**. The module arithmetic gives
 * 189 × 550 W = 103,950 W = **103.95 kW DC** — a 0.07 kW (0.07%) difference,
 * already flagged in `pvElectrical.ts`. Both figures are therefore surfaced and
 * labelled: `NAMEPLATE_DC_KW` is the report's specification and is shown in the
 * PV Array spec block; the live "Installed Capacity" telemetry continues to come
 * from `PVElectricalEngine`, which derives it from the modules that actually
 * exist. Neither value is silently adjusted to match the other — the same
 * nominal-vs-as-built convention the adaptive façade already uses (guide §18.2).
 */

import { BATTERY_CAPACITY_KWH } from './battery'
import { GRID_CONNECTION } from './grid'

export interface EquipmentSpec {
  manufacturer: string
  model: string
  /** Short label for the quantity/rating headline, e.g. `"189 Modules"`. */
  quantity: string
  /** Additional nameplate rows, `[label, value]`. */
  rows: [string, string][]
}

/** DC side — the PV module type installed on the roof. */
export const PV_MODULE_SPEC: EquipmentSpec = {
  manufacturer: 'LONGi',
  model: 'LR5-72HBD 550M',
  quantity: '189 Modules',
  rows: [
    ['Technology', 'Bifacial Monocrystalline'],
    ['Module Rating', '550 W'],
    ['Installed Capacity', '104.02 kW DC'],
  ],
}

/** AC side — the string inverter converting the array's DC output. */
export const PV_INVERTER_SPEC: EquipmentSpec = {
  manufacturer: 'Huawei',
  model: 'SUN2000-80KTL-M1',
  quantity: '1 Inverter',
  rows: [
    ['Rated Capacity', '80 kW AC'],
    ['Nominal Efficiency', '98%'],
  ],
}

/**
 * Storage side — the Battery Energy Storage System.
 *
 * The report gives the capacity and nothing else: no manufacturer, no chemistry,
 * no power conversion rating. None is invented here. `BATTERY_CAPACITY_KWH` is
 * imported from the engine so the figure has exactly one authority, and the
 * parameters the report does NOT specify (C-rate, efficiency, reserve) are
 * labelled engineering assumptions in the panel rather than presented as
 * datasheet values.
 */
export const BATTERY_SPEC: EquipmentSpec = {
  manufacturer: 'Battery Energy Storage',
  model: 'Specification: capacity only',
  quantity: 'Status: Online',
  rows: [['Battery Capacity', `${BATTERY_CAPACITY_KWH} kWh`]],
}

/**
 * Utility side — the point of common coupling. Static engineering data; the
 * values are imported from the grid engine so the connection has one authority.
 */
export const GRID_SPEC: EquipmentSpec = {
  manufacturer: 'Utility Grid Connection',
  model: GRID_CONNECTION.type,
  quantity: 'Point of Common Coupling',
  rows: [
    ['Nominal Voltage', `${GRID_CONNECTION.nominalVoltageV} V`],
    ['Frequency', `${GRID_CONNECTION.frequencyHz} Hz`],
  ],
}

/** Report nameplate DC capacity, kW. See the note in this file's header. */
export const NAMEPLATE_DC_KW = 104.02

/** Report nameplate AC capacity, kW — matches `PVInverterEngine`'s default. */
export const NAMEPLATE_AC_KW = 80
