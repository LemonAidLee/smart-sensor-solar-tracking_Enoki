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
        // Outer Shell — floats & lifts on hover
        "relative rounded-[2rem] p-[1px] overflow-hidden group",
        "bg-white/5 border border-white/10",
        "shadow-[0_20px_45px_-20px_rgba(0,0,0,0.65)]", // Diffusion shadow
        "transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
        "hover:-translate-y-1 hover:shadow-[0_35px_60px_-25px_rgba(0,0,0,0.75)]",
        className
      )}
      {...props}
    >
      {/* Animated glowing conic border on hover */}
      <div className="absolute inset-0 z-0 bg-[conic-gradient(from_0deg,transparent_0_320deg,rgba(0,208,132,0.35)_360deg)] animate-[spin_5s_linear_infinite] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

      {/* Inner Core — frosted glass */}
      <div
        className={cn(
          "relative z-10 h-full w-full rounded-[calc(2rem-1px)]",
          "bg-navy/70 backdrop-blur-2xl backdrop-saturate-150",
          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),inset_0_0_20px_rgba(255,255,255,0.02)]", // top highlight + internal depth
          "border border-white/5",
          "overflow-hidden p-6 md:p-8",
          innerClassName
        )}
      >
        {/* Specular top-edge sheen */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-60" />
        {/* Soft corner light bloom */}
        <div className="pointer-events-none absolute -top-24 -right-16 h-48 w-48 rounded-full bg-emerald/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        {children}
      </div>
    </div>
  )
}
