import type { SubsystemId } from '../knowledge/types'
import type { ReasoningIntent } from './reasoningTypes'

export interface IntentDefinition {
  id: string
  /**
   * Returns a confidence score from 0 to 100 based on the input text.
   * If the text matches the intent, a higher score wins.
   */
  match: (text: string) => number
  primarySubsystem: SubsystemId
  intent: ReasoningIntent
  targetSubsystem?: SubsystemId
}

/**
 * A helper to easily match keywords.
 * `requiredPatterns` are arrays of synonyms (OR).
 * The function ensures ALL `requiredPatterns` match (AND).
 */
function createKeywordMatcher(requiredPatterns: string[][], score = 80): (text: string) => number {
  return (text: string) => {
    const t = text.toLowerCase()
    const matchesAll = requiredPatterns.every(synonyms =>
      synonyms.some(word => t.includes(word))
    )
    return matchesAll ? score : 0
  }
}

/**
 * Single source of truth for "which words name which subsystem" — feeds both
 * the high-confidence Definition matchers and the low-confidence Fallback
 * matchers below, so the two families can never drift out of sync.
 */
const SUBSYSTEM_KEYWORDS: Partial<Record<SubsystemId, string[]>> = {
  Battery: ['battery', 'storage', 'soc'],
  UtilityGrid: ['grid', 'utility', 'export', 'import'],
  Weather: ['weather', 'cloud', 'rain'],
  RooftopPV: ['pv', 'solar panel', 'solar array', 'rooftop'],
  AdaptiveFacade: ['facade', 'façade', 'skin', 'blade'],
  BuildingEnergy: ['building', 'hvac', 'occupancy'],
  SolarPhysics: ['sun position', 'solar geometry', 'irradiance', 'azimuth'],
  PBIF: ['pbif', 'controller decision', 'optimi'],
}

const DEFINITION_PHRASES = ['what is', 'what are', 'define', 'definition of', 'explain', 'tell me about', 'meaning of']

/**
 * An explicit "what is / define / explain" phrase plus a named subsystem is
 * as unambiguous as free text gets — a genuine definition request, which is
 * exactly what the Deterministic Assistant's fast path is for. Scored ≥ 90 so
 * it clears the router's deterministic-confidence threshold.
 */
const definitionMatchers: IntentDefinition[] = (Object.entries(SUBSYSTEM_KEYWORDS) as [SubsystemId, string[]][]).map(
  ([id, words]) => ({
    id: `Definition_${id}`,
    match: createKeywordMatcher([DEFINITION_PHRASES, words], 92),
    primarySubsystem: id,
    intent: 'State' as ReasoningIntent,
  }),
)

/**
 * A single subsystem keyword with no other qualifier — the weakest possible
 * signal. These exist so a matched subsystem (however uncertain) can still be
 * threaded through to Gemini as grounding context, not to answer on their own.
 */
const fallbackMatchers: IntentDefinition[] = (['Cause', 'State', 'Effect', 'Relationship', 'Comparison'] as ReasoningIntent[]).flatMap(
  (intent) =>
    (Object.entries(SUBSYSTEM_KEYWORDS) as [SubsystemId, string[]][]).map(([id, words]) => ({
      id: `Fallback_${intent}_${id}`,
      match: createKeywordMatcher([words], 30),
      primarySubsystem: id,
      intent,
    })),
)

export const intentRegistry: IntentDefinition[] = [
  {
    id: 'BatteryChargeIssue',
    match: createKeywordMatcher([
      ['why', 'cause', 'reason', 'not'],
      ['battery', 'storage'],
      ['charge', 'charging', 'empty']
    ], 95),
    primarySubsystem: 'Battery',
    intent: 'Cause',
  },
  {
    id: 'PVOutputIssue',
    match: createKeywordMatcher([
      ['why', 'cause', 'reason'],
      ['pv', 'solar', 'panel', 'array'],
      ['low', 'output', 'power', 'drop']
    ], 95),
    primarySubsystem: 'RooftopPV',
    intent: 'Cause',
  },
  {
    id: 'HighConsumptionIssue',
    match: createKeywordMatcher([
      ['why', 'cause', 'reason'],
      ['building', 'consume', 'electricity', 'load'],
      ['much', 'high', 'lot', 'so']
    ], 95),
    primarySubsystem: 'BuildingEnergy',
    intent: 'Cause',
  },
  {
    id: 'SystemWideLowYield',
    match: createKeywordMatcher([
      ['why', 'cause', 'reason'],
      ['everything', 'system', 'all'],
      ['low', 'down', 'bad']
    ], 90),
    // Mapping to UtilityGrid Cause traverses upstream to Battery, Building, PV, Solar Physics, Weather
    primarySubsystem: 'UtilityGrid',
    intent: 'Cause',
  },
  ...definitionMatchers,
  {
    id: 'GlobalSummary',
    // Deliberately kept BELOW the router's deterministic threshold (0.90): a
    // "summarise the whole simulation" question is exactly the project-level
    // case that should be escalated to Gemini, not answered by one subsystem's
    // deterministic reasoning chain.
    match: createKeywordMatcher([
      ['explain', 'summary', 'what', 'tell'],
      ['simulation', 'today', 'system']
    ], 85),
    primarySubsystem: 'CyberPhysicalPipeline',
    intent: 'State',
  },
  {
    id: 'GenericBatteryStatus',
    // A subsystem name plus an explicit status word is an unambiguous simple
    // status query (Stage 8.6 requirement #1) — raised to clear the
    // deterministic-confidence threshold rather than escalating needlessly.
    match: createKeywordMatcher([
      ['battery', 'storage', 'soc'],
      ['status', 'doing', 'state']
    ], 92),
    primarySubsystem: 'Battery',
    intent: 'State'
  },
  {
    id: 'GenericWeatherStatus',
    match: createKeywordMatcher([
      ['weather', 'cloud', 'rain'],
      ['status', 'doing', 'state', 'how']
    ], 92),
    primarySubsystem: 'Weather',
    intent: 'State'
  },
  // Weak, single-keyword signals — never enough confidence to answer alone,
  // but enough to hand Gemini a subsystem worth grounding its answer in.
  ...fallbackMatchers,
]

export interface IntentMatch {
  def: IntentDefinition
  /** 0–100, as returned by the winning matcher. */
  score: number
}

/**
 * The single place every caller resolves intent through — previously
 * duplicated between `DeterministicAssistant` and `GeminiAssistantProvider`.
 * Returns `null` only when literally nothing matched (score 0), so even a
 * weak Fallback hit is still returned for the caller to weigh.
 */
export function resolveIntent(text: string): IntentMatch | null {
  let best: IntentMatch | null = null
  for (const def of intentRegistry) {
    const score = def.match(text)
    if (score > 0 && (!best || score > best.score)) {
      best = { def, score }
    }
  }
  return best
}
