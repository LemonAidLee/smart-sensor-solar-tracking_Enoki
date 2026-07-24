'use client'

import { useTwinStore } from '@/lib/engine/store'
import { SCENARIOS } from '@/lib/engine/scenario'

/** Whole-configuration presets — one click reconfigures the entire twin. */
export function ScenarioBar() {
  const scenarioId = useTwinStore((s) => s.scenarioId)
  const apply = useTwinStore((s) => s.applyScenarioId)

  return (
    <div className="glass-strong relative flex items-center gap-1.5 rounded-full p-1.5">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <span className="px-2 text-[10px] font-semibold uppercase tracking-widest text-white/45">Scenario</span>
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {SCENARIOS.map((sc) => (
          <button
            key={sc.id}
            onClick={() => apply(sc.id)}
            title={sc.description}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              scenarioId === sc.id ? 'bg-white/90 text-black' : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            {sc.name}
          </button>
        ))}
      </div>
    </div>
  )
}
