import { Navigation } from "@/components/layout/Navigation"
import { ScrollProgress } from "@/components/layout/ScrollProgress"
import { Footer } from "@/components/layout/Footer"
import { HeroSection } from "@/components/sections/HeroSection"
import { ProblemSection } from "@/components/sections/ProblemSection"
import { SolutionSection } from "@/components/sections/SolutionSection"
import { SensorFusionSection } from "@/components/sections/SensorFusionSection"
import { BrainSection } from "@/components/sections/BrainSection"
import { DashboardSection } from "@/components/sections/DashboardSection"
import { WeatherIntelligenceSection } from "@/components/sections/WeatherIntelligenceSection"
import { DecisionsSection } from "@/components/sections/DecisionsSection"
import { TechStackSection } from "@/components/sections/TechStackSection"
import { ImpactSection } from "@/components/sections/ImpactSection"
import { PrototypeSection } from "@/components/sections/PrototypeSection"
import { ComponentsSection } from "@/components/sections/ComponentsSection"
import { RoadmapSection } from "@/components/sections/RoadmapSection"
import { TeamSection } from "@/components/sections/TeamSection"

import { GlobalBackground } from "@/components/3d/GlobalBackground"

export default function Home() {
  return (
    <main className="min-h-[100dvh] w-full selection:bg-emerald/30 selection:text-white relative">
      <GlobalBackground />
      <ScrollProgress />
      <Navigation />
      
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <SensorFusionSection />
      <BrainSection />
      <DashboardSection />
      <WeatherIntelligenceSection />
      <DecisionsSection />
      <TechStackSection />
      <ImpactSection />
      <PrototypeSection />
      <ComponentsSection />
      <RoadmapSection />
      <TeamSection />
      
      <Footer />
    </main>
  )
}
