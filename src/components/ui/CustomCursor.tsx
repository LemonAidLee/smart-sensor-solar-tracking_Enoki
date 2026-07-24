"use client"

import { useEffect, useState } from "react"
import { motion, useMotionValue, useSpring } from "framer-motion"

export function CustomCursor() {
  const [isHovered, setIsHovered] = useState(false)
  const [cursorText, setCursorText] = useState("")

  const cursorX = useMotionValue(-100)
  const cursorY = useMotionValue(-100)
  
  // Heavier, more deliberate spring physics for a premium cinematic feel
  const springConfig = { damping: 30, stiffness: 200, mass: 1.2 }
  const cursorXSpring = useSpring(cursorX, springConfig)
  const cursorYSpring = useSpring(cursorY, springConfig)

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX)
      cursorY.set(e.clientY)
    }

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Find closest interactive element
      const interactive = target.closest('a, button, [data-cursor]')
      
      if (interactive) {
        setIsHovered(true)
        const text = interactive.getAttribute('data-cursor')
        if (text) setCursorText(text)
        else setCursorText("")
      } else {
        setIsHovered(false)
        setCursorText("")
      }
    }

    window.addEventListener("mousemove", moveCursor)
    window.addEventListener("mouseover", handleMouseOver)

    return () => {
      window.removeEventListener("mousemove", moveCursor)
      window.removeEventListener("mouseover", handleMouseOver)
    }
  }, [cursorX, cursorY])

  // Hide default cursor globally on mount
  useEffect(() => {
    document.body.style.cursor = 'none'
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [])

  return (
    <motion.div
      className="fixed top-0 left-0 z-[9999] pointer-events-none flex items-center justify-center rounded-full mix-blend-difference bg-white text-black"
      style={{
        x: cursorXSpring,
        y: cursorYSpring,
        // Center the cursor
        translateX: "-50%",
        translateY: "-50%",
      }}
      animate={{
        width: isHovered ? 90 : 12,
        height: isHovered ? 90 : 12,
        opacity: 1
      }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <motion.span 
        className="text-[10px] font-mono tracking-[0.2em] font-bold uppercase whitespace-nowrap"
        animate={{ opacity: isHovered && cursorText ? 1 : 0, scale: isHovered ? 1 : 0.8 }}
        transition={{ duration: 0.3, ease: [0.76, 0, 0.24, 1] }}
      >
        {cursorText}
      </motion.span>
    </motion.div>
  )
}
