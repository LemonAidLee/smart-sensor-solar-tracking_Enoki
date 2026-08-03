"use client"

import { Navigation } from "@/components/layout/Navigation"
import { SmoothScroll } from "@/components/layout/SmoothScroll"
import { Footer } from "@/components/layout/Footer"
import { CustomCursor } from "@/components/ui/CustomCursor"
import { EngineeringHero } from "@/components/engineering/EngineeringHero"
import { SectionTitle } from "@/components/engineering/SectionTitle"
import { HardwareCard } from "@/components/engineering/HardwareCard"
import { ComingSoonCard } from "@/components/engineering/ComingSoonCard"
import { HARDWARE_MODELS } from "@/components/engineering/hardwareData"
import {
  CircuitBoard,
  Layers,
  MapPin,
  Cable,
  Zap,
  Radio,
  Cpu,
  Code2,
  Binary,
  SlidersHorizontal,
  GitBranch,
  Network,
  FlaskConical,
  History,
  FileText,
  Boxes,
  Ruler,
  ClipboardCheck,
  ListChecks,
} from "lucide-react"

const CIRCUIT_ITEMS = [
  { icon: CircuitBoard, title: "Circuit Schematics" },
  { icon: Layers, title: "PCB Layout" },
  { icon: MapPin, title: "Pin Mapping" },
  { icon: Cable, title: "Sensor Wiring" },
  { icon: Zap, title: "Power Distribution" },
  { icon: Radio, title: "Communication Bus" },
  { icon: Cpu, title: "Microcontroller" },
]

const PROGRAMMING_ITEMS = [
  { icon: Code2, title: "Firmware" },
  { icon: Cpu, title: "ESP32" },
  { icon: Binary, title: "Embedded Logic" },
  { icon: SlidersHorizontal, title: "Calibration" },
  { icon: GitBranch, title: "Control Algorithms" },
  { icon: Network, title: "Communication Protocols" },
  { icon: FlaskConical, title: "Testing" },
  { icon: History, title: "Version History" },
]

const ASSET_ITEMS = [
  { icon: FileText, title: "Documentation" },
  { icon: Boxes, title: "CAD Files" },
  { icon: Layers, title: "Simulation Assets" },
  { icon: Ruler, title: "Manufacturing Drawings" },
  { icon: ClipboardCheck, title: "Test Reports" },
  { icon: ListChecks, title: "Bill of Materials" },
]

export default function EngineeringPage() {
  return (
    <SmoothScroll>
      <CustomCursor />

      <main className="min-h-screen w-full bg-background text-white selection:bg-emerald/30 selection:text-emerald">
        <Navigation />

        <div className="relative z-10 flex flex-col">
          <EngineeringHero />

          {/* Section 1 — Hardware Designs */}
          <section id="hardware" className="w-full py-24 md:py-32">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
              <SectionTitle
                eyebrow="Section 01"
                title={<>Hardware <span className="text-white/40 italic">Designs.</span></>}
                description="Interactive 3D reference models of the physical hardware behind the Digital Twin — orbit, zoom, and inspect each assembly."
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10">
                {HARDWARE_MODELS.map((model, i) => (
                  <HardwareCard key={model.id} model={model} delay={i * 0.15} />
                ))}
              </div>
            </div>
          </section>

          {/* Section 2 — Circuit Documentation */}
          <section id="circuits" className="w-full bg-black/20 backdrop-blur-sm border-y border-white/5 py-24 md:py-32">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
              <SectionTitle
                eyebrow="Section 02"
                title={<>Circuit <span className="text-white/40 italic">Documentation.</span></>}
                description="Schematics, layouts, and wiring references for the electronics stack. Reserved for future publication."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {CIRCUIT_ITEMS.map((item, i) => (
                  <ComingSoonCard key={item.title} icon={item.icon} title={item.title} delay={i * 0.06} />
                ))}
              </div>
            </div>
          </section>

          {/* Section 3 — Programming */}
          <section id="programming" className="w-full py-24 md:py-32">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
              <SectionTitle
                eyebrow="Section 03"
                title={<>Programming <span className="text-white/40 italic">Resources.</span></>}
                description="Firmware, embedded logic, and control software driving the physical prototype. Reserved for future publication."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {PROGRAMMING_ITEMS.map((item, i) => (
                  <ComingSoonCard key={item.title} icon={item.icon} title={item.title} delay={i * 0.06} />
                ))}
              </div>
            </div>
          </section>

          {/* Section 4 — Project Assets */}
          <section id="assets" className="w-full bg-black/20 backdrop-blur-sm border-y border-white/5 py-24 md:py-32">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
              <SectionTitle
                eyebrow="Section 04"
                title={<>Project <span className="text-white/40 italic">Assets.</span></>}
                description="A future expandable archive of documentation, CAD files, and manufacturing records."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {ASSET_ITEMS.map((item, i) => (
                  <ComingSoonCard key={item.title} icon={item.icon} title={item.title} badge="Coming Soon" delay={i * 0.06} />
                ))}
              </div>
            </div>
          </section>

          <Footer />
        </div>
      </main>
    </SmoothScroll>
  )
}
