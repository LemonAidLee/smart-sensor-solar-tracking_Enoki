'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// Mimic the spring physics from the homepage to feel consistent
const springConfig = { type: 'spring' as const, stiffness: 350, damping: 30, mass: 1 }

export function SimulationHeader() {
  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...springConfig, delay: 0.1 }}
      className="fixed top-0 left-0 right-0 z-50 flex h-10 items-center justify-between border-b border-white/5 bg-[#05060a]/80 px-4 backdrop-blur-md md:px-6"
    >
      <div className="flex flex-1 items-center">
        <Link href="/" className="group flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.15em] text-white/50 transition-colors hover:text-white">
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-1" />
          <span className="hidden sm:inline">Back to Overview</span>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center gap-3">
        <span className="text-[11px] font-bold tracking-widest text-white/90 drop-shadow-md">SOLIS AI</span>
        <span className="h-3 w-[1px] bg-white/10" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400 drop-shadow-[0_0_8px_rgba(0,208,132,0.3)]">Digital Twin</span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        <motion.div
          animate={{
            opacity: [0.5, 1, 0.5],
            scale: [0.95, 1, 0.95],
            boxShadow: [
              "0 0 5px rgba(0,208,132,0.2)",
              "0 0 10px rgba(0,208,132,0.5)",
              "0 0 5px rgba(0,208,132,0.2)",
            ]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="h-1.5 w-1.5 rounded-full bg-emerald"
        />
        <span className="text-[9px] font-mono font-medium tracking-[0.2em] text-white/40">SYS:<span className="font-semibold text-emerald-400">ONLINE</span></span>
      </div>
    </motion.header>
  )
}
