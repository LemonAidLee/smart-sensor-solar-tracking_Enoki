/**
 * Digital Twin v3 — Simulation Layer type definitions.
 *
 * Geometry-agnostic adaptive skin: a building is a *collection of surfaces*,
 * never "North/East/South/West". The Geometry Engine emits `BuildingSurface[]`
 * (each with its own normal + panel grid) and the Adaptive Skin Engine optimises
 * every panel from surface normals and environmental vectors alone — so the same
 * intelligence runs on a box, a triangle, a hexagon, a cylinder or an L-shape.
 */

import type { Vec3 } from './math'
import type { PanelState } from './panelStates'
import type { FacadeLayoutSummary } from './facadeModule'
import type { BuildingEnergySnapshot } from './buildingEnergy'
import type { BuildingThermalState } from './buildingThermal'
import type { BuildingLightingState } from './buildingLighting'
import type { BatteryState } from './battery'
import type { GridState } from './grid'
import type { DailyEnergyTotals } from './energyLedger'
import type { WeatherTimelineStatus } from './weatherScenario'
import type { ForecastStatus } from './liveForecast'

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------
export interface SimClock {
  date: Date
  timeHours: number
  speed: number
  playing: boolean
}

// ---------------------------------------------------------------------------
// Sun (from a real astronomical algorithm — never faked)
// ---------------------------------------------------------------------------
export interface SunState {
  azimuth: number
  altitude: number
  irradiance: number
  uvIndex: number
  colorTemperature: number
  /** World-space unit vector pointing from the scene toward the sun. */
  worldDir: Vec3
  isDaytime: boolean

  // -- ASHRAE Clear Sky intermediate values (for engineering inspector) --
  /** Solar zenith angle, degrees. */
  zenithAngle: number
  /** Air mass (Kasten & Young 1989). */
  airMass: number
  /** Extraterrestrial irradiance E₀, W/m² (solar constant × eccentricity). */
  extraterrestrialIrradiance: number
  /** ASHRAE beam optical depth τb for the current month. */
  tauB: number
  /** ASHRAE diffuse optical depth τd for the current month. */
  tauD: number
  /** Direct Normal Irradiance (clear sky), W/m². */
  dniClearSky: number
  /** Diffuse Horizontal Irradiance (clear sky), W/m². */
  dhiClearSky: number
  /** Global Horizontal Irradiance (clear sky, before cloud correction), W/m². */
  ghiClearSky: number
  /** Cloud modification factor applied to GHI (0–1). */
  cloudModificationFactor: number

