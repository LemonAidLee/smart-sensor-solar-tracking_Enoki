"use client"

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Box, Cylinder } from "@react-three/drei"
import * as THREE from "three"

interface SolarTrackerProps {
  target: THREE.Vector3
}

export function SolarTracker({ target }: SolarTrackerProps) {
  const yawRef = useRef<THREE.Group>(null)
  const pitchRef = useRef<THREE.Group>(null)

  // Autonomously track the target (sun)
  useFrame(() => {
    if (yawRef.current && pitchRef.current) {
      // 1. Calculate Target Yaw (Pan)
      // The tracker faces +Z locally. We calculate the angle to the sun in the XZ plane.
      const targetYaw = Math.atan2(target.x, target.z)
      
      // Smoothly interpolate Yaw (handling -PI / PI wrap-around)
      let diffYaw = targetYaw - yawRef.current.rotation.y
      diffYaw = Math.atan2(Math.sin(diffYaw), Math.cos(diffYaw))
      yawRef.current.rotation.y += diffYaw * 0.05

      // 2. Calculate Target Pitch (Tilt)
      const distanceXZ = Math.sqrt(target.x * target.x + target.z * target.z)
      
      // Approximate height of the pitch joint relative to the world origin
      const pitchJointWorldY = 4.35 
      const heightDiff = target.y - pitchJointWorldY
      
      // Math.atan2(distance, height) gives 0 (facing straight up) when sun is overhead
      // and PI/2 (facing forward) when sun is at the horizon.
      const targetPitch = Math.atan2(distanceXZ, heightDiff)
      
      // Smoothly interpolate Pitch
      let diffPitch = targetPitch - pitchRef.current.rotation.x
      diffPitch = Math.atan2(Math.sin(diffPitch), Math.cos(diffPitch))
      pitchRef.current.rotation.x += diffPitch * 0.05
    }
  })

  // Premium Materials
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: "#1e293b", // Slate 800
    metalness: 0.8,
    roughness: 0.3,
  })

  const jointMaterial = new THREE.MeshStandardMaterial({
    color: "#0f172a", // Slate 900
    metalness: 0.9,
    roughness: 0.2,
  })

  const panelMaterial = new THREE.MeshPhysicalMaterial({
    color: "#020617", // Slate 950
    metalness: 0.9,
    roughness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  })

  const ldrMaterial = new THREE.MeshStandardMaterial({
    color: "#00D084", // Emerald Green
    emissive: "#00D084",
    emissiveIntensity: 2.0, // Increased for Bloom
    metalness: 0.5,
    roughness: 0.2,
    toneMapped: false, // Bypass tone mapping for true glowing bloom
  })

  return (
    <group position={[0, -2, 0]}>
      {/* 1. Base Platform */}
      <Cylinder args={[2, 2.5, 0.4, 64]} material={metalMaterial} position={[0, 0.2, 0]} castShadow receiveShadow />
      
      {/* 2. Main Center Post */}
      <Cylinder args={[0.5, 0.6, 2.5]} material={metalMaterial} position={[0, 1.65, 0]} castShadow receiveShadow />

      {/* 3. Yaw Joint (Pan - Rotates around Y axis) */}
      <group ref={yawRef} position={[0, 2.9, 0]}>
        
        {/* Pan Motor Housing */}
        <Box args={[1.5, 0.8, 1.5]} material={jointMaterial} castShadow receiveShadow />
        
        {/* U-Bracket Arms holding the Tilt axis */}
        <Box args={[0.3, 1.8, 1.0]} material={metalMaterial} position={[-0.9, 1.0, 0]} castShadow receiveShadow />
        <Box args={[0.3, 1.8, 1.0]} material={metalMaterial} position={[0.9, 1.0, 0]} castShadow receiveShadow />

        {/* 4. Pitch Joint (Tilt - Rotates around X axis) */}
        <group ref={pitchRef} position={[0, 1.6, 0]}>
          
          {/* Tilt Axis Axle */}
          <Cylinder args={[0.2, 0.2, 2.2]} rotation={[0, 0, Math.PI / 2]} material={jointMaterial} castShadow receiveShadow />
          
          {/* Mounting Plate / Frame */}
          <Box args={[6.4, 0.2, 4.4]} material={metalMaterial} position={[0, 0.3, 0]} castShadow receiveShadow />
          
          {/* Solar Panel Surface */}
          <Box args={[6.2, 0.1, 4.2]} material={panelMaterial} position={[0, 0.45, 0]} />
          
          {/* Grid lines for solar panel (aesthetic) */}
          <gridHelper args={[6.2, 10, "#38bdf8", "#1e293b"]} position={[0, 0.51, 0]} />

          {/* 5. Sensors: 4 LDRs at the extreme corners */}
          {/* Top Left */}
          <Box args={[0.4, 0.4, 0.4]} material={ldrMaterial} position={[-3.0, 0.6, -2.0]} />
          {/* Top Right */}
          <Box args={[0.4, 0.4, 0.4]} material={ldrMaterial} position={[3.0, 0.6, -2.0]} />
          {/* Bottom Left */}
          <Box args={[0.4, 0.4, 0.4]} material={ldrMaterial} position={[-3.0, 0.6, 2.0]} />
          {/* Bottom Right */}
          <Box args={[0.4, 0.4, 0.4]} material={ldrMaterial} position={[3.0, 0.6, 2.0]} />
        </group>
      </group>
    </group>
  )
}
