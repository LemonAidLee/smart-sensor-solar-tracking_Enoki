"use client"

import { useRef, useState } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { Canvas, useFrame } from "@react-three/fiber"
import { Environment, PerspectiveCamera, Float, MeshDistortMaterial, Sphere, useCursor } from "@react-three/drei"
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing"
import * as THREE from "three"
import { MagneticButton } from "@/components/ui/MagneticButton"
import { GlassCard } from "@/components/ui/GlassCard"
import { ArrowRight, Activity, Thermometer, Wind, Droplets, Sun, Zap } from "lucide-react"

// High-impact 3D Kinetic Sun
function KineticSun() {
  const innerMesh = useRef<THREE.Mesh>(null)
  const outerMesh = useRef<THREE.Mesh>(null)
  const group = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)

  useCursor(hovered, 'grab', 'auto')

  useFrame((state) => {
    if (group.current) {
      // Slowly rotate the entire group
      group.current.rotation.y = state.clock.elapsedTime * 0.1
      group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.2
    }
    
    if (outerMesh.current) {
      outerMesh.current.rotation.y = state.clock.elapsedTime * -0.05
      outerMesh.current.rotation.z = state.clock.elapsedTime * 0.05
    }

    if (innerMesh.current && outerMesh.current) {
      // Scale pulse effect on hover
      const targetScale = hovered ? 1.1 : 1
      innerMesh.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1)
      outerMesh.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1)
    }
  })

  return (
    <group ref={group}>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        
        {/* Solid Inner Core */}
        <Sphere ref={innerMesh} args={[1.8, 32, 32]} 
          onPointerOver={() => setHovered(true)} 
          onPointerOut={() => setHovered(false)}
        >
          <MeshDistortMaterial 
            color="#020617" 
            emissive="#00D084" 
            emissiveIntensity={hovered ? 0.8 : 0.2} 
            distort={0.3} 
            speed={2} 
            roughness={0.8}
          />
        </Sphere>

        {/* Wireframe Outer Shell */}
        <Sphere ref={outerMesh} args={[1.9, 24, 24]} pointerEvents="none">
          <meshStandardMaterial 
            color="#00D084" 
            emissive="#00D084" 
            emissiveIntensity={1} 
            wireframe={true} 
            transparent
            opacity={0.6}
          />
        </Sphere>

        {/* Orbiting rings */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[3.2, 0.02, 16, 100]} />
          <meshBasicMaterial color="#38BDF8" transparent opacity={0.3} />
        </mesh>
        <mesh rotation={[Math.PI / 3, Math.PI / 4, 0]}>
          <torusGeometry args={[4.0, 0.01, 16, 100]} />
          <meshBasicMaterial color="#00D084" transparent opacity={0.2} />
        </mesh>
      </Float>
    </group>
  )
}

function DataBadge({ icon: Icon, label, value, delay }: { icon: any, label: string, value: string, delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay, type: "spring" }}
      className="flex items-center gap-3 bg-black/60 backdrop-blur-xl border border-white/20 rounded-2xl p-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald/20 text-emerald border border-emerald/30 shadow-[0_0_15px_rgba(0,208,132,0.3)]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-gray-300 font-semibold">{label}</span>
        <span className="font-mono text-sm font-bold text-white tracking-wide">{value}</span>
      </div>
    </motion.div>
  )
}

