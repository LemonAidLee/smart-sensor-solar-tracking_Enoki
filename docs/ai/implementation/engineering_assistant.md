# Engineering Assistant Subsystem

**Subsystem ID:** EngineeringAssistant (meta — not a `SubsystemId`; this doc describes the assistant itself, not a physics engine)
**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

Answers natural-language engineering questions about the SOLIS AI Digital Twin, grounded strictly in the
twin's own live state and documented implementation. It is a **communicator**, never a **simulator** — it
never computes physics, never decides a PBIF angle, never touches simulation state. Its job is to explain
what the deterministic twin has already done, and to teach *why*, with the depth of an engineering lecturer
rather than a generic chatbot.

## Responsibilities

- Route a question to the cheapest capable path: a fast deterministic pattern-matcher when a subsystem is
  unambiguous and the reasoning graph can resolve it completely, escalating to a generative model (Gemini)
  otherwise.
- Fuse four layers of grounding for a generative answer: curated per-subsystem implementation documentation,
  a static engineering knowledge base, live simulation context, and a deterministic cause/effect reasoning
  chain — never letting the model invent facts outside them.
- Identify which subsystem(s) a question is actually about, and load *only* the implementation documentation
  for those subsystems (never the whole documentation layer) into the prompt.
- Append a deterministic, code-computed "Implementation References" footer to every technical answer, naming
  the exact documentation file(s) and source file(s) the answer is traceable to.
- Never let a network/API/parse failure produce silence — always fall back to the deterministic engine with an
  explicit, honest error prefix rather than a fabricated answer.

## Inputs

- `AssistantQuery.text` — the raw natural-language question, typed by the operator into `AiAssistantPanel`.
- The live `Simulation` snapshot, indirectly, via `EngineeringContextBuilder.update(sim)` — called each render
  tick by whichever component owns the simulation loop, not by the assistant itself.
- `src/lib/knowledge/*` — the static Engineering Knowledge Base (subsystem purposes, equations, assumptions,
  limitations, FAQ, and the upstream/downstream dependency graph).
- `docs/ai/implementation/*.md` — the curated Implementation Documentation layer this doc is itself part of.

## Outputs

- `AssistantResponse` — `{ question, intent, primarySubsystem, targetSubsystem?, explanation, provider,
  confidence?, error? }`, rendered by `AiAssistantPanel.tsx`.
- Console diagnostics only, dev-mode: Gemini configuration status (`logGeminiConfigStatusOnce`), and runtime
  error detail on a failed generative call — never the API key itself.

## Internal Calculation Pipeline

There is no physics pipeline here — the "calculation" is a routing and grounding pipeline:

1. **`AiAssistantPanel`** calls `engineeringAssistant.ask({ text })` (`assistantRouter.ts`).
2. **`EngineeringAssistantRouter.ask`** calls `resolveIntent(text)` (`intentRegistry.ts`) to get an
   `IntentMatch { def, score }` or `null`. `confidence = score / 100`.
   - `confidence ≥ DETERMINISTIC_CONFIDENCE_THRESHOLD` (0.9) → try `DeterministicAssistant.ask`.
     - If it returns a non-null `explanation` with no `error`, that response is returned as-is — the fast path.
     - Otherwise, fall through to Gemini.
   - `confidence < 0.9` → go straight to Gemini.
3. **`DeterministicAssistant.ask`** (the fast path): re-resolves intent (`MINIMUM_MATCH_SCORE = 50` floor),
   then calls `EngineeringReasoningEngine.generateExplanation(intent, primarySubsystem, targetSubsystem)`.
   - `generateExplanation` reads `EngineeringKnowledgeBase.getSubsystemById(primarySubsystem)` (static) and
     `engineeringContext.getSubsystemContext(primarySubsystem)` (live), and branches on `intent`
     (`State` / `Cause` / `Effect` / `Relationship` / `Comparison`), each branch doing a breadth-first
     traversal of `EngineeringKnowledgeBase.graph` (`findUpstreamCauses` / `findDownstreamEffects` /
     `findDependencyChain`) to collect the subsystems the answer should cite as `relatedSubsystems`.
   - Attaches `implementationReferences` via `buildImplementationReferences(relatedSubsystems)`
     (`implementationIndex.ts`) — a pure lookup, not model output.
