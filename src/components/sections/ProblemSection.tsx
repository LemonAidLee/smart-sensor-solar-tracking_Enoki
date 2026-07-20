"use client"

import { motion } from "framer-motion"
import { SectionWrapper } from "@/components/layout/SectionWrapper"
import { GlassCard } from "@/components/ui/GlassCard"
import { ThermometerSun, ZapOff, ShieldAlert, CloudRain, Sun } from "lucide-react"
import { Canvas } from "@react-three/fiber"
import { Float, Environment } from "@react-three/drei"

const PROBLEMS = [
  {
    icon: ThermometerSun,
    title: "Overheating",
    desc: "More than 50% of solar heat enters through conventional glass façades, causing thermal discomfort.",
  },
  {
    icon: ZapOff,
    title: "High HVAC Energy",
    desc: "Cooling systems consume excessive electricity to compensate for passive building skins.",
  },
  {
    icon: ShieldAlert,
    title: "Static Shading",
    desc: "Manual or static blinds cannot adapt to the dynamic movement of the sun throughout the day.",
  },
  {
    icon: CloudRain,
    title: "Weather Vulnerability",
    desc: "Sudden rainstorms and strong winds can damage unprotected exterior shading systems.",
  }
]

function FloatingGlassShards() {
  return (
    <>
      <Float speed={1.5} rotationIntensity={1} floatIntensity={2}>
        <mesh position={[-4, 2, -5]} rotation={[0.5, 0.5, 0]}>
          <octahedronGeometry args={[1]} />
          <meshPhysicalMaterial color="#f43f5e" transmission={0.9} opacity={1} transparent roughness={0.1} thickness={2} />
        </mesh>
      </Float>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        <mesh position={[5, -2, -8]} rotation={[-0.2, 0.8, 0]}>
          <boxGeometry args={[1.5, 1.5, 1.5]} />
          <meshPhysicalMaterial color="#3b82f6" transmission={0.9} opacity={1} transparent roughness={0.2} thickness={1} />
        </mesh>
      </Float>
    </>
  )
}

export function ProblemSection() {
  return (
    <SectionWrapper id="problem" className="relative bg-transparent">
      
      {/* 3D Background layer */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-50 hidden md:block">
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <FloatingGlassShards />
          <Environment preset="city" />
        </Canvas>
      </div>

      <div className="relative z-10 flex flex-col gap-6 mb-20 text-center lg:text-left">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          className="inline-block mx-auto lg:mx-0 rounded-full border border-electric/30 bg-electric/10 px-4 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-electric w-max"
        >
          The Problem
        </motion.div>
        
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          className="text-4xl md:text-5xl lg:text-6xl font-sans tracking-tighter text-white"
        >
          Passive buildings <br className="hidden lg:block"/> are bleeding energy.
        </motion.h2>
      </div>

      <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 items-center">
        
        {/* Left: Illustration / Abstract Graphic */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, type: "spring" }}
          className="w-full lg:w-1/2 aspect-square relative flex items-center justify-center"
        >
          <div className="absolute inset-0 rounded-full bg-electric/5 blur-3xl" />
          
          <GlassCard className="w-full h-full p-2" innerClassName="flex flex-col items-center justify-center gap-8 relative overflow-hidden p-0">
            {/* Abstract glass building graphic */}
            <div className="absolute inset-0 bg-gradient-to-b from-navy/50 to-background/90 z-10" />
            
            {/* Grid background */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />

            <div className="relative z-20 flex flex-col items-center gap-4">
               <motion.div 
                 animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                 transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                 className="flex flex-col items-center text-rose-500"
               >
                 <Sun className="w-16 h-16 mb-2" />
                 <span className="font-mono text-sm uppercase tracking-widest font-bold">Heat Gain: Critical</span>
               </motion.div>
               
               <div className="w-48 h-64 border border-rose-500/30 bg-rose-500/10 rounded-xl relative overflow-hidden backdrop-blur-sm">
                 <div className="absolute bottom-0 left-0 right-0 h-3/4 bg-gradient-to-t from-rose-500/40 to-transparent" />
                 <div className="absolute inset-0 flex items-center justify-center flex-col gap-2">
                    <span className="text-4xl font-sans tracking-tighter text-white font-bold">50%</span>
                    <span className="text-xs text-rose-300 uppercase tracking-widest text-center px-4">Solar Heat Load</span>
                 </div>
               </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Right: Bento Cards */}
        <div className="w-full lg:w-1/2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {PROBLEMS.map((problem, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: idx * 0.1, duration: 0.6, type: "spring" }}
            >
              <GlassCard className="h-full" innerClassName="flex flex-col p-6">
                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 text-white">
                  <problem.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{problem.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {problem.desc}
                </p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  )
}
