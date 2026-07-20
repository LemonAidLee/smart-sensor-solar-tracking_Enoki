"use client"

import { motion } from "framer-motion"
import { SectionWrapper } from "@/components/layout/SectionWrapper"
import { GlassCard } from "@/components/ui/GlassCard"
import { Eye, Cpu, Network, RotateCw } from "lucide-react"
import { Canvas } from "@react-three/fiber"
import { Float, Environment } from "@react-three/drei"

const STEPS = [
  {
    step: "01",
    title: "Sense",
    icon: Eye,
    desc: "LDR, Pyranometer, Temperature, Humidity, Wind, Rain, PIR, and CO₂.",
    color: "text-electric",
    bg: "bg-electric/10"
  },
  {
    step: "02",
    title: "Think",
    icon: Cpu,
    desc: "Sensor Fusion Engine aggregates and cleans raw environmental data.",
    color: "text-emerald",
    bg: "bg-emerald/10"
  },
  {
    step: "03",
    title: "Decide",
    icon: Network,
    desc: "AI Decision Engine computes optimal shading angles and predictive actions.",
    color: "text-blue-400",
    bg: "bg-blue-400/10"
  },
  {
    step: "04",
    title: "Act",
    icon: RotateCw,
    desc: "Servo motors independently rotate modular kinetic façade panels.",
    color: "text-purple-400",
    bg: "bg-purple-400/10"
  }
]

function FloatingDataNodes() {
  return (
    <>
      <Float speed={1} rotationIntensity={1} floatIntensity={1}>
        <mesh position={[0, 0, -5]} rotation={[0.5, 0.5, 0]}>
          <icosahedronGeometry args={[2, 0]} />
          <meshStandardMaterial color="#00D084" wireframe transparent opacity={0.3} />
        </mesh>
      </Float>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={2}>
        <mesh position={[-6, 2, -8]} rotation={[-0.2, 0.8, 0]}>
          <torusGeometry args={[1.5, 0.05, 16, 100]} />
          <meshStandardMaterial color="#3b82f6" transparent opacity={0.4} />
        </mesh>
      </Float>
      <Float speed={1.5} rotationIntensity={0.8} floatIntensity={1.5}>
        <mesh position={[6, -2, -6]} rotation={[1, 0, 0.5]}>
          <torusGeometry args={[1, 0.05, 16, 100]} />
          <meshStandardMaterial color="#f43f5e" transparent opacity={0.4} />
        </mesh>
      </Float>
    </>
  )
}

export function SolutionSection() {
  return (
    <SectionWrapper id="solution" className="relative bg-transparent">
      
      {/* 3D Background layer */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-50 hidden md:block">
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} color="#38BDF8" />
          <pointLight position={[-10, -10, -10]} intensity={0.5} color="#00D084" />
          <FloatingDataNodes />
          <Environment preset="city" />
        </Canvas>
      </div>

      <div className="relative z-10 flex flex-col items-center text-center gap-6 mb-24">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          className="rounded-full border border-emerald/30 bg-emerald/10 px-4 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-emerald"
        >
          Our Solution
        </motion.div>
        
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          className="text-4xl md:text-5xl lg:text-6xl font-sans tracking-tighter text-white max-w-2xl"
        >
          An autonomous <span className="text-gradient-primary">kinetic loop</span>.
        </motion.h2>
      </div>

      <div className="relative">
        {/* Connecting Line */}
        <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-white/10 -translate-y-1/2 hidden lg:block" />
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {STEPS.map((step, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ delay: idx * 0.15, duration: 0.8, type: "spring", bounce: 0.4 }}
              className="relative z-10"
            >
              <GlassCard className="h-full" innerClassName="flex flex-col p-8 items-center text-center">
                <span className={`text-[10px] uppercase font-mono tracking-[0.2em] mb-8 font-bold ${step.color}`}>
                  Step {step.step}
                </span>
                
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-8 border border-white/10 ${step.bg}`}>
                  <step.icon className={`w-8 h-8 ${step.color}`} />
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">{step.title}</h3>
                
                <p className="text-sm text-gray-400 leading-relaxed">
                  {step.desc}
                </p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  )
}
