'use client'

import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useWindowStore } from '@/lib/dt/windowStore'
import { AI_TOOLS } from './workspaceTools'

/**
 * AiDock — a dedicated sidebar for AI tools (Prediction, What-If Analysis).
 *
 * It mirrors the behavior of the Engineering ToolDock but has its own visual
 * identity (emerald/teal accents) and is positioned beside the original dock.
 */
export function AiDock() {
  const windows = useWindowStore((s) => s.windows)
  const toggle = useWindowStore((s) => s.toggle)

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto absolute right-20 top-1/2 z-[60] flex -translate-y-1/2 flex-col gap-2 rounded-[24px] bg-[#0a1016]/40 p-2 backdrop-blur-2xl ring-1 ring-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.05)] md:right-24"
    >
      {/* AI Header Icon */}
      <div className="flex h-[32px] w-[42px] items-center justify-center mb-1 border-b border-emerald-500/20 pb-2">
        <Sparkles className="h-4 w-4 text-emerald-500/60" />
      </div>

      {AI_TOOLS.map((tool) => {
        const active = windows[tool.id]?.open ?? false
        const Icon = tool.icon
        
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
            </button>

            {/* Tooltip */}
            <span className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#0a1016]/90 px-3 py-1.5 text-[11px] font-medium tracking-wide text-emerald-50 opacity-0 shadow-xl ring-1 ring-emerald-500/30 backdrop-blur-md transition-all duration-200 group-hover:opacity-100 group-hover:mr-4">
              {tool.label}
            </span>
          </div>
        )
      })}
    </motion.div>
  )
}
