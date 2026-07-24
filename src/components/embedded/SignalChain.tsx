'use client'

import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import type { SignalStep } from '@/lib/embedded'

/**
 * SignalChain — renders a translation as a vertical arrow chain. Purely
 * presentational: it draws whatever `steps` it is given (from
 * `src/lib/embedded/sensors.ts` or `servo.ts`) and never computes a value
 * itself. Defaults suit the sensor Environment→ESP32 direction; the servo
 * Outputs chain (ESP32→Servo) overrides `startTag`/`endTag` to match its
 * reversed, output-side direction.
 *
 * Collapsed (default), each step shows only its label + value, matching the
 * "do not overwhelm the interface" requirement. A step that carries an
 * `equation`/`meaning`/`assumptions`/`reference` (see `SignalStep`) gets a
 * small info toggle revealing all four together — never shown unprompted.
 */
export function SignalChain({
  steps,
  startTag = 'ENVIRONMENT',
  endTag = 'ESP32-S3',
}: {
  steps: SignalStep[]
  startTag?: string
  endTag?: string
}) {
  return (
    <div className="space-y-1">
      <ChainTag label={startTag} tone="neutral" />
      {steps.map((step, i) => (
        <div key={step.label}>
          <div className="flex items-center justify-center py-0.5">
            <ChevronDown className="h-3 w-3 text-white/20" />
          </div>
          <StepRow step={step} />
          {i === steps.length - 1 && (
            <div className="flex items-center justify-center py-0.5">
              <ChevronDown className="h-3 w-3 text-white/20" />
            </div>
          )}
        </div>
      ))}
      <ChainTag label={endTag} tone="accent" />
    </div>
  )
}

function StepRow({ step }: { step: SignalStep }) {
  const [open, setOpen] = useState(false)
  const hasDetail = Boolean(step.equation || step.meaning || step.assumptions || step.reference)

  return (
    <div className="overflow-hidden rounded-lg bg-white/[0.03]">
      <button
        onClick={() => hasDetail && setOpen((o) => !o)}
        className={`flex w-full flex-col gap-1 px-2.5 py-1.5 text-left ${hasDetail ? 'hover:bg-white/[0.03]' : 'cursor-default'}`}
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-[10px] text-white/55">{step.label}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="font-mono text-[11px] font-semibold text-white/90 tabular-nums">{step.value}</span>
            {hasDetail && <Info className={`h-3 w-3 ${open ? 'text-electric' : 'text-white/25'}`} />}
          </span>
        </span>
        {step.source && (
          <span className="w-fit max-w-full truncate rounded bg-white/5 px-1 py-0.5 text-[7.5px] font-medium uppercase tracking-wide text-white/35">
            {step.source}
          </span>
        )}
      </button>
      {open && hasDetail && (
        <div className="space-y-1.5 border-t border-white/5 px-2.5 py-2 text-[9px] leading-relaxed">
          {step.equation && (
            <DetailRow label="Equation">
              <span className="font-mono text-electric">{step.equation}</span>
            </DetailRow>
          )}
          {step.meaning && (
            <DetailRow label="Meaning">
              <span className="text-white/65">{step.meaning}</span>
            </DetailRow>
          )}
          {step.assumptions && (
            <DetailRow label="Assumptions">
              <span className="text-white/65">{step.assumptions}</span>
            </DetailRow>
          )}
          {step.reference && (
            <DetailRow label="Reference">
              <span className="italic text-white/50">{step.reference}</span>
            </DetailRow>
          )}
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p>
      <span className="mr-1 font-semibold uppercase tracking-wide text-white/35">{label}:</span>
      {children}
    </p>
  )
}

function ChainTag({ label, tone }: { label: string; tone: 'neutral' | 'accent' }) {
  return (
    <div className="flex justify-center">
      <span
        className={`rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-widest ${
          tone === 'accent' ? 'bg-electric/15 text-electric' : 'bg-white/5 text-white/40'
        }`}
      >
        {label}
      </span>
    </div>
  )
}
