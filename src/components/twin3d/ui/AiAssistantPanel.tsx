'use client'

import { useState } from 'react'
import {
  MessageSquare,
  Search,
  Sparkles,
  BookOpen,
  ArrowRight,
  ShieldAlert,
  HelpCircle
} from 'lucide-react'
import { engineeringAssistant } from '@/lib/assistant'
import type { AssistantResponse } from '@/lib/assistant'
import { EngineeringKnowledgeBase } from '@/lib/knowledge'
import type { SubsystemId } from '@/lib/knowledge/types'

const SUGGESTED_QUESTIONS = [
  "What is the status of the Battery?",
  "Why is the Grid importing?",
  "How does Weather affect the PV Array?",
  "What happens if PBIF changes?"
]

export function AiAssistantBody() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<AssistantResponse | null>(null)
  const [selectedSubsystem, setSelectedSubsystem] = useState<SubsystemId | null>(null)

  const handleAsk = async (text: string) => {
    if (!text.trim()) return
    setLoading(true)
    setQuery(text)
    // Simulate slight network delay for UX even though it's synchronous
    setTimeout(async () => {
      const res = await engineeringAssistant.ask({ text })
      setResponse(res)
      setLoading(false)
      setSelectedSubsystem(null) // Reset knowledge view
    }, 300)
  }

  const handleSubsystemClick = (id: SubsystemId) => {
    setSelectedSubsystem(id === selectedSubsystem ? null : id)
  }

  const knowledge = selectedSubsystem ? EngineeringKnowledgeBase.getSubsystemById(selectedSubsystem) : null

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Input Section */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk(query)}
            placeholder="Ask an engineering question..."
            className="w-full bg-white/5 border border-white/10 rounded-md py-2 pl-3 pr-10 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50"
          />
          <button 
            onClick={() => handleAsk(query)}
            disabled={loading}
            className="absolute right-1 top-1 bottom-1 px-2 flex items-center justify-center text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Suggestions */}
        {!response && (
          <div className="flex flex-col gap-1 mt-2">
            <span className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Suggested</span>
            {SUGGESTED_QUESTIONS.map(q => (
              <button 
                key={q}
                onClick={() => handleAsk(q)}
                className="text-left text-emerald-300/80 hover:text-emerald-300 text-xs py-1 px-2 rounded hover:bg-white/5 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-emerald-500/80 py-4 justify-center">
          <Sparkles className="w-4 h-4 animate-pulse" />
          <span className="text-xs tracking-wider animate-pulse uppercase">Reasoning Engine Active...</span>
        </div>
      )}

      {/* Response Section */}
      {response && !loading && (
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-300 px-3 py-1.5 rounded-full border border-emerald-500/20 text-xs w-fit">
            <ShieldAlert className="w-3.5 h-3.5" />
            Provider: {response.provider}
            {typeof response.confidence === 'number' && (
              <span className="text-emerald-300/50">· {Math.round(response.confidence * 100)}% match confidence</span>
            )}
          </div>

          {response.error ? (
            <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-3 rounded-md">
              {response.error}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              
              {/* Reasoning Path / Related Subsystems */}
              {response.explanation?.relatedSubsystems && response.explanation.relatedSubsystems.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 p-2 bg-white/5 rounded-md border border-white/5">
                  <span className="text-[10px] uppercase tracking-wider text-white/40 w-full mb-1">Reasoning Path</span>
                  {response.explanation.relatedSubsystems.map((sub, i) => (
                    <div key={sub} className="flex items-center gap-1.5">
                      <button 
                        onClick={() => handleSubsystemClick(sub as SubsystemId)}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${selectedSubsystem === sub ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'}`}
                      >
                        {sub}
                      </button>
                      {i < response.explanation!.relatedSubsystems.length - 1 && (
                        <ArrowRight className="w-3 h-3 text-white/20" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* The Explanation */}
              <div className="flex flex-col gap-2">
                <h4 className="text-white font-medium">{response.explanation?.observation}</h4>
                <p className="text-emerald-100/80 leading-relaxed text-[13px]">{response.explanation?.engineeringReason}</p>
              </div>

              {/* Evidence */}
              {response.explanation?.evidence && Object.keys(response.explanation.evidence).length > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {Object.entries(response.explanation.evidence).map(([key, val]) => (
                    <div key={key} className="flex flex-col bg-black/20 p-2 rounded border border-white/5">
                      <span className="text-[10px] text-white/40 uppercase">{key}</span>
                      <span className="text-emerald-300 font-mono text-xs mt-0.5">{val}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Assumptions & Limitations */}
              {(response.explanation?.assumptions?.length || response.explanation?.limitations?.length) ? (
                <div className="flex flex-col gap-2 mt-2 pt-3 border-t border-white/10">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">Knowledge Boundaries</span>
                  {response.explanation?.assumptions.slice(0, 1).map((a, i) => (
                    <span key={i} className="text-xs text-white/50">• {a}</span>
                  ))}
                  {response.explanation?.limitations.slice(0, 1).map((l, i) => (
                    <span key={i} className="text-xs text-orange-200/50">• {l}</span>
                  ))}
                </div>
              ) : null}

              {/* Conclusion */}
              <div className="bg-emerald-500/10 border-l-2 border-emerald-500 p-2 mt-2">
                <span className="text-emerald-100/90 text-[13px]">{response.explanation?.conclusion}</span>
              </div>

            </div>
          )}

          {/* Subsystem Knowledge Inspector (Popup/Expand) */}
          {knowledge && (
            <div className="mt-4 bg-white/5 border border-white/10 rounded-md p-3 animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span className="font-medium text-emerald-100">{knowledge.name} Definition</span>
              </div>
              <p className="text-xs text-white/70 leading-relaxed mb-3">{knowledge.purpose}</p>
              <div className="flex flex-col gap-1 text-[11px] font-mono text-emerald-300/60">
                {knowledge.keyEquations.map((eq, i) => (
                  <span key={i}>{eq}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