4. **`GeminiAssistantProvider.ask`** (the generative path): re-resolves intent again (each provider is
   independently stateless), optionally builds a deterministic `StructuredExplanation` the same way step 3
   does (to ground Gemini even when confidence was too low to trust alone), then:
   - `promptBuilder.buildSystemPrompt()` — static instructions (grounding priority, 11-step answer structure,
     critical rules).
   - `promptBuilder.buildUserPrompt(text, { primarySubsystem, relatedSubsystems, explanation })` (**async**):
     assembles Project Overview → AI Knowledge Governance → Knowledge Base overview → per-subsystem KB
     deep-dive → **Implementation Documentation** (see below) → live Engineering Context → deterministic
     Engineering Reasoning, in that order, as one prompt string.
   - Calls `GoogleGenAI.models.generateContent` with a strict JSON `responseSchema`, keeping the last 5
     question/answer pairs (`this.memory`, capped at 10 entries) as conversation history.
   - Parses the JSON response into a `StructuredExplanation`, overwrites `implementationReferences` with the
     deterministically computed value (never the model's own), and returns it — *unless* the model set
     `clarification`, the one channel through which it may ask the user to narrow the question.
   - Any thrown error (config, network, quota, parse) is caught and routed to `fallback()`, which re-runs
     `DeterministicAssistant.ask` and prefixes its result with the real failure reason.

### Implementation documentation selection (the part this update added)

Inside `buildUserPrompt`, `resolveDocSlugs(question, primarySubsystem, relatedSubsystems)`
(`implementationIndex.ts`) picks up to 3 doc slugs:

1. `primarySubsystem` and each of `relatedSubsystems`, mapped through `SUBSYSTEM_TO_DOC` (built once, at
   module load, as the inverse of every `IMPLEMENTATION_DOCS[*].covers`).
2. A narrow keyword scan of the raw question text for the three subsystems that exist in the code and in
   CLAUDE.md but have no `SubsystemId` yet (`BuildingThermal`, `BuildingLighting`, `FaultDetection`), plus this
   assistant's own meta-doc — because `resolveIntent` can never surface them as `primarySubsystem` (its return
   type is constrained to the existing `SubsystemId` union).

The resolved slugs are fetched through `loadImplementationDocs` (`implementationDocsLoader.ts`), which calls
`GET /api/assistant-docs/[slug]` (`src/app/api/assistant-docs/[slug]/route.ts`) — the one server-side reader of
`docs/ai/implementation/*.md`, needed because this whole call chain runs client-side (see `geminiConfig.ts`'s
note on `NEXT_PUBLIC_`-only env access) and cannot use Node's `fs` directly. Fetched content is cached
per-slug in a module-level `Map` for the life of the browser session — the docs are curated, not live data, so
re-fetching them on every question would be pure waste.

## Engineering Equations

None — this subsystem performs no physics. The closest analogue is the routing threshold:

```
route = confidence >= 0.9 ? Deterministic : Gemini     (assistantRouter.ts)
confidence = (matchScore ?? 0) / 100                    (intentRegistry.ts / geminiAssistant.ts)
```

## Constants

| Constant | Value | File |
|---|---|---|
| `DETERMINISTIC_CONFIDENCE_THRESHOLD` | `0.9` | `assistantRouter.ts` |
| `MINIMUM_MATCH_SCORE` | `50` | `deterministicAssistant.ts` |
| Gemini memory window | last 5 Q/A pairs (10 entries) | `geminiAssistant.ts` |
| `resolveDocSlugs` doc cap | 3 slugs per question | `implementationIndex.ts` |
| `DEFAULT_GEMINI_MODEL` | `'gemini-3.5-flash'` | `geminiConfig.ts` |
| Implementation-doc cache | `Cache-Control: private, max-age=300` (5 min) | `src/app/api/assistant-docs/[slug]/route.ts` |

## Engineering References

None cited in source — this is a software-architecture subsystem (retrieval-augmented prompting over a typed
knowledge graph), not a physical one. No external standard applies.

## Assumptions

- The deterministic matcher's confidence score is a reliable proxy for whether its own reasoning chain will be
  *complete*, not just *matched* — the router double-checks this (`result.explanation && !result.error`) rather
  than trusting the score alone.
- A subsystem named in the question text is enough signal to load its implementation doc, even at a keyword
  match — over-loading a doc is cheap; under-loading one risks a shallower answer, so `resolveDocSlugs` errs
  toward inclusion (up to 3 docs).
- Gemini's structured JSON output is trustworthy for prose (`observation`, `engineeringReason`, `conclusion`)
  but never for traceability metadata — `implementationReferences` is computed in code precisely because prose
  can be graded for plausibility but a wrong file path cannot.

## Limitations

