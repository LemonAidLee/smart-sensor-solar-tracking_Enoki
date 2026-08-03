"use client"

import { useState, useRef, useEffect } from "react"
import { motion, useScroll, useMotionValueEvent, useMotionValue, useSpring, useTransform, AnimatePresence, LayoutGroup } from "framer-motion"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { name: "Home", href: "/" },
  { name: "Digital Twin", href: "/digital-twin" },
  { name: "Engineering Lab", href: "/engineering" },
]

// Precision spring for all navigation motions (simulating physical weight/inertia)
const springConfig = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
  mass: 1,
}

export function Navigation() {
  const pathname = usePathname()
  const { scrollY } = useScroll()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  // Mouse tracking for dynamic lighting & parallax
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const containerRef = useRef<HTMLDivElement>(null)

  function handleMouseMove(e: React.MouseEvent) {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }

  function handleMouseLeave() {
    // Reset light to center when mouse leaves
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      mouseX.set(rect.width / 2)
      mouseY.set(rect.height / 2)
    }
  }

  // Smooth mouse coordinates for parallax & lighting
  const smoothMouseX = useSpring(mouseX, { stiffness: 100, damping: 20 })
  const smoothMouseY = useSpring(mouseY, { stiffness: 100, damping: 20 })

  // Micro-parallax calculations (max ~2px movement to keep it subconscious)
  const parallaxX = useTransform(smoothMouseX, [0, 800], [-1.5, 1.5])
  const parallaxY = useTransform(smoothMouseY, [0, 60], [-1.5, 1.5])
  
  // Inverse parallax for the glass itself
  const glassParallaxX = useTransform(smoothMouseX, [0, 800], [0.5, -0.5])
  const glassParallaxY = useTransform(smoothMouseY, [0, 60], [0.5, -0.5])

  // Radial gradient for specular lighting / internal reflection
  const background = useTransform(
    [smoothMouseX, smoothMouseY],
    ([x, y]) => `radial-gradient(350px circle at ${x}px ${y}px, rgba(255,255,255,0.06), transparent 40%)`
  )

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 50)
  })

  // Close mobile menu on route change
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  return (
    <>
      <LayoutGroup>
        <motion.header
          className={cn(
            "fixed top-0 left-0 right-0 z-50 flex items-center justify-center pt-6 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]",
            isScrolled ? "pt-4" : ""
          )}
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          {/* Main Navigation Glass Pill */}
          <motion.div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ x: glassParallaxX, y: glassParallaxY }}
            className={cn(
              "relative flex items-center justify-between rounded-full px-5 py-2.5 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] w-[95%] max-w-5xl",
              isScrolled
                ? "bg-[#002B1F]/[0.15] backdrop-blur-[24px] backdrop-saturate-150 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.1),inset_0_-1px_1px_rgba(0,0,0,0.3)] border border-white/10"
                : "bg-transparent border border-transparent shadow-[inset_0_0_0_rgba(255,255,255,0)]"
            )}
          >
            {/* Dynamic Specular Lighting Layer */}
            <motion.div
              className={cn(
                "pointer-events-none absolute inset-0 rounded-full mix-blend-overlay transition-opacity duration-700",
                isScrolled ? "opacity-100" : "opacity-0"
              )}
              style={{ background }}
            />

            {/* Specular top-edge sheen */}
            <div
              className={cn(
                "pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-opacity duration-700",
                isScrolled ? "opacity-100" : "opacity-0"
              )}
            />

            {/* Logo Group */}
            <motion.div 
              style={{ x: parallaxX, y: parallaxY }}
              className="flex items-center gap-3 shrink-0 pr-4 pl-1"
            >
              {/* Breathing Status Indicator */}
              <motion.div
                animate={{
                  opacity: [0.5, 1, 0.5],
                  scale: [0.95, 1, 0.95],
                  boxShadow: [
                    "0 0 10px rgba(0,208,132,0.2)",
                    "0 0 20px rgba(0,208,132,0.5)",
                    "0 0 10px rgba(0,208,132,0.2)",
                  ]
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="h-[18px] w-[18px] rounded-full bg-emerald shrink-0" 
              />
              <span className="font-sans font-bold tracking-tight text-white/95 text-[15px] whitespace-nowrap drop-shadow-md">
                SOLIS AI
              </span>
            </motion.div>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1 overflow-hidden relative rounded-full">
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href || (pathname.startsWith(link.href) && link.href !== "/")

                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    className="relative px-5 py-2 group outline-none"
                  >
                    {/* Active Sliding Capsule */}
                    {isActive && (
                      <motion.div
                        layoutId="navCapsule"
                        className="absolute inset-0 bg-white/[0.08] border border-white/[0.1] rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                        transition={springConfig}
                      />
                    )}
                    
                    {/* Magnetic/Parallax Link Text */}
                    <motion.span 
                      style={{ x: parallaxX, y: parallaxY }}
                      className={cn(
                        "relative block text-[13px] font-medium tracking-wide transition-all duration-300",
                        isActive ? "text-white" : "text-white/60 group-hover:text-white/90 group-hover:tracking-[0.02em]"
                      )}
                    >
                      {link.name}
                    </motion.span>
                  </Link>
                )
              })}
            </nav>

            {/* Engineering Metadata */}
            <motion.div 
              style={{ x: parallaxX, y: parallaxY }}
              className="hidden lg:flex items-center gap-3 shrink-0 pl-4 border-l border-white/10"
            >
              <div className="flex flex-col items-end opacity-80">
                <span className="text-[9px] font-mono font-medium text-white/40 tracking-[0.2em] leading-tight">BUILDING OS</span>
                <span className="text-[8px] font-mono font-semibold text-emerald-400 tracking-wider leading-tight">SYS. ONLINE</span>
              </div>
            </motion.div>

            {/* Mobile Toggle */}
            <button
              className="lg:hidden relative z-50 flex h-8 w-8 flex-col items-center justify-center gap-[5px]"
              onClick={() => setIsOpen(!isOpen)}
            >
              <motion.span
                animate={isOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
                transition={springConfig}
                className="h-[2px] w-5 bg-white block rounded-full"
              />
              <motion.span
                animate={isOpen ? { opacity: 0 } : { opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="h-[2px] w-5 bg-white block rounded-full"
              />
              <motion.span
                animate={isOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
                transition={springConfig}
                className="h-[2px] w-5 bg-white block rounded-full"
              />
            </button>
          </motion.div>
        </motion.header>
      </LayoutGroup>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(24px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#00140F]/80"
          >
            <nav className="flex flex-col items-center gap-6">
              {NAV_LINKS.map((link, i) => {
                const isActive = pathname === link.href || (pathname.startsWith(link.href) && link.href !== "/")
                return (
                  <motion.div
                    key={link.name}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 10, opacity: 0 }}
                    transition={{ ...springConfig, delay: 0.1 + i * 0.05 }}
                  >
                    <Link
                      href={link.href}
                      className={cn(
                        "text-2xl font-semibold tracking-tight transition-colors",
                        isActive ? "text-emerald-400" : "text-white"
                      )}
                    >
                      {link.name}
                    </Link>
                  </motion.div>
                )
              })}
            </nav>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="absolute bottom-12 flex flex-col items-center opacity-80"
            >
                <span className="text-[10px] font-mono text-white/40 tracking-[0.2em]">BUILDING OS</span>
                <span className="text-[10px] font-mono text-emerald-400/70 tracking-wider">ONLINE</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
