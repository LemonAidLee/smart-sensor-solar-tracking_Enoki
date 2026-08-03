"use client"

import { useRef } from "react"
import { motion, useInView } from "framer-motion"

// Reusable cinematic text reveal, matching HeroImmersive's convention.
function TextReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div className="overflow-hidden">
      <motion.div
        initial={{ y: "120%", opacity: 0, rotateZ: 2 }}
        animate={{ y: 0, opacity: 1, rotateZ: 0 }}
        transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1], delay }}
        className="block origin-bottom-left"
      >
        {children}
      </motion.div>
    </div>
  )
}

/** Blueprint grid + drifting circuit traces — a self-contained CSS/SVG backdrop, no R3F cost. */
function BlueprintBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Fine blueprint grid, masked to a soft vignette */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,208,132,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,208,132,0.06)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_35%,black_20%,transparent_75%)]" />

      {/* Slow-drifting glow blobs */}
      <motion.div
        className="absolute -top-32 left-1/4 h-[32rem] w-[32rem] rounded-full bg-emerald/10 blur-[120px]"
        animate={{ x: [0, 40, 0], y: [0, 24, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 right-1/5 h-[26rem] w-[26rem] rounded-full bg-electric/10 blur-[120px]"
        animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />

      {/* Animated circuit-trace lines */}
      <svg className="absolute inset-0 h-full w-full opacity-40" viewBox="0 0 1200 800" preserveAspectRatio="none" fill="none">
        {TRACES.map((d, i) => (
          <motion.path
            key={i}
            d={d}
            stroke={i % 2 === 0 ? "#00D084" : "#38BDF8"}
            strokeWidth={1}
            strokeLinecap="round"
            strokeDasharray="6 10"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.7 }}
            transition={{ duration: 2.4, delay: 0.6 + i * 0.2, ease: [0.76, 0, 0.24, 1] }}
          />
        ))}
      </svg>

      {/* Bottom fade into page background */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-background to-transparent" />
    </div>
  )
}

const TRACES = [
  "M 80 120 H 340 L 400 180 V 400",
  "M 1120 90 H 860 L 800 150 V 340 L 740 400",
  "M 60 620 H 260 L 320 560 H 560",
  "M 1140 640 H 900 L 840 580 V 460",
  "M 500 60 V 220 L 560 280 H 760",
]

export function EngineeringHero() {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: true })

  return (
    <section
      ref={containerRef}
      className="relative w-full min-h-[85vh] flex flex-col justify-center overflow-hidden bg-background"
    >
      <BlueprintBackdrop />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-24 flex flex-col items-start">
        <div className="overflow-hidden mb-8">
          <motion.span
            initial={{ y: "100%" }}
            animate={isInView ? { y: 0 } : { y: "100%" }}
            transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1], delay: 0.2 }}
            className="block text-emerald font-mono text-sm tracking-[0.3em] uppercase"
          >
            Hardware &amp; Systems Reference
          </motion.span>
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-sans tracking-tighter text-white font-medium leading-[0.95] mb-10 drop-shadow-2xl">
          <TextReveal delay={0.3}>Engineering</TextReveal>
          <TextReveal delay={0.4}>
            <span className="text-emerald">Workspace.</span>
          </TextReveal>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 1, delay: 0.8, ease: [0.76, 0, 0.24, 1] }}
          className="text-lg md:text-2xl text-gray-400 max-w-2xl font-light leading-relaxed tracking-wide drop-shadow-md"
        >
          A centralized engineering repository containing the physical designs, hardware architecture,
          programming resources, and development assets that power the SOLIS Adaptive Façade Digital Twin.
        </motion.p>
      </div>
    </section>
  )
}
