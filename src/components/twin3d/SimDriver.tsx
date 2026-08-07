'use client'

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { getSimulation } from '@/lib/engine/simulation'
import { useTwinStore } from '@/lib/engine/store'
import { rateHz } from '@/lib/engine/scheduler'

/**
 * The one authoritative loop: advances the Simulation every frame and pushes a
 * throttled telemetry snapshot into the store (~8 Hz) so React never re-renders
 * at 60 fps. Mounted first so downstream meshes read freshly-ticked state.
 */
export function SimDriver() {
  const sim = getSimulation()
  const pull = useTwinStore((s) => s.pull)
  const pullAi = useTwinStore((s) => s.pullAi)
  const acc = useRef(0)
  // AI advisory tier (~3 Hz) — deliberately slower than the ~8 Hz telemetry
  // tier above; see `pullAi`'s own doc comment in `store.ts`.
  const aiAcc = useRef(0)
  // Stage 7.11 — `TwinScene.tsx` turns off `shadowMap.autoUpdate`; every place
  // that actually moves a shadow-casting object (`FacadeLayer.tsx`,
  // `SceneEnvironment.tsx`) flags a refresh itself. This is the safety net for
  // anything that moves declaratively (React props) rather than imperatively
  // (a scene-graph mutation this loop wouldn't otherwise catch) — e.g. an
  // edited neighbour building. 2 Hz keeps the shadow map self-healing within
  // half a second of any missed case, at negligible cost next to "every frame".
  const shadowSafetyNet = useRef(rateHz(2))

  useEffect(() => {
    // Forecast Mode is the engine's default active source, so this fires on
    // every fresh mount — it must NOT also jump the clock to "now" (Stage
    // 7.11.1: a fresh launch opens at 06:00 on today's date, set once by
    // `Simulation`'s constructor, and stays there until the operator does
    // something that asks for "now" — the Now button, or explicitly
    // re-selecting Forecast Mode via `setWeatherSource`, both of which
    // already call `syncClockToSiteNow()` themselves). Only the live
    // forecast fetch needs to start unconditionally here, so cached data is
    // ready the moment the operator looks at it.
    if (useTwinStore.getState().weatherSource === 'forecast') {
      sim.liveForecast.start()
    }
  }, [sim])

  useFrame((state, dt) => {
    sim.tick(dt)
    acc.current += dt
    if (acc.current > 0.12) {
      acc.current = 0
      pull()
    }
    aiAcc.current += dt
    if (aiAcc.current > 0.33) {
      aiAcc.current = 0
      pullAi()
    }
    if (shadowSafetyNet.current.tick(dt)) {
      state.gl.shadowMap.needsUpdate = true
    }
  })

  return null
}
