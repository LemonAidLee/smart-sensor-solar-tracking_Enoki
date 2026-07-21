"use client"

import { useRef, useState, useEffect } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Stars, Float, Icosahedron, Octahedron, Torus } from "@react-three/drei"
import * as THREE from "three"

function FloatingGeometries() {
  // Scatter geometries vertically from y=10 down to y=-150
  const shapes = Array.from({ length: 30 }).map((_, i) => ({
    id: i,
    type: i % 3, // 0: Icosahedron, 1: Octahedron, 2: Torus
    position: [
      (Math.random() - 0.5) * 40, // Spread widely across X
      -(Math.random() * 150) + 10, // Spread down Y axis to cover scroll
      (Math.random() - 0.5) * 20 - 15 // Keep them slightly pushed back in Z
    ] as [number, number, number],
    rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI] as [number, number, number],
    scale: Math.random() * 0.8 + 0.5,
    speed: Math.random() * 2 + 1,
  }))

  const materialProps = {
    color: "#00D084",
    wireframe: true,
    transparent: true,
    opacity: 0.15,
  }

  return (
    <group>
      {shapes.map((shape) => (
        <Float 
          key={shape.id} 
          speed={shape.speed} 
          rotationIntensity={1.5} 
          floatIntensity={2}
          position={shape.position}
        >
          {shape.type === 0 && <Icosahedron args={[1, 0]} scale={shape.scale} rotation={shape.rotation}><meshBasicMaterial {...materialProps} /></Icosahedron>}
          {shape.type === 1 && <Octahedron args={[1, 0]} scale={shape.scale} rotation={shape.rotation}><meshBasicMaterial {...materialProps} /></Octahedron>}
          {shape.type === 2 && <Torus args={[0.8, 0.2, 8, 16]} scale={shape.scale} rotation={shape.rotation}><meshBasicMaterial {...materialProps} /></Torus>}
        </Float>
      ))}
    </group>
  )
}

function Scene() {
  const group = useRef<THREE.Group>(null)

  // Map camera Y position to window scroll
  useFrame((state) => {
    // We access scroll directly from window to keep it smooth
    const scrollY = window.scrollY
    // Move camera down as user scrolls down. Adjust multiplier to tune scroll speed
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, -(scrollY * 0.02), 0.05)
    
    if (group.current) {
      // Very slow rotation for the stars
      group.current.rotation.y = state.clock.elapsedTime * 0.01
    }
  })

  return (
    <>
      <group ref={group}>
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      </group>
      <FloatingGeometries />
    </>
  )
}

export function GlobalBackground() {
  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none bg-[#020617]">
      {/* Gradient Overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020617]/70 to-[#020617] z-10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,208,132,0.05),transparent_60%)] z-10" />
      
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <fog attach="fog" args={['#020617', 10, 40]} />
        <Scene />
      </Canvas>
    </div>
  )
}
