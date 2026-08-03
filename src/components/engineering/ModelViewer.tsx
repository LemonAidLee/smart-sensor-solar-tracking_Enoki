"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { motion, useInView } from "framer-motion"
import { Canvas, useFrame } from "@react-three/fiber"
import { Bounds, ContactShadows, Environment, OrbitControls, useBounds, useGLTF } from "@react-three/drei"
import { RotateCcw, Maximize2, Minimize2, Loader2 } from "lucide-react"
import * as THREE from "three"
import { cn } from "@/lib/utils"

interface ModelViewerProps {
  src: string
  className?: string
}

function Model({ src }: { src: string }) {
  const gltf = useGLTF(src)
  return (
    <group dispose={null}>
      <primitive object={gltf.scene} />
    </group>
  )
}

/** Rotating placeholder shown while the GLB streams in — pure Three.js, no DOM-in-canvas cost. */
function LoaderMesh() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.x += delta * 0.6
      ref.current.rotation.y += delta * 0.9
    }
  })
  return (
    <mesh ref={ref}>
      <torusKnotGeometry args={[0.5, 0.15, 100, 16]} />
      <meshStandardMaterial color="#00D084" emissive="#00D084" emissiveIntensity={0.4} wireframe />
    </mesh>
  )
}

function FitOnSignal({ signal }: { signal: number }) {
  const bounds = useBounds()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    bounds.refresh().fit()
  }, [signal, bounds])
  return null
}

export function ModelViewer({ src, className }: ModelViewerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(wrapperRef, { once: true, margin: "100px" })
  const [resetSignal, setResetSignal] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  function toggleFullscreen() {
    if (!wrapperRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      wrapperRef.current.requestFullscreen()
    }
  }

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40",
        isFullscreen && "bg-background aspect-auto h-full",
        className
      )}
    >
      {isInView ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
          className="h-full w-full"
        >
          <Canvas
            shadows
            dpr={[1, 1.75]}
            camera={{ position: [3, 2.2, 4], fov: 40 }}
            gl={{ antialias: true, powerPreference: "high-performance" }}
          >
            <ambientLight intensity={0.5} />
            <directionalLight position={[4, 6, 4]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
            <Suspense fallback={<LoaderMesh />}>
              <Bounds fit clip margin={1.3}>
                <Model src={src} />
                <FitOnSignal signal={resetSignal} />
              </Bounds>
              <Environment preset="city" environmentIntensity={0.7} />
              <ContactShadows position={[0, -0.01, 0]} opacity={0.55} scale={10} blur={2.4} far={4} resolution={512} color="#000000" />
            </Suspense>
            <OrbitControls
              makeDefault
              autoRotate
              autoRotateSpeed={0.5}
              enableDamping
              dampingFactor={0.08}
              minDistance={0.6}
              maxDistance={20}
            />
          </Canvas>
        </motion.div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 rounded-full border border-emerald/30 bg-emerald/5 animate-pulse" />
        </div>
      )}

      {/* Loading spinner overlay (visible briefly before the wrapper is even in view / while WebGL boots) */}
      {!isInView && (
        <div className="absolute inset-0 flex items-center justify-center text-white/30">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          onClick={() => setResetSignal((s) => s + 1)}
          title="Reset View"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 backdrop-blur-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 backdrop-blur-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Specular top-edge sheen, matching the site's glass tokens */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
    </div>
  )
}
