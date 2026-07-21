"use client"

import { useRef, useState } from "react"
import { motion, HTMLMotionProps, useMotionValue, useSpring, useTransform } from "framer-motion"
import { cn } from "@/lib/utils"

interface MagneticButtonProps extends HTMLMotionProps<"button"> {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "outline"
  className?: string
  icon?: React.ReactNode
}

export function MagneticButton({
  children,
  variant = "primary",
  className,
  icon,
  ...props
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  // Motion values for the magnetic pull
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // Smooth springs for the movement
  const springConfig = { stiffness: 150, damping: 15, mass: 0.1 }
  const springX = useSpring(x, springConfig)
  const springY = useSpring(y, springConfig)

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!ref.current) return
    const { left, top, width, height } = ref.current.getBoundingClientRect()
    const centerX = left + width / 2
    const centerY = top + height / 2
    
    // Calculate distance from center (max pull is 20% of width/height)
    x.set((e.clientX - centerX) * 0.2)
    y.set((e.clientY - centerY) * 0.2)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    x.set(0)
    y.set(0)
  }

  const baseStyles = "relative inline-flex items-center justify-center overflow-hidden rounded-full px-6 py-3 font-medium transition-[background-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"

  const variants = {
    primary: "bg-emerald text-navy hover:bg-emerald/90 shadow-[0_8px_30px_-8px_rgba(0,208,132,0.7)] hover:shadow-[0_10px_40px_-6px_rgba(0,208,132,0.85)]",
    secondary: "bg-electric text-navy hover:bg-electric/90 shadow-[0_8px_30px_-8px_rgba(56,189,248,0.7)] hover:shadow-[0_10px_40px_-6px_rgba(56,189,248,0.85)]",
    outline: "border border-white/15 bg-white/5 backdrop-blur-xl backdrop-saturate-150 hover:bg-white/10 hover:border-white/25 text-white"
  }

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{ x: springX, y: springY }}
      className={cn(baseStyles, variants[variant], "group", className)}
      {...props}
    >
      {/* Glass sheen sweep on hover */}
      <span className="pointer-events-none absolute inset-0 z-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-full" />
      <span className="relative z-10 flex items-center gap-2">
        {children}
        {icon && (
          <motion.span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/10 dark:bg-white/10"
            animate={{
              x: isHovered ? 4 : 0,
              y: isHovered ? -1 : 0,
              scale: isHovered ? 1.05 : 1
            }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            {icon}
          </motion.span>
        )}
      </span>
    </motion.button>
  )
}
