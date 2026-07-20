import { FileText, FlaskConical, Presentation, Mail } from "lucide-react"
import { Github } from "@/components/ui/Icons"

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="w-full bg-transparent py-12 md:py-20 relative overflow-hidden">
      {/* Subtle Grid */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_40%,transparent_100%)]" />
      
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_bottom_center,rgba(0,208,132,0.05),transparent_70%)]" />
      
      <div className="mx-auto w-full max-w-7xl px-4 md:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          
          {/* Brand */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-full bg-emerald shadow-[0_0_15px_rgba(0,208,132,0.5)]" />
              <span className="font-sans font-bold tracking-tight text-white text-xl">SOLIS AI</span>
            </div>
            <p className="text-gray-400 max-w-sm leading-relaxed">
              Intelligent Responsive Façade Powered by Smart Sensor Fusion. 
              Reducing HVAC loads and maximizing natural daylight through autonomous kinetic architecture.
            </p>
          </div>

          {/* Resources Links */}
          <div className="flex flex-col gap-4">
            <h4 className="text-white font-medium mb-2 tracking-tight">Resources</h4>
            <a href="#" className="flex items-center gap-2 text-sm text-gray-400 hover:text-emerald transition-colors">
              <FileText className="w-4 h-4" /> Documentation
            </a>
            <a href="#" className="flex items-center gap-2 text-sm text-gray-400 hover:text-emerald transition-colors">
              <FlaskConical className="w-4 h-4" /> Research Paper
            </a>
            <a href="#" className="flex items-center gap-2 text-sm text-gray-400 hover:text-emerald transition-colors">
              <Presentation className="w-4 h-4" /> Presentation
            </a>
          </div>

          {/* Connect Links */}
          <div className="flex flex-col gap-4">
            <h4 className="text-white font-medium mb-2 tracking-tight">Connect</h4>
            <a href="#" className="flex items-center gap-2 text-sm text-gray-400 hover:text-electric transition-colors">
              <Github className="w-4 h-4" /> GitHub Repository
            </a>
            <a href="#" className="flex items-center gap-2 text-sm text-gray-400 hover:text-electric transition-colors">
              <Mail className="w-4 h-4" /> Contact Team
            </a>
          </div>
        </div>

        <div className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            &copy; {currentYear} SOLIS AI Team. Engineering Case Competition Submission.
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Designed with precision</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
          </div>
        </div>
      </div>
    </footer>
  )
}
