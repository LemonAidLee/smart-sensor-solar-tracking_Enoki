'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  CircuitBoard,
  ChevronDown,
  CloudRain,
  Cpu,
  Droplets,
  GripVertical,
  Power,
  Radio,
  Sun,
  Thermometer,
  User,
  Wind as WindIcon,
  Wrench,
  Zap,
} from 'lucide-react'
import { getSimulation } from '@/lib/engine/simulation'
import { useTwinStore } from '@/lib/engine/store'
import { useModuleHighlightStore } from '@/lib/dt/moduleHighlightStore'
import { computeEmbeddedState, pickUpperCentrePanel, type SensorSignal, type ServoState } from '@/lib/embedded'
import { SignalChain } from './SignalChain'
import { LcdScreen } from './LcdScreen'
import { Esp32Board, type BoardPin } from './Esp32Board'
import { CircuitSimulation } from './CircuitSimulation'
import { LeaderLine } from './LeaderLine'

const POSITION_STORAGE_KEY = 'vec-panel-position'
/**
 * Minimum on-screen Y — clears the fixed Simulation Header (which floats
 * at `z-50`, above this panel's `z-25`). Other
 * HUD panels sit at the equivalent of `top-14` (56px); this one starts a bit
 * lower since it defaults nearer the nav's denser centre content.
 */
const NAV_CLEARANCE_Y = 60
const DEFAULT_POSITION = { x: 360, y: NAV_CLEARANCE_Y }

const SIZE_STORAGE_KEY = 'vec-panel-size'
const DEFAULT_SIZE = { width: 560, height: 760 }
const MIN_SIZE = { width: 400, height: 420 }
const MAX_SIZE = { width: 920, height: 1000 }

/** Safe margin kept between the panel and every viewport edge (px). */
const VIEWPORT_MARGIN = 16
/**
 * Smallest panel height we will ever render. Because the top of the panel is
 * never allowed lower than `viewportH - VIEWPORT_MARGIN - MIN_VISIBLE_HEIGHT`,
 * the sticky header plus a usable slice of scrollable content always stay on
 * screen — even on short viewports or at high browser zoom.
 */
const MIN_VISIBLE_HEIGHT = 260
/** Approximate collapsed-badge footprint — used only to keep it fully on-screen. */
const BADGE_SIZE = { width: 150, height: 56 }

type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

/** Clamp a value into [lo, hi], tolerating an inverted range (lo > hi) on tiny
 *  viewports by preferring `lo` (keeps the header edge visible). */
const clampNum = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

const clampToBounds = (p: { x: number; y: number }, b: Bounds) => ({
  x: clampNum(p.x, b.minX, b.maxX),
  y: clampNum(p.y, b.minY, b.maxY),
})

/**
 * Live viewport size (CSS px). Recomputes only on `resize` and `visualViewport`
 * resize — the events that fire on window-resize AND on desktop browser zoom —
 * never per animation frame. Updates are rAF-coalesced so a burst of resize
 * events collapses into a single state write.
 */
function useViewportSize() {
  const [vp, setVp] = useState({ w: 1280, h: 800 })
  useEffect(() => {
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setVp({ w: window.innerWidth, h: window.innerHeight }))
    }
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [])
  return vp
}
/** More opaque than the shared `glass-strong` background — this panel packs
 *  dense text over the live 3D scene, so it reads better solid than washed-out. */
const PANEL_BACKGROUND = 'rgba(8, 11, 18, 0.94)'

/** Generic pipeline references — conceptual, not tied to the live reading. */
const SIGNAL_TRANSLATION_REFERENCE: { sensor: string; chain: string[] }[] = [
  { sensor: 'Cloud Cover', chain: ['Sky Simulation', 'Estimated Illuminance', 'LDR Resistance', 'Voltage Divider', 'ADC Counts', 'ESP32'] },
  { sensor: 'Wind Speed', chain: ['Virtual Cup Rotation', 'Pulse Frequency', 'ADC Counts', 'ESP32'] },
  { sensor: 'Rain', chain: ['Surface Wetness Model', 'Sensor Resistance', 'Voltage Divider', 'ADC Counts', 'ESP32'] },
  { sensor: 'Temperature', chain: ['DHT22 Digital Sensor', 'Single-Wire Protocol', 'ESP32'] },
  { sensor: 'Humidity', chain: ['DHT22 Digital Sensor', 'Single-Wire Protocol', 'ESP32'] },
  { sensor: 'Occupancy', chain: ['PIR Digital Sensor', 'GPIO Interrupt', 'ESP32'] },
]

