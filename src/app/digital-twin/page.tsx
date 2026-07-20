"use client"

import { Suspense, useMemo } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Environment, PerspectiveCamera, ContactShadows, Sphere } from "@react-three/drei"
import { EffectComposer, Bloom } from "@react-three/postprocessing"
import { Navigation } from "@/components/layout/Navigation"
import { SolarTracker } from "@/components/3d/SolarTracker"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { motion } from "framer-motion"
import * as THREE from "three"
import { useControls } from "leva"

function Scene() {
  const { sunAzimuth, sunElevation } = useControls("Sun Controls", {
    sunAzimuth: { value: 180, min: 0, max: 360, step: 1, label: "Sun Azimuth" },
    sunElevation: { value: 45, min: 5, max: 90, step: 1, label: "Sun Elevation" },
  })

  // Calculate Sun Position based on spherical coordinates
  const sunPosition = useMemo(() => {
    const radius = 25
    // Phi: 0 at zenith, 90 at horizon. So 90 - elevation
    const phi = THREE.MathUtils.degToRad(90 - sunElevation)
    const theta = THREE.MathUtils.degToRad(sunAzimuth)
    
    return new THREE.Vector3(
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta)
    )
  }, [sunAzimuth, sunElevation])

  return (
    <>
      <PerspectiveCamera makeDefault position={[-12, 10, 12]} fov={40} />
      <ambientLight intensity={0.2} />
      
      {/* Moving Directional Light acting as the Sun's rays */}
      <directionalLight 
        position={sunPosition} 
        intensity={2.5} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
      />
      <spotLight position={[-10, 10, -10]} intensity={1.5} color="#38bdf8" />
      
      {/* Simulated Sun (High-intensity emissive sphere) */}
      <Sphere args={[1.5, 32, 32]} position={sunPosition}>
        <meshBasicMaterial color="#fffbeb" toneMapped={false} />
      </Sphere>
      
      <Suspense fallback={null}>
        <Environment preset="night" />
        
        {/* Pass the sun's target position to the Tracker */}
        <SolarTracker target={sunPosition} />
        
        <ContactShadows position={[0, -1.99, 0]} opacity={0.6} scale={20} blur={2.5} far={10} color="#000000" />
        
        {/* Post-Processing Bloom */}
        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={1.2} mipmapBlur intensity={1.5} />
        </EffectComposer>
      </Suspense>

      <OrbitControls 
        makeDefault 
        minPolarAngle={0} 
        maxPolarAngle={Math.PI / 2 + 0.05} 
        minDistance={5} 
        maxDistance={35} 
        target={[0, 2, 0]}
      />
    </>
  )
}

export default function DigitalTwinPage() {
  return (
    <main className="relative min-h-screen bg-[#090909] overflow-hidden">
      <Navigation />

      {/* UI Overlay */}
      <div className="absolute top-32 left-6 md:left-12 z-10 pointer-events-none">
        <Link href="/" className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-6 pointer-events-auto">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Overview
        </Link>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md pointer-events-auto"
        >
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
            Digital <span className="text-[#38bdf8]">Twin</span>
          </h1>
          <p className="text-gray-400 text-lg">
            Interactive real-time 3D simulation of the SOLIS AI Smart Sensor Tracker. 
            Change the Sun's position using the control panel, and watch the tracker autonomously follow it.
          </p>
        </motion.div>
      </div>

      {/* 3D Canvas */}
      <div className="w-full h-screen cursor-grab active:cursor-grabbing">
        <Canvas shadows>
          <Scene />
        </Canvas>
      </div>
    </main>
  )
}
