"use client"

import { useRef, useMemo } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Environment, MeshTransmissionMaterial, Float, Sparkles } from "@react-three/drei"
import { EffectComposer, Bloom, Noise, Vignette } from "@react-three/postprocessing"
import * as THREE from "three"

// ------------------------------------------------------------------
// Architectural Geometry & Materials
// ------------------------------------------------------------------

function ArchitecturalStructure() {
  const groupRef = useRef<THREE.Group>(null)
  const innerPlanesRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  
  // Track scroll position manually inside R3F + Add cinematic camera drift
  useFrame((state, delta) => {
    // 1. Scroll-Linked Articulation
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    const scrollProgress = maxScroll > 0 ? window.scrollY / maxScroll : 0
    
    if (groupRef.current) {
      // Smoothly interpolate rotation based on scroll (adding significant Z depth as we scroll)
      const targetRotationY = scrollProgress * Math.PI * 0.75
      groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, targetRotationY, 4, delta)
      
      const targetRotationX = scrollProgress * Math.PI * 0.15
      groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, targetRotationX, 4, delta)

      const targetZ = scrollProgress * 5
      groupRef.current.position.z = THREE.MathUtils.damp(groupRef.current.position.z, targetZ, 3, delta)
    }

    if (innerPlanesRef.current) {
      // Add subtle continuous articulation to the inner facade planes
      const time = state.clock.getElapsedTime()
      innerPlanesRef.current.children.forEach((child, i) => {
        const offset = i * Math.PI * 0.25
        child.rotation.x = Math.sin(time * 0.3 + offset) * 0.05
        child.rotation.y = Math.cos(time * 0.2 + offset) * 0.05
      })
    }

    // 2. Cinematic Camera Breathing
    const t = state.clock.getElapsedTime()
    camera.position.x = THREE.MathUtils.damp(camera.position.x, Math.sin(t * 0.5) * 0.2, 2, delta)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, Math.cos(t * 0.3) * 0.2, 2, delta)
    camera.lookAt(0, 0, 0)
  })

  return (
    <group ref={groupRef} position={[0, -1, 0]}>
      
      {/* Cinematic Dust Particles */}
      <Sparkles count={400} scale={20} size={2} speed={0.2} opacity={0.1} color="#e0f2fe" />

      {/* Outer Structural Frames (Mullions) */}
      <mesh position={[0, 0, -2]}>
        <boxGeometry args={[12, 16, 0.1]} />
        <meshStandardMaterial 
          color="#0a0a0a" 
          metalness={1} 
          roughness={0.1} 
          wireframe={true} 
          transparent 
          opacity={0.15} 
        />
      </mesh>

      <mesh position={[0, 0, -5]}>
        <boxGeometry args={[25, 25, 20]} />
        <meshStandardMaterial 
          color="#020202" 
          metalness={1} 
          roughness={0.05} 
          wireframe={true} 
          transparent 
          opacity={0.08} 
        />
      </mesh>

      {/* Internal Floating Glass Planes (Façade Modules) */}
      <group ref={innerPlanesRef} position={[0, 0, 0]}>
        {[...Array(8)].map((_, i) => (
          <Float 
            key={i} 
            speed={0.5 + i * 0.1} 
            rotationIntensity={0.2} 
            floatIntensity={0.3}
          >
            <mesh 
              position={[
                (Math.random() - 0.5) * 10, 
                (Math.random() - 0.5) * 10, 
                (Math.random() - 0.5) * 6
              ]}
              rotation={[
                Math.random() * Math.PI, 
                Math.random() * Math.PI, 
                0
              ]}
            >
              <planeGeometry args={[2.5, 4.5]} />
              <MeshTransmissionMaterial 
                backside={true}
                samples={8}
                thickness={1.5}
                roughness={0.05}
                transmission={0.98}
                ior={1.4}
                chromaticAberration={0.06}
                anisotropy={0.3}
                color="#f0fdfa"
                attenuationColor="#10b981"
                attenuationDistance={3}
                clearcoat={1}
                clearcoatRoughness={0.1}
              />
              {/* Highlight edge frame */}
              <lineSegments>
                <edgesGeometry args={[new THREE.PlaneGeometry(2.5, 4.5)]} />
                <lineBasicMaterial color="#34d399" transparent opacity={0.2} />
              </lineSegments>
            </mesh>
          </Float>
        ))}
      </group>

      {/* Deep structural elements */}
      <mesh position={[3, -2, -3]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 25, 8]} />
        <meshStandardMaterial color="#ffffff" emissive="#10b981" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[-4, 2, -4]} rotation={[0, -Math.PI / 6, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 25, 8]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, -5, -2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 25, 8]} />
        <meshStandardMaterial color="#ffffff" emissive="#34d399" emissiveIntensity={0.5} />
      </mesh>

    </group>
  )
}

function AnimatedLighting() {
  const lightRef = useRef<THREE.PointLight>(null)

  useFrame((state) => {
    if (lightRef.current) {
      // Smooth orbit for the point light to create dynamic reflections
      lightRef.current.position.x = Math.sin(state.clock.elapsedTime * 0.15) * 6
      lightRef.current.position.y = Math.cos(state.clock.elapsedTime * 0.2) * 6
      lightRef.current.position.z = Math.sin(state.clock.elapsedTime * 0.1) * 3
    }
  })

  return (
    <>
      <ambientLight intensity={0.15} color="#020205" />
      <directionalLight position={[10, 10, 10]} intensity={0.8} color="#e0f2fe" />
      
      {/* Simulating Volumetric Light Shafts */}
      <spotLight 
        position={[-15, 20, 5]} 
        angle={0.4} 
        penumbra={1} 
        intensity={3} 
        color="#34d399" 
        distance={50}
        decay={1.5}
      />
      <spotLight 
        position={[15, -20, -5]} 
        angle={0.6} 
        penumbra={1} 
        intensity={1.5} 
        color="#ffffff" 
        distance={50}
      />

      <pointLight 
        ref={lightRef}
        position={[0, 0, 2]} 
        intensity={1.5} 
        color="#ffffff" 
        distance={25}
      />
      
      {/* Soft fill light */}
      <rectAreaLight 
        width={15} 
        height={15} 
        color="#00D084" 
        intensity={0.5} 
        position={[0, 0, -8]} 
        lookAt={[0, 0, 0]} 
      />
    </>
  )
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export function ArchitecturalEnvironment() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none bg-[#020205]">
      <Canvas 
        camera={{ position: [0, 0, 12], fov: 35 }}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: false }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#020205']} />
        
        {/* Deep, dense fog for atmosphere and light falloff */}
        <fogExp2 attach="fog" args={['#020205', 0.06]} />
        
        <AnimatedLighting />
        <ArchitecturalStructure />
        
        {/* High quality studio environment for glass reflections */}
        <Environment preset="studio" />

        <EffectComposer>
          <Bloom 
            luminanceThreshold={0.4} 
            luminanceSmoothing={0.9} 
            intensity={1.5} 
            mipmapBlur 
          />
          <Noise opacity={0.04} />
          <Vignette eskil={false} offset={0.2} darkness={1.3} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
