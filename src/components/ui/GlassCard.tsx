import { cn } from "@/lib/utils"
import { HTMLAttributes, ReactNode } from "react"

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  className?: string
  innerClassName?: string
}

export function GlassCard({ children, className, innerClassName, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        // Outer Shell
        "relative rounded-[2rem] p-[1px] overflow-hidden group",
        "bg-white/5 border border-white/10",
        "shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)]", // Diffusion shadow
        className
      )}
      {...props}
    >
      {/* Animated glowing border effect */}
      <div className="absolute inset-0 z-0 bg-[conic-gradient(from_0deg,transparent_0_340deg,rgba(0,208,132,0.3)_360deg)] animate-[spin_4s_linear_infinite] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      
      {/* Inner Core */}
      <div
        className={cn(
          "relative z-10 h-full w-full rounded-[calc(2rem-1px)]",
          "bg-navy/80 backdrop-blur-3xl",
          "shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]", // Stronger internal depth
          "border border-white/5",
          "overflow-hidden p-6 md:p-8",
          innerClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}
