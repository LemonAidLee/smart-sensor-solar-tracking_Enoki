/**
 * Adaptive Skin Engine — the geometry-agnostic intelligence + motor driver.
 *
 * It receives a collection of `BuildingSurface[]` and optimises every blade using
 * ONLY surface normals and environmental vectors (dot products) — it never asks
 * "is this the north façade?". The same engine therefore runs unchanged on a box,
 * a triangle, a hexagon, a cylinder, an L-shape or a future imported polygon.
 *
 * The mechanism is a motor-driven blade with a full 0°→180° sweep (see
 * `panelStates.ts`): flush/closed at 0° and 180°, edge-on/open at 90°. Callers
 * request high-level {@link PanelState}s (`setPanelState`, `setSurfaceState`) or,
 * for fine control, raw angles (`setPanelRotation`, `setSurfaceRotation`). Every
 * frame the engine interpolates each blade with real acceleration, deceleration
 * and mechanical inertia, staggering neighbouring rows so the façade moves like a
 * cohesive commercial kinetic skin rather than snapping instantly.
 *
 * External systems (AI, virtual ESP32, MQTT, Node-RED) drive it purely through
 * this control API — the engine has no knowledge of any of them.
 */

import type {
  BuildingConfig,
  BuildingMetrics,
  BuildingSurface,
  FacadePanel,
  SkinMode,
  SunState,
  SurfaceMetrics,
  SurfaceSummary,
  WeatherState,
} from './types'
import { clamp, dot, lerp, rad2deg, smoothstep } from './math'
import { generateSurfaces } from './geometry'
import { summariseFacadeLayout, type FacadeLayoutSummary } from './facadeModule'
import { computeBuildingMetrics, computeSurfaceMetrics, normalisedExposure } from './metrics'
import type { SolarPhysicsEngine } from './solarPhysics'
import type { VirtualSensorEngine } from './virtualSensor'
import {
  angleForOpenness,
  describeAngle,
  opennessFromAngle,
  PanelState,
  ROTATION_MAX,
  ROTATION_MIN,
  shadingFromAngle,
  STATE_ANGLE,
} from './panelStates'
import { WEATHER_VALIDATION_MODE } from './validationMode'
import {
  solarVector,
  transformSolarVector,
  type Intent,
  type SolarVector,
} from '@/lib/kinematics'
import { resolveTargetRotation, type FacadeControlMode } from './facadeControl'
import { evaluatePbif, type PbifEvaluation } from '@/lib/pbif'
import { SERVO_SETTLED_DEG } from '@/lib/embedded/servo'

/** Blade follow-smoothing rate (s⁻¹) — same easing for every control source. */
const TARGET_EASE_RATE = 2.4

// Motor envelope. A blade can travel the full 180° in ~2 s at full tilt.
const MAX_SPEED = 58 // deg/s
const MECHANICAL_DELAY = 0.2 // s — command smoothing (motor spin-up)
const ROW_LAG = 0.34 // s — extra lag on lower rows → cohesive top-down cascade
const WAVE_DURATION = 6 // s

/** Ways the whole façade can currently be driven. Wave is a transient overlay. */
type Program = SkinMode

export class AdaptiveSkinEngine {
  private surfaces: BuildingSurface[] = []
  private flat: FacadePanel[] = []
  private byId = new Map<string, FacadePanel>()
  /** As-built façade layout. Recomputed ONLY in `rebuild()` — never per frame. */
  private facadeLayout!: FacadeLayoutSummary

  private program: Program = 'auto'
  private manualRotation = 90
  /**
   * `facadeControlMode` selects the SOURCE of the target rotation — `'manual'`
   * (slider), `'sun-tracking'` (pure kinematics) or `'pbif'` (decision layer);
   * the renderer is agnostic to it (see `facadeControl.ts`). `trackingIntent`
   * is the geometry engine's intent, used only in `'sun-tracking'`/`'pbif'`.
   * Defaults to `'pbif'` — PBIF is the default façade-control source in every
   * mode, including Weather Validation Mode (the constructor only overrides
   * the separate render `program`, never this field). An operator can still
   * switch to `'manual'`/`'sun-tracking'` via the Program control at any time.
   */
  private facadeControlMode: FacadeControlMode = 'pbif'
  private trackingIntent: Intent = 'shade'
  /**
   * Latest PBIF evaluation (assessment → decision → policy), recomputed once per
   * tick from weather in `'pbif'` mode. Building-global, so it is decided ONCE and
   * shared by every surface. Null until PBIF has run. Read by the UI for the
   * decision panel; never per-frame panel data.
   */
  private pbifEvaluation: PbifEvaluation | null = null
  private speedScale = 1 // maintenance mode drives the motors slowly