export function HeroSection() {
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 1000], [0, 300])
  const opacity = useTransform(scrollY, [0, 500], [1, 0])

  return (
    <section id="home" className="relative min-h-[100dvh] w-full overflow-hidden pt-32 lg:pt-0">
      
      {/* Architectural Grid Pattern */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black_40%,transparent_100%)]" />

      {/* Ambient Glows */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,rgba(0,208,132,0.15),transparent_40%)]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.1),transparent_40%)]" />

      {/* Large Faded Watermark */}
      <div className="absolute left-[-5%] top-1/4 z-0 select-none pointer-events-none opacity-5">
        <h1 className="text-[20rem] font-bold tracking-tighter text-white font-sans leading-none">SOLIS</h1>
      </div>

      <div className="mx-auto flex min-h-[100dvh] max-w-7xl flex-col lg:flex-row items-center px-4 md:px-8 relative z-10">
        
        {/* Left: Typography */}
        <motion.div 
          className="flex w-full lg:w-2/5 flex-col items-start gap-8 z-20"
          style={{ y, opacity }}
        >
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex items-center gap-2 rounded-full border border-emerald/30 bg-emerald/10 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-emerald"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" />
            The Responsive Skin
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl md:text-7xl font-sans tracking-tighter text-white leading-[1.1]"
          >
            The Building That <br />
            <span className="text-gradient-primary">Thinks</span> Before <br />
            The Sun Moves.
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-lg md:text-xl text-gray-400 max-w-lg leading-relaxed"
          >
            AI-powered Smart Sensor Fusion & Solar Tracking for Autonomous Kinetic Façades. 
            Reducing cooling loads while maximizing natural daylight.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex flex-wrap items-center gap-4 mt-4"
          >
            <MagneticButton icon={<ArrowRight className="h-4 w-4" />}>
              Explore Technology
            </MagneticButton>
            <MagneticButton variant="outline">
              View Simulation
            </MagneticButton>
          </motion.div>
        </motion.div>

        {/* Right: 3D Visualization & Data */}
        <div className="relative w-full lg:w-3/5 h-[60vh] lg:h-[100dvh] mt-12 lg:mt-0 z-10 flex items-center justify-center">
          
          {/* HUD Background Elements */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30 hidden md:flex">
            {/* Concentric rings */}
            <div className="absolute w-[80%] aspect-square max-w-[500px] border border-emerald/20 rounded-full border-dashed animate-[spin_40s_linear_infinite]" />
            <div className="absolute w-[60%] aspect-square max-w-[350px] border border-electric/20 rounded-full animate-[spin_30s_linear_infinite_reverse]" />
            <div className="absolute w-[40%] aspect-square max-w-[250px] border border-white/10 rounded-full border-dotted animate-[spin_20s_linear_infinite]" />
            
            {/* Corner brackets */}
            <div className="absolute top-1/4 left-10 w-16 h-16 border-t-2 border-l-2 border-emerald/40 rounded-tl-3xl opacity-70" />
            <div className="absolute top-1/4 right-10 w-16 h-16 border-t-2 border-r-2 border-emerald/40 rounded-tr-3xl opacity-70" />
            <div className="absolute bottom-1/4 left-10 w-16 h-16 border-b-2 border-l-2 border-emerald/40 rounded-bl-3xl opacity-70" />
            <div className="absolute bottom-1/4 right-10 w-16 h-16 border-b-2 border-r-2 border-emerald/40 rounded-br-3xl opacity-70" />
          </div>

          {/* 3D Canvas */}
          <div className="absolute inset-0 cursor-grab active:cursor-grabbing">
            <Canvas>
              <PerspectiveCamera makeDefault position={[0, 0, 12]} fov={45} />
              <ambientLight intensity={0.2} />
              <pointLight position={[5, 5, 5]} intensity={1} color="#38BDF8" />
              <pointLight position={[-5, -5, -5]} intensity={0.5} color="#00D084" />
              <KineticSun />
              <Environment preset="city" />
              
              {/* Post-Processing for immense glow */}
              <EffectComposer>
                <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} height={300} intensity={0.8} />
                <Vignette eskil={false} offset={0.1} darkness={1.1} />
              </EffectComposer>
            </Canvas>
          </div>

          {/* Floating Data Badges */}
          <div className="absolute right-0 top-1/4 flex flex-col gap-4 pointer-events-none hidden md:flex">
            <DataBadge icon={Sun} label="Solar Irradiance" value="840 W/m²" delay={0.5} />
            <DataBadge icon={Thermometer} label="Indoor Temp" value="22.5 °C" delay={0.6} />
            <DataBadge icon={Wind} label="Wind Speed" value="12 km/h" delay={0.7} />
          </div>

          <div className="absolute left-0 bottom-1/4 flex flex-col gap-4 pointer-events-none hidden md:flex">
            <DataBadge icon={Activity} label="Panel Angle" value="45.2°" delay={0.8} />
            <DataBadge icon={Zap} label="Energy Saved" value="12.4 kWh" delay={0.9} />
          </div>

        </div>

      </div>
    </section>
  )
}