- `BuildingThermal`, `BuildingLighting` and `FaultDetection` are not registered in `src/lib/knowledge`'s
  `SubsystemId` union (see the gap noted in `building_thermal.md`, `building_lighting.md` and
  `fault_detection.md`). Deterministic intent matching, live context building and the reasoning graph BFS
  traversals can never reach these three subsystems — only implementation-doc *loading* can, via the narrow
  keyword fallback in `resolveDocSlugs`. A question like "why is the thermal state X" will still be answered
  by Gemini using the loaded `building_thermal.md`, but it can never take the deterministic fast path, and the
  reasoning graph will never list it as an upstream/downstream dependency of another subsystem.
- `AiAssistantPanel.tsx` renders `observation`, `engineeringReason` and `conclusion` as plain React text nodes,
  not through a Markdown renderer — the system prompt still asks the model to "use Markdown", so literal
  `**`/`##` characters can appear in the UI. This predates this documentation layer and was not introduced or
  fixed by it; flagged here as a known, pre-existing UI limitation.
- The knowledge-base deep-dive and the implementation-doc deep-dive can overlap in content for a well-matched
  subsystem — token cost, not correctness — because both are injected whenever `focusIds` is non-empty.
- `resolveDocSlugs` caps at 3 docs per question; a question that genuinely spans more than 3 subsystems will
  only get the first 3 (primary first, then related in order) as full implementation documentation, though the
  Knowledge Base overview and live Engineering Context still cover every subsystem in the twin.

## Dependencies

- [Weather](./weather.md), [Solar Physics](./solar.md), [Cyber-Physical Pipeline](./cyber_physical_pipeline.md),
  [PBIF](./pbif.md), [Adaptive Façade](./adaptive_facade.md), [Building Thermal](./building_thermal.md),
  [Building Lighting](./building_lighting.md), [Building Energy](./building_energy.md),
  [Energy Ledger](./energy_ledger.md), [PV](./pv.md), [Battery](./battery.md), [Grid](./grid.md),
  [Prediction](./prediction.md), [Fault Detection](./fault_detection.md) — every implementation doc is a
  potential dependency; which ones load depends entirely on the question.
- `Simulation` (`src/lib/engine/simulation.ts`) indirectly, through `engineeringContext.update(sim)` — the
  assistant itself never imports `Simulation`.

## Consumers

- `AiAssistantPanel.tsx` / `AiAssistantBody` (`src/components/twin3d/ui/AiAssistantPanel.tsx`) — the only UI
  entry point, reached from the right-side "AI Prediction" / assistant panel workspace tooling
  (`workspaceTools.tsx`).

## Public API

- `engineeringAssistant.ask(query: AssistantQuery): Promise<AssistantResponse>` — the one entry point external
  code should call (`assistantRouter.ts`).
- `deterministicAssistant.ask(query)`, `geminiAssistant.ask(query)` — the two providers the router dispatches
  to; callable directly but not intended to be, outside the router and its own fallback path.
- `engineeringContext.update(sim)`, `.getSubsystemContext(id)`, `.getAllContexts()`, `.getContextSummary()`,
  `.searchContext(keyword)` (`contextBuilder.ts`).
- `engineeringReasoning.generateExplanation(intent, primarySubsystem, targetSubsystem?)`,
  `.findUpstreamCauses(id)`, `.findDownstreamEffects(id)`, `.findDependencyChain(start, end)`
  (`reasoningEngine.ts`).
- `resolveIntent(text): IntentMatch | null` (`intentRegistry.ts`).
- `promptBuilder.buildSystemPrompt(): string`, `promptBuilder.buildUserPrompt(question, opts): Promise<string>`
  (`promptBuilder.ts`).
- `resolveDocSlugs(question, primarySubsystem, relatedSubsystems, maxDocs?)`,
  `buildImplementationReferences(subsystemIds)`, `IMPLEMENTATION_DOCS` (`implementationIndex.ts`).
- `loadImplementationDocs(slugs)` (`implementationDocsLoader.ts`).
- `EngineeringKnowledgeBase.{subsystems, concepts, graph, searchSubsystems, searchConcepts, searchFaqs,
  getSubsystemById, getConceptById}` (`src/lib/knowledge/index.ts`).

## Live Outputs

`AssistantResponse`:

```
question: string
intent: ReasoningIntent | null                 // 'Cause' | 'Effect' | 'State' | 'Relationship' | 'Comparison'
primarySubsystem: SubsystemId | null
targetSubsystem?: SubsystemId | null
explanation: StructuredExplanation | null
provider: string                               // 'Deterministic Engine' | 'Gemini 3.5 Flash' | 'Deterministic (Fallback)'
confidence?: number                            // 0-1, pre-dispatch routing confidence — not an answer-quality score
error?: string
```

