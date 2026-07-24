import { Navigation } from "@/components/layout/Navigation"
import { SmoothScroll } from "@/components/layout/SmoothScroll"
import { CustomCursor } from "@/components/ui/CustomCursor"
import { ArchitecturalEnvironment } from "@/components/sections/home/ArchitecturalEnvironment"
import { HeroImmersive } from "@/components/sections/home/HeroImmersive"
import { ProblemSolutionSequence } from "@/components/sections/home/ProblemSolutionSequence"
import { EngineeringDeepDive } from "@/components/sections/home/EngineeringDeepDive"
import { KinematicsAndWeather } from "@/components/sections/home/KinematicsAndWeather"
import { ProjectContext } from "@/components/sections/home/ProjectContext"
import { HomeBootstrapper } from "@/components/sections/home/HomeBootstrapper"

export default function Home() {
  return (
    <SmoothScroll>
      <CustomCursor />
      <HomeBootstrapper />

      <main className="min-h-screen text-white selection:bg-emerald/30 selection:text-emerald">
        
        {/* Global 3D Architectural Background */}
        <ArchitecturalEnvironment />

        <Navigation />
        
        {/* We need these sections to be relative and not block the background */}
        <div className="relative z-10 flex flex-col pointer-events-auto">
          <HeroImmersive />
          <ProblemSolutionSequence />
          <EngineeringDeepDive />
          <KinematicsAndWeather />
          <ProjectContext />
          
          <footer className="w-full py-12 border-t border-white/5 bg-transparent backdrop-blur-sm text-center text-gray-500 font-mono text-xs uppercase tracking-widest">
            PBIF © 2026. Designed for UM Innovation Competition.
          </footer>
        </div>

      </main>
    </SmoothScroll>
  )
}
