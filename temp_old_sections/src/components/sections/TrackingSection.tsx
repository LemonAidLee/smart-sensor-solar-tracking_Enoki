"use client"

import { useState, useRef, useEffect } from "react"
import { motion, useMotionValue, useTransform } from "framer-motion"
import { SectionWrapper } from "@/components/layout/SectionWrapper"
import { GlassCard } from "@/components/ui/GlassCard"

export function TrackingSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  
  useEffect(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth)
    }
    const handleResize = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.offsetWidth)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Draggable Sun logic
  const x = useMotionValue(0)
  
  // Mapping sun X position to facade angle and time of day
  // Assuming sun travels from x=0 to x=containerWidth
  // Angle: from -60 deg (morning) to +60 deg (evening)
  const panelAngle = useTransform(x, [0, containerWidth > 0 ? containerWidth : 800], [-60, 60])
  const sunElevation = useTransform(x, 
    [0, (containerWidth > 0 ? containerWidth : 800) / 2, containerWidth > 0 ? containerWidth : 800], 
    [20, 100, 20]
  ) // Parabola for sun height
  
  const timeProgress = useTransform(x, [0, containerWidth > 0 ? containerWidth : 800], [0, 100])

  return (
    <SectionWrapper id="simulation" className="relative bg-transparent overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_40%,transparent_100%)]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_bottom_left,rgba(0,208,132,0.05),transparent_60%)]" />
      <div className="flex flex-col items-center text-center gap-6 mb-16">
        <h2 className="text-4xl md:text-5xl font-sans tracking-tighter text-white">
          Active Solar Tracking
        </h2>
        <p className="text-gray-400 max-w-xl">
          Drag the sun to simulate the time of day. The kinetic façade autonomously calculates the optimal azimuth and elevation angles to block direct glare.
        </p>
      </div>

      <GlassCard className="w-full max-w-5xl mx-auto p-2" innerClassName="h-[500px] relative overflow-hidden flex flex-col items-center justify-end pb-20">
        
        {/* Dynamic Sky Background */}
        <motion.div 
          className="absolute inset-0 z-0"
          style={{
            background: useTransform(timeProgress, 
              [0, 50, 100], 
              ["linear-gradient(to bottom, #1e3a8a, #0f172a)", "linear-gradient(to bottom, #38bdf8, #0ea5e9)", "linear-gradient(to bottom, #7e22ce, #0f172a)"]
            )
          }}
        />

        {/* Info Overlay */}
        <div className="absolute top-6 left-6 right-6 flex justify-between items-start z-30 pointer-events-none">
           <div className="flex flex-col gap-2 bg-black/40 backdrop-blur-md p-4 rounded-xl border border-white/10">
             <span className="text-[10px] text-gray-300 uppercase tracking-widest">Time Progress</span>
             <motion.span className="text-xl font-mono text-white font-bold">
                {useTransform(timeProgress, v => `${Math.round(v)}%`)}
             </motion.span>
           </div>
           
           <div className="flex flex-col gap-2 bg-black/40 backdrop-blur-md p-4 rounded-xl border border-white/10 text-right">
             <span className="text-[10px] text-gray-300 uppercase tracking-widest">Panel Angle</span>
             <motion.span className="text-xl font-mono text-emerald font-bold">
                {useTransform(panelAngle, v => `${v.toFixed(1)}°`)}
             </motion.span>
           </div>
        </div>

        {/* Draggable Sun Area */}
        <div className="absolute inset-0 z-20 flex items-center px-20" ref={containerRef}>
           <motion.div 
             drag="x"
             dragConstraints={containerRef}
             dragElastic={0}
             dragMomentum={false}
             style={{ x, y: useTransform(sunElevation, v => -v) }}
             className="w-24 h-24 rounded-full bg-yellow-400 shadow-[0_0_100px_rgba(250,204,21,1)] cursor-grab active:cursor-grabbing flex items-center justify-center relative -ml-12"
           >
              <div className="absolute inset-0 rounded-full animate-ping bg-yellow-400/50" />
           </motion.div>
        </div>

        {/* The Facade Panels */}
        <div className="relative z-10 flex gap-4 w-full justify-center px-10">
           {[...Array(7)].map((_, i) => (
             <motion.div
               key={i}
               className="w-16 h-48 bg-gradient-to-b from-slate-200 to-slate-400 rounded-sm shadow-xl border border-white/20 origin-center"
               style={{ rotateY: panelAngle }}
               transition={{ type: "spring", stiffness: 50, damping: 20 }}
             >
                {/* Panel reflections */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent opacity-50" />
             </motion.div>
           ))}
        </div>

        {/* Base / Floor */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-navy/90 backdrop-blur-xl border-t border-white/10 flex items-center justify-center z-30">
          <span className="text-xs text-gray-400 uppercase tracking-widest">Interactive Simulation Zone</span>
        </div>

      </GlassCard>
    </SectionWrapper>
  )
}
