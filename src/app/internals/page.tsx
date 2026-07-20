import { Navigation } from "@/components/layout/Navigation"
import { CodeViewer } from "@/components/ui/CodeViewer"
import { InternalsScene } from "@/components/3d/InternalsScene"
import { sketchCode } from "@/lib/sketchCode"

export default function InternalsPage() {
  const code = sketchCode;

  return (
    <main className="relative min-h-screen bg-[#090909] overflow-hidden pt-28 px-4 lg:px-8 pb-8">
      <Navigation />
      
      <div className="w-full flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
        
        {/* Left Side: 3D Circuit Board */}
        <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 overflow-hidden relative shadow-2xl">
          <div className="absolute top-6 left-6 z-10 pointer-events-none">
            <h2 className="text-3xl font-bold text-white tracking-tight mb-1">
              Circuit <span className="text-[#00D084]">Topology</span>
            </h2>
            <p className="text-gray-400 text-sm max-w-sm">
              Interactive 3D representation of the Wokwi E&M wiring schema. ESP32 microcontroller with sensor fusion arrays.
            </p>
          </div>
          
          <InternalsScene />
        </div>

        {/* Right Side: Code Viewer */}
        <div className="w-full lg:w-[600px] xl:w-[800px] 2xl:w-[1000px] h-full shrink-0">
          <CodeViewer code={code} />
        </div>

      </div>
    </main>
  )
}