  // Overrides sit on top of the program. Rotation and state overrides for the
  // same id are mutually exclusive (setting one clears the other).
  private surfaceStateOverride = new Map<string, PanelState>()
  private surfaceRotationOverride = new Map<string, number>()
  private panelStateOverride = new Map<string, PanelState>()
  private panelRotationOverride = new Map<string, number>()

  private waveTime = 0
  private animTime = 0
  private waveUntil = 0

  private lastSun: SunState | null = null
  private lastWeather: WeatherState | null = null

  // Cached environmental inputs for Weather-Validation Mode. These are recomputed
  // only on "resolve" frames (the ~20 Hz environmental tier) and reused on the
  // per-frame ease-only frames, so the expensive occlusion/solar work no longer
  // runs at the render rate. Blade easing still happens every frame (see below).
  private vSolar: SolarVector | null = null
  private vLocalSun: SunState | null = null

  constructor(cfg: BuildingConfig) {
    this.rebuild(cfg)
    // Weather Validation Mode still boots the render `program` into manual
    // (Auto/Storm/Privacy/Maintenance stay disabled — see validationMode.ts),
    // but `facadeControlMode` — the field `resolveTargetRotation` actually
    // switches on — is deliberately left at its class-field default, `'pbif'`:
    // PBIF is the default façade-control source in every mode. `program` and
    // `facadeControlMode` are independent switches; only the render program
    // is forced here.
    if (WEATHER_VALIDATION_MODE) {
      this.program = 'manual'
    }
  }

  /** Regenerate surfaces from geometry, preserving live blade motion by id. */
  rebuild(cfg: BuildingConfig): void {
    const prev = this.byId
    const next = generateSurfaces(cfg)
    for (const s of next) {
      for (const p of s.panels) {
        const old = prev.get(p.id)
        if (old) {
          p.state = old.state
          p.rotationAngle = old.rotationAngle
          p.commandedRotation = old.commandedRotation
          p.targetRotation = old.targetRotation
          p.rotationVelocity = old.rotationVelocity
          p.movementState = old.movementState
          p.movementDuration = old.movementDuration
          p.healthStatus = old.healthStatus
        }
      }
    }
    this.surfaces = next
    this.flat = next.flatMap((s) => s.panels)
    this.byId = new Map(this.flat.map((p) => [p.id, p]))
    this.facadeLayout = summariseFacadeLayout(next, cfg)
  }

  /** As-built adaptive-façade layout (panel counts, module sizes, areas). */
  getFacadeLayout(): FacadeLayoutSummary {
    return this.facadeLayout
  }

  // ==========================================================================
  // Control API — high level (states) and low level (raw rotations)
  // ==========================================================================

  /** Drive a single blade to an operational state. */
  setPanelState(panelId: string, state: PanelState): void {
    if (!this.byId.has(panelId)) return
    this.panelStateOverride.set(panelId, state)
    this.panelRotationOverride.delete(panelId)
  }
  /** Drive a single blade to a raw angle (0–180°). */
  setPanelRotation(panelId: string, angle: number): void {
    if (!this.byId.has(panelId)) return
    this.panelRotationOverride.set(panelId, this.clampRot(angle))
    this.panelStateOverride.delete(panelId)
  }
  clearPanelOverride(panelId: string): void {
    this.panelStateOverride.delete(panelId)
    this.panelRotationOverride.delete(panelId)
  }

