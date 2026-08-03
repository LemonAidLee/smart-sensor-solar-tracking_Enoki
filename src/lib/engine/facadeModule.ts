/**
 * Adaptive Façade Module Specification — the curtain-wall setting-out rules that
 * turn a building massing into a real, buildable panel grid.
 *
 * This is the single authority on "how big is a panel and how many fit". The
 * Geometry Engine (`geometry.ts`) asks it for column/row counts; the Engineering
 * UI asks it for the resulting layout summary. Neither owns any grid arithmetic
 * of its own.
 *
 * ── The engineering case study (project report, Comprehensive Project Summary) ──
 *   Commercial office · 5 storeys · 25 m wide × 40 m long · 19 m tall
 *   Floor-to-floor 3.8 m · 100% curtain wall · external adaptive façade
 *   Nominal adaptive module 1.2 m × 1.26 m
 *   324 panels per floor · 1,620 panels total · ≈2,470 m² of façade
 *
 * ── The one inconsistency in those figures, and how it is resolved ─────────────
 * Perimeter = 2 × (25 + 40) = 130 m; 130 / 1.2 = 108.33 modules. The report's
 * 324 panels/floor = 108 columns × 3 rows takes the 108 from that *continuous*
 * perimeter. But a real façade is four separate planar elevations, and a module
 * cannot wrap a corner. Setting each elevation out independently at exactly
 * 1.2 m gives floor(25/1.2) = 20 and floor(40/1.2) = 33, i.e. only
 * 2 × (20 + 33) = 106 columns — 318 panels/floor, 1,590 total, 30 short of the
 * report, and with a 1.0 m unglazed sliver stranded at every corner.
 *
 * The resolution is the one real curtain walls use: **1.2 m × 1.26 m is the
 * NOMINAL module, and each elevation adjusts its bay width slightly so the bays
 * close exactly on the structural grid.** Rounding (rather than flooring) the
 * module count per elevation gives:
 *
 *   25 m elevation → 21 bays → 25 / 21 = 1.1905 m per module (−0.8% of nominal)
 *   40 m elevation → 33 bays → 40 / 33 = 1.2121 m per module (+1.0% of nominal)
 *   3.8 m storey   →  3 rows → 19 / 15 = 1.2667 m per module (+0.5% of nominal)
 *
 *   ⇒ 2 × (21 + 33) = 108 columns · × 3 rows = 324 panels/floor · × 5 = 1,620 ✓
 *   ⇒ 100% of the 130 m × 19 m = 2,470 m² envelope is covered ✓
 *
 * Every headline figure in the report is therefore met exactly; the only
 * adjustment is ≤1% on an individual module's dimensions, which is smaller than
 * the tolerance any real curtain-wall package is set out to. Nothing is silently
 * changed: the nominal module is the constant below, the per-elevation actual
 * width is derived, and the Engineering UI reports both.
 *
 * Pure and framework-free (guide §6).
 */

import { clamp } from './math'
import type { BuildingConfig, BuildingSurface } from './types'

/**
 * Nominal adaptive-module width, metres. The catalogue bay size from the project
 * report; each elevation's actual module width is this value adjusted to close
 * the bay exactly (see `moduleColumnsForEdge`).
 */
export const NOMINAL_MODULE_WIDTH_M = 1.2

/**
 * Nominal adaptive-module height, metres. Three modules stack within the 3.8 m
 * floor-to-floor zone (3 × 1.26 = 3.78 m), so the actual module height closes
 * the storey exactly at 3.8 / 3 = 1.2667 m.
 */
export const NOMINAL_MODULE_HEIGHT_M = 1.26

/** Floor-to-floor height of the case-study building, metres (5 × 3.8 = 19 m). */
export const NOMINAL_FLOOR_TO_FLOOR_M = 3.8

/**
 * Setting-out guards. These are generous limits that never bind at the
 * case-study specification (which needs 33 columns and 3 rows per floor); they
 * exist only so an extreme interactive configuration cannot generate an
 * unbounded panel grid.
 */
const MAX_COLUMNS_PER_EDGE = 64 // ≈77 m of elevation at the nominal module
const MAX_ROWS_PER_FLOOR = 6 // ≈7.6 m floor-to-floor at the nominal module

/**
 * Modules across one elevation. Rounding — not flooring — is what lets the four
 * elevations sum to the documented column count; the residual is absorbed by
 * adjusting this elevation's actual module width, exactly as a curtain-wall
 * package is set out. See the module header for the full derivation.
 */