`StructuredExplanation` (`reasoningTypes.ts`):

```
observation: string
evidence: Record<string, string>
engineeringReason: string
relatedSubsystems: SubsystemId[]
assumptions: string[]
limitations: string[]
conclusion: string
implementationReferences?: { subsystem: string; documentation: string; sourceFiles: string[]; engineeringReferences: string[] }[]
```

## Source Files

- `src/lib/assistant/assistantRouter.ts`
- `src/lib/assistant/deterministicAssistant.ts`
- `src/lib/assistant/geminiAssistant.ts`
- `src/lib/assistant/geminiConfig.ts`
- `src/lib/assistant/promptBuilder.ts`
- `src/lib/assistant/contextBuilder.ts`
- `src/lib/assistant/reasoningEngine.ts`
- `src/lib/assistant/reasoningTypes.ts`
- `src/lib/assistant/intentRegistry.ts`
- `src/lib/assistant/projectContext.ts`
- `src/lib/assistant/implementationIndex.ts`
- `src/lib/assistant/implementationDocsLoader.ts`
- `src/app/api/assistant-docs/[slug]/route.ts`
- `src/lib/knowledge/*`
- `src/components/twin3d/ui/AiAssistantPanel.tsx`

## Design Rationale

- **Router-then-provider, not provider-with-fallback.** The router comment in `assistantRouter.ts` explicitly
  records why this shape exists: before it, `GeminiAssistantProvider` re-implemented its own low-confidence
  handling by falling back to `DeterministicAssistant`, so a question the deterministic matcher couldn't
  confidently resolve always ended in "please specify a subsystem" — even when Gemini, given the full project
  context, could often have just answered it. Inverting the flow (deterministic only for what it's actually
  good at, everything else escalates *up*) is why the clarification prompt is now reserved for Gemini's own
  judgement (`clarification` in its JSON), never an automatic consequence of a low match score.
- **Implementation References computed in code, never asked of the model.** `StructuredExplanation` is
  intentionally kept model-writable for prose but not for traceability metadata. This is the direct
  implementation of this project's "never hallucinate" and "fully traceable" grounding rules: a wrong sentence
  is a quality problem, but a wrong file path silently breaks the entire point of an "Implementation
  References" footer, so it is never left to generation.
- **Docs served through an API route, not bundled.** `geminiConfig.ts` already documents that the assistant's
  call chain is reachable only from client components, so only `NEXT_PUBLIC_`-prefixed env vars exist at
  runtime. The same constraint applies to `docs/ai/implementation/*.md`: it is not under `public/` (it is a
  curated engineering source, not a static asset) and there is no bundler configuration in this repo for raw
  markdown imports, so a minimal server-side route is the lowest-risk bridge — no build-tool configuration
  changes, single source of truth preserved, cached client-side per session.
- **`resolveDocSlugs` is separate from `resolveIntent`.** Widening `SubsystemId` to cover `BuildingThermal`,
  `BuildingLighting` and `FaultDetection` would ripple into the knowledge base, context builder and intent
  registry — real work, but out of scope for "load the right documentation." A narrow keyword layer, scoped
  only to doc selection, closes the practical gap without touching the deterministic reasoning architecture.

## Future Extension Points

- Register `BuildingThermal`, `BuildingLighting` and `FaultDetection` as real `SubsystemId` values (with
  `subsystems.ts` entries, `relationships.ts` graph nodes, `contextBuilder.ts` builders and
  `intentRegistry.ts` keywords), so they can take the deterministic fast path and participate in the
  upstream/downstream reasoning graph like every other subsystem.
- Render `observation` / `engineeringReason` / `conclusion` through an actual Markdown renderer in
  `AiAssistantPanel.tsx`, now that the system prompt asks for a much longer, more structured, Markdown-formatted
  narrative (the eleven-step answer order) than the original four short fields were designed to hold as plain text.
- Prediction-accuracy tracking (CLAUDE.md §10) would give this assistant a genuinely new evidence source —
  "how well did the twin's own past predictions hold up" — that today's Engineering Context has no equivalent
  of for any other subsystem.
- A citation-density or hallucination check that verifies every equation/constant Gemini's `engineeringReason`
  states also appears verbatim in the loaded Implementation Documentation, rejecting or flagging the response
  otherwise.