  // -- WHO/WMO UV Index intermediate values --
  /** Clear-sky erythemal UV irradiance, W/m². */
  uvErythemalClearSky: number
  /** Cloud modification factor for UV (Bodeker & McKenzie 1996). */
  uvCloudModificationFactor: number
  /** Total column ozone, Dobson Units. */
  ozoneDU: number
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------
export interface WeatherState {
  temperature: number
  humidity: number
  windSpeed: number
  windDirection: number // ° compass the wind blows FROM
  cloudCoverage: number
  rainIntensity: number
  pressure: number
  visibility: number
  uvIndex: number
  windStrength: number
  groundWetness: number
  /** World-space unit vector the wind travels TOWARD (derived). */
  windVector: Vec3
}

// ---------------------------------------------------------------------------
// Building (fully configurable, arbitrary geometry)
// ---------------------------------------------------------------------------
export type GlassType = 'clear' | 'tinted' | 'low-e' | 'reflective'
export type BuildingShape = 'rectangle' | 'triangle' | 'hexagon' | 'cylinder' | 'lshape'

export interface BuildingConfig {
  shape: BuildingShape
  /** Occupancy / programme of the case-study building, for the Engineering UI. */
  buildingType: string
  /** Metres. `width` is the footprint span / diameter. */
  height: number
  width: number
  depth: number
  /**
   * Storeys. Together with `height` this fixes the floor-to-floor height, which
   * in turn sets how many adaptive-module rows fit within one storey — see
   * `facadeModule.ts`. The façade grid is therefore always storey-aligned.
   */
  floorCount: number
  /** Free rotation of the whole building, 0–360°. Rotates surface normals — never renames them. */
  orientation: number
  /** Glazed ratio of each surface, 0–1. */
  glassRatio: number
  glassType: GlassType
  /** Double-skin air-gap, metres. */
  facadeDepth: number
  latitude: number
  longitude: number
  timezone: number
  locationName: string
}

export interface NeighborBuilding {
  id: string
  width: number
  depth: number
  height: number
  distance: number
  bearing: number
}

// ---------------------------------------------------------------------------
// Panels + surfaces (geometry-driven, compass-free)
// ---------------------------------------------------------------------------
/** Phase of the motor's motion profile (drives inertia + telemetry). */
export type MovementState = 'idle' | 'accelerating' | 'cruising' | 'decelerating' | 'holding'
export type PanelHealth = 'ok' | 'degraded' | 'fault' | 'offline'

/**
 * Global façade program requested by the operator (or a future BMS/AI). Per-
 * surface and per-panel state overrides sit on top of whichever program is active.
 */
export type SkinMode = 'auto' | 'manual' | 'solar-tracking' | 'maintenance' | 'storm' | 'privacy'

/** Mechanical travel envelope of a single blade, in degrees. */
export interface RotationLimits {
  min: number
  max: number
}

export interface FacadePanel {
  id: string
  surfaceId: string
  /** Module row on its elevation. Row 0 is the TOP of the façade. */
  row: number
  /** Module column (bay) on its elevation, left to right along `surface.right`. */
  column: number
  /** Storey this module belongs to. 0 = ground floor. */
  floor: number
  worldPosition: Vec3
  /** Outward normal, inherited from the parent surface (before blade rotation). */
  normal: Vec3
  /** Cell size in metres (used for render scale). */
  width: number
  height: number

  // -- Kinetic rotation model (0 flush/closed → 90 perpendicular/open → 180 flush/closed)
  /** High-level operational state currently driving this blade. */
  state: PanelState
  rotationAngle: number
  targetRotation: number
  /** Eased target — models the motor's mechanical delay / inertia. Internal. */
  commandedRotation: number
  rotationVelocity: number
  rotationAcceleration: number
  rotationLimits: RotationLimits
  /** Seconds the blade has been continuously in motion (0 when settled). */
  movementDuration: number
  movementState: MovementState

  // -- Derived optical state
  /** 0 = fully closed, 1 = fully open. Peaks at 90°. */
  openness: number
  /** 1 = fully closed, 0 = fully open. Glazing coverage. */
  shading: number
  openingPercentage: number