export function moduleColumnsForEdge(edgeLength: number): number {
  return clamp(Math.round(edgeLength / NOMINAL_MODULE_WIDTH_M), 1, MAX_COLUMNS_PER_EDGE)
}

/** Module rows within one storey, from that storey's floor-to-floor height. */
export function moduleRowsPerFloor(floorToFloor: number): number {
  return clamp(Math.round(floorToFloor / NOMINAL_MODULE_HEIGHT_M), 1, MAX_ROWS_PER_FLOOR)
}

/** Floor-to-floor height implied by the massing, metres. */
export function floorToFloorHeight(cfg: BuildingConfig): number {
  return cfg.height / Math.max(1, cfg.floorCount)
}

/**
 * Total module rows up the full elevation. Deliberately `rowsPerFloor ×
 * floorCount` rather than `height / moduleHeight`, so every row belongs to
 * exactly one storey and the grid can never straddle a floor slab.
 */
export function facadeRowCount(cfg: BuildingConfig): number {
  return moduleRowsPerFloor(floorToFloorHeight(cfg)) * Math.max(1, cfg.floorCount)
}

/**
 * Which storey a module row belongs to. Row 0 is the TOP of the elevation (the
 * Geometry Engine's convention), so storeys are counted back down: 0 = ground.
 */
export function floorForRow(row: number, cfg: BuildingConfig): number {
  const storeys = Math.max(1, cfg.floorCount)
  const perFloor = moduleRowsPerFloor(floorToFloorHeight(cfg))
  const fromTop = Math.floor(row / perFloor)
  return clamp(storeys - 1 - fromTop, 0, storeys - 1)
}

/** The as-built façade layout, measured from the generated surfaces. */
export interface FacadeLayoutSummary {
  storeys: number
  /** Metres. */
  floorToFloor: number
  rowsPerFloor: number
  totalRows: number
  /** Modules around one horizontal ring of the building. */
  columnsPerRing: number
  panelsPerFloor: number
  totalPanels: number
  /** Sum of every module's actual area, m². */
  facadeArea: number
  /** Perimeter × height, m² — what the modules are covering. */
  envelopeArea: number
  /** Elevation perimeter, m. */
  perimeter: number
  /** Actual module width range across all elevations, m: `[min, max]`. */
  moduleWidth: [number, number]
  /** Actual module height, m (uniform — every storey is the same). */
  moduleHeight: number
  surfaceCount: number
}

/**
 * Summarise the layout from the surfaces the Geometry Engine actually produced —
 * never from a parallel formula. Every number the Engineering UI shows is
 * therefore measured off real panel instances, so a panel count on screen is a
 * count of panels that exist in the simulation. O(panels); called once per
 * geometry rebuild, never per frame.
 */
export function summariseFacadeLayout(
  surfaces: BuildingSurface[],
  cfg: BuildingConfig,
): FacadeLayoutSummary {
  const storeys = Math.max(1, cfg.floorCount)
  const rowsPerFloor = moduleRowsPerFloor(floorToFloorHeight(cfg))

  let totalPanels = 0
  let facadeArea = 0
  let perimeter = 0
  let columnsPerRing = 0
  let minW = Infinity
  let maxW = 0
  let moduleHeight = 0
  let totalRows = 0

  for (const s of surfaces) {
    perimeter += s.width
    for (const p of s.panels) {
      totalPanels++
      facadeArea += p.width * p.height
      if (p.width < minW) minW = p.width
      if (p.width > maxW) maxW = p.width
      if (p.height > moduleHeight) moduleHeight = p.height
      if (p.column + 1 > 0 && p.row + 1 > totalRows) totalRows = p.row + 1
    }
    // Columns are per-elevation; the ring is their sum around the building.
    let cols = 0
    for (const p of s.panels) if (p.column + 1 > cols) cols = p.column + 1
    columnsPerRing += cols
  }

  return {
    storeys,
    floorToFloor: floorToFloorHeight(cfg),
    rowsPerFloor,
    totalRows,
    columnsPerRing,
    panelsPerFloor: Math.round(totalPanels / storeys),
    totalPanels,
    facadeArea: Math.round(facadeArea),
    envelopeArea: Math.round(perimeter * cfg.height),
    perimeter: Math.round(perimeter * 10) / 10,
    moduleWidth: [
      Math.round((Number.isFinite(minW) ? minW : 0) * 1000) / 1000,
      Math.round(maxW * 1000) / 1000,
    ],
    moduleHeight: Math.round(moduleHeight * 1000) / 1000,
    surfaceCount: surfaces.length,
  }
}
