"use client"

import { useRef } from "react"
import { motion, useInView } from "framer-motion"

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

export function KinematicsAndWeather() {
  return (
    <section className="relative w-full text-white py-32 md:py-64 border-t border-white/5 bg-transparent">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        
        {/* PBIF Engine & Weather */}
        <div className="mb-48">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-24 bg-black/40 backdrop-blur-xl p-8 md:p-12 rounded-xl border border-white/5 shadow-2xl">
            <div className="max-w-3xl">
              <FadeReveal>
                <span className="text-gray-400 font-mono text-sm tracking-[0.2em] uppercase block mb-8">
                  Decision Layer
                </span>
              </FadeReveal>
              <h2 className="text-4xl md:text-6xl font-sans tracking-tight leading-[1.1] mb-8">
                <TextReveal>Deterministic</TextReveal>
                <TextReveal delay={0.1}><span className="italic text-white/40">Weather Intelligence.</span></TextReveal>
              </h2>
              <FadeReveal delay={0.3}>
                <p className="text-xl text-gray-300 font-light leading-relaxed">
                  PBIF v1 is a deterministic, rule-based engine. It translates continuous weather variables (Wind, Rain, Cloud) into actionable engineering states.
                </p>
              </FadeReveal>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FadeReveal delay={0.2} className="h-full">
              <div className="border border-white/5 bg-black/40 backdrop-blur-xl rounded-xl p-8 md:p-12 h-full shadow-2xl hover:bg-black/60 transition-colors duration-500" data-cursor="READ">
                <h3 className="text-2xl font-medium mb-10 tracking-tight">Priority Hierarchy</h3>
                <ul className="flex flex-col gap-10">
                  <li className="flex gap-6 group">
                    <span className="text-emerald font-mono tracking-widest transition-opacity duration-300 opacity-70 group-hover:opacity-100">01</span>
                    <div>
                      <h4 className="text-lg font-medium tracking-tight">Structural Safety</h4>
                      <p className="text-sm text-gray-400 mt-2 leading-relaxed font-light">Protect the actuator and structure from EXTREME or HIGH wind events. Forces SAFE_MODE.</p>
                    </div>
                  </li>
                  <li className="flex gap-6 group">
                    <span className="text-emerald font-mono tracking-widest transition-opacity duration-300 opacity-70 group-hover:opacity-100">02</span>
                    <div>
                      <h4 className="text-lg font-medium tracking-tight">Weather Protection</h4>
                      <p className="text-sm text-gray-400 mt-2 leading-relaxed font-light">Preserve the façade and glazing from HEAVY rain. Forces WEATHER_PROTECTION orientation.</p>
                    </div>
                  </li>
                  <li className="flex gap-6 group">
                    <span className="text-emerald font-mono tracking-widest transition-opacity duration-300 opacity-70 group-hover:opacity-100">03</span>
                    <div>
                      <h4 className="text-lg font-medium tracking-tight">Solar Optimization</h4>
                      <p className="text-sm text-gray-400 mt-2 leading-relaxed font-light">Track the sun efficiently. Drops to ECONOMY_TRACKING during OVERCAST conditions.</p>
                    </div>
                  </li>
                </ul>
              </div>
            </FadeReveal>

            <FadeReveal delay={0.4} className="h-full">
              <div className="border border-white/5 bg-black/40 backdrop-blur-xl rounded-xl p-8 md:p-12 flex flex-col justify-center h-full shadow-2xl hover:bg-black/60 transition-colors duration-500" data-cursor="READ">
                <h3 className="text-2xl font-medium mb-8 tracking-tight">Kinematic Solving</h3>
                <p className="text-gray-300 leading-relaxed font-light mb-16">
                  The Façade Kinematics engine translates solar vectors into panel-rotation geometry. PBIF never dictates an angle—it dictates an objective. The geometry engine computes the shortest-path continuous 360° rotation based on structural limits.
                </p>
                <div className="grid grid-cols-2 gap-8">
                   <div className="flex flex-col gap-2">
                      <span className="text-5xl text-white font-sans font-medium tracking-tighter drop-shadow-md">NOAA</span>
                      <span className="text-xs text-gray-400 uppercase tracking-[0.2em] font-mono">Solar Model</span>
                   </div>
                   <div className="flex flex-col gap-2">
                      <span className="text-5xl text-white font-sans font-medium tracking-tighter drop-shadow-md">ASHRAE</span>
                      <span className="text-xs text-gray-400 uppercase tracking-[0.2em] font-mono">Clear-Sky Mod</span>
                   </div>
                </div>
              </div>
            </FadeReveal>
          </div>
        </div>

      </div>
    </section>
  )
}