  /** Drive every blade of one surface to an operational state. */
  setSurfaceState(surfaceId: string, state: PanelState): void {
    this.surfaceStateOverride.set(surfaceId, state)
    this.surfaceRotationOverride.delete(surfaceId)
  }
  /** Drive every blade of one surface to a raw angle (0–180°). */
  setSurfaceRotation(surfaceId: string, angle: number): void {
    this.surfaceRotationOverride.set(surfaceId, this.clampRot(angle))
    this.surfaceStateOverride.delete(surfaceId)
  }
  clearSurfaceOverride(surfaceId: string): void {
    this.surfaceStateOverride.delete(surfaceId)
    this.surfaceRotationOverride.delete(surfaceId)
  }

  // -- Whole-façade programs / animations ------------------------------------
  setMode(program: Program): void {
    this.program = program
    this.speedScale = program === 'maintenance' ? 0.4 : 1
    this.waveUntil = 0
    this.clearAllOverrides()
  }
  getMode(): Program {
    return this.program
  }
  /** Manual raw-angle program. 0–180° normally; 0–360° in Weather Validation Mode. */
  setManualRotation(angle: number): void {
    this.manualRotation = WEATHER_VALIDATION_MODE ? ((angle % 360) + 360) % 360 : this.clampRot(angle)
    this.program = 'manual'
    this.speedScale = 1
    this.waveUntil = 0
    this.clearAllOverrides()
  }
  getManualRotation(): number {
    return this.manualRotation
  }
  /** Weather Validation Mode: choose the target-rotation source (Manual/Sun-Tracking). */
  setFacadeControlMode(mode: FacadeControlMode): void {
    this.facadeControlMode = mode
  }
  getFacadeControlMode(): FacadeControlMode {
    return this.facadeControlMode
  }
  /** Sun-Tracking intent for the geometry engine ('shade' | 'daylight'). */
  setTrackingIntent(intent: Intent): void {
    this.trackingIntent = intent
  }
  getTrackingIntent(): Intent {
    return this.trackingIntent
  }
  /** Latest PBIF evaluation (assessment → decision → policy), for the UI. */
  getPbifEvaluation(): PbifEvaluation | null {
    return this.pbifEvaluation
  }
  openAll(): void {
    this.setManualRotation(STATE_ANGLE[PanelState.FULLY_OPEN] ?? 90)
  }
  closeAll(): void {
    this.setManualRotation(STATE_ANGLE[PanelState.FULLY_CLOSED] ?? 0)
  }
  solarTracking(): void {
    this.setMode('solar-tracking')
  }
  maintenanceMode(): void {
    this.setMode('maintenance')
  }
  stormMode(): void {
    this.setMode('storm')
  }
  privacyMode(): void {
    this.setMode('privacy')
  }
  triggerWave(): void {
    this.waveUntil = this.animTime + WAVE_DURATION
  }

  reset(): void {
    this.program = 'auto'
    this.manualRotation = 90
    this.speedScale = 1
    this.waveUntil = 0
    this.clearAllOverrides()
    for (const p of this.flat) if (p.healthStatus === 'offline') p.healthStatus = 'ok'
  }
  setPowerLoss(fraction: number): void {
    const cutoff = Math.floor(this.flat.length * clamp(fraction))
    this.flat.forEach((p, i) => {
      if (i < cutoff) p.healthStatus = 'offline'
      else if (p.healthStatus === 'offline') p.healthStatus = 'ok'
    })
  }

  // -- Read API --------------------------------------------------------------
  getSurface(id: string): BuildingSurface | undefined {
    return this.surfaces.find((s) => s.id === id)
  }
  getAllSurfaces(): BuildingSurface[] {
    return this.surfaces
  }
  getPanel(id: string): FacadePanel | undefined {
    return this.byId.get(id)
  }
  getAllPanels(): FacadePanel[] {
    return this.flat
  }
  getSurfaceMetrics(id: string): SurfaceMetrics | undefined {
    const s = this.getSurface(id)
    if (!s) return undefined
    return computeSurfaceMetrics(s, this.lastWeather, this.lastSun)
  }
  getBuildingMetrics(): BuildingMetrics {
    return computeBuildingMetrics(this.surfaces, this.lastWeather, this.lastSun)
  }
  getSurfaceSummaries(): SurfaceSummary[] {
    return this.surfaces.map((s) => {
      let exp = 0
      let ang = 0
      let open = 0
      for (const p of s.panels) {
        exp += p.solarExposure
        ang += p.rotationAngle
        open += p.openness
      }
      const n = s.panels.length || 1
      const avgAngle = ang / n
      return {
        id: s.id,
        name: s.name,
        averageSolarExposure: Math.round((exp / n) * 100) / 100,
        averagePanelAngle: Math.round(avgAngle * 10) / 10,
        averageOpenness: Math.round((open / n) * 100) / 100,
        dominantState: describeAngle(avgAngle),
      }
    })
  }

