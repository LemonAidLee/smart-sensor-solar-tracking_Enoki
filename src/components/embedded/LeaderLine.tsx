'use client'

import { AnimatePresence, motion } from 'framer-motion'

interface LeaderLineProps {
  from: { x: number; y: number } | null
  to: { x: number; y: number } | null
  visible: boolean
}

/**
 * LeaderLine — a subtle, fading annotation line connecting the Virtual
 * Embedded Controller panel to the façade module it observes. Purely
 * presentational: `from`/`to` are screen coordinates computed elsewhere (the
 * panel's own DOM rect, and the 3D→2D projection written by
 * `SelectedModuleHighlight` into `moduleHighlightStore`). Hidden whenever the
 * panel is collapsed or either endpoint is unavailable — the module highlight
 * itself stays active regardless.
 */
export function LeaderLine({ from, to, visible }: LeaderLineProps) {
  const show = visible && !!from && !!to
  return (
    <AnimatePresence>
      {show && from && to && (
        <motion.svg
          key="leader-line"
          className="pointer-events-none fixed inset-0 h-full w-full"
          style={{ zIndex: 24 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#22d3ee" strokeWidth={1} strokeDasharray="4 3" opacity={0.55} />
          <circle cx={to.x} cy={to.y} r={3} fill="#22d3ee" opacity={0.8} />
        </motion.svg>
      )}
    </AnimatePresence>
  )
}
