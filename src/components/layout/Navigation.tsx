"use client"

import { useState, useEffect } from "react"
import { motion, useScroll, useMotionValueEvent } from "framer-motion"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { name: "Home", href: "/#home" },
  { name: "Problem", href: "/#problem" },
  { name: "Solution", href: "/#solution" },
  { name: "Technology", href: "/#technology" },
  { name: "AI Brain", href: "/#ai-brain" },
  { name: "Simulation", href: "/simulation" },
  { name: "Digital Twin", href: "/digital-twin" },
  { name: "Internals", href: "/internals" },
  { name: "Impact", href: "/#impact" },
  { name: "Prototype", href: "/#prototype" },
  { name: "Team", href: "/#team" },
]

export function Navigation() {
  const { scrollY } = useScroll()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 50)
  })

  return (
    <>
      <motion.header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 flex items-center justify-center pt-6 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isScrolled ? "pt-4" : ""
        )}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <div
          className={cn(
            "relative flex items-center justify-between rounded-full px-6 py-3 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] w-[95%] max-w-7xl border",
            isScrolled
              ? "bg-navy/50 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.65)] border-white/10"
              : "bg-transparent border-transparent"
          )}
        >
          {/* Specular top-edge sheen (only visible once the glass pill appears) */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent transition-opacity duration-700",
              isScrolled ? "opacity-100" : "opacity-0"
            )}
          />
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0 pr-4">
            <div className="h-6 w-6 rounded-full bg-emerald shadow-[0_0_15px_rgba(0,208,132,0.5)] shrink-0" />
            <span className="font-sans font-bold tracking-tight text-white text-lg whitespace-nowrap">SOLIS AI</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-4 xl:gap-8 overflow-x-auto custom-scrollbar no-scrollbar">
            {NAV_LINKS.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="group relative text-sm font-medium text-white/70 hover:text-white transition-colors duration-300 whitespace-nowrap py-1"
              >
                {link.name}
                {/* Animated underline sweep */}
                <span className="pointer-events-none absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-gradient-to-r from-emerald to-electric transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100" />
              </a>
            ))}
          </nav>

          {/* Mobile Toggle */}
          <button
            className="lg:hidden relative z-50 flex h-8 w-8 flex-col items-center justify-center gap-1.5"
            onClick={() => setIsOpen(!isOpen)}
          >
            <motion.span
              animate={isOpen ? { rotate: 45, y: 8 } : { rotate: 0, y: 0 }}
              className="h-0.5 w-6 bg-white block transition-all"
            />
            <motion.span
              animate={isOpen ? { opacity: 0 } : { opacity: 1 }}
              className="h-0.5 w-6 bg-white block transition-all"
            />
            <motion.span
              animate={isOpen ? { rotate: -45, y: -8 } : { rotate: 0, y: 0 }}
              className="h-0.5 w-6 bg-white block transition-all"
            />
          </button>
        </div>
      </motion.header>

      {/* Mobile Menu Overlay */}
      <motion.div
        initial={false}
        animate={isOpen ? { opacity: 1, pointerEvents: "auto" } : { opacity: 0, pointerEvents: "none" }}
        className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-background/95 backdrop-blur-3xl"
      >
        <nav className="flex flex-col items-center gap-8">
          {NAV_LINKS.map((link, i) => (
            <motion.a
              key={link.name}
              href={link.href}
              initial={{ y: 20, opacity: 0 }}
              animate={isOpen ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
              transition={{ delay: isOpen ? 0.1 * i : 0 }}
              onClick={() => setIsOpen(false)}
              className="text-3xl font-bold tracking-tighter text-white"
            >
              {link.name}
            </motion.a>
          ))}
        </nav>
      </motion.div>
    </>
  )
}
