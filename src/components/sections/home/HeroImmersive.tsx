"use client"

import { useRef } from "react"
import { motion, useScroll, useTransform, useInView } from "framer-motion"

// Reusable cinematic text reveal component
function TextReveal({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-10%" })
  
  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <motion.div
        initial={{ y: "120%", opacity: 0, rotateZ: 2 }}
        animate={isInView ? { y: 0, opacity: 1, rotateZ: 0 } : { y: "120%", opacity: 0, rotateZ: 2 }}
        transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1], delay }}
        className="origin-bottom-left"
      >
        {children}
      </motion.div>
    </div>
  )
}

function FadeReveal({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-10%" })
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 1, ease: [0.76, 0, 0.24, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function HeroImmersive() {
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Optional subtle parallax on the text itself
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  })
  
  const yText = useTransform(scrollYProgress, [0, 1], ["0%", "30%"])
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])

  return (
    <section 
      ref={containerRef} 
      className="relative min-h-[100vh] w-full flex flex-col justify-center overflow-hidden bg-transparent"
    >
      {/* Typography Overlay */}
      <motion.div 
        style={{ y: yText, opacity }}
        className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-12 pt-32 pb-16 flex flex-col items-start justify-center min-h-[100vh] pointer-events-auto"
      >
        <div className="overflow-hidden mb-8">
          <motion.span 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1], delay: 2.5 }}
            className="block text-emerald font-mono text-sm tracking-[0.3em] uppercase"
          >
            Predictive Building Intelligence
          </motion.span>
        </div>

        <h1 className="text-5xl md:text-8xl lg:text-[7.5rem] font-sans tracking-tighter text-white font-medium leading-[0.95] mb-10 drop-shadow-2xl">
          <div className="overflow-hidden">
            <motion.span 
              initial={{ y: "120%", opacity: 0, rotateZ: 2 }}
              animate={{ y: 0, opacity: 1, rotateZ: 0 }}
              transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1], delay: 2.6 }}
              className="block origin-bottom-left"
            >
              The Building
            </motion.span>
          </div>
          <div className="overflow-hidden">
            <motion.span 
              initial={{ y: "120%", opacity: 0, rotateZ: 2 }}
              animate={{ y: 0, opacity: 1, rotateZ: 0 }}
              transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1], delay: 2.7 }}
              className="block origin-bottom-left"
            >
              That <span className="text-white/40 italic">Thinks</span>
            </motion.span>
          </div>
          <div className="overflow-hidden">
            <motion.span 
              initial={{ y: "120%", opacity: 0, rotateZ: 2 }}
              animate={{ y: 0, opacity: 1, rotateZ: 0 }}
              transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1], delay: 2.8 }}
              className="block text-emerald drop-shadow-none origin-bottom-left"
            >
              Before The Sun Moves.
            </motion.span>
          </div>
        </h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 3.2, ease: [0.76, 0, 0.24, 1] }}
          className="text-lg md:text-2xl text-gray-400 max-w-2xl font-light leading-relaxed tracking-wide mb-20 drop-shadow-md"
        >
          AI-powered Smart Sensor Fusion & Solar Tracking for Autonomous Kinetic Façades. 
          Reducing cooling loads while maximizing natural daylight.
        </motion.p>

        {/* Data Badges Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 3.4, ease: [0.76, 0, 0.24, 1] }}
          className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-8 w-full border-t border-white/10 pt-10"
        >
          <DataBadge label="Solar Irradiance" value="840 W/m²" />
          <DataBadge label="Indoor Temp" value="22.5 °C" />
          <DataBadge label="Wind Speed" value="12 km/h" />
          <DataBadge label="Panel Angle" value="45.2°" />
          <DataBadge label="Energy Saved" value="12.4 kWh" />
        </motion.div>

      </motion.div>
    </section>
  )
}

function DataBadge({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex flex-col gap-2 p-5 bg-black/20 backdrop-blur-md border border-white/5 rounded-lg shadow-lg hover:bg-black/40 transition-colors duration-500">
      <span className="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-mono">{label}</span>
      <span className="text-white font-sans text-xl md:text-2xl tracking-tight drop-shadow-md tabular-nums">{value}</span>
    </div>
  )
}
