"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import { Box, Cylinder, Sphere, Line, Text, useGLTF } from "@react-three/drei"
import * as THREE from "three"

// Custom Orthogonal Line Component
function OrthoLine({ start, end, color }: { start: [number, number, number], end: [number, number, number], color: string }) {
  const points = [
    new THREE.Vector3(...start),
    new THREE.Vector3(end[0], start[1], start[2]), // Go horizontally (X-axis) first to prevent overlapping near pins
    new THREE.Vector3(...end)
  ]
  return <Line points={points} color={color} lineWidth={2} />
}

export function WiringDiagram() {
  const groupRef = useRef<THREE.Group>(null)
  
  // Load the ESP32 GLTF Model
  const espGLTF = useGLTF("/ESP32-S3-WROOM-1.glb")

  const espScene = useMemo(() => {
    if (!espGLTF.scene) return new THREE.Group();
    const scene = espGLTF.scene.clone()
    
    // Auto center
    const box = new THREE.Box3().setFromObject(scene)
    const center = box.getCenter(new THREE.Vector3())
    scene.position.sub(center)
    
    // Auto scale to 4.5 units
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      const scaleFactor = 4.5 / maxDim
      scene.scale.set(scaleFactor, scaleFactor, scaleFactor)
    }
    
    const wrapper = new THREE.Group()
    wrapper.add(scene)
    // Rotate to lie flat (most 3D models are Y-up, but some are Z-up)
    // We'll leave it as is, user can tell us if it's sideways
    return wrapper
  }, [espGLTF.scene])

  // Gentle floating animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.15) * 0.1
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.1 + 0.5
    }
  })

  // Materials
  const mats = useMemo(() => ({
    espBoard: new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.8 }),
    espChip: new THREE.MeshStandardMaterial({ color: "#888888", metalness: 0.8, roughness: 0.2 }),
    blueBoard: new THREE.MeshStandardMaterial({ color: "#1e3a8a", roughness: 0.9 }),
    greenBoard: new THREE.MeshStandardMaterial({ color: "#059669", roughness: 0.9 }),
    lcdScreen: new THREE.MeshStandardMaterial({ color: "#064e3b", roughness: 0.3 }),
    whitePlastic: new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.5 }),
    greyPlastic: new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.6 }),
    pin: new THREE.MeshStandardMaterial({ color: "#fbbf24", metalness: 1, roughness: 0.2 }),
    silver: new THREE.MeshStandardMaterial({ color: "#e2e8f0", metalness: 0.6, roughness: 0.4 }),
    redTip: new THREE.MeshStandardMaterial({ color: "#ef4444", emissive: "#ef4444", emissiveIntensity: 0.5 })
  }), [])

  // Gentle floating animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = -0.5 + Math.sin(state.clock.elapsedTime * 1.5) * 0.1
    }
  })

  // Component Positions
  const posESP: [number, number, number] = [-0.15, 0.1, 0] // Shifted left to center asymmetrical GLB
  
  // Left Side (-X) Components
  const posLDR1: [number, number, number] = [-4.5, 0, -5] // Top Left corner
  const posPIR: [number, number, number] = [-6.5, 0.2, -2]
  const posDHT: [number, number, number] = [-5.5, 0.2, 2]
  const posLDR3: [number, number, number] = [-4.5, 0, 5]  // Bottom Left corner
  
  // Right Side (+X) Components
  const posLCD: [number, number, number] = [7, 0.5, -6.5]
  const posLDR2: [number, number, number] = [4.5, 0, -5]  // Top Right corner
  const posPot1: [number, number, number] = [5.5, 0.2, -2.5]
  const posPot2: [number, number, number] = [6.5, 0.2, 0]
  const posServo: [number, number, number] = [6, 0.5, 2.5]
  const posLDR4: [number, number, number] = [4.5, 0, 5]   // Bottom Right corner

  return (
    <group ref={groupRef} position={[0, -0.5, 0]}>
      
      {/* 1. ESP32-S3 */}
      <group position={posESP} rotation={[-Math.PI / 2, 0, 0]}>
        <primitive object={espScene} />
      </group>

      {/* 2. LDR Modules */}
      {[
        { pos: posLDR1, rot: 0 }, { pos: posLDR2, rot: 0 }, 
        { pos: posLDR3, rot: Math.PI }, { pos: posLDR4, rot: Math.PI }
      ].map((ldr, i) => (
        <group key={`ldr-${i}`} position={ldr.pos} rotation={[0, ldr.rot, 0]}>
          <Box args={[2, 0.1, 1.2]} material={mats.blueBoard} />
          {/* Trimpot */}
          <Box args={[0.4, 0.2, 0.5]} material={mats.blueBoard} position={[-0.3, 0.15, 0]} />
          <Box args={[0.2, 0.25, 0.1]} material={mats.silver} position={[-0.3, 0.15, 0]} />
          {/* LDR Sensor Bulb */}
          <Cylinder args={[0.15, 0.15, 0.4]} material={mats.redTip} position={[-1.1, 0.1, 0]} rotation={[0, 0, Math.PI/2]} />
          {/* Pins */}
          <Box args={[0.4, 0.1, 0.8]} material={mats.pin} position={[1, 0, 0]} />
          <Text position={[0, 0.15, 0.3]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.15} color="white">LDR</Text>
        </group>
      ))}

      {/* 3. DHT22 */}
      <group position={posDHT}>
        <Box args={[1.4, 0.3, 1.8]} material={mats.whitePlastic} />
        {/* Slits */}
        {[...Array(5)].map((_, i) => (
          <Box key={`slit-${i}`} args={[1.2, 0.31, 0.1]} material={mats.espBoard} position={[0, 0, -0.6 + i*0.3]} />
        ))}
        {/* Pins */}
        <Box args={[0.8, 0.1, 0.4]} material={mats.pin} position={[0, 0, 1.1]} />
        <Text position={[0, 0.16, 0.6]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.2} color="black">DHT22</Text>
      </group>

      {/* 4. PIR Sensor */}
      <group position={posPIR}>
        <Box args={[1.6, 0.1, 1.6]} material={mats.blueBoard} />
        <Sphere args={[0.7, 16, 16, 0, Math.PI*2, 0, Math.PI/2]} material={mats.whitePlastic} position={[0, 0.05, 0]} />
        <Box args={[0.6, 0.1, 0.3]} material={mats.pin} position={[0, 0, 0.9]} />
      </group>

      {/* 5. Potentiometers */}
      {[posPot1, posPot2].map((pos, i) => (
        <group key={`pot-${i}`} position={pos}>
          <Box args={[1.2, 0.1, 1.2]} material={mats.blueBoard} />
          <Cylinder args={[0.4, 0.5, 0.4]} material={mats.silver} position={[0, 0.25, 0]} />
          <Box args={[0.1, 0.41, 0.4]} material={mats.espBoard} position={[0, 0.25, 0]} /> {/* Notch */}
          <Box args={[0.6, 0.1, 0.3]} material={mats.pin} position={[0, 0, 0.7]} />
        </group>
      ))}

      {/* 6. LCD1602 */}
      <group position={posLCD}>
        <Box args={[5, 0.1, 2.5]} material={mats.greenBoard} />
        <Box args={[4.2, 0.15, 1.8]} material={mats.lcdScreen} position={[0, 0.1, 0]} />
        {/* I2C Backpack Pins */}
        <Box args={[0.2, 0.1, 0.8]} material={mats.pin} position={[-2.4, 0, -1]} />
      </group>

      {/* 7. Servo */}
      <group position={posServo}>
        <Box args={[2, 1, 1]} material={mats.greyPlastic} />
        <Box args={[2.4, 0.2, 1]} material={mats.greyPlastic} position={[0, -0.2, 0]} />
        {/* Servo Horn */}
        <Cylinder args={[0.3, 0.3, 0.2]} material={mats.whitePlastic} position={[-0.5, 0.6, 0]} />
        <Box args={[1.2, 0.15, 0.2]} material={mats.whitePlastic} position={[-0.5, 0.7, 0]} />
      </group>

      {/* 8. Wires (Orthogonal Traces) */}
      {/* Left side pins (-Z to +Z order to prevent crossing) */}
      <OrthoLine start={[-0.52, 0.1, -1.2]} end={posLDR1} color="#34d399" />
      <OrthoLine start={[-0.52, 0.1, -0.4]} end={posPIR} color="#a78bfa" />
      <OrthoLine start={[-0.52, 0.1, 0.4]} end={posDHT} color="#60a5fa" />
      <OrthoLine start={[-0.52, 0.1, 1.2]} end={posLDR3} color="#34d399" />
      
      {/* Right side pins (-Z to +Z order to prevent crossing) */}
      <OrthoLine start={[0.55, 0.1, -1.2]} end={posLCD} color="#fcd34d" />
      <OrthoLine start={[0.55, 0.1, -0.7]} end={posLDR2} color="#34d399" />
      <OrthoLine start={[0.55, 0.1, -0.2]} end={posPot1} color="#fbbf24" />
      <OrthoLine start={[0.55, 0.1, 0.3]} end={posPot2} color="#fbbf24" />
      <OrthoLine start={[0.55, 0.1, 0.8]} end={posServo} color="#f97316" />
      <OrthoLine start={[0.55, 0.1, 1.3]} end={posLDR4} color="#34d399" />

    </group>
  )
}

useGLTF.preload("/ESP32-S3-WROOM-1.glb")
