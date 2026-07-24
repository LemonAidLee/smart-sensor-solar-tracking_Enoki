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

const TEAM = [
  { name: "Lim Yong Hen", role: "Team Leader", initials: "LYH" },
  { name: "Lee Wen Yi", role: "Software & Systems", initials: "LWY" },
  { name: "Joo Eu-Jin", role: "Mechatronics & AI", initials: "JEJ" },
  { name: "Ong Jing Zhen", role: "Architecture & Design", initials: "OJZ" }
]

const MILESTONES = [
  { phase: "Phase 1", title: "Proof of Concept", desc: "Single mechanical unit validated. Sensor fusion baseline established using Arduino Nano." },
  { phase: "Phase 2", title: "The Scale Model", desc: "1:10 scale prototype with 7 active panels. ESP32 integration for Edge AI processing." },
  { phase: "Phase 3", title: "Building Integration Pilot", desc: "Full-scale single window installation on a commercial facade. Testing weather durability." },
  { phase: "Phase 4", title: "Commercial Deployment", desc: "Mass-manufacturable kinetic modules with centralized AWS IoT Core digital twin dashboard." }
]

export function ProjectContext() {
  return (
    <section className="relative w-full text-white py-32 md:py-64 border-t border-white/5 bg-transparent">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        
        {/* The Prototype */}
        <div className="mb-48 pb-48 border-b border-white/10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-24">
            <div className="bg-black/40 backdrop-blur-xl p-8 md:p-12 rounded-xl border border-white/5 h-fit shadow-2xl">
              <FadeReveal>
                <span className="text-gray-400 font-mono text-sm tracking-[0.2em] uppercase block mb-8">
                  Execution
                </span>
              </FadeReveal>
              <h2 className="text-4xl md:text-6xl font-sans tracking-tight leading-[1.1] mb-8">
                <TextReveal>From concept</TextReveal>
                <TextReveal delay={0.1}><span className="italic text-white/40">to reality.</span></TextReveal>
              </h2>
              <FadeReveal delay={0.3}>
                <p className="text-xl text-gray-300 font-light leading-relaxed">
                  A 1:10 scale physical model validating our kinematic equations and sensor fusion latency. Designed for the UM Innovation Competition 2026.
                </p>
              </FadeReveal>
            </div>
            
            <FadeReveal delay={0.4} className="h-full">
              <div className="flex items-center justify-center bg-black/20 backdrop-blur-md border border-white/5 rounded-xl aspect-square md:aspect-video lg:aspect-square p-12 shadow-2xl hover:bg-black/30 transition-colors duration-500" data-cursor="VIEW">
                <span className="text-sm font-mono text-white/40 uppercase tracking-[0.2em]">
                  CAD Render Loading...
                </span>
              </div>
            </FadeReveal>
          </div>
        </div>

        {/* Roadmap */}
        <div className="mb-48">
          <div className="max-w-2xl mb-24 bg-black/40 backdrop-blur-xl p-8 md:p-12 rounded-xl border border-white/5 shadow-2xl">
            <FadeReveal>
              <span className="text-gray-400 font-mono text-sm tracking-[0.2em] uppercase block mb-8">
                Trajectory
              </span>
            </FadeReveal>
            <h2 className="text-4xl md:text-6xl font-sans tracking-tight leading-tight">
              <TextReveal>The <span className="italic text-white/40">Roadmap.</span></TextReveal>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {MILESTONES.map((stone, idx) => (
              <FadeReveal key={stone.phase} delay={0.1 * idx} className="h-full">
                <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-white/5 p-8 md:p-10 flex flex-col justify-between min-h-[320px] shadow-xl hover:bg-white/[0.02] transition-colors duration-500" data-cursor="EXPLORE">
                  <div>
                    <span className="text-xs font-mono text-emerald tracking-[0.2em] uppercase mb-6 block">
                      {stone.phase}
                    </span>
                    <h3 className="text-xl font-medium mb-6 leading-tight tracking-tight">{stone.title}</h3>
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed font-light">
                    {stone.desc}
                  </p>
                </div>
              </FadeReveal>
            ))}
          </div>
        </div>

        {/* Team */}
        <div>
          <div className="max-w-2xl mb-24 bg-black/40 backdrop-blur-xl p-8 md:p-12 rounded-xl border border-white/5 shadow-2xl">
            <FadeReveal>
              <span className="text-gray-400 font-mono text-sm tracking-[0.2em] uppercase block mb-8">
                Personnel
              </span>
            </FadeReveal>
            <h2 className="text-4xl md:text-6xl font-sans tracking-tight leading-[1.1]">
              <TextReveal>A multidisciplinary</TextReveal>
              <TextReveal delay={0.1}><span className="italic text-white/40">group of engineers.</span></TextReveal>
            </h2>
            <FadeReveal delay={0.3}>
              <p className="text-lg text-gray-300 font-light leading-relaxed mt-8">
                Bridging the gap between architecture, robotics, and artificial intelligence.
              </p>
            </FadeReveal>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {TEAM.map((member, idx) => (
              <FadeReveal key={member.name} delay={0.1 * idx}>
                <div className="flex flex-col gap-6 group cursor-pointer" data-cursor="PROFILE">
                  <div className="w-full aspect-square border border-white/5 bg-black/40 backdrop-blur-md flex items-center justify-center rounded-xl shadow-lg group-hover:bg-black/60 transition-colors duration-500 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <span className="text-5xl font-light text-white/20 group-hover:text-emerald/40 transition-colors duration-500 tracking-tighter">{member.initials}</span>
                  </div>
                  <div className="bg-black/40 backdrop-blur-xl border border-white/5 p-5 rounded-lg group-hover:border-white/10 transition-colors duration-500">
                    <h3 className="text-lg font-medium tracking-tight mb-2">{member.name}</h3>
                    <p className="text-[10px] font-mono text-emerald uppercase tracking-[0.2em]">{member.role}</p>
                  </div>
                </div>
              </FadeReveal>
            ))}
          </div>
        </div>

      </div>
    </section>
  )
}
