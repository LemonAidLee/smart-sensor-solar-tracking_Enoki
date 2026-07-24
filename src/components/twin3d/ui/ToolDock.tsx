'use client'

import { motion } from 'framer-motion'
import { useTwinStore } from '@/lib/engine/store'
import { useWindowStore } from '@/lib/dt/windowStore'
import { WORKSPACE_TOOLS } from './workspaceTools'

/**
 * ToolDock — the compact, always-visible engineering tool rail.
 *
 * Instead of a wall of permanently-expanded panels, the workspace exposes a
 * slim icon dock (CAD / game-editor style). Each icon toggles its floating
 * engineering window open/closed. The dock stays out of the way — icons only —
 * so the building remains the hero until the user summons a tool.
 *
 * Per icon: tooltip (label), hover state, active state (window open), and an
 * "unread"-style indicator (e.g. PBIF pulses when it is actively driving the
 * façade so the user knows there is a live decision to inspect).
 */
export function ToolDock() {
  const windows = useWindowStore((s) => s.windows)
  const toggle = useWindowStore((s) => s.toggle)
  const facadeControlMode = useTwinStore((s) => s.facadeControlMode)

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto absolute right-4 top-1/2 z-[60] flex -translate-y-1/2 flex-col gap-2 rounded-[24px] bg-[#0a1016]/40 p-2 backdrop-blur-2xl ring-1 ring-cyan-500/20 shadow-[0_0_30px_rgba(0,255,255,0.05)] md:right-6"
    >
      {WORKSPACE_TOOLS.map((tool) => {
        const active = windows[tool.id]?.open ?? false
        const Icon = tool.icon
        // The PBIF tool has a live decision to inspect only when PBIF drives the façade.
        const indicator = tool.id === 'pbif' && facadeControlMode === 'pbif' && !active
        return (
          <div key={tool.id} className="group relative">
            <button
              onClick={() => toggle(tool.id)}
              aria-pressed={active}
              className={`relative flex h-[42px] w-[42px] items-center justify-center rounded-full transition-all duration-300 ease-out ${
                active
                  ? 'text-[#0a0e16] scale-95'
                  : 'text-white/60 hover:bg-white/10 hover:scale-105 hover:text-white'
              }`}
              style={active ? { background: tool.accent, boxShadow: `0 0 20px ${tool.accent}90, inset 0 0 8px rgba(255,255,255,0.4)` } : undefined}
            >
              <Icon className="h-[18px] w-[18px]" />
              {/* Live-decision indicator */}
              {indicator && (
                <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: tool.accent }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: tool.accent }} />
                </span>
              )}
            </button>

            {/* Tooltip */}
            <span className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#0a1016]/90 px-3 py-1.5 text-[11px] font-medium tracking-wide text-cyan-50 opacity-0 shadow-xl ring-1 ring-cyan-500/30 backdrop-blur-md transition-all duration-200 group-hover:opacity-100 group-hover:mr-4">
              {tool.label}
            </span>
          </div>
        )
      })}
    </motion.div>
  )
}
