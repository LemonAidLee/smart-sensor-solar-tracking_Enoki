"use client"

import { useRef } from "react"
import { motion, useInView } from "framer-motion"
import type { LucideIcon } from "lucide-react"

interface ComingSoonCardProps {
  icon: LucideIcon
  title: string
  badge?: "Reserved" | "Coming Soon"
  delay?: number
}

export function ComingSoonCard({ icon: Icon, title, badge = "Reserved", delay = 0 }: ComingSoonCardProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-10%" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1], delay }}
      className="group relative flex flex-col gap-5 rounded-xl border border-white/5 border-dashed bg-black/20 backdrop-blur-md p-6 hover:bg-white/[0.03] hover:border-white/15 transition-colors duration-500"
    >
      <div className="flex items-center justify-between">
        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/5 shadow-inner">
          <Icon className="w-5 h-5 text-white/40 group-hover:text-emerald/70 transition-colors duration-500" />
        </div>
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/30 border border-white/10 rounded-full px-2.5 py-1">
          {badge}
        </span>
      </div>
      <h4 className="text-lg font-medium tracking-tight text-white/70">{title}</h4>
    </motion.div>
  )
}
