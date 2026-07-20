"use client"

import { Suspense, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Environment, PerspectiveCamera, ContactShadows } from "@react-three/drei"
import { EffectComposer, Bloom } from "@react-three/postprocessing"
import { WiringDiagram } from "@/components/3d/WiringDiagram"
import { Image as ImageIcon, Box } from "lucide-react"

export function InternalsScene() {
  const [viewMode, setViewMode] = useState<"3D" | "2D">("3D")

  return (
    <div className="w-full h-full relative">
      {/* Toggle Buttons */}
      <div className="absolute bottom-6 right-6 z-20 flex gap-2 bg-[#020617]/80 backdrop-blur-md p-1 rounded-lg border border-white/10">
        <button
          onClick={() => setViewMode("3D")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
            viewMode === "3D" ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          <Box className="w-4 h-4" /> 3D Model
        </button>
        <button
          onClick={() => setViewMode("2D")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
            viewMode === "2D" ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          <ImageIcon className="w-4 h-4" /> 2D Sketch
        </button>
      </div>

      {viewMode === "3D" ? (
        <div className="w-full h-full cursor-grab active:cursor-grabbing">
          <Canvas shadows>
            <PerspectiveCamera makeDefault position={[0, 16, 12]} fov={50} />
            <ambientLight intensity={0.4} />
            <spotLight position={[0, 10, 0]} intensity={1.5} color="#ffffff" castShadow />
            
            <Suspense fallback={null}>
              <Environment preset="night" />
              <WiringDiagram />
              <ContactShadows position={[0, -1, 0]} opacity={0.6} scale={25} blur={2.5} color="#000000" />
              
              <EffectComposer>
                <Bloom luminanceThreshold={1} mipmapBlur intensity={1.5} />
              </EffectComposer>
            </Suspense>
            
            <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2} minDistance={5} maxDistance={35} target={[0, 0, -0.5]} />
          </Canvas>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[#090909] p-8">
          <img 
            src="/wokwi-diagram.png" 
            alt="2D Wokwi Sketch" 
            className="w-full h-full object-contain drop-shadow-2xl opacity-90 rounded-xl"
          />
        </div>
      )}
    </div>
  )
}
