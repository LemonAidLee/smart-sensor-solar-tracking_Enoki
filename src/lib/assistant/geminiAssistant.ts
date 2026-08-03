import { GoogleGenAI, Type } from '@google/genai'
import type { AssistantProvider, AssistantQuery, AssistantResponse } from './assistantProvider'
import { deterministicAssistant } from './deterministicAssistant'
import { resolveIntent } from './intentRegistry'
import { engineeringReasoning } from './reasoningEngine'
import { promptBuilder } from './promptBuilder'
import type { StructuredExplanation } from './reasoningTypes'
import type { SubsystemId } from '../knowledge/types'

/** Shape Gemini is asked to fill. `clarification` is the ONLY channel through
 *  which the model may ask the user to specify a subsystem — see req. #3: the
 *  deterministic matcher's own low confidence must never trigger that prompt
 *  directly, only Gemini's own judgement over the full context bundle may. */
interface GeminiStructuredResponse {
  clarification: string | null
  observation: string
  evidence: Record<string, string>
  engineeringReason: string
  relatedSubsystems: string[]
  assumptions: string[]
  limitations: string[]
  conclusion: string
}

export class GeminiAssistantProvider implements AssistantProvider {
  private ai: GoogleGenAI | null = null
  private memory: Array<{ role: 'user' | 'model'; parts: { text: string }[] }> = []

  constructor() {
    if (process.env.NODE_ENV === 'development') {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''
      const model = process.env.NEXT_PUBLIC_GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash'

      console.log('Gemini Provider')
      if (apiKey) {
        console.log('✓ API key loaded')
      } else {
        console.warn('⚠ API key missing')
      }

      if (model) {
        console.log(`✓ Model:\n${model}`)
      } else {
        console.warn('⚠ Model missing')
      }
    }
  }

  private getAI(): GoogleGenAI {
    if (!this.ai) {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''
      this.ai = new GoogleGenAI({ apiKey })
    }
    return this.ai
  }

  private getModelName(): string {
    return process.env.NEXT_PUBLIC_GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash'
  }

  /** "gemini-3.5-flash" → "Gemini 3.5 Flash" — the display label the panel
   *  shows (Stage 8.6 requirement #8), derived from the actual model in use
   *  rather than hand-maintained as a second copy of the name. */
  private providerLabel(): string {
    return this.getModelName()
      .split('-')
      .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join(' ')
  }

  public async ask(query: AssistantQuery): Promise<AssistantResponse> {
    const text = query.text
    const match = resolveIntent(text)
    const confidence = (match?.score ?? 0) / 100
    const primarySubsystem = match?.def.primarySubsystem ?? null
    const intent = match?.def.intent ?? null
    const targetSubsystem = match?.def.targetSubsystem

    // Ground Gemini in the deterministic reasoning chain whenever a subsystem
    // was identified AT ALL, even at low confidence — a weak match is still a
    // useful hint of what the question is about. This never gates whether
    // Gemini runs; it only enriches the prompt when it can.
    let explanation: StructuredExplanation | null = null
    if (primarySubsystem && intent) {
      try {
        explanation = engineeringReasoning.generateExplanation(intent, primarySubsystem, targetSubsystem)
      } catch {
        explanation = null
      }
    }

    try {
      const systemInstruction = promptBuilder.buildSystemPrompt()
      const userPrompt = promptBuilder.buildUserPrompt(text, {
        primarySubsystem,
        relatedSubsystems: explanation?.relatedSubsystems ?? [],
        explanation,
      })

      const aiInstance = this.getAI()
      const response = await aiInstance.models.generateContent({
        model: this.getModelName(),
        contents: [...this.memory, { role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              // Set ONLY when Gemini itself judges the question genuinely
              // ambiguous — see the system prompt's rule #7.
              clarification: { type: Type.STRING, nullable: true },
              observation: { type: Type.STRING },
              evidence: { type: Type.OBJECT, additionalProperties: { type: Type.STRING } },
              engineeringReason: { type: Type.STRING },
              relatedSubsystems: { type: Type.ARRAY, items: { type: Type.STRING } },
              assumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
              limitations: { type: Type.ARRAY, items: { type: Type.STRING } },
              conclusion: { type: Type.STRING }
            },
            required: ['observation', 'evidence', 'engineeringReason', 'relatedSubsystems', 'assumptions', 'limitations', 'conclusion']
          }
        }
      })

      if (!response.text) {
        throw new Error("Empty response from Gemini")
      }

      // Memory Management (keep last 5 interactions) — the conversation
      // history requirement (#4): every subsequent call includes it via
      // `contents` above.
      this.memory.push({ role: 'user', parts: [{ text: userPrompt }] })
      this.memory.push({ role: 'model', parts: [{ text: response.text }] })
      if (this.memory.length > 10) {
        this.memory = this.memory.slice(this.memory.length - 10)
      }

      const parsed: GeminiStructuredResponse = JSON.parse(response.text)
      const provider = this.providerLabel()

      // Gemini judged the request genuinely ambiguous — the ONLY path by
      // which the user is asked to specify a subsystem (req. #3).
      if (parsed.clarification && parsed.clarification.trim().length > 0) {
        return {
          question: text,
          intent,
          primarySubsystem,
          targetSubsystem,
          explanation: null,
          provider,
          confidence,
          error: parsed.clarification,
        }
      }

      const generatedExplanation: StructuredExplanation = {
        observation: parsed.observation,
        evidence: parsed.evidence,
        engineeringReason: parsed.engineeringReason,
        relatedSubsystems: parsed.relatedSubsystems as SubsystemId[],
        assumptions: parsed.assumptions,
        limitations: parsed.limitations,
        conclusion: parsed.conclusion,
      }

      return {
        question: text,
        intent,
        primarySubsystem,
        targetSubsystem,
        explanation: generatedExplanation,
        provider,
        confidence,
      }
    } catch (e: unknown) {
      console.error("Gemini Assistant Error:", e)
      return this.fallback(query, 'Gemini is currently unavailable. Using the deterministic engineering assistant.')
    }
  }

  /** Network/API/timeout/parse failure only — NOT the path for "ambiguous
   *  question" (that is `clarification` above, and never touches this). */
  private async fallback(query: AssistantQuery, prefixMsg: string): Promise<AssistantResponse> {
    const res = await deterministicAssistant.ask(query)
    return {
      ...res,
      provider: 'Deterministic (Fallback)',
      error: res.error ? `${prefixMsg} ${res.error}` : prefixMsg,
    }
  }
}

export const geminiAssistant = new GeminiAssistantProvider()
