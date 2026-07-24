'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, X, type LucideIcon } from 'lucide-react'
import { useWindowStore, WINDOW_Z_BASE, type WindowId } from '@/lib/dt/windowStore'

/**
 * FloatingWindow — the generic engineering-workspace window shell.
 *
 * Every engineering tool (Weather, Solar Geometry, Panel Kinematics, PBIF) is an
 * independent floating window that can be opened, closed, collapsed, expanded,
 * dragged and resized. All of that behaviour — plus persistence and z-stacking —
 * lives here so the tool bodies stay pure content. This mirrors CAD / Digital
 * Twin / game-editor palettes: tools appear only when summoned, and the user
 * arranges them freely.
 *
 * The drag/resize gestures use raw pointer events (not framer-motion's controlled
 * drag) so the window body can host normal, clickable controls — the same proven
 * approach used by the Virtual Embedded Controller.
 */

/** Pointer must move this far before a press counts as a drag/resize, not a click. */
const DRAG_THRESHOLD_PX = 4
/** Keep windows clear of the fixed top navigation (z-50) so headers stay clickable. */
const NAV_CLEARANCE_Y = 96
const MIN_X = 8

const MIN_SIZE = { w: 240, h: 160 }
const MAX_SIZE = { w: 720, h: 1100 }

export interface FloatingWindowProps {
  id: WindowId
  title: string
  icon: LucideIcon
  accent: string
  defaultX: number
  defaultY: number
  defaultW: number
  /** Optional fixed content width; when omitted the window is horizontally resizable. */
  resizable?: boolean
  children: React.ReactNode
}

/**
 * A fast gesture can drag the pointer over selectable text between move events;
 * disabling selection document-wide for the gesture's duration (the standard drag
 * library fix) prevents the user getting stuck having highlighted the panel.
 */
function setGlobalTextSelection(enabled: boolean) {
  document.body.style.userSelect = enabled ? '' : 'none'
}

export function FloatingWindow({
  id,
  title,
  icon: Icon,
  accent,
  defaultX,
  defaultY,
  defaultW,
  resizable = true,
  children,
}: FloatingWindowProps) {
  const win = useWindowStore((s) => s.windows[id])
  const order = useWindowStore((s) => s.order)
  const close = useWindowStore((s) => s.close)
  const setCollapsed = useWindowStore((s) => s.setCollapsed)
  const setPosition = useWindowStore((s) => s.setPosition)
  const setSize = useWindowStore((s) => s.setSize)
  const focus = useWindowStore((s) => s.focus)

  const open = win?.open ?? false
  const collapsed = win?.collapsed ?? false

  // Local, live transform state seeded from the store; written back on gesture
  // end so we persist final values without thrashing localStorage mid-drag.
  const [pos, setPos] = useState({ x: win?.x ?? defaultX, y: win?.y ?? defaultY })
  const [width, setWidth] = useState(win?.w ?? defaultW)

  // Re-seed from the store when it changes externally (e.g. persisted restore),
  // but never while the user is actively dragging/resizing this window.
  const interacting = useRef(false)
  useEffect(() => {
    if (interacting.current) return
    setPos({ x: win?.x ?? defaultX, y: win?.y ?? defaultY })
    setWidth(win?.w ?? defaultW)
  }, [win?.x, win?.y, win?.w, defaultX, defaultY, defaultW])

  const zIndex = WINDOW_Z_BASE + Math.max(0, order.indexOf(id))

  /* ── Drag (header) ──────────────────────────────────────────────────────── */
  const drag = useRef({ pressed: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 })
  const onDragDown = (e: React.PointerEvent) => {
    focus(id)
    drag.current = { pressed: true, moved: false, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
  }
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d.pressed) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      d.moved = true
      interacting.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      setGlobalTextSelection(false)
    }
    setPos({ x: Math.max(MIN_X, d.ox + dx), y: Math.max(NAV_CLEARANCE_Y, d.oy + dy) })
  }
  const onDragUp = () => {
    const d = drag.current
    d.pressed = false
    setGlobalTextSelection(true)
    if (!d.moved) return
    d.moved = false
    interacting.current = false
    setPosition(id, Math.max(MIN_X, pos.x), Math.max(NAV_CLEARANCE_Y, pos.y))
  }

  /* ── Resize (bottom-right corner) ───────────────────────────────────────── */
  const rez = useRef({ pressed: false, moved: false, sx: 0, ow: 0 })
  const onRezDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    focus(id)
    rez.current = { pressed: true, moved: false, sx: e.clientX, ow: width }
  }
  const onRezMove = (e: React.PointerEvent) => {
    const r = rez.current
    if (!r.pressed) return
    const dx = e.clientX - r.sx
    if (!r.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return
      r.moved = true
      interacting.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      setGlobalTextSelection(false)
    }
    setWidth(Math.min(MAX_SIZE.w, Math.max(MIN_SIZE.w, r.ow + dx)))
  }
  const onRezUp = () => {
    const r = rez.current
    r.pressed = false
    setGlobalTextSelection(true)
    if (!r.moved) return
    r.moved = false
    interacting.current = false
    setSize(id, width, win?.h ?? 0)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key={id}
          className="glass-strong pointer-events-auto absolute flex flex-col overflow-hidden rounded-3xl"
          style={{ left: pos.x, top: pos.y, width, maxWidth: '92vw', zIndex }}
          onPointerDown={() => focus(id)}
          initial={{ opacity: 0, scale: 0.92, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 8 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.7 }}
        >
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          {/* Header — the drag handle. Collapse + close controls stay clickable. */}
          <div
            className="flex shrink-0 cursor-grab select-none items-center justify-between gap-2 px-4 py-3 active:cursor-grabbing"
            onPointerDown={onDragDown}
            onPointerMove={onDragMove}
            onPointerUp={onDragUp}
            onPointerCancel={onDragUp}
            style={{ touchAction: 'none' }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg" style={{ background: `${accent}22` }}>
                <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
              </span>
              <p className="truncate text-[13px] font-semibold text-white/85">{title}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => setCollapsed(id, !collapsed)}
                title={collapsed ? 'Expand' : 'Collapse'}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${collapsed ? '-rotate-90' : ''}`} />
              </button>
              <button
                onClick={() => close(id)}
                title="Close"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-white/50 transition-colors hover:bg-red-500/20 hover:text-red-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Body — collapsible with a smooth height/opacity animation. */}
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="min-h-0 overflow-hidden"
              >
                <div className="no-scrollbar max-h-[calc(100dvh-14rem)] overflow-y-auto px-4 pb-4">
                  {children}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Resize handle — bottom-right corner, window-style. */}
          {resizable && !collapsed && (
            <div
              onPointerDown={onRezDown}
              onPointerMove={onRezMove}
              onPointerUp={onRezUp}
              onPointerCancel={onRezUp}
              title="Resize"
              className="absolute bottom-0 right-0 flex h-6 w-6 cursor-ew-resize select-none items-end justify-end p-1.5"
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
  )
}
