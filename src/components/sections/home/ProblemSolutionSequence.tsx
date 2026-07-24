"use client"

import { useRef } from "react"
import { motion, useScroll, useTransform, useInView } from "framer-motion"
import { ThermometerSun, ZapOff, ShieldAlert, Eye, Cpu, Network } from "lucide-react"

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

export function ProblemSolutionSequence() {
  const containerRef = useRef<HTMLDivElement>(null)
  
  return (
    <section ref={containerRef} className="relative w-full text-white bg-transparent">
      
      {/* The Problem */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-32 md:py-64">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-24">
          <div className="sticky top-40 h-fit bg-black/40 backdrop-blur-xl p-8 md:p-12 rounded-xl border border-white/5 shadow-2xl">
            <FadeReveal>
              <span className="text-gray-400 font-mono text-sm tracking-[0.2em] uppercase block mb-8">
                The Architecture Flaw
              </span>
            </FadeReveal>
            
            <h2 className="text-4xl md:text-6xl font-sans tracking-tight leading-[1.1] mb-8">
              <TextReveal>Glass buildings are</TextReveal>
              <TextReveal delay={0.1}><span className="text-white/40 italic">thermal traps.</span></TextReveal>
            </h2>
            
            <FadeReveal delay={0.3}>
              <p className="text-xl text-gray-300 font-light leading-relaxed">
                Modern architecture prioritizes daylight and aesthetics through extensive glazing, but fundamentally fails to react to the dynamic, shifting nature of the sun.
              </p>
            </FadeReveal>
          </div>

          <div className="flex flex-col gap-12 lg:pt-48">
            <ProblemCard 
              icon={ThermometerSun}
              title="Overheating"
              desc="More than 50% of solar heat enters through conventional glass façades, causing immediate thermal discomfort for occupants."
              delay={0}
            />
            <ProblemCard 
              icon={ZapOff}
              title="High HVAC Energy"
              desc="Cooling systems consume excessive electricity to compensate for passive building skins, drastically inflating operational carbon."
              delay={0.1}
            />
            <ProblemCard 
              icon={ShieldAlert}
              title="Static Shading"
              desc="Manual or static blinds cannot adapt to the dynamic movement of the sun, forcing a compromise between views and comfort."
              delay={0.2}
            />
          </div>
        </div>
      </div>

      {/* The Solution */}
      <div className="w-full bg-black/20 backdrop-blur-sm border-y border-white/5 py-32 md:py-64">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          
          <div className="max-w-3xl mb-32 bg-black/40 backdrop-blur-xl p-8 md:p-12 rounded-xl border border-white/5 shadow-2xl">
            <FadeReveal>
              <span className="text-emerald font-mono text-sm tracking-[0.2em] uppercase block mb-8">
                The Resolution
              </span>
            </FadeReveal>
            <h2 className="text-5xl md:text-7xl font-sans tracking-tight leading-[1.1]">
              <TextReveal>A skin that <span className="italic">breathes.</span></TextReveal>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 relative">
            <div className="hidden md:block absolute top-12 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            
            <SolutionCard 
              step="01"
              icon={Eye}
              title="Sense"
              desc="LDR, Pyranometer, Temperature, Humidity, Wind, Rain, PIR, and CO₂ sensors continuously ingest environmental states."
              delay={0.2}
            />
            <SolutionCard 
              step="02"
              icon={Cpu}
              title="Think"
              desc="The Sensor Fusion Engine aggregates and cleans raw environmental data, passing it to the Digital Twin physics solver."
              delay={0.3}
            />
            <SolutionCard 
              step="03"
              icon={Network}
              title="Decide"
              desc="The PBIF Engine computes optimal shading angles and predictive actions, translating physics into kinetic motion."
              delay={0.4}
            />
          </div>

        </div>
      </div>

    </section>
  )
}

function ProblemCard({ icon: Icon, title, desc, delay }: { icon: any, title: string, desc: string, delay: number }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-10%" })

  return (
    <motion.div 
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 1, ease: [0.76, 0, 0.24, 1], delay }}
      className="flex flex-col gap-6 bg-black/40 backdrop-blur-xl p-8 rounded-xl border border-white/5 hover:bg-white/[0.03] transition-colors duration-500" 
      data-cursor="READ"
    >
      <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center bg-white/5 shadow-inner">
        <Icon className="w-6 h-6 text-emerald/80" />
      </div>
      <h3 className="text-2xl md:text-3xl font-medium tracking-tight">{title}</h3>
      <p className="text-lg text-gray-400 font-light leading-relaxed max-w-sm">
        {desc}
      </p>
    </motion.div>
  )
}

function SolutionCard({ step, icon: Icon, title, desc, delay }: { step: string, icon: any, title: string, desc: string, delay: number }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-10%" })

  return (
    <motion.div 
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 1, ease: [0.76, 0, 0.24, 1], delay }}
      className="flex flex-col gap-8 relative z-10 bg-black/60 backdrop-blur-xl p-8 rounded-xl border border-white/5 shadow-2xl hover:bg-black/40 transition-colors duration-500" 
      data-cursor="VIEW"
    >
      <div className="flex justify-between items-center w-full">
        <span className="text-5xl font-light text-white/10 tracking-tighter tabular-nums">{step}</span>
        <div className="w-12 h-12 bg-black/50 border border-white/10 flex items-center justify-center rounded-full shadow-[0_0_15px_rgba(52,211,153,0.1)]">
          <Icon className="w-5 h-5 text-emerald" />
        </div>
      </div>
      <h3 className="text-2xl font-medium tracking-tight">{title}</h3>
      <p className="text-gray-400 font-light leading-relaxed text-lg">
        {desc}
      </p>
    </motion.div>
  )
}
