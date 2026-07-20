"use client"

import { useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Stars } from "@react-three/drei"
import * as THREE from "three"

function AnimatedStars() {
  const group = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (group.current) {
      // Slow rotation for a serene background effect
      group.current.rotation.y = state.clock.elapsedTime * 0.02
      group.current.rotation.x = state.clock.elapsedTime * 0.01
    }
  })

  return (
    <group ref={group}>
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      {/* Add a subtle green hue to some stars to match theme */}
      <Stars radius={100} depth={50} count={1000} factor={4} saturation={1} fade speed={1.5} color="#00D084" />
    </group>
  )
}

export function GlobalBackground() {
  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none bg-[#020617]">
      {/* Gradient Overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020617]/50 to-[#020617] z-10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,208,132,0.05),transparent_60%)] z-10" />
      
      <Canvas camera={{ position: [0, 0, 1] }}>
        <AnimatedStars />
      </Canvas>
    </div>
  )
}