const SENSOR_ICON: Record<string, typeof Sun> = {
  ldrUpper: Sun,
  ldrLower: Sun,
  wind: WindIcon,
  rain: CloudRain,
  temperature: Thermometer,
  humidity: Droplets,
  pir: User,
  pauseSwitch: Wrench,
}

/** Pointer must move this far before a press counts as a drag, not a click. */
const DRAG_THRESHOLD_PX = 4

/**
 * A fast drag/resize gesture can carry the pointer momentarily over selectable
 * text between move events; even with `setPointerCapture` routing the events
 * correctly, the browser's native "start a text selection" heuristic is a
 * separate mechanism and can still fire, leaving the user stuck having
 * highlighted a swath of the panel instead of moved/resized it. Disabling
 * selection document-wide for the gesture's duration — the standard fix drag
 * libraries use — closes that gap regardless of what the pointer grazes.
 */
function setGlobalTextSelection(enabled: boolean) {
  document.body.style.userSelect = enabled ? '' : 'none'
}

/**
 * Persisted drag position — pointer-based (not framer-motion's controlled drag)
 * so the panel's own body can host normal, clickable controls. `onTap` fires on
 * a press that never crossed the drag threshold, letting the collapsed badge act
 * as a click-to-open target while still being freely draggable.
 */
function usePersistedDrag(
  defaultPos: { x: number; y: number },
  onTap?: () => void,
  boundsRef?: React.RefObject<Bounds>,
) {
  const [pos, setPos] = useState(defaultPos)
  const posRef = useRef(defaultPos)
  // `dragging` only flips true once the pointer has moved past the threshold;
  // `pressed` tracks the down→up span regardless. Capturing the pointer (and
  // therefore retargeting events away from whatever was actually pressed) only
  // once real drag movement is confirmed keeps a plain click on a nested
  // button — e.g. the collapse/expand chevron — working normally.
  const pressed = useRef(false)
  const dragging = useRef(false)
  const start = useRef({ x: 0, y: 0 })
  const origin = useRef(defaultPos)

  useEffect(() => {
    // Client-only, one-time restore of a remembered position. Reading
    // localStorage can't happen during the (SSR-matching) first render without
    // a hydration mismatch, so this deliberately corrects position once after
    // mount rather than on every render — not the cascading-update pattern the
    // lint rule guards against.
    try {
      const raw = localStorage.getItem(POSITION_STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { x: number; y: number }
        // Re-clamp: a position saved before NAV_CLEARANCE_Y existed (or from
        // an old build) could still sit under the nav — never restore that.
        const clamped = { x: Math.max(8, saved.x), y: Math.max(NAV_CLEARANCE_Y, saved.y) }
        posRef.current = clamped
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPos(clamped)
      }
    } catch {
      // Ignore malformed/unavailable storage — default position stands.
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    pressed.current = true
    dragging.current = false
    start.current = { x: e.clientX, y: e.clientY }
    // Grab from the currently *visible* (clamped) position so a drag never
    // jumps — the rendered position may already be clamped in from a stale
    // stored value after a viewport resize.
    origin.current = boundsRef?.current ? clampToBounds(posRef.current, boundsRef.current) : posRef.current
    // Deliberately no setPointerCapture here yet — see the comment above.
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pressed.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (!dragging.current) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      dragging.current = true
      // Now that this is a confirmed drag, capture so a fast move keeps
      // delivering events to us even if the pointer leaves the header, and
      // suppress text selection for the same reason (see setGlobalTextSelection).
      e.currentTarget.setPointerCapture(e.pointerId)
      setGlobalTextSelection(false)
    }
    const raw = { x: origin.current.x + dx, y: origin.current.y + dy }
    // Clamp within the live viewport bounds so the window can never be dragged
    // off-screen; fall back to the low-edge guards before bounds are known.
    const next = boundsRef?.current
      ? clampToBounds(raw, boundsRef.current)
      : { x: Math.max(8, raw.x), y: Math.max(NAV_CLEARANCE_Y, raw.y) }
    posRef.current = next
    setPos(next)
  }
  const onPointerUp = () => {
    pressed.current = false
    setGlobalTextSelection(true)
    if (!dragging.current) {
      // A press that never became a drag counts as a tap — used to open the badge.
      onTap?.()
      return
    }
    dragging.current = false
    try {
      localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(posRef.current))
    } catch {
      // Non-persistable environment — the position still holds for this session.
    }
  }

  return { pos, dragHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } }
}

