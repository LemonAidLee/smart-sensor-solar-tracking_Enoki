"use client"

import { useRef, ReactNode } from "react"
import { motion, useInView } from "framer-motion"
import { cn } from "@/lib/utils"

interface SectionTitleProps {
  eyebrow: string
  title: ReactNode
  description?: string
  align?: "left" | "center"
  className?: string
}

export function SectionTitle({ eyebrow, title, description, align = "left", className }: SectionTitleProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-10%" })

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col mb-16 md:mb-20",
        align === "center" ? "items-center text-center" : "items-start text-left",
        className
      )}
    >
      <motion.span
        initial={{ opacity: 0, y: 12 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
        className="text-emerald font-mono text-sm tracking-[0.3em] uppercase block mb-6"
      >
        {eyebrow}
      </motion.span>

      <div className="overflow-hidden">
        <motion.h2
          initial={{ y: "110%", opacity: 0 }}
          animate={isInView ? { y: 0, opacity: 1 } : { y: "110%", opacity: 0 }}
          transition={{ duration: 1, ease: [0.76, 0, 0.24, 1], delay: 0.1 }}
          className="text-4xl md:text-6xl font-sans tracking-tight leading-[1.05] text-white"
        >
          {title}
        </motion.h2>
      </div>

      {description && (
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1], delay: 0.25 }}
          className={cn(
            "text-lg text-gray-400 font-light leading-relaxed mt-6",
            align === "center" ? "max-w-2xl" : "max-w-xl"
          )}
        >
          {description}
        </motion.p>
      )}
    </div>
  )
}
