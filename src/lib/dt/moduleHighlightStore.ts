'use client'

import { create } from 'zustand'

/**
 * Tiny bridge between the 3D scene and the 2D Virtual Embedded Controller
 * panel — nothing else. The 3D `SelectedModuleHighlight` (inside the R3F
 * Canvas) writes the selected façade module's projected screen position each
 * frame; `VirtualEmbeddedPanel` (an HTML overlay outside the Canvas) reads it
 * to draw a leader line, and writes its own open/collapsed state back so the
 * 3D layer can gently fade its on-panel hardware icons in step with it.
 */
interface ModuleHighlightState {
  /** Projected screen-space position of the selected module, or null when
   *  unavailable (no panel resolved, or the point is behind the camera). */
  screen: { x: number; y: number } | null
  setScreen: (screen: { x: number; y: number } | null) => void
  /** Mirrors the Virtual Embedded Controller panel's own expand/collapse state. */
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  /** Counter that increments when an external component requests the panel to open. */
  triggerOpen: number
  requestOpenPanel: () => void
}

export const useModuleHighlightStore = create<ModuleHighlightState>((set) => ({
  screen: null,
  setScreen: (screen) => set({ screen }),
  panelOpen: false,
  setPanelOpen: (open) => set({ panelOpen: open }),
  triggerOpen: 0,
  requestOpenPanel: () => set((state) => ({ triggerOpen: state.triggerOpen + 1 })),
}))