const clampSize = (size: { width: number; height: number }) => ({
  width: Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, size.width)),
  height: Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, size.height)),
})

/**
 * Persisted panel size — a bottom-right corner drag handle, same pointer-based
 * approach (and the same drag-threshold-before-capture trick) as
 * `usePersistedDrag`, so the panel behaves like a resizable desktop window.
 */
function usePersistedSize(defaultSize: { width: number; height: number }) {
  const [size, setSize] = useState(defaultSize)
  const sizeRef = useRef(defaultSize)
  const pressed = useRef(false)
  const resizing = useRef(false)
  const start = useRef({ x: 0, y: 0 })
  const origin = useRef(defaultSize)

  useEffect(() => {
    // Client-only, one-time restore — same rationale as usePersistedDrag's.
    try {
      const raw = localStorage.getItem(SIZE_STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { width: number; height: number }
        const clamped = clampSize(saved)
        sizeRef.current = clamped
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSize(clamped)
      }
    } catch {
      // Ignore malformed/unavailable storage — default size stands.
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    pressed.current = true
    resizing.current = false
    start.current = { x: e.clientX, y: e.clientY }
    origin.current = sizeRef.current
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pressed.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (!resizing.current) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      resizing.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      setGlobalTextSelection(false)
    }
    const next = clampSize({ width: origin.current.width + dx, height: origin.current.height + dy })
    sizeRef.current = next
    setSize(next)
  }
  const onPointerUp = () => {
    pressed.current = false
    setGlobalTextSelection(true)
    if (!resizing.current) return
    resizing.current = false
    try {
      localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(sizeRef.current))
    } catch {
      // Non-persistable environment — the size still holds for this session.
    }
  }

  return { size, resizeHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } }
}

/**
 * VirtualEmbeddedPanel — Layer 2 of the Digital Twin: the embedded hardware
 * installed inside ONE façade module ("Upper Centre"). Bridges
 * Environment → Physical Sensors → Embedded Controller → PBIF, entirely
 * read-only (see `src/lib/embedded/index.ts`'s header for the full contract).
 */