  // ==========================================================================
  // Update — advance every blade one frame
  // ==========================================================================
  /**
   * @param resolve  When true (the ~20 Hz environmental tier) the expensive
   *   environment-derived work runs: solar transform, PBIF, neighbour occlusion,
   *   per-surface target resolution. When false (the intervening render frames)
   *   only the cheap per-frame blade easing runs, reusing the last resolved
   *   targets — so the façade stays 60 fps-smooth while the heavy maths does not
   *   run at the render rate. Non-validation mode always runs fully (it owns a
   *   per-frame motor model) — it is disabled in Weather Validation Mode anyway.
   */
  update(
    cfg: BuildingConfig,
    sun: SunState,
    weather: WeatherState,
    solarPhysics: SolarPhysicsEngine,
    virtualSensor: VirtualSensorEngine,
    dt: number,
    resolve = true,
  ): void {
    const step = Math.min(dt, 0.05)
    this.animTime += step
    this.waveTime += step * (0.3 + weather.windStrength * 0.6)

    if (WEATHER_VALIDATION_MODE) {
      this.updateValidation(cfg, sun, weather, solarPhysics, virtualSensor, step, resolve)
    } else {
      this.updateFull(sun, weather, solarPhysics, virtualSensor, step)
    }
  }

  /**
   * Weather Validation Mode: ONE animation pipeline. The environment-derived
   * target is resolved on `resolve` frames only; every frame eases each blade
   * toward that stored target (identical time-constant, so motion is unchanged —
   * just sampled from a target that updates at the environmental tier).
   */
  private updateValidation(
    cfg: BuildingConfig,
    sun: SunState,
    weather: WeatherState,
    solarPhysics: SolarPhysicsEngine,
    virtualSensor: VirtualSensorEngine,
    step: number,
    resolve: boolean,
  ): void {
    if (resolve) {
      this.lastSun = sun
      this.lastWeather = weather
      const worldSolar = solarVector(sun.altitude, sun.azimuth)
      this.vSolar = transformSolarVector(worldSolar, cfg.orientation)
      // Transform the sun state so physics uses local vectors.
      this.vLocalSun = { ...sun, ...this.vSolar, worldDir: this.vSolar.toSun }
      // PBIF v1 — decide the building-level operational objective ONCE per tick
      // from the three permitted weather variables (cloud, rain, wind).
      this.pbifEvaluation = evaluatePbif({
        windSpeed: weather.windSpeed,
        rainIntensity: weather.rainIntensity,
        solarADC: virtualSensor.getGlobalFilteredADC(),
        outdoorTemperature: weather.temperature,
      })
    }

    const solar = this.vSolar
    const localSun = this.vLocalSun ?? sun

    for (const s of this.surfaces) {
      const rows = s.panels.length ? Math.max(...s.panels.map((p) => p.row)) + 1 : 1

      // One target rotation per surface (co-planar blades move together),
      // resolved on the environmental tier and reused between resolves.
      let target: number | null = null
      if (resolve && solar && s.panels.length) {
        target = resolveTargetRotation(this.facadeControlMode, {
          surfaceNormal: s.normal,
          solar,
          currentAngle: s.panels[0].rotationAngle,
          manualAngle: this.manualRotation,
          trackingIntent: this.trackingIntent,
          pbifState: this.pbifEvaluation?.decision.state,
          solarResource: this.pbifEvaluation?.solarResource.state,
        })
      }

      for (const p of s.panels) {
        if (resolve) {
          this.physics(p, rows, sun, weather, solarPhysics)
          p.healthStatus = 'ok'
          const t = target ?? this.manualRotation
          p.targetRotation = t
          p.commandedRotation = t
        }

        // ── Ease every frame toward the stored target ──────────────────────
        // Stage 7.11: a settled blade (within the SAME "settled" threshold the
        // Servo Status readout already uses) needs neither the easing step nor
        // any of the angle-derived state recomputed — its `rotationAngle` this
        // frame is bit-for-bit identical to last frame's, so `describeAngle` /
        // `opennessFromAngle` / `shadingFromAngle` would recompute the exact
        // same outputs. Skipping them is what lets `FacadeLayer`'s renderer
        // detect "nothing changed" and skip its own per-panel matrix/colour
        // work and GPU buffer upload for the same panel (see FacadeLayer.tsx).
        // Snapping exactly to target once (rather than approaching forever)
        // is what makes the skip stable rather than re-triggering every frame.
        const t = p.targetRotation
        const remaining = t - p.rotationAngle
        if (Math.abs(remaining) > SERVO_SETTLED_DEG) {
          p.rotationAngle += remaining * Math.min(1, step * TARGET_EASE_RATE)
          p.state = describeAngle(p.rotationAngle)
          p.openness = opennessFromAngle(p.rotationAngle)
          p.shading = shadingFromAngle(p.rotationAngle)
          p.openingPercentage = Math.round(p.openness * 100)
        } else if (p.rotationAngle !== t) {
          p.rotationAngle = t
          p.state = describeAngle(p.rotationAngle)
          p.openness = opennessFromAngle(p.rotationAngle)
          p.shading = shadingFromAngle(p.rotationAngle)
          p.openingPercentage = Math.round(p.openness * 100)
        }
        p.rotationVelocity = 0
        p.movementState = 'idle'
        p.movementDuration = 0
        p.powerConsumption = p.healthStatus === 'offline' ? 0 : 0.35
      }
    }
  }

