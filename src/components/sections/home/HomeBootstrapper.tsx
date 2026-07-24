"use client"

import { useState, useEffect } from "react"
import { Preloader } from "@/components/layout/Preloader"

export function HomeBootstrapper() {
  const [isPreloading, setIsPreloading] = useState(true)

  useEffect(() => {
    // Lock body scroll while preloading
    if (isPreloading) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
  }, [isPreloading])

  return (
    <>
      {isPreloading && <Preloader onComplete={() => setIsPreloading(false)} />}
    </>
  )
}