export function VirtualEmbeddedPanel() {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [showSignalTranslation, setShowSignalTranslation] = useState(false)
  const [expandedSensor, setExpandedSensor] = useState<string | null>(null)
  const [occupied, setOccupied] = useState(false)
  const [paused, setPaused] = useState(false)
  // Live viewport-clamp bounds, populated below once the mode/size/viewport are
  // known. The drag hook only reads `boundsRef.current` inside pointer events,
  // so it is safe for this to be filled in after the hook is created.
  const boundsRef = useRef<Bounds>({ minX: VIEWPORT_MARGIN, maxX: 9999, minY: NAV_CLEARANCE_Y, maxY: 9999 })

  // The drag handlers (and their onTap closure) are rebuilt every render, so the
  // tap handler always sees the current `open` — a tap opens the badge, and is a
  // no-op once the full controller is already open.
  const { pos, dragHandlers } = usePersistedDrag(
    DEFAULT_POSITION,
    () => {
      if (!open) setOpen(true)
    },
    boundsRef,
  )
  const { size, resizeHandlers } = usePersistedSize(DEFAULT_SIZE)
  const vp = useViewportSize()

  // Mirror collapse state into the shared store so the 3D highlight can fade
  // its on-panel hardware icons in step with it (see moduleHighlightStore.ts).
  useEffect(() => {
    useModuleHighlightStore.getState().setPanelOpen(open)
  }, [open])
  const targetScreen = useModuleHighlightStore((s) => s.screen)

  // Re-render on each throttled snapshot tick (same convention as PbifPanel /
  // KinematicsInspector) — the values below are then read live, not cached.
  useTwinStore((s) => s.snapshot)
  const building = useTwinStore((s) => s.building)

  const sim = getSimulation()
  // Re-resolve which panel is "Upper Centre" only when the geometry itself
  // changes (shape/dimensions/orientation) — never per tick. `sim` is a stable
  // singleton and `pickUpperCentrePanel` doesn't read `building` directly (it
  // reads `sim`'s live surfaces), so eslint can't see why `building` belongs
  // here — but it's the store's proxy for "geometry changed" and is required
  // to invalidate this memo when `setBuilding`/`setOrientation` replace it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const panelId = useMemo(() => pickUpperCentrePanel(sim)?.id, [building, sim])
  const state = computeEmbeddedState(sim, panelId, { occupied, paused })

  const pins: BoardPin[] = [
    { id: 'ldrUpper', label: state.sensors.ldrUpper.gpioLabel, sublabel: 'LDR Upper', group: 'analog', side: 'left', raw: state.sensors.ldrUpper.raw },
    { id: 'ldrLower', label: state.sensors.ldrLower.gpioLabel, sublabel: 'LDR Lower', group: 'analog', side: 'left', raw: state.sensors.ldrLower.raw },
    { id: 'wind', label: state.sensors.wind.gpioLabel, sublabel: 'Wind', group: 'analog', side: 'left', raw: state.sensors.wind.raw },
    { id: 'rain', label: state.sensors.rain.gpioLabel, sublabel: 'Rain', group: 'analog', side: 'left', raw: state.sensors.rain.raw },
    { id: 'dht22', label: 'GPIO4', sublabel: 'DHT22 (T/H)', group: 'digital', side: 'left', raw: Math.max(state.sensors.temperature.raw, state.sensors.humidity.raw) },
    { id: 'pir', label: state.sensors.pir.gpioLabel, sublabel: 'PIR', group: 'digital', side: 'left', raw: state.sensors.pir.raw },
    { id: 'pauseSwitch', label: state.sensors.pauseSwitch.gpioLabel, sublabel: 'Pause SW', group: 'digital', side: 'left', raw: state.sensors.pauseSwitch.raw },
    { id: 'servo', label: 'PWM CH0', sublabel: 'Servo', group: 'pwm', side: 'right', raw: state.servo.moving ? 1 : 0 },
    { id: 'sda', label: 'I²C SDA', sublabel: 'LCD', group: 'i2c', side: 'right', raw: 0.5 },
    { id: 'scl', label: 'I²C SCL', sublabel: 'LCD', group: 'i2c', side: 'right', raw: 0.5 },
  ]

  const sensorList: SensorSignal[] = [
    state.sensors.ldrUpper,
    state.sensors.ldrLower,
    state.sensors.wind,
    state.sensors.rain,
    state.sensors.temperature,
    state.sensors.humidity,
    state.sensors.pir,
    state.sensors.pauseSwitch,
  ]

  // ── Viewport-aware sizing & positioning ──────────────────────────────────
  // Width fits within the horizontal safe margins; height is derived after the
  // vertical position is clamped so the panel can never exceed the viewport.
  const effectiveWidth = Math.min(size.width, Math.max(MIN_SIZE.width, vp.w - VIEWPORT_MARGIN * 2))
  // Bounds differ per mode: the expanded panel reserves MIN_VISIBLE_HEIGHT below
  // its top edge; the collapsed badge only needs its own small footprint.
  const boxW = open ? effectiveWidth : BADGE_SIZE.width
  const bottomReserve = open ? MIN_VISIBLE_HEIGHT : BADGE_SIZE.height
  const bounds: Bounds = {
    minX: VIEWPORT_MARGIN,
    maxX: Math.max(VIEWPORT_MARGIN, vp.w - boxW - VIEWPORT_MARGIN),
    minY: NAV_CLEARANCE_Y,
    maxY: Math.max(NAV_CLEARANCE_Y, vp.h - bottomReserve - VIEWPORT_MARGIN),
  }
  // Keep the ref the drag hook reads in sync (mutated in an effect, never during
  // render, per the refs-in-render rule). Keyed on the numeric bounds so it only
  // runs when they actually change — not on every snapshot re-render.
  useEffect(() => {
    boundsRef.current = bounds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY])
  // The position we actually render — always inside the viewport, even if the
  // stored position came from a larger screen or a prior zoom level.
  const renderPos = clampToBounds(pos, bounds)
  // Fit the height into whatever room remains below the (clamped) top edge, so
  // only the internal content scrolls — never the window itself. On any realistic
  // viewport the maxY clamp above guarantees `availableHeight >= MIN_VISIBLE_HEIGHT`;
  // the outer floor only guards absurdly short (unsupported) viewports, and it is
  // still bounded by available space so the panel can never exceed the viewport.
  const availableHeight = Math.max(120, vp.h - renderPos.y - VIEWPORT_MARGIN)
  const effectiveHeight = Math.min(size.height, MAX_SIZE.height, availableHeight)

  // The panel's own on-screen anchor for the leader line — an estimate of the
  // header's left edge, roughly vertically centred (its height is stable
  // regardless of open/collapsed, so this needs no DOM measurement).
  const anchor = { x: renderPos.x, y: renderPos.y + 30 }

  return (
    <>
      <LeaderLine from={anchor} to={targetScreen} visible={open && state.available} />

      <AnimatePresence mode="wait">
        {!open ? (
          /* ── Collapsed: subtle activation badge ──────────────────────────────
             Never permanently occupies screen space. Hovering expands it into a
             live preview; a tap (a press that isn't a drag) opens the full
             Virtual Embedded Controller. It stays freely draggable. */
          <motion.div
            key="badge"
            className="glass-strong pointer-events-auto absolute flex cursor-grab select-none items-center rounded-2xl p-2 active:cursor-grabbing"
            style={{ left: renderPos.x, top: renderPos.y, zIndex: 25, background: PANEL_BACKGROUND, touchAction: 'none' }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onPointerDown={dragHandlers.onPointerDown}
            onPointerMove={dragHandlers.onPointerMove}
            onPointerUp={dragHandlers.onPointerUp}
            onPointerCancel={dragHandlers.onPointerCancel}
            title="Open Virtual Embedded Controller"
          >
            <motion.div
              className="grid place-items-center rounded-xl bg-electric/20"
              animate={{ width: hovered ? 34 : 30, height: hovered ? 34 : 30 }}
              transition={{ type: 'spring', stiffness: 400, damping: 26 }}
            >
              <Zap className="h-4 w-4 text-electric" />
            </motion.div>
            <div className="px-2">
              <p className="text-[8.5px] font-semibold uppercase leading-none tracking-[0.16em] text-electric">Embedded</p>
              <p className="text-[11px] font-medium leading-tight text-white/70">ESP32-S3</p>
            </div>

            <AnimatePresence>
              {hovered && (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="ml-1 flex items-center gap-3 whitespace-nowrap border-l border-white/10 pl-3 pr-1">
                    {state.available ? (
                      <>
                        <PreviewStat label="Loop" value={`${state.loopHz.toFixed(1)} Hz`} />
                        <PreviewStat label="Servo" value={state.servo.moving ? 'MOVING' : 'HOLDING'} />
                        <span className="text-[9px] font-medium text-electric">Click to open →</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-white/45">No module for this geometry</span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
      <motion.div
        key="panel"
        className="glass-strong pointer-events-auto absolute flex flex-col overflow-hidden rounded-3xl p-4"
        style={{
          left: renderPos.x,
          top: renderPos.y,
          width: effectiveWidth,
          height: effectiveHeight,
          zIndex: 25,
          background: PANEL_BACKGROUND,
        }}
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 8 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.7 }}
      >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

      {/* Draggable header — the only drag handle; body controls stay clickable. */}
      <div
        className="flex w-full shrink-0 cursor-grab select-none items-center justify-between active:cursor-grabbing"
        onPointerDown={dragHandlers.onPointerDown}
        onPointerMove={dragHandlers.onPointerMove}
        onPointerUp={dragHandlers.onPointerUp}
        onPointerCancel={dragHandlers.onPointerCancel}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 text-white/25" />
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-electric/20">
            <CircuitBoard className="h-4 w-4 text-electric" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-electric">Virtual Embedded Controller</p>
            <p className="text-xs font-medium text-white/70">Façade Module · Upper Centre</p>
          </div>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 hover:bg-white/10">
          <ChevronDown className={`h-4 w-4 text-white/50 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="slim-scrollbar mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto scroll-smooth pr-1" style={{ overscrollBehavior: 'contain' }}>
          {!state.available ? (
            <p className="rounded-xl bg-white/[0.03] p-3 text-[11px] text-white/45">No façade panel available for this building geometry.</p>
          ) : (
            <>
              {/* ── ESP32-S3 Controller board status ─────────────────────────── */}
              <BoardStatusStrip loopHz={state.loopHz} moving={state.servo.moving} />

              {/* ── Sensors | ESP32 | Outputs | LCD ──────────────────────────── */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <SectionLabel>Sensor Layer</SectionLabel>
                  {sensorList.map((s) => (
                    <SensorRow
                      key={s.id}
                      signal={s}
                      expanded={expandedSensor === s.id}
                      onToggle={() => setExpandedSensor((cur) => (cur === s.id ? null : s.id))}
                    />
                  ))}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <ManualToggle icon={User} label="Occupancy" on={occupied} onClick={() => setOccupied((v) => !v)} />
                    <ManualToggle icon={Wrench} label="Maintenance" on={paused} onClick={() => setPaused((v) => !v)} />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <SectionLabel>ESP32-S3</SectionLabel>
                    <Esp32Board pins={pins} />
                  </div>
                  <div>
                    <SectionLabel>Outputs</SectionLabel>
                    <OutputsCard servo={state.servo} led={state.led} />
                  </div>
                  <div>
                    <SectionLabel>LCD · 20×4 I²C</SectionLabel>
                    <LcdScreen lines={state.lcd} />
                  </div>
                </div>
              </div>

              {/* ── Signal Translation ───────────────────────────────────────── */}
              <div className="rounded-2xl border border-white/5 bg-white/[0.02]">
                <button
                  onClick={() => setShowSignalTranslation((o) => !o)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Signal Translation</span>
                  <ChevronDown className={`h-3.5 w-3.5 text-white/40 transition-transform ${showSignalTranslation ? 'rotate-180' : ''}`} />
                </button>
                {showSignalTranslation && (
                  <div className="space-y-1.5 px-3 pb-3">
                    <p className="text-[9px] leading-relaxed text-white/40">
                      PBIF never receives Cloud Cover, Wind or Rain directly — only what the electronics actually measure:
                      ADC counts, GPIO states and digital sensor packets.
                    </p>
                    {SIGNAL_TRANSLATION_REFERENCE.map((row) => (
                      <div key={row.sensor} className="rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[9.5px] leading-relaxed text-white/60">
                        <span className="font-semibold text-white/80">{row.sensor}</span>
                        {' → '}
                        {row.chain.join(' → ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Circuit Simulation ───────────────────────────────────────── */}
              <div>
                <SectionLabel>Circuit Simulation</SectionLabel>
                <div className="mt-2">
                  <CircuitSimulation state={state} pins={pins} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Resize handle — bottom-right corner, window-style. Only meaningful
          once the panel has a body to resize. */}
      {open && (
        <div
          onPointerDown={resizeHandlers.onPointerDown}
          onPointerMove={resizeHandlers.onPointerMove}
          onPointerUp={resizeHandlers.onPointerUp}
          onPointerCancel={resizeHandlers.onPointerCancel}
          className="absolute bottom-0 right-0 flex h-6 w-6 cursor-nwse-resize select-none items-end justify-end p-1"
          style={{ touchAction: 'none' }}
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3 text-white/25">
            <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.2" />
            <line x1="10" y1="6" x2="6" y2="10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </div>
      )}
      </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[7.5px] uppercase leading-none tracking-wider text-white/40">{label}</p>
      <p className="mt-0.5 font-mono text-[10px] font-semibold text-white/85">{value}</p>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-white/45">{children}</p>
}

function BoardStatusStrip({ loopHz, moving }: { loopHz: number; moving: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <StatusChip icon={Cpu} label="CPU" value="Running" tone="good" />
      <StatusChip icon={Activity} label="Loop" value={`${loopHz.toFixed(1)} Hz`} tone="neutral" />
      <StatusChip icon={Power} label="Power" value={moving ? 'Elevated' : 'Nominal'} tone="neutral" />
      <StatusChip icon={Radio} label="Link" value="Standalone (Sim)" tone="neutral" />
      <StatusChip icon={CircuitBoard} label="Firmware" value="Enoki v1" tone="neutral" />
      <StatusChip icon={Activity} label="Status" value="OK" tone="good" />
    </div>
  )
}

function StatusChip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Cpu
  label: string
  value: string
  tone: 'good' | 'neutral'
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
      <p className="flex items-center gap-1 text-[7.5px] uppercase tracking-wider text-white/40">
        <Icon className="h-2.5 w-2.5" /> {label}
      </p>
      <p className={`truncate font-mono text-[10px] font-semibold ${tone === 'good' ? 'text-emerald-400' : 'text-white/85'}`}>{value}</p>
    </div>
  )
}

function SensorRow({ signal, expanded, onToggle }: { signal: SensorSignal; expanded: boolean; onToggle: () => void }) {
  const Icon = SENSOR_ICON[signal.id] ?? Activity
  const first = signal.steps[0]
  const last = signal.steps[signal.steps.length - 1]
  // The LDR pipeline starts from the Engineering Inspector's own GHI (never
  // recomputed here) and ends at the literal firmware call that reads it —
  // reinforcing that the firmware only ever sees ADC counts, not lux/volts.
  const isLdr = signal.id === 'ldrUpper' || signal.id === 'ldrLower'
  return (
    <div className="overflow-hidden rounded-lg bg-white/[0.03]">
      <button onClick={onToggle} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-white/[0.03]">
        <Icon className="h-3 w-3 shrink-0 text-white/40" />
        <span className="w-[64px] shrink-0 truncate text-[9.5px] text-white/70">{signal.name}</span>
        <span className="ml-auto truncate font-mono text-[9px] text-white/45">{first.value}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-white/30 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        <span className="shrink-0 rounded bg-white/5 px-1 py-0.5 font-mono text-[9px] font-semibold text-electric">{last.value}</span>
      </button>
      {expanded && (
        <div className="border-t border-white/5 p-2">
          <SignalChain
            steps={signal.steps}
            startTag={isLdr ? 'ENGINEERING INSPECTOR' : undefined}
            endTag={isLdr ? `analogRead(${signal.gpioLabel})` : undefined}
          />
        </div>
      )}
    </div>
  )
}

function ManualToggle({ icon: Icon, label, on, onClick }: { icon: typeof User; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[9.5px] font-medium transition-colors ${
        on ? 'bg-emerald/25 text-emerald' : 'bg-white/5 text-white/55 hover:bg-white/10'
      }`}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  )
}

/**
 * Building Kinematics vs. Embedded Hardware: `worldRotationTarget` is the
 * unbounded kinematic rotation the façade solver commands (may be well
 * outside 0–360°, e.g. -735° after many tracked rotations) — never what a
 * real actuator reads. The chain below folds it into the physical servo's
 * 0–180° travel and PWM signal (see `src/lib/embedded/servo.ts`) so the
 * Outputs panel shows what the ESP32-S3 is ACTUALLY commanding, not the
 * internal mathematical representation.
 */
function OutputsCard({ servo, led }: { servo: ServoState; led: { tracking: boolean; maintenance: boolean; override: boolean } }) {
  const steps = [
    { label: 'World Rotation', value: `${Math.round(servo.worldRotationTarget)}°` },
    { label: 'Servo Command', value: `${Math.round(servo.servoCommandAngle)}°` },
    { label: 'PWM Output', value: `${servo.pwmMicros} µs` },
    { label: 'Servo Position', value: `${Math.round(servo.servoPositionAngle)}°` },
  ]
  return (
    <div className="space-y-2 rounded-xl bg-white/[0.03] p-2.5">
      <SignalChain steps={steps} startTag="ESP32-S3" endTag="SERVO" />
      <div className="flex items-center justify-between border-t border-white/5 pt-2">
        <span className="text-[8px] uppercase tracking-wider text-white/40">Movement</span>
        <span className="font-mono text-[10px] font-semibold text-white/85">{servo.moving ? 'MOVING' : 'HOLDING'}</span>
      </div>
      <div className="flex items-center justify-center gap-4 border-t border-white/5 pt-2">
        <Led color="#00D084" on={led.tracking} label="Tracking" />
        <Led color="#fbbf24" on={led.maintenance} label="Maint." />
        <Led color="#ef4444" on={led.override} label="Override" />
      </div>
    </div>
  )
}

function Led({ color, on, label }: { color: string; on: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="h-2.5 w-2.5 rounded-full transition-all"
        style={{ background: on ? color : 'rgba(255,255,255,0.12)', boxShadow: on ? `0 0 8px ${color}` : 'none' }}
      />
      <span className="text-[7.5px] uppercase tracking-wider text-white/40">{label}</span>
    </div>
  )
}