  /** Full simulation (non-validation): per-frame motor model, unchanged. */
  private updateFull(sun: SunState, weather: WeatherState, solarPhysics: SolarPhysicsEngine, virtualSensor: VirtualSensorEngine, step: number): void {
    this.lastSun = sun
    this.lastWeather = weather
    const waveActive = this.animTime < this.waveUntil

    for (const s of this.surfaces) {
      const rows = s.panels.length ? Math.max(...s.panels.map((p) => p.row)) + 1 : 1
      for (const p of s.panels) {
        this.physics(p, rows, sun, weather, solarPhysics)
        p.targetRotation = this.resolveTarget(p, sun, weather, waveActive)
        p.state = this.resolveState(p, waveActive)

        const frozen = p.healthStatus === 'offline' || p.healthStatus === 'fault'
        if (!frozen) {
          // Cohesion: lower rows lag slightly so motion cascades top→bottom.
          const rowFrac = rows > 1 ? p.row / (rows - 1) : 0
          const delay = MECHANICAL_DELAY + rowFrac * ROW_LAG + (p.column % 4) * 0.012
          p.commandedRotation += (p.targetRotation - p.commandedRotation) * Math.min(1, step / delay)
          this.servo(p, step)
        } else {
          p.rotationVelocity = 0
          p.movementState = 'idle'
          p.movementDuration = 0
        }

        // Derived optical state.
        p.openness = opennessFromAngle(p.rotationAngle)
        p.shading = shadingFromAngle(p.rotationAngle)
        p.openingPercentage = Math.round(p.openness * 100)
        p.powerConsumption =
          p.healthStatus === 'offline'
            ? 0
            : p.movementState === 'idle'
              ? 0.35
              : p.movementState === 'holding'
                ? 0.7
                : 1.9 + Math.abs(p.rotationVelocity) * 0.06
      }
    }
  }