  // -- Environmental
  incidentAngle: number
  solarExposure: number
  irradiance: number
  surfaceTemperature: number
  windLoad: number
  rainExposure: number
  powerConsumption: number
  healthStatus: PanelHealth
}

export interface BuildingSurface {
  id: string
  name: string
  normal: Vec3
  center: Vec3
  /** Orthonormal in-plane axes (panel column / row directions). */
  right: Vec3
  up: Vec3
  width: number
  height: number
  /** Tilt from horizontal in degrees (90 = vertical wall). */
  tilt: number
  area: number
  glassRatio: number
  panels: FacadePanel[]
}

// ---------------------------------------------------------------------------
// Rooftop PV 
// ---------------------------------------------------------------------------
export interface PVModule {
  id: string
  worldPosition: Vec3
  normal: Vec3
}


// ---------------------------------------------------------------------------
// Metrics — per-surface, then aggregated for the whole building
// ---------------------------------------------------------------------------
export interface SurfaceMetrics {
  surfaceId: string
  name: string
  averageSolarExposure: number
  averageTemperature: number
  averageWindLoad: number
  averagePanelAngle: number
  /** Mean blade openness across the surface, 0–1. */
  averageOpenness: number
  /** Mean glazing coverage across the surface, 0–1. */
  averageShading: number
  /** Heat driven through the surface right now, 0–1 proxy. */
  thermalExposure: number
  /** Actuator draw for this surface's blades, W. */
  powerUsage: number
  averageDaylight: number
  coolingLoad: number
  energySaving: number
  comfortScore: number
  panelCount: number
}

export interface BuildingMetrics {
  totalCoolingLoad: number // kW
  totalEnergySaving: number // %
  averageComfort: number // /100
  averagePanelAngle: number // °
  averageOpenness: number // 0–1
  totalPowerConsumption: number // W
  averageFacadeTemperature: number // °C
  averageSolarExposure: number // 0–1
  averageDaylight: number // %
  totalPanels: number
  movingPanels: number
  faultPanels: number
  healthyPanels: number
  surfaceCount: number
  surfaces: SurfaceMetrics[]
}

// ---------------------------------------------------------------------------
// Camera + scenarios
// ---------------------------------------------------------------------------
export type CameraView = 'perspective' | 'orthographic' | 'top' | 'isometric' | 'facade'

export interface Scenario {
  id: string
  name: string
  description: string
  building: Partial<BuildingConfig>
  neighbors: NeighborBuilding[]
  weather: Partial<WeatherState>
  timeHours: number
  month: number
  skinMode: SkinMode
}

/** Compact per-surface summary for the UI. */
export interface SurfaceSummary {
  id: string
  name: string
  averageSolarExposure: number
  averagePanelAngle: number
  averageOpenness: number
  /** Dominant descriptive state across the surface's blades. */
  dominantState: PanelState
}

/** Throttled telemetry pushed to React — never per-frame panel data. */
export interface SimSnapshot {
  timeHours: number
  clockLabel: string
  sun: {
    azimuth: number; altitude: number; irradiance: number; uvIndex: number; isDaytime: boolean
    // ASHRAE Clear Sky pipeline
    zenithAngle: number; airMass: number; extraterrestrialIrradiance: number
    tauB: number; tauD: number
    dniClearSky: number; dhiClearSky: number; ghiClearSky: number
    cloudModificationFactor: number
    // WHO UV pipeline
    uvErythemalClearSky: number; uvCloudModificationFactor: number; ozoneDU: number
  }
  weather: WeatherState
  /** Weather source + position along the active timeline (Stage 7.7). */
  weatherSource: WeatherTimelineStatus
  /** Live Forecast Engine connection, cache and provenance (Stage 7.8). */
  forecast: ForecastStatus
  metrics: BuildingMetrics
  surfaces: SurfaceSummary[]
  /** As-built adaptive-façade layout, measured off the generated panels. */
  facade: FacadeLayoutSummary
  /** BEMS — building demand, the AC bus and the live energy balance. */
  energy: BuildingEnergySnapshot
  /** Building Thermal Response — façade solar gain through the envelope to cooling load. */
  thermal: BuildingThermalState
  /** Building Lighting Response — outdoor daylight through the envelope to artificial lighting demand. */
  lighting: BuildingLightingState
  /** BESS — state of charge and charge/discharge dispatch. */
  battery: BatteryState
  /** Utility grid — the balancing component's live exchange and state. */
  grid: GridState
  /** Daily energy totals across every bus flow, reset at simulated midnight. */
  daily: DailyEnergyTotals
  pvStatus: string
  pvAverageIrradiance: number
  pvInstalledCapacity: number
  pvCurrentDCOutput: number
  pvAverageModuleOutput: number
  pvOperatingModules: number
  pvUtilization: number
  invRatedCapacityKW: number
  invCurrentDCOutput: number
  invCurrentACOutput: number
  invEfficiency: number
  invConversionLossKW: number
  invOperatingState: string
  orientation: number
  shape: BuildingShape
  skinMode: SkinMode
  fps: number
}
