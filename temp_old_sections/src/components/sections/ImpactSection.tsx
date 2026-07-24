"use client"

import { useEffect, useState } from "react"
import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { SectionWrapper } from "@/components/layout/SectionWrapper"

function AnimatedCounter({ value, suffix = "", duration = 2 }: { value: number, suffix?: string, duration?: number }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  useEffect(() => {
    if (isInView) {
      let start = 0
      const increment = value / (duration * 60)
      const timer = setInterval(() => {
        start += increment
        if (start >= value) {
          setCount(value)
          clearInterval(timer)
        } else {
          setCount(Math.floor(start))
        }
      }, 1000 / 60)
      return () => clearInterval(timer)
    }
  }, [isInView, value, duration])

  return (
    <span ref={ref} className="text-6xl md:text-7xl font-sans tracking-tighter text-white font-bold">
      {count}{suffix}
    </span>
  )
}

const SDGS = [
  { num: "7", title: "Affordable & Clean Energy" },
  { num: "9", title: "Industry, Innovation & Infrastructure" },
  { num: "11", title: "Sustainable Cities & Communities" },
  { num: "13", title: "Climate Action" },
]

export function ImpactSection() {
  return (
    <SectionWrapper id="impact" className="relative bg-transparent overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_40%,transparent_100%)]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,rgba(0,208,132,0.05),transparent_60%)]" />
      <div className="flex flex-col items-center text-center gap-6 mb-24">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-rose-400"
        >
          Environmental Impact
        </motion.div>
        
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-sans tracking-tighter text-white max-w-3xl">
          Sustainable by <span className="text-gradient-primary">Design</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 max-w-6xl mx-auto mb-32">
        <div className="flex flex-col items-center text-center gap-4">
          <AnimatedCounter value={25} suffix="%" />
          <span className="text-sm text-gray-400 uppercase tracking-widest font-mono">Cooling Load Reduction</span>
        </div>
        <div className="flex flex-col items-center text-center gap-4">
          <AnimatedCounter value={40} suffix="%" />
          <span className="text-sm text-gray-400 uppercase tracking-widest font-mono">Lower HVAC Energy</span>
        </div>
        <div className="flex flex-col items-center text-center gap-4">
          <AnimatedCounter value={100} suffix="%" />
          <span className="text-sm text-gray-400 uppercase tracking-widest font-mono">Autonomous Operation</span>
        </div>
        <div className="flex flex-col items-center text-center gap-4">
          <AnimatedCounter value={24} suffix="/7" />
          <span className="text-sm text-gray-400 uppercase tracking-widest font-mono">Continuous Monitoring</span>
        </div>
      </div>

      {/* SDGs */}
      <div className="border-t border-white/10 pt-20 max-w-5xl mx-auto">
        <h3 className="text-center text-sm text-gray-500 uppercase tracking-widest mb-12">Aligned with UN Sustainable Development Goals</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {SDGS.map((sdg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="flex flex-col gap-4 p-6 rounded-2xl bg-white/5 border border-white/10 items-start hover:bg-white/10 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
                {sdg.num}
              </div>
              <span className="text-sm font-medium text-gray-300">{sdg.title}</span>
            </motion.div>
          ))}
        </div>
      </div>

    </SectionWrapper>
  )
}