  // -- Environment (dot products only — orientation/shape agnostic) ----------
  private physics(
    p: FacadePanel,
    rows: number,
    sun: SunState,
    w: WeatherState,
    solarPhysics: SolarPhysicsEngine,
  ): void {
    const hFrac = 1 - (p.row + 0.5) / rows
    const windward = Math.max(0, -dot(p.normal, w.windVector))

    const effectiveIrradiance = solarPhysics.getModuleEffectiveIrradiance(p.id)
    const exposure = normalisedExposure(effectiveIrradiance)

    p.incidentAngle = solarPhysics.getModuleIncidentAngle(p.id)
    p.solarExposure = exposure
    p.irradiance = effectiveIrradiance
    // A more-closed blade (higher shading) absorbs more of the beam → hotter skin.
    p.surfaceTemperature = Math.round((w.temperature + exposure * (10 + p.shading * 8)) * 10) / 10
    p.windLoad = clamp(windward * w.windStrength * (0.5 + 0.5 * hFrac))
    p.rainExposure = clamp(w.rainIntensity * (0.35 + 0.65 * windward) * (0.5 + 0.5 * hFrac))
  }

  // -- Target resolution: overrides > program --------------------------------
  private resolveTarget(p: FacadePanel, sun: SunState, w: WeatherState, waveActive: boolean): number {
    if (p.healthStatus === 'offline' || p.healthStatus === 'fault') return p.rotationAngle

    if (waveActive) return this.waveAngle(p)

    const pr = this.panelRotationOverride.get(p.id)
    if (pr !== undefined) return pr
    const ps = this.panelStateOverride.get(p.id)
    if (ps !== undefined) return this.stateAngle(ps, p, sun, w)

    const sr = this.surfaceRotationOverride.get(p.surfaceId)
    if (sr !== undefined) return this.clampRot(sr + this.ripple(p))
    const ss = this.surfaceStateOverride.get(p.surfaceId)
    if (ss !== undefined) return this.stateAngle(ss, p, sun, w)

    switch (this.program) {
      case 'manual':
        return this.clampRot(this.manualRotation + this.ripple(p))
      case 'solar-tracking':
        return this.clampRot(this.solarTrackAngle(p, sun, w) + this.ripple(p))
      case 'maintenance':
        return STATE_ANGLE[PanelState.MAINTENANCE] ?? 90
      case 'storm':
        return STATE_ANGLE[PanelState.STORM_LOCK] ?? 0
      case 'privacy':
        return STATE_ANGLE[PanelState.PRIVACY_MODE] ?? 180
      case 'auto':
      default:
        return this.clampRot(this.autoTarget(p, sun, w) + this.ripple(p))
    }
  }

  /** Descriptive state reported back for telemetry / the HUD. */
  private resolveState(p: FacadePanel, waveActive: boolean): PanelState {
    if (p.healthStatus === 'offline' || p.healthStatus === 'fault') return p.state
    if (waveActive) return describeAngle(p.rotationAngle)
    const ps = this.panelStateOverride.get(p.id)
    if (ps !== undefined) return ps
    if (this.panelRotationOverride.has(p.id)) return describeAngle(p.rotationAngle)
    const ss = this.surfaceStateOverride.get(p.surfaceId)
    if (ss !== undefined) return ss
    if (this.surfaceRotationOverride.has(p.surfaceId)) return describeAngle(p.rotationAngle)
    switch (this.program) {
      case 'solar-tracking':
        return PanelState.SOLAR_TRACKING
      case 'maintenance':
        return PanelState.MAINTENANCE
      case 'storm':
        return PanelState.STORM_LOCK
      case 'privacy':
        return PanelState.PRIVACY_MODE
      default:
        return describeAngle(p.rotationAngle)
    }
  }

  /** Resolve a state to a concrete angle — dynamic states read the environment. */
  private stateAngle(state: PanelState, p: FacadePanel, sun: SunState, w: WeatherState): number {
    if (state === PanelState.SOLAR_TRACKING) return this.solarTrackAngle(p, sun, w)
    return STATE_ANGLE[state] ?? 90
  }

  /** A tiny organic offset so a settled façade still breathes. */
  private ripple(p: FacadePanel): number {
    return Math.sin(p.row * 0.5 + p.column * 0.35 - this.waveTime * 1.2) * 2.2
  }

