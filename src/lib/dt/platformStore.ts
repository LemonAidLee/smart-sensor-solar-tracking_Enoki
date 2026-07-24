'use client'

import { create } from 'zustand'

export type DtLayer = 'BUILDING' | 'DECISION' | 'ELECTRONICS' | 'EXPLAINABILITY'

interface PlatformState {
  layer: DtLayer
  setLayer: (layer: DtLayer) => void
}

export const usePlatformStore = create<PlatformState>((set) => ({
  layer: 'BUILDING',
  setLayer: (layer) => set({ layer }),
}))
