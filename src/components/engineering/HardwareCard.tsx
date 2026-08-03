"use client"

import { useRef } from "react"
import { motion, useInView } from "framer-motion"
import { GlassCard } from "@/components/ui/GlassCard"
import { ModelViewer } from "./ModelViewer"
import type { HardwareModel } from "./hardwareData"

interface HardwareCardProps {
  model: HardwareModel
  delay?: number
}

export function HardwareCard({ model, delay = 0 }: HardwareCardProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-10%" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 1, ease: [0.76, 0, 0.24, 1], delay }}
    >
      <GlassCard innerClassName="p-4 md:p-6" className="rounded-[1.5rem]">
        <ModelViewer src={model.modelSrc} />

        <div className="mt-6 flex flex-col gap-4">
          <div>
            <h3 className="text-2xl font-medium tracking-tight text-white">{model.name}</h3>
            <p className="mt-2 text-gray-400 font-light leading-relaxed">{model.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/10 pt-4">
            <Field label="Development Status" value={model.developmentStatus} />
            <Field label="Designer" value={model.designer} />
            <Field label="Revision" value={model.revision} />
            <Field label="File Format" value={model.fileFormat} />
            <Field label="Interactive Notes" value={model.interactiveNotes} className="col-span-2" />
          </div>
        </div>
      </GlassCard>
    </motion.div>
  )
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  const isPending = value === "To be documented"
  return (
    <div className={className}>
      <span className="block text-[10px] uppercase tracking-[0.2em] font-mono text-gray-500 mb-1">{label}</span>
      <span className={isPending ? "text-white/30 italic text-sm" : "text-white/85 text-sm"}>{value}</span>
    </div>
  )
}