  /** Full-range motorised sweep used by the wave animation. */
  private waveAngle(p: FacadePanel): number {
    const t = this.waveUntil - this.animTime
    const travel = (WAVE_DURATION - t) * 1.6
    return this.clampRot(90 + Math.sin(p.row * 0.34 + p.column * 0.46 - travel * 3) * 90)
  }

  /**
   * Solar tracking — tilt the blade off perpendicular (90° = open) toward heavy
   * shading (~45°) in proportion to how much solar load this blade is taking. The
   * blade stays on the near side (0–90°) so it always shades toward the sun.
   */
  private solarTrackAngle(p: FacadePanel, sun: SunState, w: WeatherState): number {
    if (!sun.isDaytime) return 90
    const tempFactor = clamp((w.temperature - 26) / 14)
    const demand = clamp(p.solarExposure * 0.9 + tempFactor * 0.3 - w.cloudCoverage * 0.4)
    const opennessTarget = 1 - demand * 0.72 // heavy demand → ~0.28 openness (≈44°)
    return angleForOpenness(opennessTarget)
  }

  /**
   * Auto — the default adaptive program. Solar-tracks by day, closes for the
   * night, tilts to rain protection in wet weather and drives to the storm-lock
   * (fully flush) as wind rises. Every transition is a smooth blend.
   */
  private autoTarget(p: FacadePanel, sun: SunState, w: WeatherState): number {
    let target = sun.isDaytime ? this.solarTrackAngle(p, sun, w) : 8 // near-closed at night
    // Rain protection: heavy outward tilt (135°) that sheds water off the glazing.
    target = lerp(target, STATE_ANGLE[PanelState.RAIN_PROTECTION] ?? 135, smoothstep(0.4, 0.75, w.rainIntensity))
    // Storm lock: override everything toward fully flush/closed as wind rises.
    target = lerp(target, STATE_ANGLE[PanelState.STORM_LOCK] ?? 0, smoothstep(0.45, 0.78, w.windStrength))
    return target
  }

  // -- Motor: acceleration / cruise / deceleration with inertia --------------
  private servo(p: FacadePanel, dt: number): void {
    const accel = p.rotationAcceleration
    const speedCap = (p.healthStatus === 'degraded' ? MAX_SPEED * 0.45 : MAX_SPEED) * this.speedScale
    const err = p.commandedRotation - p.rotationAngle
    const dir = Math.sign(err)
    const brakeSpeed = Math.sqrt(2 * accel * Math.abs(err)) // decel to arrive at rest
    const desired = dir * Math.min(speedCap, brakeSpeed)
    const dv = clamp(desired - p.rotationVelocity, -accel * dt, accel * dt)
    p.rotationVelocity += dv
    p.rotationAngle += p.rotationVelocity * dt

    // Hard mechanical stops.
    if (p.rotationAngle <= p.rotationLimits.min) {
      p.rotationAngle = p.rotationLimits.min
      if (p.rotationVelocity < 0) p.rotationVelocity = 0
    } else if (p.rotationAngle >= p.rotationLimits.max) {
      p.rotationAngle = p.rotationLimits.max
      if (p.rotationVelocity > 0) p.rotationVelocity = 0
    }

    const speed = Math.abs(p.rotationVelocity)
    const moving = speed > 0.5 || Math.abs(err) > 0.5
    if (!moving) {
      p.movementState = 'idle'
      p.movementDuration = 0
    } else {
      p.movementDuration += dt
      if (brakeSpeed < speedCap * 0.98) p.movementState = 'decelerating'
      else if (speed < speedCap * 0.9) p.movementState = 'accelerating'
      else p.movementState = 'cruising'
      // At target but still fighting a small error under load → holding.
      if (Math.abs(err) > 0.5 && speed < 0.5) p.movementState = 'holding'
    }
  }

  private clampRot(a: number): number {
    return clamp(a, ROTATION_MIN, ROTATION_MAX)
  }
  private clearAllOverrides(): void {
    this.surfaceStateOverride.clear()
    this.surfaceRotationOverride.clear()
    this.panelStateOverride.clear()
    this.panelRotationOverride.clear()
  }
}
