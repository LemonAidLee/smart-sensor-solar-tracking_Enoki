'use client'

/**
 * Electronics Digital Twin — UI/interaction state (Zustand).
 *
 * Owns ONLY view state: window geometry, the circuit pan/zoom transform, which
 * component is hovered/selected, the feature toggles, and the execution-debugger
 * playhead. It holds no firmware or simulation state — that is read live from the
 * VEC store. This keeps the EDT a pure observation/visualisation layer.
 */

import { create } from 'zustand'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface ViewTransform {
  zoom: number
  panX: number
  panY: number
}

interface EdtState {
  open: boolean
  fullscreen: boolean
  win: Rect
  view: ViewTransform

  hoveredId: string | null
  selectedId: string | null

  showLegend: boolean
  showEducation: boolean
  showDataFlow: boolean
  showDebugger: boolean

  // execution debugger playhead
  playing: boolean
  speed: number // 0.25 … 4 (× real time)
  stageIndex: number
  replayIndex: number | null // null = live latest; else index into traceHistory

  // actions
  setOpen: (o: boolean) => void
  toggleFullscreen: () => void
  setWin: (r: Partial<Rect>) => void
  setView: (v: Partial<ViewTransform>) => void
  zoomBy: (factor: number, cx?: number, cy?: number) => void
  resetView: () => void
  fitView: () => void
  hover: (id: string | null) => void
  select: (id: string | null) => void
  toggle: (k: 'showLegend' | 'showEducation' | 'showDataFlow' | 'showDebugger') => void

  setPlaying: (p: boolean) => void
  setSpeed: (s: number) => void
  setStageIndex: (i: number) => void
  stepStage: (delta: number) => void
  setReplayIndex: (i: number | null) => void
}

const DEFAULT_WIN: Rect = { x: 90, y: 96, w: 1120, h: 700 }
const DEFAULT_VIEW: ViewTransform = { zoom: 1, panX: 0, panY: 0 }

export const useEdtStore = create<EdtState>((set) => ({
  open: false,
  fullscreen: false,
  win: { ...DEFAULT_WIN },
  view: { ...DEFAULT_VIEW },
  hoveredId: null,
  selectedId: null,
  showLegend: false,
  showEducation: false,
  showDataFlow: true,
  showDebugger: true,
  playing: true,
  speed: 1,
  stageIndex: 0,
  replayIndex: null,

  setOpen: (open) => set({ open }),
  toggleFullscreen: () => set((s) => ({ fullscreen: !s.fullscreen })),
  setWin: (r) => set((s) => ({ win: { ...s.win, ...r } })),
  setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
  zoomBy: (factor) =>
    set((s) => ({ view: { ...s.view, zoom: Math.min(3, Math.max(0.4, s.view.zoom * factor)) } })),
  resetView: () => set({ view: { ...DEFAULT_VIEW } }),
  fitView: () => set({ view: { ...DEFAULT_VIEW } }),
  hover: (hoveredId) => set({ hoveredId }),
  select: (selectedId) => set({ selectedId }),
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Pick<EdtState, typeof k>),

  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setStageIndex: (stageIndex) => set({ stageIndex }),
  stepStage: (delta) => set((s) => ({ playing: false, stageIndex: Math.max(0, Math.min(18, s.stageIndex + delta)) })),
  setReplayIndex: (replayIndex) => set({ replayIndex }),
}))
