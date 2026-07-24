'use client'

import { Pause, Play, SkipBack, SkipForward, Radio } from 'lucide-react'
import { useVecStore } from '@/lib/vec/store'
import { useEdtStore } from '@/lib/edt/store'
import { PBIF_MODULES, STAGE_MAP } from '@/lib/edt/circuit'
import type { ExecutionTrace, VarGroup } from '@/lib/vec/types'

const GROUP_COLOR: Record<VarGroup, string> = {
  sensor: '#38BDF8',
  environment: '#a78bfa',
  decision: '#00D084',
  actuator: '#f97316',
  comm: '#22d3ee',
  timing: '#fbbf24',
}
const SPEEDS = [0.25, 0.5, 1, 2, 4]

export function ExecutionDebugger() {
  const trace = useVecStore((s) => s.trace)
  const history = useVecStore((s) => s.traceHistory)
  const stageIndex = useEdtStore((s) => s.stageIndex)
  const playing = useEdtStore((s) => s.playing)
  const speed = useEdtStore((s) => s.speed)
  const replayIndex = useEdtStore((s) => s.replayIndex)
  const setPlaying = useEdtStore((s) => s.setPlaying)
  const setSpeed = useEdtStore((s) => s.setSpeed)
  const stepStage = useEdtStore((s) => s.stepStage)
  const setStageIndex = useEdtStore((s) => s.setStageIndex)
  const setReplayIndex = useEdtStore((s) => s.setReplayIndex)

  const shown: ExecutionTrace | null = replayIndex != null ? history[replayIndex] ?? trace : trace
  if (!shown) return <div className="p-4 text-xs text-white/40">Awaiting firmware trace…</div>

  const idx = Math.min(stageIndex, shown.stages.length - 1)
  const stage = shown.stages[idx]
  const activeModule = STAGE_MAP[stage.id].pbif

  return (
    <div className="flex h-full flex-col text-white/80">
      {/* Transport controls */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="mr-1 font-mono text-[11px] font-bold text-electric">Loop #{shown.loop}</span>
        <button onClick={() => stepStage(-1)} className="rounded p-1 hover:bg-white/10" title="Step back">
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setPlaying(!playing)} className="rounded p-1 hover:bg-white/10" title={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => stepStage(1)} className="rounded p-1 hover:bg-white/10" title="Step forward">
          <SkipForward className="h-3.5 w-3.5" />
        </button>
        <div className="ml-1 flex items-center gap-0.5 rounded-full bg-white/5 p-0.5">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              onClick={() => setSpeed(sp)}
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${speed === sp ? 'bg-white/90 text-black' : 'text-white/50 hover:text-white'}`}
            >
              {sp}×
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 text-[10px]">
          {replayIndex == null ? (
            <span className="inline-flex items-center gap-1 text-emerald">
              <Radio className="h-3 w-3" /> LIVE
            </span>
          ) : (
            <button onClick={() => setReplayIndex(null)} className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-300">
              REPLAY → go live
            </button>
          )}
        </div>
      </div>

      {/* Replay scrubber */}
      {history.length > 1 && (
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5">
          <span className="text-[9px] uppercase tracking-wider text-white/40">Replay</span>
          <input
            type="range"
            min={0}
            max={history.length - 1}
            value={replayIndex ?? history.length - 1}
            onChange={(e) => {
              const v = Number(e.target.value)
              setReplayIndex(v === history.length - 1 ? null : v)
              setPlaying(false)
            }}
            className="wx-range flex-1"
          />
        </div>
      )}

      {/* PBIF module sync strip */}
      <div className="flex flex-wrap gap-1 border-b border-white/10 px-3 py-2">
        {PBIF_MODULES.map((m) => (
          <span
            key={m}
            className={`rounded px-1.5 py-0.5 text-[8.5px] font-semibold transition-colors ${
              m === activeModule ? 'bg-electric text-black' : 'bg-white/5 text-white/40'
            }`}
          >
            {m}
          </span>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2">
        {/* Pipeline */}
        <div className="min-h-0 overflow-y-auto border-r border-white/10 p-2">
          <p className="mb-1 px-1 text-[9px] uppercase tracking-wider text-white/40">Firmware execution pipeline</p>
          {shown.stages.map((s, i) => {
            const cur = i === idx
            const done = i < idx
            return (
              <button
                key={s.id}
                onClick={() => setStageIndex(i)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[10px] transition-colors ${
                  cur ? 'bg-electric/20 text-white' : done ? 'text-white/35' : 'text-white/60 hover:bg-white/5'
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cur ? 'bg-electric' : done ? 'bg-white/25' : 'bg-white/40'}`} />
                <span className="flex-1 truncate">{s.label}</span>
                <span className="font-mono text-[8.5px] text-white/35">{fmtUs(s.durationUs)}</span>
              </button>
            )
          })}
        </div>

        {/* Right column: current step + variables + decision + timing */}
        <div className="min-h-0 overflow-y-auto p-2 text-[10px]">
          {/* Current function */}
          <Section title="Function trace">
            <div className="rounded-lg bg-white/[0.03] p-2">
              <p className="font-mono text-[11px] font-bold text-electric">{stage.fn}</p>
              <p className="mt-0.5 text-white/55">{stage.description}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1 font-mono text-[9px]">
                <KV k="in" v={stage.inputs.join(', ') || '—'} />
                <KV k="out" v={stage.outputs.join(', ') || '—'} />
                <KV k="t_exec" v={fmtUs(stage.durationUs)} />
                {stage.note && <KV k="note" v={stage.note} warn />}
              </div>
            </div>
          </Section>

          {/* Decision breakdown */}
          <Section title="Decision breakdown">
            <div className="space-y-1 rounded-lg bg-white/[0.03] p-2">
              <KV k="objective" v={shown.decision.buildingObjective} accent />
              <KV k="surface" v={shown.decision.surfaceStrategy} />
              <KV k="panel" v={shown.decision.panelStrategy} />
              <p className="text-white/55">{shown.decision.reason}</p>
              <div className="flex items-center gap-2">
                <span className="text-white/40">confidence</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald" style={{ width: `${Math.round(shown.decision.confidence * 100)}%` }} />
                </div>
                <span className="font-mono text-emerald">{Math.round(shown.decision.confidence * 100)}%</span>
              </div>
              {shown.decision.alternatives.length > 0 && (
                <div className="pt-1">
                  <p className="text-[9px] uppercase tracking-wider text-white/35">Rejected</p>
                  {shown.decision.alternatives.map((a) => (
                    <p key={a.label} className="text-white/45">
                      <span className="text-white/65">{a.label}</span> — {a.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* Variable monitor */}
          <Section title="Internal variables">
            <div className="grid grid-cols-2 gap-1">
              {shown.variables.map((v) => (
                <div key={v.name} className="rounded bg-white/[0.03] px-1.5 py-1">
                  <p className="flex items-center gap-1 truncate font-mono text-[8.5px] text-white/45">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: GROUP_COLOR[v.group] }} />
                    {v.name}
                  </p>
                  <p className="truncate font-mono text-[10px] font-semibold text-white/90">
                    {String(v.value)}
                    {v.unit ? ` ${v.unit}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          {/* Timing */}
          <Section title="Timing analysis">
            <div className="grid grid-cols-3 gap-1 font-mono text-[9px]">
              <Stat k="loop" v={`${shown.timing.loopFreqHz} Hz`} />
              <Stat k="compute" v={fmtUs(shown.timing.computeUs)} />
              <Stat k="sensor" v={fmtUs(shown.timing.sensorUs)} />
              <Stat k="decision" v={fmtUs(shown.timing.decisionUs)} />
              <Stat k="pwm" v={fmtUs(shown.timing.pwmUs)} />
              <Stat k="mqtt" v={shown.timing.mqttUs ? fmtUs(shown.timing.mqttUs) : '—'} />
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="mb-1 px-1 text-[9px] uppercase tracking-wider text-white/40">{title}</p>
      {children}
    </div>
  )
}
function KV({ k, v, accent, warn }: { k: string; v: string; accent?: boolean; warn?: boolean }) {
  return (
    <p className="truncate">
      <span className="text-white/40">{k}:</span>{' '}
      <span className={warn ? 'text-amber-300' : accent ? 'font-semibold text-emerald' : 'text-white/80'}>{v}</span>
    </p>
  )
}
function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded bg-white/[0.03] px-1.5 py-1">
      <p className="text-[8px] uppercase text-white/40">{k}</p>
      <p className="font-semibold text-white/85">{v}</p>
    </div>
  )
}
function fmtUs(us: number): string {
  if (us >= 1000) return `${(us / 1000).toFixed(us >= 10000 ? 0 : 1)} ms`
  return `${us} µs`
}
