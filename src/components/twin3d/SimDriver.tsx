'use client'

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { getSimulation } from '@/lib/engine/simulation'
import { useTwinStore } from '@/lib/engine/store'

/**
 * The one authoritative loop: advances the Simulation every frame and pushes a
 * throttled telemetry snapshot into the store (~8 Hz) so React never re-renders
 * at 60 fps. Mounted first so downstream meshes read freshly-ticked state.
 */
export function SimDriver() {
  const sim = getSimulation()
  const pull = useTwinStore((s) => s.pull)
  const acc = useRef(0)

  useEffect(() => {
    if (useTwinStore.getState().weatherSource === 'forecast') {
      useTwinStore.getState().returnToNow()
      sim.liveForecast.start()
    }
  }, [sim])

  useFrame((_, dt) => {
    sim.tick(dt)
    acc.current += dt
    if (acc.current > 0.12) {
      acc.current = 0
      pull()
    }
  })

  return null
}
