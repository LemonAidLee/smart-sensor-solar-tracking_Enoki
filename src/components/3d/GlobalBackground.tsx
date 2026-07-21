"use client"

import { useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Stars, Float, Icosahedron, Octahedron, Torus } from "@react-three/drei"
import * as THREE from "three"

const BASE = "#05060a"

function FloatingGeometries() {
  // Scatter geometries vertically from y=10 down to y=-150 to cover the scroll
  const shapes = Array.from({ length: 26 }).map((_, i) => ({
    id: i,
    type: i % 3, // 0: Icosahedron, 1: Octahedron, 2: Torus
    // Alternate accent colors for richer depth
    color: i % 2 === 0 ? "#00D084" : "#38BDF8",
    position: [
      (Math.random() - 0.5) * 42,
      -(Math.random() * 150) + 10,
      (Math.random() - 0.5) * 20 - 15,
    ] as [number, number, number],
    rotation: [
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI,
    ] as [number, number, number],
    scale: Math.random() * 0.8 + 0.5,
    speed: Math.random() * 2 + 1,
  }))

  return (
    <group>
      {shapes.map((shape) => {
        const materialProps = {
          color: shape.color,
          wireframe: true,
          transparent: true,
          opacity: 0.12,
        }
        return (
          <Float
            key={shape.id}
            speed={shape.speed}
            rotationIntensity={1.5}
            floatIntensity={2}
            position={shape.position}
          >
            {shape.type === 0 && (
              <Icosahedron args={[1, 0]} scale={shape.scale} rotation={shape.rotation}>
                <meshBasicMaterial {...materialProps} />
              </Icosahedron>
            )}
            {shape.type === 1 && (
              <Octahedron args={[1, 0]} scale={shape.scale} rotation={shape.rotation}>
                <meshBasicMaterial {...materialProps} />
              </Octahedron>
            )}
            {shape.type === 2 && (
              <Torus args={[0.8, 0.2, 8, 16]} scale={shape.scale} rotation={shape.rotation}>
                <meshBasicMaterial {...materialProps} />
              </Torus>
            )}
          </Float>
        )
      })}
    </group>
  )
}

function Scene() {
  const group = useRef<THREE.Group>(null)

  // Map camera Y position to window scroll for a smooth, continuous parallax
  useFrame((state) => {
    const scrollY = window.scrollY
    state.camera.position.y = THREE.MathUtils.lerp(
      state.camera.position.y,
      -(scrollY * 0.02),
      0.05
    )

    if (group.current) {
      group.current.rotation.y = state.clock.elapsedTime * 0.01
      // Keep stars centered around the camera's Y position so they never disappear
      group.current.position.y = state.camera.position.y
    }
  })

  return (
    <>
      <group ref={group}>
        <Stars radius={100} depth={50} count={2600} factor={4} saturation={0} fade speed={1} />
      </group>
      <FloatingGeometries />
    </>
  )
}

export function GlobalBackground() {
  return (
    <div
      className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none"
      style={{ backgroundColor: BASE }}
    >
      {/* Deep vertical base gradient — subtle navy lift toward the top */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0a1020_0%,#05060a_45%,#04050a_100%)]" />

      {/* Drifting aurora orbs — continuous, seam-free ambient color field.
          Independent durations/delays keep the motion organic, never in sync. */}
      <div className="absolute -top-[10%] -left-[10%] h-[60vmax] w-[60vmax] rounded-full bg-[radial-gradient(circle,rgba(0,208,132,0.16),transparent_65%)] blur-3xl animate-[aurora_20s_ease-in-out_infinite]" />
      <div className="absolute top-[25%] right-[-15%] h-[65vmax] w-[65vmax] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.14),transparent_65%)] blur-3xl animate-[aurora_26s_ease-in-out_infinite] [animation-delay:-8s]" />
      <div className="absolute bottom-[-10%] left-[10%] h-[55vmax] w-[55vmax] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.12),transparent_65%)] blur-3xl animate-[aurora_32s_ease-in-out_infinite] [animation-delay:-14s]" />
      <div className="absolute top-[55%] left-[35%] h-[45vmax] w-[45vmax] rounded-full bg-[radial-gradient(circle,rgba(0,208,132,0.08),transparent_60%)] blur-3xl animate-[aurora_24s_ease-in-out_infinite] [animation-delay:-4s]" />

      {/* Fine dot-matrix texture for engineered, technical depth (very subtle) */}
      <div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(rgba(255,255,255,0.35)_0.5px,transparent_0.5px)] bg-[size:26px_26px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />

      {/* 3D starfield + floating geometries */}
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <fog attach="fog" args={[BASE, 10, 40]} />
        <Scene />
      </Canvas>

      {/* Vignette to keep foreground content legible and add cinematic depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(4,5,10,0.55)_100%)]" />
    </div>
  )
}
