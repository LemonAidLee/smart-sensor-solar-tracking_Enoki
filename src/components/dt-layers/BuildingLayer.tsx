'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScenarioBar } from '@/components/twin3d/ui/ScenarioBar'
import { ControlDeck } from '@/components/twin3d/ui/ControlDeck'
import { ToolDock } from '@/components/twin3d/ui/ToolDock'
import { WorkspaceWindows } from '@/components/twin3d/ui/WorkspaceWindows'
import { VirtualEmbeddedPanel } from '@/components/embedded/VirtualEmbeddedPanel'
import { VECPanel } from '@/components/twin3d/ui/VECPanel'
import { CameraBar } from '@/components/twin3d/ui/CameraBar'
import { Timeline } from '@/components/twin3d/ui/Timeline'
import { usePlatformStore } from '@/lib/dt/platformStore'
import { WEATHER_VALIDATION_MODE } from '@/lib/engine/validationMode'


export function BuildingLayer() {
  const layer = usePlatformStore((s) => s.layer)
  const isActive = layer === 'BUILDING'

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          key="building-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          className="pointer-events-none absolute inset-0 z-10"
        >
          {/* Scenario bar (top-centre) — hidden in Weather Validation Mode so the
              environment stays deterministic. */}
          {!WEATHER_VALIDATION_MODE && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="pointer-events-auto absolute left-1/2 top-14 -translate-x-1/2"
            >
              <ScenarioBar />
            </motion.div>
          )}

          {/* Right Tool Dock — a compact, always-visible icon rail. Each icon
              toggles its engineering tool as an independent floating window, so
              no panel is permanently expanded and the building stays the hero. */}
          <ToolDock />

          {/* Floating engineering windows (Weather · Solar Geometry · Panel
              Kinematics · PBIF) — draggable, resizable, collapsible, persistent;
              each renders only while its dock icon is active. */}
          <WorkspaceWindows />

          {/* Virtual Embedded Controller — a subtle activation badge that expands
              on hover and opens the full controller on tap (Weather Validation
              Mode). Never permanently occupies screen space. */}
          {WEATHER_VALIDATION_MODE && <VirtualEmbeddedPanel />}

          {/* Full-twin embedded dashboard (non-validation mode only). */}
          {!WEATHER_VALIDATION_MODE && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="pointer-events-auto no-scrollbar absolute bottom-4 right-20 top-14 flex w-[300px] max-w-[88vw] flex-col gap-3 overflow-y-auto md:right-24"
            >
              <VECPanel />
            </motion.div>
          )}

          {/* Camera bar (bottom-right) */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="pointer-events-auto absolute bottom-4 right-4 md:right-6 md:bottom-6"
          >
            <CameraBar />
          </motion.div>

          {/* Control deck (bottom-left) */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="pointer-events-auto absolute bottom-4 left-4 md:left-6"
          >
            <ControlDeck />
          </motion.div>

          {/* Timeline (bottom-centre) */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2"
          >
            <Timeline />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
