'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Digital Twin workspace window manager.
 *
 * The Digital Twin is a professional engineering workspace, not a dashboard: the
 * building is always the hero and engineering tools appear only when the user
 * summons them. This store is the single source of truth for that behaviour — it
 * tracks, per engineering window, whether it is open, whether it is collapsed,
 * where it sits, how big it is, and its focus order (z-stacking). Everything is
 * persisted to `localStorage` so a user's workspace arrangement survives reloads
 * and sessions, exactly like CAD / BIM / game-editor tooling.
 *
 * Only *deltas* are stored: a window that has never been moved holds no
 * position, so `FloatingWindow` falls back to the tool's registered default.
 * This keeps the persisted blob tiny and lets default layouts evolve without
 * fighting stale saved coordinates.
 */

export type WindowId = 'pipeline' | 'weather' | 'pbif' | 'pv' | 'thermal' | 'lighting' | 'ai' | 'whatif' | 'assistant' | 'fdd'

/** Persisted per-window state. Position/size are optional — absent means "use
 *  the tool's default", so we never freeze a window to an old default. */
export interface WindowState {
  open: boolean
  collapsed: boolean
  x?: number
  y?: number
  w?: number
  h?: number
}

interface WindowStore {
  /** Sparse map — a window only appears here once it has been interacted with. */
  windows: Partial<Record<WindowId, WindowState>>
  /** Focus order, front-most last. Drives z-index so the last-touched window wins. */
  order: WindowId[]

  toggle: (id: WindowId) => void
  open: (id: WindowId) => void
  close: (id: WindowId) => void
  setCollapsed: (id: WindowId, collapsed: boolean) => void
  setPosition: (id: WindowId, x: number, y: number) => void
  setSize: (id: WindowId, w: number, h: number) => void
  /** Bring a window to the front of the focus order. */
  focus: (id: WindowId) => void
  /** Close every window — used by "clear workspace" affordances. */
  closeAll: () => void
}

/** Merge a patch into a window's state, seeding sensible defaults on first touch. */
function patchWindow(
  windows: Partial<Record<WindowId, WindowState>>,
  id: WindowId,
  patch: Partial<WindowState>,
): Partial<Record<WindowId, WindowState>> {
  const current = windows[id] ?? { open: false, collapsed: false }
  return { ...windows, [id]: { ...current, ...patch } }
}

/** Move `id` to the front (end) of the focus order without duplicating it. */
function bringToFront(order: WindowId[], id: WindowId): WindowId[] {
  return [...order.filter((w) => w !== id), id]
}

export const useWindowStore = create<WindowStore>()(
  persist(
    (set) => ({
      windows: {},
      order: [],

      toggle: (id) =>
        set((s) => {
          const isOpen = s.windows[id]?.open ?? false
          return {
            windows: patchWindow(s.windows, id, { open: !isOpen }),
            order: isOpen ? s.order : bringToFront(s.order, id),
          }
        }),

      open: (id) =>
        set((s) => ({
          windows: patchWindow(s.windows, id, { open: true }),
          order: bringToFront(s.order, id),
        })),

      close: (id) =>
        set((s) => ({ windows: patchWindow(s.windows, id, { open: false }) })),

      setCollapsed: (id, collapsed) =>
        set((s) => ({ windows: patchWindow(s.windows, id, { collapsed }) })),

      setPosition: (id, x, y) =>
        set((s) => ({ windows: patchWindow(s.windows, id, { x, y }) })),

      setSize: (id, w, h) =>
        set((s) => ({ windows: patchWindow(s.windows, id, { w, h }) })),

      focus: (id) => set((s) => ({ order: bringToFront(s.order, id) })),

      closeAll: () =>
        set((s) => {
          const windows = { ...s.windows }
          for (const id of Object.keys(windows) as WindowId[]) {
            windows[id] = { ...windows[id]!, open: false }
          }
          return { windows }
        }),
    }),
    {
      name: 'dt-workspace-windows',
      // Persist only the arrangement, not the action functions.
      partialize: (s) => ({ windows: s.windows, order: s.order }),
    },
  ),
)

/** Base z-index for floating windows; focus order is layered on top of this. */
export const WINDOW_Z_BASE = 30
