/**
 * Single source of truth for Gemini configuration. Every file that needs the
 * API key, the model name, or a human-readable "why isn't this working"
 * message reads it from here — never `process.env` directly — so the whole
 * assistant can only ever agree with itself about which variable it expects.
 *
 * `geminiAssistant.ts` is reachable only from client ('use client')
 * components (AiAssistantPanel -> geminiAssistant -> GoogleGenAI), so at
 * runtime in the browser ONLY `NEXT_PUBLIC_`-prefixed env vars exist — every
 * other `process.env.*` reference is stripped out of the client bundle by
 * Next.js. The bare (non-prefixed) fallbacks below are kept only for a
 * future server-side call path (e.g. an API route) and can never resolve to
 * anything from this file's actual call site today.
 */

export const GEMINI_API_KEY_ENV_VAR = 'NEXT_PUBLIC_GEMINI_API_KEY' as const
export const GEMINI_API_KEY_SERVER_FALLBACK_ENV_VAR = 'GEMINI_API_KEY' as const
export const GEMINI_MODEL_ENV_VAR = 'NEXT_PUBLIC_GEMINI_MODEL' as const
export const GEMINI_MODEL_SERVER_FALLBACK_ENV_VAR = 'GEMINI_MODEL' as const
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash'

export interface GeminiConfig {
  enabled: boolean
  apiKey: string
  model: string
  /** Which env var actually supplied the key — for diagnostics only, never the key itself. */
  apiKeySource: typeof GEMINI_API_KEY_ENV_VAR | typeof GEMINI_API_KEY_SERVER_FALLBACK_ENV_VAR | null
  modelSource: typeof GEMINI_MODEL_ENV_VAR | typeof GEMINI_MODEL_SERVER_FALLBACK_ENV_VAR | 'default'
}

function resolveConfig(): GeminiConfig {
  const publicKey = process.env[GEMINI_API_KEY_ENV_VAR] ?? ''
  const serverKey = process.env[GEMINI_API_KEY_SERVER_FALLBACK_ENV_VAR] ?? ''
  const apiKey = publicKey || serverKey
  const apiKeySource = publicKey ? GEMINI_API_KEY_ENV_VAR : serverKey ? GEMINI_API_KEY_SERVER_FALLBACK_ENV_VAR : null

  const publicModel = process.env[GEMINI_MODEL_ENV_VAR] ?? ''
  const serverModel = process.env[GEMINI_MODEL_SERVER_FALLBACK_ENV_VAR] ?? ''
  const model = publicModel || serverModel || DEFAULT_GEMINI_MODEL
  const modelSource = publicModel ? GEMINI_MODEL_ENV_VAR : serverModel ? GEMINI_MODEL_SERVER_FALLBACK_ENV_VAR : 'default'

  return { enabled: apiKey.length > 0, apiKey, model, apiKeySource, modelSource }
}

// NEXT_PUBLIC_* values are inlined into the bundle at build time, so
// re-reading process.env on every call can never produce a different answer
// within one running client — resolve once and reuse.
let cached: GeminiConfig | null = null

export function getGeminiConfig(): GeminiConfig {
  if (!cached) cached = resolveConfig()
  return cached
}

/** Exact, actionable message for "no key configured" — names the specific
 *  env var so this failure is never surfaced as a generic, unexplained
 *  fallback. Used both for the console diagnostic and as the user-facing
 *  fallback reason. */
export function missingApiKeyMessage(): string {
  return (
    `Gemini is not configured: "${GEMINI_API_KEY_ENV_VAR}" is missing or empty. ` +
    `Set it in .env.local (must use the NEXT_PUBLIC_ prefix — "${GEMINI_API_KEY_SERVER_FALLBACK_ENV_VAR}" ` +
    `is not readable from browser code) and restart the dev server.`
  )
}

let loggedStatus = false

/** Prints the resolved configuration exactly once, in development only.
 *  Never prints the key itself — only whether one was found and which
 *  variable supplied it. Call this from the one place Gemini is constructed;
 *  it is idempotent so importing/calling it more than once is harmless. */
export function logGeminiConfigStatusOnce(): void {
  if (loggedStatus) return
  loggedStatus = true
  if (process.env.NODE_ENV !== 'development') return

  const cfg = getGeminiConfig()
  // eslint-disable-next-line no-console
  console.log(
    '[Gemini Assistant] configuration',
    `\n  Gemini enabled:  ${cfg.enabled ? 'Yes' : 'No'}`,
    `\n  API key loaded:  ${cfg.enabled ? 'Yes' : 'No'}${cfg.apiKeySource ? ` (from ${cfg.apiKeySource})` : ''}`,
    `\n  Model:           ${cfg.model}`,
    `\n  Model source:    ${cfg.modelSource}`,
  )
  if (!cfg.enabled) {
    console.warn(`[Gemini Assistant] ${missingApiKeyMessage()}`)
  }
}
