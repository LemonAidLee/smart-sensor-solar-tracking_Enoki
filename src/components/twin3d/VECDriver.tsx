'use client'

import { useEffect } from 'react'
import { useVecStore } from '@/lib/vec/store'

/**
 * Synchronisation driver for the Virtual Embedded Controller. Boots the active
 * controller once, then ticks the bidirectional sync loop on a fixed cadence
 * (the store self-gates to the firmware's 200 ms loop). Lives outside the Canvas
 * — it needs no Three.js, only the Simulation singleton and the VEC store.
 */
export function VECDriver() {
  const init = useVecStore((s) => s.init)
  const sync = useVecStore((s) => s.sync)

  useEffect(() => {
    init()
    const t = window.setInterval(sync, 100)
    return () => window.clearInterval(t)
  }, [init, sync])

  return null
}
