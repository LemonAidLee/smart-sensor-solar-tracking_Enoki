# Digital Twin — Walkthrough

A running, human-readable record of what the Digital Twin interface does and why,
stage by stage. Where `PBIF_ENGINEERING_GUIDE.md` is the engineering
constitution (rules, physics, citations), this document is the **narrative**: how
the interface tells its story, and what changed at each step of building it.

Newest stage first.

---

## Stage 8.6 — Engineering Assistant Confidence-Based Routing

_2026-08-03_

### Why this stage happened

The Engineering Assistant's `GeminiAssistantProvider` matched intent using the
same keyword registry as `DeterministicAssistant`, and when that match scored
below 50 it fell back DOWN to the deterministic engine — which then had
nothing to reason over either, so the user was told to "please specify a
subsystem" for exactly the broad or project-level questions Gemini was best
placed to answer. The routing direction was backwards: uncertainty should
escalate UP to the model with more context, not fail DOWN to a clarification
prompt.

### Routing architecture

A new `EngineeringAssistantRouter` (`assistantRouter.ts`) is now the panel's
single entry point (`engineeringAssistant`), replacing the direct
`geminiAssistant.ask()` call:

```
resolveIntent(text) → confidence = score / 100
  confidence ≥ 0.90  → DeterministicAssistant
                         ├─ complete explanation, no error → return it
                         └─ otherwise                       → escalate to Gemini
  confidence <  0.90  → GeminiAssistantProvider
                         └─ network/API/parse failure        → falls back to
                                                                 DeterministicAssistant
```

The user is asked to specify a subsystem **only** when Gemini itself sets a
new `clarification` field in its structured response — never as a direct
consequence of the deterministic matcher's confidence. That field is governed
by one system-prompt rule: ambiguous means "names no subsystem, topic or
concept this project could plausibly involve," not "broad" or
"project-level" — those are exactly what Gemini is expected to answer.

### Confidence thresholds

`DETERMINISTIC_CONFIDENCE_THRESHOLD = 0.90`, matching requirement #6 exactly.
Intent scores were recalibrated against it rather than left as arbitrary
values:

| Confidence | Intents | Routes to |
|---|---|---|
| 0.95 | `BatteryChargeIssue`, `PVOutputIssue`, `HighConsumptionIssue` | Deterministic |
| 0.92 | `Definition_*` (new — "what is / define / explain" + subsystem name, one per subsystem), `GenericBatteryStatus`, `GenericWeatherStatus` (raised from 0.70) | Deterministic |
| 0.90 | `SystemWideLowYield` | Deterministic |
| 0.85 | `GlobalSummary` ("explain today's simulation") | Gemini |
| 0.30 | `Fallback_*` (one keyword, any subsystem, any intent) | Gemini |
| 0 | No keyword match at all | Gemini |

`GenericBatteryStatus`/`GenericWeatherStatus` were the only two existing
scores that needed raising: they are genuinely unambiguous "subsystem name +
status word" queries — exactly requirement #1's "Simple subsystem status" —
so 0.70 was routing them to Gemini for no good reason. `GlobalSummary` and
every `Fallback_*` entry were deliberately left below the threshold; they are
either project-level or too weak a signal to answer alone, which is the
"complex / project-level questions automatically use Gemini" case from the
validation list.

`SUBSYSTEM_KEYWORDS` is a new single source of truth for "which words name
which subsystem," feeding both the new `Definition_*` family and the existing
`Fallback_*` family — previously the fallback keyword lists were the only copy
of that mapping, inline.

### Gemini's context bundle (requirement #4)

`promptBuilder.buildUserPrompt()` now assembles, every call, regardless of
whether an intent matched: Project Overview + AI Knowledge governance summary
(`projectContext.ts` — hand-written summaries of `CLAUDE.md` / `AI_KNOWLEDGE.md`,
since neither file ships to the client) → a full one-line-per-subsystem
Knowledge Base index (**generated from `EngineeringKnowledgeBase.subsystems`**,
not hand-duplicated, so it cannot drift from the real data) → a deep-dive on
whichever subsystem(s) were identified, at any confidence → live Engineering
Context (the matched subsystems' context, or **every** subsystem's when
nothing matched — so Gemini can judge relevance itself) → the deterministic
`StructuredExplanation` when one exists, or an explicit "reason from the
context above instead" note when it does not. Conversation history continues
to ride in the Gemini `contents` array (`this.memory`), unchanged.

Previously, Gemini only ever ran — and only ever received the (much smaller)
subsystem-scoped prompt — when the SAME ≥50 keyword match `DeterministicAssistant`
needed had already succeeded. Now the reasoning chain is attempted whenever a
subsystem was identified at any confidence, purely to enrich Gemini's prompt;
it never gates whether Gemini is called.

### Other changes

- `AssistantResponse` gained an optional `confidence` field (0–1), surfaced
  in the panel next to the provider badge.
- Provider labels now match requirement #8's examples exactly: `"Deterministic
  Engine"`, a model-derived `"Gemini 3.5 Flash"` (formatted from the configured
  model id, not hand-maintained), and `"Deterministic (Fallback)"` — only used
  on a genuine Gemini failure, never on a low-confidence match.
- `resolveIntent()` is now the one place intent-matching happens; it was
  previously duplicated, near-identically, inside both `DeterministicAssistant`
  and `GeminiAssistantProvider`.

### Deliberately not done

- No new `ReasoningIntent` type for "pure definitions" — `Definition_*`
  intents reuse the existing `'State'` intent, since a definition is a
  degenerate case of "what is this subsystem's current state and purpose."
- No change to `EngineeringReasoningEngine` or the Knowledge Base — the router
  sits entirely in front of the existing reasoning chain.

### Files modified / added

| File | Change |
|---|---|
| `src/lib/assistant/assistantRouter.ts` | **New.** `EngineeringAssistantRouter`, `DETERMINISTIC_CONFIDENCE_THRESHOLD` |
| `src/lib/assistant/projectContext.ts` | **New.** `PROJECT_OVERVIEW`, `AI_KNOWLEDGE_GOVERNANCE`, `buildKnowledgeBaseOverview()` |
| `src/lib/assistant/intentRegistry.ts` | `resolveIntent()`; `SUBSYSTEM_KEYWORDS`; `Definition_*` matchers; recalibrated `GenericBatteryStatus`/`GenericWeatherStatus` |
| `src/lib/assistant/deterministicAssistant.ts` | Uses `resolveIntent()`; returns `confidence`; provider label shortened |
| `src/lib/assistant/geminiAssistant.ts` | Always builds the full context bundle; `clarification` response field; dynamic provider label; simplified fallback |
| `src/lib/assistant/promptBuilder.ts` | `buildUserPrompt()` takes a `ContextBundleOptions` bundle instead of a required explanation; new system prompt rules |
| `src/lib/assistant/assistantProvider.ts` | `AssistantResponse.confidence?: number` |
| `src/lib/assistant/index.ts` | Exports the router, `resolveIntent`, `intentRegistry`, `projectContext` |
| `src/components/twin3d/ui/AiAssistantPanel.tsx` | Calls `engineeringAssistant.ask()`; shows match confidence beside the provider badge |

### Validation

- ✓ TypeScript (`tsc --noEmit`) clean.
- ✓ ESLint clean on every file touched (0 errors; two pre-existing unused-icon
  warnings in `AiAssistantPanel.tsx` predate this change and were left alone).
- ✓ `next build` — compiles, type-checks and prerenders `/digital-twin`.
- ✓ Routing table traced by hand against `resolveIntent`'s scoring for
  representative questions: "Why is the battery not charging?" → 0.95 →
  Deterministic; "What is the status of the Battery?" / "What is PBIF?" →
  0.92 → Deterministic; "Explain today's simulation" → 0.85 → Gemini; a
  free-form relational question ("How does the grid interact with the battery
  during a cloudy afternoon…") → weak Fallback hits only, 0.30 → Gemini; a
  fully off-topic question → no match, 0.0 → Gemini.
- Not verified: an actual Gemini API round-trip (network call) or the panel's
  live rendering in a browser — no browser-automation tool was available this
  session, and calling the real API wasn't attempted without the user driving
  it. The routing decision itself was verified statically (scoring table,
  `tsc`, `next build`); the Gemini response content should be spot-checked
  live before shipping.

---

## Stage 8.5 — AI Fault Detection & Diagnosis (FDD)

_2026-08-03_

### Why this stage happened

Stage 8.1 projects the twin forward; Stage 8.2 asks "what if". Neither one asks
*is the twin behaving the way it should, right now?* Stage 8.5 adds that
question: a deterministic engineering **monitor** that re-derives each
subsystem's expected behaviour from values the engines have already published
and reports where the observed state agrees — or disagrees — with its own
physics. It is not a fault simulator: the twin runs correctly by construction,
so the expected steady state is every monitored subsystem reporting Healthy,
and the engine must never invent a finding to look busier than that.

### Architecture

New subsystem, `src/lib/ai/faultDetection/`, following the same read-only,
cached-report shape as the Prediction Engine:

| File | Role |
|---|---|
| `types.ts` | `HealthStatus`, `SubsystemHealth`, `Anomaly`, `DetectableCondition`, `FaultDetectionReport` |
| `rules.ts` | Twelve deterministic per-subsystem checks — the only place that reads `SimSnapshot` numbers |
| `diagnostics.ts` | Aggregates subsystem grades into an overall score/status, a diagnosis sentence, evidence bullets and anomaly records |
| `recommendations.ts` | Turns a grade into operator guidance; the static, hand-authored `DETECTABLE_CONDITIONS` catalogue |
| `faultDetectionEngine.ts` | `FaultDetectionEngine` — orchestration, invalidation-key caching |
| `index.ts` | Public surface |

Per the spec, the engine consumes exactly four things: `EngineeringKnowledgeBase`
and the `engineeringReasoning`/`engineeringContext` singletons (imported
directly, the same pattern `reasoningEngine.ts` already uses) and the caller's
`SimSnapshot`. It receives no reference to `Simulation` and writes nothing
back — the observer guarantee is structural, exactly like Stage 8.1's
`PredictionContext`.

### Detection strategy

Each rule re-derives an expected value or invariant from the snapshot and
compares it against what was actually observed — never a timer, a random roll
or a hidden counter:

- **Weather** — all five drivers within their physically valid ranges.
- **Solar Physics** — daytime flag agrees with sun altitude; actual DNI never
  exceeds the clear-sky ceiling for the same instant.
- **Virtual Sensors** — the global ADC channel is a finite value inside the
  12-bit range.
- **PBIF** — a decision was actually published for this tick.
- **Servo / Adaptive Façade** — panel fault count from `BuildingMetrics`
  (`faultPanels`/`totalPanels`), blade angle and openness/daylight bounds.
- **PV Array** — DC output against the irradiance-scaled reference yield
  (`irradiance / 1000 × installed capacity`), tolerant of thermal derating.
- **PV Inverter** — AC output never exceeds DC input; efficiency plausible.
- **Building Energy** — load intensity and occupancy within plausible bounds.
- **Battery** — SOC in range, never charging and discharging at once, and its
  reported dispatch agrees with the energy bus's *planned* dispatch — two
  independently-produced numbers for the same physical quantity.
- **Utility Grid** — a genuine conservation check: generation + import +
  battery discharge balances load + battery charge + export within 0.5 kW,
  and import/export are never simultaneously non-zero.
- **Prediction Engine** — Ready vs. Holding; Holding grades Warning (a real,
  honestly-reported loss of visibility), never Critical.

### Health scoring

Every rule returns a **deviation**, 0 (perfect match) to 1 (fully diverged),
converted to a 0–100 health score (`100 − deviation × 100`) and a status band
(`≥ 90` Healthy, `≥ 70` Warning, else Critical). **Confidence** is separate
from health: it is `99 − 2 × (known limitations for that subsystem)`, so a
subsystem the Knowledge Base itself documents as having more unmodelled
behaviour reports lower confidence — a real property of the static knowledge
base, not a flat, meaningless 100% everywhere. The **overall** score is the
weakest-link minimum across all twelve subsystems, not an average: one real
finding must never be diluted by eleven healthy ones.

Anomalies (Warning/Critical subsystems) route their `reasoning` field through
`EngineeringReasoningEngine.generateExplanation('Cause', subsystem)` — the same
upstream-cause graph traversal the Engineering Assistant uses — so a finding is
explained in terms of the dependency graph that produced it, not a restatement
of the score.

### Future extensibility

`rules.ts` exports one `Rule` type and a single `RULES` array; a new check
(sensor disagreement, inverter clipping severity, servo tracking failure, …)
is one more entry, nothing else in the engine changes. The **Example
Detectable Conditions** section of the panel is a static catalogue
(`DETECTABLE_CONDITIONS`) of exactly this kind of future rule — eleven
conditions spanning every monitored subsystem, hand-authored and never
generated from a live value, explicitly labelled "NOT current faults" so it
can never be mistaken for an active finding.

### Panel

`src/components/twin3d/ui/AiFddPanel.tsx`, registered in `AI_TOOLS` alongside
Prediction / What-If / Assistant (`WindowId` gains `'fdd'`). Section order
matches the spec: Overall System Health → Subsystem Health (12 collapsible
rows, each showing its reason, raw evidence and confidence) → AI Diagnosis →
Engineering Evidence → Detected Anomalies (`None` when the twin is healthy,
which is the expected state) → Example Detectable Conditions (collapsed by
default) → AI Status. Same visual language as the other AI panels — the shared
`glass-panel` token, the `#e879f9` AI accent for AI-authored sections, `#22d3ee`
for evidence/reasoning, and the traffic-light `Healthy #34d399 / Warning
#fbbf24 / Critical #f87171` used consistently for every status chip and score.

### Wiring

`Simulation.faultDetection: FaultDetectionEngine`, exposed via
`getFaultDetection(snapshot)` — takes the same `SimSnapshot` the rest of the UI
already reads, never called from `tick()`. The store's `pull()` (~8 Hz) now
computes `snap` once and feeds it to both `snapshot` and `faultDetection`, so
the FDD engine costs one key comparison per poll while nothing a rule reads has
moved, exactly like `prediction`.

### Deliberately not done

- No fabricated Warning/Critical grades to make the panel look more capable —
  every non-Healthy grade traces to a specific failed comparison in `rules.ts`.
- No live generation of "detectable conditions" — that catalogue is static by
  design, so it structurally cannot leak into `anomalies`.
- No new engine state and no write path back into simulation — `rules.ts`
  takes `ContextBuilderAPI` and `SimSnapshot` by value; there is no handle
  through which a check could mutate the twin.

### Validation

- ✓ TypeScript (`tsc --noEmit`) clean.
- ✓ ESLint clean (one initial unused-variable warning in `AiFddPanel.tsx` fixed
  by colouring the subsystem score with its status colour).
- ✓ `next build` — compiles, type-checks and prerenders `/digital-twin`
  successfully.
- ✓ Dev server serves `/digital-twin` with no runtime error and the new
  "AI Fault Detection & Diagnosis" dock entry present in the rendered markup.
- Not verified: interactively opening the panel and reading live values in a
  browser — no browser-automation tool was available in this session, so this
  should be spot-checked visually before shipping.

---

## Stage 8.2 — AI What-If Analysis Engine

_2026-08-01_

### Why this stage happened

Stage 8.1 answered *what will happen*. It could tell the operator that grid
import would climb after sunset — but not whether a bigger battery would help.
Stage 8.2 turns prediction into decision support: eight engineering studies that
each change one thing about the twin and report what the existing engines then
produce.

### The refactor that made the sandbox trivial

Stage 8.1's `PredictionContext` held two live engines (`weatherScenario`,
`liveForecast`). Cloning that for a sandbox would have meant faking engines.

So the context became **pure data**: every value resolved up front by
`Simulation.predictionContext()`, with a new `parameters` sub-object carrying the
plant's true values (derate 1, no temperature offset, grid connected).

A sandbox is now an object spread:

```ts
apply: (ctx) => ({ ...ctx, parameters: { ...ctx.parameters, cloudOverride: 0.9 } })
```

There is no engine to reset, no state to restore, no teardown to forget.
**Isolation is a property of the data structure**, not of the discipline applied
to it. It also removed the Manual-Mode timeline trap from the prediction layer
entirely — `isActive()` is now gated once, at the boundary.

### New files

| File | Role |
|---|---|
| `src/lib/prediction/whatif/types.ts` | `WhatIfScenario`, `MetricComparison`, `WhatIfRecommendation`, `WhatIfResult` |
| `src/lib/prediction/whatif/scenarios.ts` | The eight studies and the one parameter each changes |
| `src/lib/prediction/whatif/compare.ts` | Aggregation + the metric table |
| `src/lib/prediction/whatif/recommend.ts` | Observation → Evidence → Reason → Impact, per scenario |
| `src/lib/prediction/whatif/whatIfEngine.ts` | `WhatIfEngine` — orchestration, caching, staleness |
| `src/components/twin3d/ui/AiWhatIfPanel.tsx` | The AI What-If Analysis window |

### Modified files

| File | Change |
|---|---|
| `src/lib/prediction/types.ts` | `PredictionContext` → pure data; `ProjectionParameters`; `LIVE_PARAMETERS`; façade + unserved fields on `TwinProjection` |
| `src/lib/prediction/projection.ts` | Applies the parameters; adds façade thermal/optical response |
| `src/lib/prediction/predictionEngine.ts` | Reads the flattened fields; keys on `timelineId` and façade openness |
| `src/lib/engine/simulation.ts` | Resolves the full context; owns `whatIf`; `runWhatIf` / `getWhatIf` / `isWhatIfStale` |
| `src/lib/engine/store.ts` | `whatIf`, `whatIfScenarioId`, `whatIfStale` + the three actions |
| `src/lib/engine/metrics.ts` | Extracted `facadeSolarGainKW`, `facadeEnvelopeGainKW`, `facadeDaylightPercent`, `normalisedExposure` |
| `src/lib/engine/adaptiveSkin.ts` | Uses `normalisedExposure` (one line) |
| `src/lib/dt/windowStore.ts` | `WindowId` gains `'whatif'` |
| `src/components/twin3d/ui/workspaceTools.tsx` | Registers the tool |

### The eight studies

| Study | The one change |
|---|---|
| Heavily Overcast | `cloudOverride: 0.9` |
| Rain Arrives Earlier | `weatherShiftHours: 2` |
| +3 °C Outdoor | `temperatureOffsetC: 3` |
| PV −10% Efficiency | `pvDerate: 0.9` — through the soiling hook `moduleDcPowerW` already had |
| Battery ×2 Capacity | capacity and power limit ×2, SoC preserved |
| Grid Unavailable | `gridAvailable: false` |
| Façade Locked Open / Closed | `facadeOpenness: 1` / `0` |

"Rain 2 hours earlier" shifts the **whole** driver sample, not the rain channel:
shifting rain alone would schedule rainfall under an unchanged clear sky, which
is not a pattern any forecast could produce. Stated in the study's `assumption`.

### Still no duplicated equations

The comparator and the recommender compute no physics. Both walks go through the
same `projectWalk` as the live prediction, and the façade thermal response
reuses `metrics.ts` — extended with one more extraction in the Stage 8.1 style.
The strongest proof is an assertion in validation: **the study's baseline walk is
byte-identical to the live prediction's walk.**

### The bug the What-If caught in Stage 8.1

Running "Heavily Overcast" showed façade solar gain **unchanged**. That is
impossible, and it exposed a real error in the Stage 8.1 projection.

`FacadePanel.solarExposure` — what `facadeSolarGainKW` is defined against — is
**normalised irradiance** (`irradiance / 1000`), not the geometric cosine
projection. Stage 8.1 had been feeding it the bare cosine, which carries no cloud
attenuation at all. Fixed by extracting `normalisedExposure()` in `metrics.ts`,
using it in both `adaptiveSkin.ts` and the projection. Façade gain now moves
149.9 → 74.4 kW under overcast, as it always should have.

This is the argument for building What-If: asking the twin a question whose
answer you already know is how you discover it has been quietly wrong.

### Two studies that land on modelling boundaries — reported, not papered over

**The façade studies.** Locking the façade closed cuts peak solar gain 149.9 → 0
kW and daylight 55% → 0%. It moves the projected HVAC **electrical** demand by
exactly nothing — because the BEMS load model responds to outdoor dry-bulb and
occupancy, and is not yet coupled to façade solar gain. The recommendation says
so in `limitation`. Inventing that coupling would have produced a better-looking
number and made every other number in the twin untrustworthy.

**The islanding study.** Removing the grid changes no dispatch decision at all,
because the utility is the balancing component and the battery already covers the
full deficit within its limits regardless. The study therefore *reclassifies* the
residual the bus already settled — 1,229.8 kWh of import becomes 1,229.8 kWh of
unserved load — rather than re-settling anything. That is the honest finding, and
a genuinely useful one.

**Energy cost** is listed as a metric and marked "Not modelled", with the reason:
the grid engine pins `tariffPeriod` to null until the Financial Analytics stage.
A visible gap beats an invented rate.

### Three claims the validation caught overstating

1. "reduces grid import by 1% **lower**" — fixed by separating `movement()`
   ("18% lower", reads after *is*) from `magnitude()` ("18%", reads after *by*).
2. The battery study claimed savings "concentrated in the hours after sunset".
   The walk showed the opposite: the pack empties to its reserve floor at 11:00.
   The sentence now reads the hours off the data and says *"delivered at 11:00 —
   not after sunset, because the pack reaches its reserve floor before then"*.
3. Islanding coverage was computed as `unserved/(unserved+pv)`. Replaced with the
   actual definition, `(load − unserved)/load`.

### Performance

The sandbox **never runs on its own**. There is no polling entry point on
`WhatIfEngine`; `run()` fires only from the Run Analysis button. One study is two
12-step projections over pure data — well under a frame, and zero cost to the
simulation loop or the 8 Hz snapshot poll.

The poll does one string-join comparison to detect staleness, and only once a
study exists. When the twin drifts, the panel *says so* rather than re-running —
an analysis the operator did not ask for is one whose timing they cannot trust.

One related fix: the prediction cache key now includes façade openness. The
blades keep moving under PBIF while the clock barely advances, so without it the
projected solar gain would freeze until the 30-minute time bucket rolled over.

### Validation

| Check | Result |
|---|---|
| Live simulation unchanged | ✓ snapshot byte-identical after all 8 studies |
| Live prediction unchanged | ✓ byte-identical after all 8 studies |
| Sandbox isolated | ✓ object spread; nothing to tear down |
| PBIF unchanged | ✓ no write path exists |
| Existing engines reused | ✓ study baseline walk **==** live prediction walk |
| No duplicated equations | ✓ comparator and recommender compute no physics |
| Results reproducible | ✓ same study twice → identical result |
| Staleness | ✓ false on run, true after a 6 h scrub, cleared by Reset |
| Refuses without data | ✓ Forecast Mode + empty cache → `run()` returns null |
| Stage 8.1 regression | ✓ Manual persists sliders, cache stable, scenario swap invalidates, determinism holds |
| TypeScript | ✓ clean |
| ESLint | ✓ clean on all new and modified files |
| Production build | ✓ compiles |

One Stage 8.1 claim needed restating. "Same hour → identical walk" is no longer
strictly true, because the projection now carries the façade's live openness and
the blades genuinely move. Verified that the walks differ in the façade-derived
fields **only** — every other field byte-identical, battery untouched. The precise
property is *the walk is a pure function of the context*, which the What-If
reproducibility assertion proves directly.

---

## Stage 8.1 — AI Prediction Layer

_2026-08-01_

### Why this stage happened

Every earlier stage answered *what is happening now*. The twin could show the
operator that grid import was 150 kW, but not that it was about to climb, nor
why. Stage 8.1 adds the first subsystem that looks **forward**: an engineering
advisor that projects the twin twelve hours ahead and explains its reasoning.

### The one rule that shaped everything: it is an observer

The AI does not control the building. PBIF remains the sole authority over the
adaptive façade, and nothing in this layer writes to solar physics, the virtual
sensors, PBIF, the servo, the façade, the PV chain, the battery or the grid.

That is enforced by the **type system**, not by discipline. The Prediction Engine
is never handed the `Simulation` object. It receives a `PredictionContext` — a
flat, `Readonly`-typed view that `Simulation.predictionContext()` assembles from
values the engines have already published. There is no handle in the subsystem
through which state *could* be mutated, so the guarantee cannot be eroded by a
future edit that forgets the rule.

The smoke test asserts it directly: twenty `getPrediction()` calls leave
`sim.snapshot()` byte-identical.

### New files

| File | Role |
|---|---|
| `src/lib/prediction/types.ts` | The contract: `PredictionContext`, `TwinProjection`, `Prediction`, `Insight`, `PredictionReport` |
| `src/lib/prediction/projection.ts` | The forward walk — future weather → sun → PV → demand → bus → storage → grid |
| `src/lib/prediction/confidence.ts` | Confidence as horizon × freshness × stability. No randomness anywhere |
| `src/lib/prediction/insights.ts` | Narration: per-horizon predictions, cross-horizon insights, the reasoning chain |
| `src/lib/prediction/predictionEngine.ts` | `PredictionEngine` — orchestration, caching, invalidation |
| `src/lib/prediction/index.ts` | Public surface |
| `src/components/twin3d/ui/AiPredictionPanel.tsx` | The AI Prediction floating window |

### Modified files

| File | Change |
|---|---|
| `src/lib/engine/simulation.ts` | Owns `prediction`; adds `predictionContext()` and `getPrediction()`. **`tick()` is untouched** |
| `src/lib/engine/store.ts` | Holds the cached `prediction` report beside the snapshot |
| `src/lib/dt/windowStore.ts` | `WindowId` gains `'ai'` |
| `src/components/twin3d/ui/workspaceTools.tsx` | Registers the AI Prediction tool |
| `src/lib/engine/solarPhysics.ts` | Extracted `planeIrradiance()`, `attenuatedGHI()`, `DIFFUSE_SKY_FRACTION` |
| `src/lib/engine/pvElectrical.ts` | Extracted `moduleDcPowerW()`, `PV_MODULE_RATED_POWER_W`, `PV_STC_IRRADIANCE_WM2` |
| `src/lib/engine/pvInverter.ts` | Extracted `convertDcToAc()` and the nameplate constants; added `getBaseEfficiency()` |
| `src/lib/engine/buildingEnergy.ts` | Extracted `hvacDemandFactor()`, `categoryDemandKW()`, `buildingDemandKW()` |
| `src/lib/engine/battery.ts` | Extracted `planStorage()` + `StorageLimits`; added `getLimits()` |

### The extractions are the architectural point

A prediction layer is only trustworthy if it projects **this** twin rather than a
plausible imitation of it. The obvious implementation — reimplement the PV curve,
the load profile and the dispatch rule inside the prediction module — would have
produced a second physics that drifts from the first at every future edit.

So instead, five engines each gave up a **pure function** that they now call
themselves and the projection also calls:

```text
computeSun        (already pure)          → sun position + clear-sky irradiance
sampleTimeline    (already pure)          → future weather drivers
planeIrradiance   ← solarPhysics.ts       → irradiance on any plane
moduleDcPowerW    ← pvElectrical.ts       → DC power from irradiance
convertDcToAc     ← pvInverter.ts         → AC output, clipping, standby
buildingDemandKW  ← buildingEnergy.ts     → demand from hour + temperature
settleBus         (already pure)          → the energy balance
planStorage       ← battery.ts            → charge/discharge + resulting SoC
```

Every one is an *extraction*: the live engine's behaviour is unchanged, it simply
now calls the function instead of inlining the arithmetic. `PVInverterEngine.update()`
went from 30 lines to 6. `BatteryEnergyEngine.dispatch()` from 60 to 15. There is
still exactly one PV curve, one load model and one dispatch rule in the codebase —
the projection and the simulation cannot disagree, because they are the same code.

### The projection is one walk, sampled four times

Rather than computing four independent horizons, the engine walks the twin
forward in one-hour steps out to twelve hours and **samples** that walk at 1, 3,
6 and 12 hours. This matters for two reasons:

- The battery's state of charge at +12 h is the result of twelve real dispatch
  decisions carried forward, not a single extrapolation.
- The insight generator gets an hour-resolved series, so it can say *when*
  something changes ("cloud increases to 93% by 08:15") rather than only *that*
  it does.

The calendar date rolls over correctly at midnight, so a twelve-hour horizon from
20:00 lands on tomorrow's sun rather than today's.

### Three simplifications, stated in the panel rather than hidden

1. **Blade rotation is not projected.** Façade exposure is reported against the
   fixed *surface* normals. Predicting blade angles would mean predicting PBIF's
   decisions — and PBIF is the controller, not this layer's subject. The AI
   states the solar resource arriving at each elevation and stops there.
2. **Neighbour occlusion is not ray-cast forward.** Ray-casting 1,620 panels
   twelve times per recompute is not a cost an advisory layer may impose. The
   case-study site declares no neighbours, so today this changes nothing.
3. **The HVAC lag uses its equilibrium value** — a 15 simulated-minute time
   constant against a 1–12 hour horizon.

All three are listed under "Projection assumptions" in the panel. A projection
that quietly simplifies is a projection that cannot be audited.

### Confidence: three factors, no randomness

```text
score = horizon × freshness × stability
```

- **horizon** — 1.00 at +1 h decaying to 0.58 at +12 h.
- **freshness** — Forecast Mode decays with cache age against the same
  Excellent/Good/Fair/Stale thresholds the Weather panel already reports, so the
  two readouts can never contradict each other. A built-in scenario is a
  *definition* of the day and never decays (1.00). Manual Mode is capped at 0.50,
  because persistence is an assumption rather than data.
- **stability** — the peak-to-trough swing of cloud and rain **across the
  interval traversed**, not just at the endpoint. A storm passing at +4 h
  therefore weighs on the +6 h statement even when +6 h itself is calm.

The panel always shows which factor was binding, so a Low grade says what would
raise it ("the cached forecast is 7 h old — refreshing it would raise confidence")
rather than being mysterious.

### Explainability is the layout, not a footnote

Every prediction expands into `Statement → Evidence → Data Source`:

> **Prediction** PV generation is expected to fall to 7.5 kW AC by 18:00.
> **Evidence** 176 W/m² plane-of-array across 189 modules → 7.7 kW DC → 7.5 kW AC (Producing).
> **Data Source** PV Array + Inverter Model

Nothing is emitted that the walk does not support. Three claims were caught
overstating causality during validation and were made conditional on the data:

- Clearing skies at 03:00 no longer claim to raise façade irradiance — the panel
  now says "after dark, so façade irradiance is unaffected".
- Rain only "holds irradiance down" when that hour's irradiance is genuinely
  below the window average; rain at the sunniest hour just reports the value.
- Rising grid import attributes itself to falling PV, climbing demand, or both —
  read off the projection rather than assumed. The overnight-into-morning case is
  entirely demand-driven and now says so.

### Performance: the simulation loop pays nothing

`tick()` never calls into this subsystem. The store's ~8 Hz poll calls
`getPrediction()`, which compares an invalidation key built from everything a
projection depends on — the clock (quantised to 30 simulated minutes), the
weather source and scenario, the forecast timeline version, the manual drivers,
and the site/massing. On a match it returns the **same object by reference**, so
zustand's selector sees no change and the panel does not re-render.

A real recompute is ~12 `computeSun` calls plus arithmetic: roughly 0.4/s at 1×
playback and 4/s at 10×. A scrub or source change lands in a new bucket
immediately, so the operator never waits.

### Validation

| Check | Result |
|---|---|
| Predictions change with weather | ✓ tropical-mixed vs thunderstorm differ at every horizon |
| Predictions change with simulation time | ✓ 09:00 → 15:00 moves +1 h irradiance 409 → 477 W/m² |
| Manual Mode supported | ✓ persists the sliders; stability 1.00, freshness capped at 0.50 |
| Scenario Mode supported | ✓ samples the built-in timeline |
| Forecast Mode supported | ✓ live Open-Meteo; real epochs, MYT stamps, provenance per horizon |
| Empty forecast cache | ✓ status `Holding`, **zero** horizons emitted, panel explains why |
| No simulation state modified | ✓ 20 `getPrediction()` calls leave the snapshot byte-identical |
| PBIF remains deterministic | ✓ untouched — the AI has no write path to it |
| Determinism | ✓ same hour → byte-identical walk, after scrubbing away and back |
| Midnight crossing | ✓ 20:00 + 12 h lands on tomorrow's sunrise |
| TypeScript | ✓ clean |
| ESLint | ✓ clean on all new and modified files |
| Production build | ✓ compiles |

### One bug the validation caught

The first implementation read `weatherScenario.getTimeline()` unconditionally.
That getter returns the **loaded** scenario's timeline even in Manual Mode, where
that scenario is not driving anything — so Manual Mode was projecting a
thunderstorm the twin was not running, producing numbers identical to the
scenario run that preceded it. Resolved by `activeTimeline()`, which gates on the
engine's own `isActive()` so the two definitions of "the timeline owns the
weather" cannot drift apart.

---

## Stage 7.6 — Utility Grid Integration & Energy Exchange

_2026-07-31_

### Why this stage happened

Stage 7.5 ended with a shortfall that nothing supplied and a surplus that nothing
absorbed. Stage 7.6 adds the terminal node of the energy architecture:

```text
PV Plant → PV Inverter → Building Energy Bus ─┬─► Building Load
                                              ├─► Battery Storage
                                              └─► Utility Grid
```

The grid is the **balancing component**: every other subsystem gets first
refusal, and the grid takes whatever is left in either direction.

### New files

| File | Role |
|---|---|
| `src/lib/engine/grid.ts` | `GridEnergyEngine` — import/export power, grid state, connection spec |
| `src/lib/engine/energyLedger.ts` | `DailyEnergyLedger` — the six daily energy totals and daily peaks |

### Modified files

| File | Change |
|---|---|
| `src/lib/engine/buildingEnergy.ts` | `bus.gridKW` now carries the real signed exchange (one line + docs) |
| `src/lib/engine/pvEquipment.ts` | `GRID_SPEC` nameplate block |
| `src/lib/engine/simulation.ts` | Owns `grid` and `energyLedger`; shares one simulated step |
| `src/lib/engine/types.ts` | `SimSnapshot` gains `grid` and `daily` |
| `src/components/twin3d/ui/RooftopPvPanel.tsx` | Utility Grid card + Daily Energy disclosure |

**Untouched**, as required: `solarPhysics.ts`, `RoofSolarArray.tsx`, `pvArray.ts`,
`pvElectrical.ts`, `pvInverter.ts`, `battery.ts`, the adaptive façade, PBIF, the
Virtual Sensor, the servo model, the Cyber-Physical Pipeline, the camera and the
neighbour system. `BuildingEnergyEngine`'s class body is unchanged — the only
edit in that file is `settleBus()` populating the grid port it had already
declared.

### The GridEnergyEngine — and why it performs no routing

This is the architectural point of the stage. Because the utility connection is
unlimited and unconditional, its import and export are **already** what the bus
computed as `requiredGridImportKW` and `surplusKW` after PV served the load and
the battery took its turn. Re-deriving them inside the grid engine would create a
second authority for the same two numbers and let the two drift apart.

So the engine **projects** the settled bus into grid terms — state, signed net
exchange, connection specification — and adds no arithmetic beyond
classification. The routing change in `buildingEnergy.ts` is therefore a single
line:

```ts
bus.gridKW = bus.requiredGridImportKW - bus.surplusKW
```

That the engine is thin is not a sign it should not exist: it owns grid state
classification, the connection specification, and the seams where net metering,
demand charges, power quality and a future `Offline` (islanding) state will live.

### Grid Import

```text
importKW = max(0, bus.requiredGridImportKW)
         = deficit − batteryDischarge
```

Whenever demand exceeds PV plus battery discharge, the grid supplies exactly the
remaining deficit — no more, no less. Verified to equal the residual on every
randomised case below.

### Grid Export

```text
exportKW = max(0, bus.surplusKW)
         = pvSurplus − batteryCharge
```

Export is never fabricated. With no surplus it is **exactly zero**, verified over
a full simulated day: `export 0.0000 kWh, peakExport 0.0000 kW`. That is the
expected weekday result for this building and follows from Stage 7.4's sizing
finding, not from any special case in the grid code.

Import and export are mutually exclusive by construction — asserted over 50,000
randomised cases, never once simultaneous.

### Energy conservation

The Stage 7.6 identity:

```text
PV + BatteryDischarge + GridImport  ==  BuildingLoad + BatteryCharge + GridExport
```

holds *identically*, not approximately. Substituting the bus definitions, both
sides reduce to `generation + load − pvToLoad`. Verified numerically to a worst
imbalance of **2.84 × 10⁻¹⁴ over 50,000 randomised cases** spanning generation
0–250 kW, load 0–250 kW and deliberately rogue battery dispatches. Two further
invariants were asserted on every case: `netKW == importKW − exportKW`, and
`bus.gridKW == grid.netKW` — the bus and the engine can never disagree.

### The daily energy counters

`DailyEnergyLedger` is a separate module because the day boundary is a
system-level concept shared by PV, the building, the battery and the grid — it
belongs to none of them individually. Keeping it separate means:

- exactly one place where a kW becomes a kWh;
- the grid engine holds **no** energy counters of its own, so daily import shown
  in the Utility Grid card and in the Daily Energy list can never diverge.

It integrates all six flows plus the daily peak import/export:

```text
energy += power × dtSimHours
```

over **simulated** seconds, matching the load model, the HVAC lag and the
battery's state of charge. Two boundary rules:

- **Midnight roll** — a genuine forward elapse whose clock wrapped past 24:00
  resets the totals and advances `dayCount`.
- **Discontinuity** — the clock moving without simulated time passing (a timeline
  scrub or date change) also restarts the day, because totals that span an
  interval which was never simulated would be misleading. A pause moves neither,
  so it is correctly ignored.

Verified: exactly 50.000 kWh after one simulated hour at 50 kW; ~1,200 kWh by
23:59; reset to 0.5 kWh and `day 2` immediately after the midnight roll.

### Rooftop PV panel

A **Utility Grid** card sits after Battery Storage: specification block (Three-Phase
AC · 415 V · 50 Hz) · grid import · grid export · grid state · daily imported ·
daily exported · peak import · peak export · plus the live reason line.

The Building Energy Flow card gained a collapsible **Daily energy · day N**
disclosure listing all six counters with the elapsed simulated hours, colour-keyed
to match the flow visualisation.

The connection specification is cited: a Malaysian commercial low-voltage supply
is three-phase 415 V / 50 Hz (TNB distribution practice, MS IEC 60038).

### Performance

Zero hot-path allocations — both the grid state object and the ledger totals
object are created once and mutated in place. The simulated step is taken **once**
per tick and shared, so the bus, the battery's SOC and the ledger all integrate
the identical interval; there is no second settlement pass and no second clock
derivation.

| Concern | Result |
|---|---|
| Duplicate routing | None — the grid projects the bus, it does not re-route |
| Duplicate energy calculations | None — the ledger is the sole kW→kWh authority |
| Per-frame allocations | None |
| Update rate | Environmental tier (20 Hz) |
| Added cost per tick | ~8 comparisons and ~8 multiply-accumulates |

### Validation

| Checklist item | Result |
|---|---|
| GridEnergyEngine created | ✓ `src/lib/engine/grid.ts` |
| Grid Import implemented | ✓ equals the remaining deficit exactly |
| Grid Export implemented | ✓ equals the remaining surplus; never fabricated |
| Daily energy counters implemented | ✓ six totals + peaks, simulated-midnight reset |
| Grid states implemented | ✓ Importing / Exporting / Idle (+ `Offline` declared) |
| Utility Grid panel added | ✓ all seven required fields + specification |
| Energy conservation maintained | ✓ 2.84 × 10⁻¹⁴ worst over 50,000 cases |
| No financial calculations | ✓ no pricing, tariffs, ROI, payback, carbon |
| TypeScript builds cleanly | ✓ `tsc --noEmit` clean |
| No ESLint regressions | ✓ all seven touched files: 0 errors, 0 warnings |
| No performance regressions | ✓ zero hot-path allocations |

Additional: import/export never simultaneous; `bus.gridKW == grid.netKW` on every
case; `/digital-twin` compiles and serves 200 with a clean dev log.

### Documentation

- `PBIF_ENGINEERING_GUIDE.md` — §14 progress-log entry for Stage 7.6.
- This file.

---

## Stage 7.5 — Battery Energy Storage System (BESS)

_2026-07-31_

### Why this stage happened

Stage 7.4 ended the energy chain at Building Load, with any shortfall reported as
a grid import that nothing supplied. Stage 7.5 inserts storage between demand and
that future grid connection:

```text
PV Plant → PV Inverter → Building Energy Bus → Building Load
                                 │
                                 ▼
                      Battery Energy Storage
                                 │
                                 ▼
                        (future) Grid Import
```

### New files

| File | Role |
|---|---|
| `src/lib/engine/battery.ts` | `BatteryEnergyEngine` — SOC, dispatch, limits, efficiency |

### Modified files

| File | Change |
|---|---|
| `src/lib/engine/buildingEnergy.ts` | Bus gains its storage terms + the `StoragePort` seam |
| `src/lib/engine/pvEquipment.ts` | `BATTERY_SPEC` nameplate block |
| `src/lib/engine/simulation.ts` | Owns `battery`; connects it to the bus; publishes it on the snapshot |
| `src/lib/engine/types.ts` | `SimSnapshot` gains `battery: BatteryState` |
| `src/components/twin3d/ui/RooftopPvPanel.tsx` | Battery Storage card + battery-aware flow visualisation |

**Untouched**, as required: `solarPhysics.ts`, `RoofSolarArray.tsx`, `pvArray.ts`,
`pvElectrical.ts`, `pvInverter.ts`, the adaptive façade, PBIF, the Virtual
Sensor, the servo model, the Cyber-Physical Pipeline, the camera and the
neighbour system. The **BuildingEnergyEngine's demand model** — categories,
densities, occupancy schedule, HVAC response and thermal lag — is byte-identical;
only the bus settlement was extended, at the seam Stage 7.4 explicitly reserved
for it ("when Battery and Grid land in Stage 7.5 they become additional terms
*here* and nowhere else").

### The BatteryEnergyEngine

Pure, framework-free, renders nothing. It implements a `StoragePort` interface
declared by `buildingEnergy.ts` and is handed **only** the PV-only imbalance the
bus already computed — surplus and deficit. It never sees irradiance, PV
metrics, building geometry or the load model, and recomputes none of them.

The port matters architecturally: `buildingEnergy.ts` imports nothing from
`battery.ts`. The router knows there is *a* store, not *which* store, so the
future grid connection can plug in through the same pattern and storage can be
disconnected (`connectStorage(null)`) to recover the exact Stage 7.4 behaviour.

### Specification

| Parameter | Value | Source |
|---|---|---|
| Battery capacity | **39.56 kWh** | **Project report** |
| Status | Online | Project report |
| Reserve floor | 10% | Brief's suggested value, configurable |
| Power limit | 0.5C → 19.78 kW | **Engineering assumption** |
| Charge / discharge efficiency | 96% each way (92.2% round-trip) | **Engineering assumption** |
| Commissioning SOC | 50% | Simulation initial condition |

The report gives the capacity and nothing else — no manufacturer, no chemistry,
no power conversion rating. None is invented. The panel prints capacity and
status as specification, and states the C-rate, efficiency and reserve as assumed
in a footnote, so a derived value can never be mistaken for a datasheet figure.
`BATTERY_CAPACITY_KWH` lives in the engine and is imported by the spec module, so
39.56 has exactly one authority.

### State of Charge

`storedKWh` is the integrated state; everything else is derived from it:

```text
soc          = stored / capacity
availableKWh = max(0, stored − capacity × reserveFraction)   ← what may still be discharged
headroomKWh  = max(0, capacity − stored)                     ← what may still be absorbed
```

Energy is integrated over **simulated** seconds, matching the load model and the
HVAC lag (Stage 7.4's simulated-vs-real-time fix). `dt = 0` — pause,
initialisation, or a timeline scrub — transfers no energy at all.

### Charging and discharging logic

Exactly one direction can be active per step, because surplus and deficit are
mutually exclusive by construction.

**Charging** — when PV generation exceeds demand:

```text
headroomLimit = headroom / (η_charge × dt_h)
charge        = min(surplus, maxPower, headroomLimit)
stored       += charge × η_charge × dt_h
```

**Discharging** — when demand exceeds PV generation:

```text
availableLimit = (available × η_discharge) / dt_h
discharge      = min(deficit, maxPower, availableLimit)
stored        -= (discharge / η_discharge) × dt_h
```

The efficiency appears on opposite sides in the two directions, which is the
physics: stored energy is AC power *times* charge efficiency, whereas AC power
delivered is stored energy *times* discharge efficiency. Charge never exceeds
available surplus, discharge never exceeds the deficit, and neither can breach
the capacity ceiling or the reserve floor.

### Bus integration

`settleBus()` now routes in strict priority order:

```text
1. PV → load               pvToLoad = min(generation, load)
2. PV surplus → battery    charge
3. battery → load          discharge
4. remainder               requiredGridImport = deficit − discharge   (not supplied)
```

with conservation enforced on both sides:

```text
generation = pvToLoad + batteryCharge + surplus
load       = pvToLoad + batteryDischarge + requiredGridImport
```

The dispatch is **clamped to the imbalance it was offered**, so even a
misbehaving storage implementation cannot break conservation on the bus.
`requiredGridImportKW` became `deficit − batteryDischarge` exactly as Stage 7.4
predicted, so every existing consumer of that field stayed correct without
changing. `selfConsumptionKW` now means generation retained on site — direct plus
stored — which is the industry definition; the direct-only portion is available
separately as `pvToLoadKW`.

### On a battery that rarely charges

For the case-study building the PV plant never exceeds demand during generation
hours (Stage 7.4's finding). The battery is therefore written to handle that
**gracefully rather than to work around it**:

- charging is driven strictly by real surplus — never fabricated;
- with no surplus the battery discharges to its reserve floor and then parks,
  reporting *why* through a `reason` string rather than silently idling, because
  an unexplained idle reads as a fault;
- the dispatch rule is expressed purely in terms of surplus and deficit, so any
  future operating mode that produces surplus charges it with no architectural
  change at all.

That last claim was verified, not assumed. Running the identical engine with the
only change being a larger array:

| | Case study (as built) | Same code, surplus available |
|---|---|---|
| 11:00 | idle, SOC 10% | **charging 19.8 kW**, SOC 25% |
| 12:00 | idle, SOC 10% | **charging 19.8 kW**, SOC 73% |
| 13:00 | idle, SOC 10% | idle, SOC **100%** (full) |
| 16:00 | idle, SOC 10% | **discharging 19.8 kW**, grid import 53.8 → **34.0 kW** |

Not one line of battery or bus code differs between those two columns. The same
will hold for a weekend/holiday schedule or reduced occupancy when those land.

In the as-built case the battery discharges its 50% commissioning charge within
the first simulated hour and then reports:

> *Holding at 10% reserve — no PV surplus available to recharge.*

### Rooftop PV panel

A **Battery Storage** card sits between Inverter and Building Energy Flow:
specification block · state-of-charge bar with the reserve floor marked · the
live reason · stored energy, capacity, charge rate, discharge rate, operating
state and reserve · an assumptions footnote.

The **energy flow visualisation** now shows the full routing. Both bars share one
scale and are split by where the energy actually went:

```text
PV Generation  →  direct to load │ into battery │ uncommitted surplus
Building Load  ←  direct from PV │ from battery │ grid import required
                    PV → Building → Battery → Grid (future)
```

Still deliberately static — the only motion is a CSS width transition.

### Performance

Zero hot-path allocations. The battery's state object and its dispatch object are
created once in the constructor and mutated in place; `NO_STORAGE` is a module
constant used when nothing is connected. The bus settles **once** per tick, and
the PV-only imbalance is computed inline where it is needed rather than by a
second settlement pass.

| Concern | Result |
|---|---|
| Duplicate calculations | None — the battery receives the imbalance, never recomputes it |
| Duplicate energy routing | None — `settleBus()` remains the single settlement point |
| Per-frame allocations | None |
| Update rate | Environmental tier (20 Hz), inside the existing BEMS call |
| Added cost per tick | ~10 arithmetic ops and 2 comparisons |

### Validation

| Checklist item | Result |
|---|---|
| BatteryEnergyEngine created | ✓ `src/lib/engine/battery.ts` |
| 39.56 kWh battery implemented | ✓ from the report, single authority |
| SOC updates continuously | ✓ integrated over simulated time |
| Charging logic implemented | ✓ exact: 19.78 + 15 × 0.96 = 34.18 kWh verified |
| Discharging logic implemented | ✓ verified reducing grid import 53.8 → 34.0 kW |
| Reserve capacity respected | ✓ stops at exactly 10.00%, never below |
| Battery efficiency implemented | ✓ constant, 92.2% round-trip, hooks for temperature/ageing declared |
| Building Energy Bus updated | ✓ storage routed between load and future grid |
| Rooftop PV panel updated | ✓ Battery Storage card + routing visualisation |
| Live battery telemetry displayed | ✓ all seven required fields |
| No financial calculations | ✓ |
| No carbon calculations | ✓ |
| No tariff calculations | ✓ |
| TypeScript builds cleanly | ✓ `tsc --noEmit` clean |
| No ESLint regressions | ✓ all six touched files: 0 errors, 0 warnings |
| No performance regressions | ✓ zero hot-path allocations |

Additional checks: bus conservation verified to 2.8 × 10⁻¹⁴ over **20,000
randomised cases** including deliberately rogue dispatches; overcharge protection
fills to exactly 100% then reports "Full"; `dt = 0` provably transfers no energy;
`/digital-twin` compiles and serves 200 with a clean dev log.

### Documentation

- `PBIF_ENGINEERING_GUIDE.md` — §14 progress-log entry for Stage 7.5.
- This file.

---

## Stage 7.4 — Building Energy Management System (BEMS)

_2026-07-31_

### Why this stage happened

The PV plant produced AC power that went nowhere. The chain ended at the
inverter:

```text
Environment → Solar Physics → PV Array → DC → Inverter → AC → ???
```

Stage 7.4 gives that power a destination and closes the electrical story:

```text
Environment → Solar Physics → PV Plant → AC Output
                                            │
                                            ▼
                                  Building Energy Bus
                                            │
                                            ▼
                                     Building Load
```

Battery and Grid are **deliberately not implemented** — the bus declares their
ports and reports the import a grid connection *would* have to supply, but
nothing is stored or exchanged. That is Stage 7.5.

### New files

| File | Role |
|---|---|
| `src/lib/engine/buildingEnergy.ts` | `BuildingEnergyEngine` — demand model, the AC bus, the energy balance |
| `src/lib/engine/pvEquipment.ts` | Static nameplate specification from the project report |

### Modified files

| File | Change |
|---|---|
| `src/lib/engine/simulation.ts` | Owns `buildingEnergy`; updates it once per environmental tick; publishes `energy` on the snapshot; derives simulated elapsed time |
| `src/lib/engine/types.ts` | `SimSnapshot` gains `energy: BuildingEnergySnapshot` |
| `src/components/twin3d/ui/RooftopPvPanel.tsx` | Restructured into Plant Summary · PV Array · Inverter · Building Energy Flow; specification separated from telemetry |

**Untouched**, as required: `solarPhysics.ts`, `RoofSolarArray.tsx`, `pvArray.ts`,
`pvElectrical.ts`, `pvInverter.ts`, the adaptive façade, PBIF, the Virtual
Sensor, the servo model, the Cyber-Physical Pipeline, the camera and the
neighbour system.

### The BuildingEnergyEngine

A pure, framework-free subsystem that renders nothing and reaches into nothing.
It receives four scalars — time of day, outdoor temperature, **the inverter's
already-computed AC output**, and elapsed simulated time — and publishes one
cached snapshot.

The critical architectural rule: **it never re-derives PV power.**
`pvACOutputKW` comes straight from `PVInverterEngine.getMetrics()
.currentACPowerKW`, so generation has exactly one authority, in the same way
`SolarPhysicsEngine` is the one authority for irradiance. There is no second
irradiance→power path anywhere in the BEMS.

It sits in the environmental tier immediately after the inverter:

```text
solarPhysics.update()  →  pvElectrical.update()  →  pvInverter.update()
                                                          │
                                                          ▼
                                              buildingEnergy.update()
```

### The Building AC Bus

The bus is a real architectural node, not incidental arithmetic — it is settled
by one pure function, `settleBus()`, which is the single place the energy balance
is resolved:

```text
      ┌── PV Inverter ──►┐                        ├──► Building Load
      │ (future) Battery ┤  Building Energy Bus   ├──► (future) Battery charge
      └──── (future) Grid┘                        └──► (future) Grid export
```

Stage 7.4 connects exactly two ports: generation in, load out. Conservation is
enforced by construction:

```text
generation = selfConsumption + surplus
load       = selfConsumption + deficit
```

`batteryKW` and `gridKW` exist on the bus state and are pinned to `0` with a
comment saying why. `requiredGridImportKW` is kept as its own field even though
it currently equals `deficitKW`, because once storage lands it becomes
`deficit − batteryDischarge` and every consumer stays correct without changing.
When Battery and Grid arrive they become additional terms **inside
`settleBus()`** and nowhere else.

### The Building Load model

A commercial-office demand profile with five categories, each expressed as a peak
**power density** in W/m² of gross floor area plus the fraction still drawn
overnight:

| Category | Peak W/m² | Night fraction | Weather-sensitive |
|---|---|---|---|
| HVAC | 22 | 0.15 | yes |
| Lighting | 8 | 0.10 | no |
| Office Equipment | 7 | 0.25 | no |
| Elevators | 2 | 0.05 | no |
| Building Services | 3 | 0.55 | no |

Sources: ASHRAE 90.1 lighting-power-density and plug-load allowances for office
space; CIBSE Guide F for vertical transport and landlord services; MS 1525
Malaysian practice for the HVAC share of a cooling-dominated office. At the
case-study building's 5,000 m² GFA this gives a **42 W/m² peak (210 kW)** and a
**7.4 W/m² unoccupied base (37 kW)**.

**Occupancy** follows the ASHRAE 90.1 Appendix G / CIBSE Guide F weekday office
schedule — arrival 06:30–08:30, lunch dip across 12:00–13:30, departure
17:00–19:30 — built entirely from `smoothstep` transitions so the curve is
C¹-continuous and no discontinuity can appear in the energy balance when the
clock crosses an edge.

**HVAC** additionally responds to outdoor temperature through the degree-hour
approximation (CIBSE Guide A / ASHRAE Fundamentals): demand rises from a 0.55
multiplier at a 24 °C balance point to 1.0 at a 34 °C design condition, passed
through a **first-order lag with a 15-minute time constant** representing the
plant and fabric thermal mass.

That lag produced the one real bug found and fixed during this stage. It was
originally expressed in wall-clock seconds — but the twin compresses a simulated
day into ~2 real minutes at 1×, so a 4-minute real lag would have been *two
simulated days* long and the HVAC would never have responded to the diurnal
temperature swing at all. Elapsed time is now derived from the simulation clock
itself (`energyStepSimSeconds()`), which is correct when paused, at any playback
speed, across the midnight wrap, and when the timeline is scrubbed (a jump of
more than an hour is treated as a discontinuity and the lag re-initialises rather
than integrating an elapse that never happened).

The result, verified over a full simulated day at steady state:

| Time | Occupancy | Load | HVAC | PV | Coverage |
|---|---|---|---|---|---|
| 03:00 | 0% | 35.7 kW | 14.2 kW | 0.3 kW | 1% |
| 08:00 | 84% | 145.6 kW | 57.9 kW | 19.4 kW | 13% |
| 13:00 | 81% | 149.9 kW | 64.4 kW | 80.0 kW | 53% |
| 17:00 | 100% | 203.7 kW | 103.7 kW | 32.3 kW | 16% |
| 22:00 | 0% | 38.0 kW | 16.5 kW | 0.8 kW | 2% |

Note HVAC peaking at **17:00**, two hours after the 15:00 temperature peak —
that lag is the thermal mass doing exactly what it should, and it is emergent,
not scripted.

### Energy flow calculations

Computed once per environmental tick, all in `settleBus()`:

| Quantity | Definition |
|---|---|
| Self Consumption | `min(generation, load)` |
| Surplus | `max(0, generation − load)` |
| Deficit | `max(0, load − generation)` |
| Required Grid Import | `= deficit` (no storage yet) |
| Self-Consumption Ratio | `selfConsumption / generation`, 0 when generation is 0 |
| Building Coverage | `selfConsumption / load`, 0 when load is 0 |

Both worked examples from the brief reproduce exactly:

```text
PV 62.4 kW · Load 54.1 kW  →  self 54.1 · surplus 8.3 · import 0.0 · coverage 100%
PV 21.5 kW · Load 48.7 kW  →  self 21.5 · surplus 0.0 · import 27.2 · coverage  44%
```

### Engineering finding: surplus is structurally zero for this building

Worth stating plainly, because a metric reading 0.0 all day looks like a bug and
is not. The plant caps at **80 kW AC**; the building's demand only falls below
80 kW outside 07:15–19:00, when the array generates almost nothing. **Surplus
therefore never occurs**, and peak coverage is ~53% at solar noon.

That is the correct engineering result, not a tuning problem: a 104 kW array on a
5,000 m² tropical office is a *partial-offset* system, not a net exporter. The
surplus path is implemented and correct (proven by the 62.4/54.1 case above); it
simply never activates for this load profile. The figures were not adjusted to
make the metric light up.

### Rooftop PV panel — restructured

The panel now separates **static engineering specification** from **live
operational telemetry**, the way a commercial monitoring platform does:

```text
Plant Summary          Status · AC Output · DC Output
PV Array               SPEC: LONGi · LR5-72HBD 550M · 189 Modules · 104.02 kW DC
                       LIVE: DC output · installed (as built) · utilization
                             · operating modules · average irradiance
Inverter               SPEC: Huawei · SUN2000-80KTL-M1 · 80 kW AC · 98%
                       LIVE: AC output · rated · efficiency · state
                             · clipping · conversion loss
Building Energy Flow   flow visualisation · building load · PV generation
                       · self consumption · coverage · surplus · grid import
                       · load breakdown by category
Planned subsystems     Battery · Grid · Financial · Carbon (reserved)
```

Specification blocks are visually distinct — muted, no numeric emphasis, headed
`SPECIFICATION` — so a datasheet value can never be mistaken for a reading.

**Energy flow visualisation**: two proportional bars on one shared scale (the
larger of generation and demand), so their lengths are directly comparable. The
generation bar splits into self-consumed / surplus; the demand bar into
PV-supplied / grid-required. Deliberately static — the only motion is a CSS width
transition as values change. No particles, no pulsing, no flow animation.

### Note on installed capacity — 104.02 vs 103.95 kW

The report states **104.02 kW DC**; 189 × 550 W is **103.95 kW**, a 0.07 kW
(0.07%) difference already flagged in `pvElectrical.ts`. Both are surfaced and
labelled rather than reconciled: the spec block shows the report's nameplate
`104.02 kW DC`, and the live telemetry shows `Installed (as built) 103.95 kW`
from `PVElectricalEngine`, which derives it from the modules that actually exist.
This is the same nominal-vs-as-built convention the adaptive façade already uses
(guide §18.2).

### Performance

The hot path allocates nothing. The category array, each category state object,
the bus object and the snapshot object are created once in the constructor and
mutated in place, so a 20 Hz environmental tier produces zero garbage.

| Concern | Result |
|---|---|
| Duplicate energy calculations | None — AC output is read from the inverter, never recomputed |
| Duplicate traversals | None — the BEMS iterates 5 categories, not 189 modules or 1,620 panels |
| Per-frame allocations | None — everything is pre-allocated and mutated |
| Snapshot cost | `energy` is a cached reference read, like `facade` |
| Update rate | Environmental tier (20 Hz), not per frame |

Per tick the BEMS performs ~5 multiply-accumulates plus one bus settlement —
negligible beside the existing 1,620-panel façade and 189-module PV traversals.

### Validation

| Checklist item | Result |
|---|---|
| BuildingEnergyEngine created | ✓ `src/lib/engine/buildingEnergy.ts` |
| Building load model implemented | ✓ 5 categories, W/m² densities, cited |
| Building AC Bus created | ✓ `settleBus()` — the single settlement point |
| Building load updates continuously | ✓ smooth, C¹, verified over a full day |
| PV Generation updates continuously | ✓ reused from the inverter |
| Energy flow calculated | ✓ conservation asserted in test across 6 cases |
| Self Consumption calculated | ✓ incl. ratio |
| Building Coverage calculated | ✓ |
| Surplus calculated | ✓ correct; structurally 0 for this building (see above) |
| Required Grid Import calculated | ✓ own field, future-proofed for storage |
| PV panel shows manufacturer + model | ✓ LONGi LR5-72HBD 550M |
| Inverter panel shows manufacturer + model | ✓ Huawei SUN2000-80KTL-M1 |
| No battery implemented | ✓ port declared, pinned to 0 |
| No grid implemented | ✓ port declared, pinned to 0 |
| TypeScript builds cleanly | ✓ `tsc --noEmit` clean |
| No ESLint regressions | ✓ all five touched files: 0 errors, 0 warnings |
| No performance regressions | ✓ zero hot-path allocations |

Additional checks: energy conservation verified on six cases including zero and
negative generation; category shares sum to exactly 1.0; `/digital-twin` compiles
and serves 200 with a clean dev log.

### Documentation

- `PBIF_ENGINEERING_GUIDE.md` — §14 progress-log entry for Stage 7.4.
- This file.

---

## Stage 7.3.1 — UI Architecture Refinement: Separating Building Engineering from the Rooftop PV Plant

_2026-07-31_

### Why this refactor happened

Stage 7.3 landed the PV inverter model and, to get the telemetry on screen
quickly, hung the whole Rooftop PV dashboard off the bottom of the Control Deck's
**Building** tab. It worked, but it asserted an architectural relationship that
does not exist anywhere in the simulation.

In the engine, the PV plant is a **sibling** of the adaptive skin, not a child of
it:

```text
Simulation
├── skin           AdaptiveSkinEngine     ← the building's kinetic façade
├── pvArray        RooftopPVEngine        ← the plant's geometry
├── pvElectrical   PVElectricalEngine     ← the plant's DC model
└── pvInverter     PVInverterEngine       ← the plant's AC model
```

They share exactly one thing — `SolarPhysicsEngine`, the single authoritative
solar model both consume — and Stage 7.1.5 went out of its way to *remove* the PV
array from the façade's interaction and debug surfaces so it would read as
infrastructure rather than as part of the Cyber-Physical pipeline.

Nesting the PV dashboard inside the Building panel contradicted all of that. It
also mixed two engineering vocabularies in one scroll: degrees, m², modules and
elevations on one side; kW, %, W/m² and inverter states on the other. And it
displaced the building's own engineering specification, which had been squeezed
out entirely — the Building panel had drifted back to a shape picker and
tower-ranged Height/Width sliders that no longer matched the locked case-study
geometry.

**The rule applied here:** the UI's top-level structure should mirror the
engine's subsystem boundaries. One panel per independent subsystem.

### What changed

Purely presentation. **No engine file was touched** — the four files modified are
all UI, and one of them is new.

#### Building panel — restored as the engineering specification panel

| Section | State |
|---|---|
| **Orientation** | Unchanged. The interactive compass + N/E/S/W buttons remain the one editable building parameter. |
| **Geometry** | Now read-only: Programme (Commercial Office), Storeys (5), Building Height (19.0 m), Width (25 m), Length (40 m). The shape picker and the Height/Width sliders were removed — they were tower-ranged leftovers (60–280 m, 30–110 m) that could drive the massing away from the locked case study. |
| **Adaptive Façade** | Restored: Nominal Module `1.20 × 1.26 m` · As-Built Module `1.190–1.212 × 1.267 m` · Grid `108 Columns / 3 Rows per Storey` · Floor-to-Floor `3.80 m` · Panels/Floor `324` · Total Panels `1,620` · Façade Area `≈2,470 m²` · Envelope `4 Elevations`. Every figure is measured off `summariseFacadeLayout()`, i.e. off the panels the Geometry Engine actually generated. |
| **Rooftop PV** | Removed completely. DC Array, AC Inverter, Inverter State, Conversion Loss, PV Utilization and power output are all gone from this panel. |

The collapsed summary was updated to match: Programme · Storeys + height ·
Footprint · Adaptive Panels · Orientation.

#### New top-level panel — Rooftop PV

`src/components/twin3d/ui/RooftopPvPanel.tsx` is registered in
`WORKSPACE_TOOLS`, so it appears as a **sixth icon on the right-hand Tool Dock**
alongside Cyber-Physical Pipeline, Environmental Conditions, Solar Geometry,
Panel Kinematics and PBIF Decision. It opens as a `FloatingWindow` — which means
it inherits the exact drag / resize / collapse / close chrome, the spring-in
animation, the glass styling and the localStorage persistence every other
engineering window already has. Nothing about the shell was special-cased.

Contents (moved verbatim in meaning, re-laid-out to the workspace's card
grammar):

```text
Plant AC Output          — headline kW AC + operating-state chip
   DC → Loss → AC        — the conversion chain in one strip

DC Array                 — Installed Capacity · Current DC Output
                           Array Utilization (+ bar) · Operating Modules
                           Average Irradiance

AC Inverter              — Current AC Output · Rated Capacity · Efficiency
                           Operating State · Clipping · Conversion Loss

Planned subsystems       — reserved, collapsed by default
```

Accent `#fb923c` (orange) — distinct from every existing tool accent, so the dock
stays legible.

#### UI consistency

The panel does not invent styling. Its `Metric` card is character-for-character
the same as the Environmental Conditions panel's — `rounded-xl bg-white/[0.03]
px-2.5 py-1.5`, a `text-[9px] uppercase tracking-wider text-white/45` label and a
`font-mono text-[13px] font-semibold tabular-nums` value. Section headings use
the established `text-[10px] uppercase tracking-wider text-white/50`. Spacing,
radii and the collapse interaction are inherited, not re-specified.

### Why Building Engineering and Rooftop PV are now separate

1. **It mirrors the engine.** `pvArray` / `pvElectrical` / `pvInverter` are
   siblings of `skin` on `Simulation`. The panel tree now says the same thing the
   object graph says.
2. **They are genuinely independent subsystems.** The façade is a kinetic
   shading device governed by PBIF; the PV plant is a power-generation asset with
   no control loop at all. Neither reads the other's state. Their only shared
   dependency is `SolarPhysicsEngine`, and that is a *supplier* to both, not a
   link between them.
3. **Stage 7.1.5 already drew this line** by stripping PV interaction and
   telemetry out of the façade debug tooling. This stage simply finishes the job
   at the panel level.
4. **Different vocabularies.** Building engineering speaks in degrees, metres,
   modules and elevations; the plant speaks in kW, %, W/m² and inverter states.
   Interleaving them made both harder to read.
5. **Room to grow.** The PV roadmap (battery, energy flow, grid, financial,
   carbon) would have kept inflating the Building panel indefinitely. It now has
   its own container sized for that growth.

### Designed for the stages that follow

The panel is a vertical stack of one component, `PvSection`. Live subsystems and
planned ones use the *same* component; a planned section differs only by
`status="planned"`. Five reserved slots — Battery Storage, Energy Flow, Grid
Interface, Financial Analysis, Carbon Reduction — are already present behind a
collapsed **Planned subsystems** disclosure, each with a one-line note on what it
will hold.

Bringing a future stage online is therefore: flip `status`, drop metrics inside
the section. No layout change, no second redesign.

### Regression check — what was deliberately not touched

Verified by file scope: the only files modified are `ControlDeck.tsx`,
`workspaceTools.tsx`, `windowStore.ts` and the new `RooftopPvPanel.tsx`. Nothing
under `src/lib/engine/`, `src/lib/pbif/` or `src/lib/kinematics/` was edited.

| Subsystem | Status |
|---|---|
| Solar Physics · `RoofSolarArray` · `PVElectricalEngine` · `PVInverterEngine` | untouched |
| Adaptive Façade · PBIF · Virtual Sensor · Cyber-Physical Pipeline | untouched |
| Building orientation control | unchanged |
| Camera | untouched |
| Engineering calculations | untouched — the new panel *reads* `SimSnapshot`, it derives nothing |

The one deliberate reduction is the removal of the Building panel's shape picker
and dimension sliders, which the brief called for ("fixed engineering geometry,
read-only"). Footprint-shape studies remain available through the scenario
presets.

### Performance

No new engine work and no new per-frame work. The panel subscribes to the same
throttled `snapshot` every other panel uses, and reads `pvArray.getModules()
.length` once per render for the module denominator (an `O(1)` array-length read
on an already-built array). Like every workspace window, it renders nothing at
all until its dock icon is toggled on.

### Validation

| Checklist item | Result |
|---|---|
| Building panel contains only building engineering information | ✓ Orientation · Geometry · Adaptive Façade |
| Building specifications restored | ✓ Programme, 5 storeys, 19.0 m, 25 m, 40 m — read-only |
| Adaptive façade specification restored | ✓ all eight fields, measured off real panels |
| Rooftop PV removed from Building panel | ✓ no PV markup remains in `ControlDeck.tsx` |
| New Rooftop PV panel created | ✓ sixth Tool Dock entry, own `FloatingWindow` |
| Existing PV dashboard moved successfully | ✓ every DC and AC metric preserved |
| No simulation behaviour changed | ✓ zero engine files modified |
| TypeScript builds cleanly | ✓ `npx tsc --noEmit` clean |
| No new ESLint issues | ✓ the four touched files report zero errors and zero warnings |
| No performance regressions | ✓ no new per-frame work; window renders only when opened |

### Documentation

- `PBIF_ENGINEERING_GUIDE.md` — §14 progress-log entry recording the panel
  separation and the subsystem-boundary rule it applies.
- This file.

---

## Stage 7.3 — Rooftop PV System (Inverter Model & AC Power Conversion)

_2026-07-31_

### Architectural Implementation

Following the decoupling of the Rooftop PV system from the Cyber-Physical Façade (Stage 7.1.5) and the completion of the DC Array Electrical Model (Stage 7.2), Stage 7.3 successfully implements the **PV Inverter subsystem**. 

The simulation pipeline now fully traces:
`Environment` → `Solar Physics` → `PV Array` → `DC Output` → `PV Inverter` → `AC Output`

#### Power Electronics Simulation
- Created a dedicated pure-TypeScript `PVInverterEngine` class inside `src/lib/engine/pvInverter.ts` entirely distinct from React layer logic, maintaining strong MVC separation.
- Simulated an **80 kW rated inverter** combining dynamic efficiency modeling (baseline + current-based) and rigorous conversion calculations.
- Integrated a physical **clipping model**: any DC generation exceeding 80 kW is deliberately clipped, converting the excess into measurable Thermal Loss (heat dissipation).

#### Engineering Telemetry & UI Expansion
- Expanded the `SimSnapshot` type with comprehensive AC power metrics.
- Substantially restructured the `ControlDeck.tsx` panel within the Building tab to expose the new Rooftop PV Dashboard.
- Dashboard features real-time visualization of both **DC Array Output** and **AC Inverter Output**, tracking generation capacity limits and utilization dynamically.
- Implemented visual states for the inverter mode: *Offline*, *Active*, and a distinctive red-accented *Clipping* alert when AC caps are reached.

#### 3D Visualization
- Deployed a lightweight, physically plausible 3D cabinet `Mesh` at the end of `RoofSolarArray.tsx` representing the 80 kW power inverter hardware.

---

## Stage — Geometry Migration to the Engineering Case Study

_2026-07-31_

### Why this stage happened

Until now the Digital Twin ran on a generic demonstration massing: a 60 × 40 m,
120 m tall, 32-storey tower with a 4.2 m "cell" standing in for a façade panel.
That was fine for building the physics, but it meant the twin was not simulating
the building the project report is about. Every number in the Engineering UI —
panel counts, façade area, storeys — described something that does not exist.

This stage migrates the geometry so the twin represents the documented case study.
It is a **rebuild of the massing and the façade grid**, not a resize: the panel
grid is now generated from a real curtain-wall module, so every adaptive panel on
screen corresponds to a physical panel location on a real elevation.

### The building specification

| Parameter | Value |
|---|---|
| Programme | Commercial Office |
| Storeys | 5 |
| Width × Length | 25 m × 40 m |
| Total height | 19 m |
| Floor-to-floor | 3.8 m |
| Façade | 100% curtain wall + external adaptive façade |
| Adaptive module | 1.2 m × 1.26 m (nominal) |
| Panels per floor | 324 |
| Total panels | 1,620 |
| Façade area | ≈2,470 m² |

### The inconsistency in those numbers — found, explained, and resolved

Nearly all of the report's figures check out against each other:
5 × 3.8 = 19 m; perimeter 2 × (25 + 40) = 130 m so the envelope is
130 × 19 = 2,470 m²; 324 × 5 = 1,620; and 3.8 / 1.26 = 3.02, giving 3 module rows
per storey, so 324 / 3 = 108 columns.

**One thing does not work.** 108 columns comes from 130 / 1.2 = 108.33 — dividing
the *continuous* perimeter. But a façade is four separate planar elevations, and a
panel cannot wrap around a corner. Setting each elevation out independently at
exactly 1.2 m gives:

```text
25 m elevation → floor(25 / 1.2) = 20 bays   (1.0 m stranded at the corner)
40 m elevation → floor(40 / 1.2) = 33 bays   (0.4 m stranded)
ring = 2 × (20 + 33) = 106 columns → 318/floor → 1,590 total
```

That is 30 panels short of the report (−1.85%), with an unglazed sliver at all
four corners. And no single uniform panel width fixes it — the integer constraint
has no solution.

**The smallest adjustment, and the one real façades actually use:** treat
1.2 m × 1.26 m as the **nominal** module and let each elevation adjust its bay
width slightly so the bays close exactly on the structural grid. Round the bay
count instead of flooring it:

| Elevation | Bays | Actual module width | Off nominal |
|---|---|---|---|
| 25 m (×2) | 21 | 25 / 21 = **1.1905 m** | −0.79% |
| 40 m (×2) | 33 | 40 / 33 = **1.2121 m** | +1.01% |
| 3.8 m storey | 3 rows | 19 / 15 = **1.2667 m** | +0.53% |

```text
2 × (21 + 33) = 108 columns  ·  × 3 rows = 324/floor  ·  × 5 = 1,620 panels
covering 130 × 19 = 2,470 m² — 100% of the envelope
```

Every headline figure in the report is now met **exactly**, and the only thing
adjusted is an individual module dimension by ≤1.01% — well inside real
curtain-wall setting-out tolerance, and far better than losing 30 panels. Nothing
was changed silently: the nominal module is a named constant, the as-built width
is derived, and the Engineering UI shows both side by side so the difference is
visible rather than hidden.

### Panel generation strategy

A new pure module, [facadeModule.ts](src/lib/engine/facadeModule.ts), is the
single authority on "how big is a panel and how many fit". The Geometry Engine
consumes it and keeps no grid arithmetic of its own:

```text
BuildingConfig (width, depth, height, floorCount, shape)
      │
      ▼  footprintPolygon()          — shape-agnostic, unchanged
edge lengths
      │
      ▼  moduleColumnsForEdge(len)   — round(len / 1.2), clamped
bays on THIS elevation
      │
      ▼  facadeRowCount(cfg)         — rowsPerFloor × floorCount
rows, shared by every elevation (transoms line through)
      │
      ▼  cellW = len/cols · cellH = height/rows
ACTUAL module size, per elevation
      │
      ▼  floorForRow(r, cfg)
every panel tagged with its storey
```

What this guarantees:

- **No hardcoded positions.** Every panel's world position is still derived from
  its surface basis and its `(row, column)` index.
- **Storey alignment is structural.** Rows are `rowsPerFloor × floorCount`, never
  `height / moduleHeight`, so the grid can never straddle a floor slab. `324
  panels per floor` is therefore a real, addressable fact — `FacadePanel` gained
  a `floor` field.
- **Rows global, columns per-elevation.** Transoms line through around the whole
  building while each elevation closes its own bays.
- **Still shape-agnostic.** Triangle, hexagon, 24-facet cylinder and concave
  L-shape are set out by the same rules, no special cases.
- **Bounded.** `MAX_COLUMNS_PER_EDGE` (64) and `MAX_ROWS_PER_FLOOR` (6) never bind
  at the specification (33 and 3); they exist only so an extreme interactive
  configuration cannot generate an unbounded grid.

### The migration process

1. **Module spec first** — `facadeModule.ts`, with the derivation and the
   inconsistency documented in the file header, so the rule is stated before
   anything consumes it.
2. **Geometry Engine** — replaced the `CELL = 4.2` demonstration cell and its
   `MAX_COLS/MAX_ROWS` caps with `moduleColumnsForEdge()` / `facadeRowCount()`,
   and tagged each panel with its storey.
3. **Massing** — `DEFAULT_BUILDING` became the case study; `BuildingConfig` gained
   `buildingType`. The `kl-rect` scenario became *KL · Reference Office* with the
   report's exact figures, and the other presets became footprint studies of the
   same 5-storey office programme rather than unrelated towers — each now carries
   an explicit `floorCount`, without which a preset would inherit 5 storeys and
   silently produce an absurd floor-to-floor height.
4. **Context** — neighbours rescaled from 90 m/150 m towers to 24 m/34 m mid-rise
   at 70 m/92 m, so they still genuinely occlude a 19 m façade at low sun angles
   instead of burying it in permanent shadow.
5. **De-assumed every dimension** — see below.
6. **As-built summary** — `summariseFacadeLayout()` measures the layout off the
   panels that were actually generated, cached on the skin engine per geometry
   rebuild and surfaced through the snapshot. The UI never re-derives it.
7. **Validated** — numerically against the report, then at runtime.

### Architectural refactoring: no dimension is assumed anywhere

The old 120 m tower had leaked into presentation code as absolute metres. Each of
these was re-expressed as a ratio of the live geometry, so the twin re-frames and
re-proportions itself for any building:

| Consumer | Was | Now |
|---|---|---|
| Camera presets | `pos [210, 80, 70]`, `target [0, 45, 0]`, `zoom 2.8` | Derived from footprint diagonal, overall span and `height × 0.42`; ortho zoom = `K / span` — where `K` is exactly what the old constants implied at span 120, so the framing is preserved, just expressed dimensionlessly |
| Orbit limits | `minDistance 40` … `maxDistance 950` | `diag × 0.35` … `span × 20` — you can now zoom in on a single 1.2 m module |
| Rooftop plant | 6 m box + 16 m mast | `height × 0.12` and `height × 0.30` |
| Kinematics debug vectors | `L = 16 m` | `height × 0.35`, floor 4 m |
| Curtain-wall mullions | `0.22 m` | `bay × 0.06` ≈ 71 mm — a real profile, not a bar |
| Second-skin rails / shafts / brackets | `0.18` / `0.10` / `0.12 m` | `bay × 0.09` / `× 0.06` / `× 0.10`, bounded |

A nice side effect: the kinetic fin's swept radius drops from 1.98 m to 0.55 m, so
the pivot now sits **1.15 m** off the glass instead of 2.58 m — a believable
double-skin cavity for this building class rather than a 4.6 m deep zone.

### Camera

Every preset (Perspective, Orthographic, Top, Isometric, Façade-Inspection) now
computes from a `Framing` derived from the massing: footprint diagonal, overall
span, and an eye height at 42% of the building height (mid-façade). The
Façade-Inspection view still aligns to the building orientation exactly as before,
and all camera *controls* are unchanged — only the framing constants became
relative. Orthographic zoom is px-per-world-unit, so it scales as `K / span`.

### Engineering UI

The Building tab of the Control Deck now reports the case study rather than
generic geometry:

- **Collapsed**: programme, storeys + height, footprint, total adaptive panels,
  orientation.
- **Expanded**: a *Storeys* slider (3–10) that drives height at the fixed 3.8 m
  floor-to-floor — so the module grid stays storey-aligned by construction —
  plus *Width* (15–45 m) and *Length* (25–60 m), replacing the old
  height/width sliders that were ranged for a tower.
- **New "Adaptive façade" spec block**: nominal module vs as-built module, grid
  (columns × rows-per-storey), floor-to-floor, panels per floor, total panels,
  façade area, and envelope area + elevation count. Every value measured off real
  panels.
- Glass-ratio ceiling raised to 100%, matching "100% curtain wall".

### Cyber-Physical Pipeline

Its logic is untouched. Only the building facts it displays were updated: the
intro now identifies the focus module concretely — *"one real 1.21 × 1.27 m
adaptive panel on storey N of 5, one of 1,620"*, reading the panel's own as-built
dimensions and storey — and the Adaptive Façade stage's live-surfaces section
states the as-built grid it belongs to. The five stages, the Environmental
Influence rails, the flow connectors and every engineering-detail body are
unchanged.

### Debug tools

All of these address panels by id / row / column and re-resolve when geometry
changes, so they followed the new grid without modification — verified by
inspection of each consumer: Solar Debugger (rays · heatmap · selected-module),
module click-selection, Solar Telemetry, Panel Kinematics inspector + 3D vectors,
`pickUpperCentrePanel()` / `panelIndex()`, `SelectedModuleHighlight` (which reads
the fin's actual instance matrix), and the Active Surface highlight.

### Performance audit

| Measure | Before | After |
|---|---|---|
| Kinetic fins (one InstancedMesh) | 1,392 | 1,620 (+16%) |
| Static frame instances | 60 | 120 |
| Brackets / shafts | 96 / 48 | 216 / 108 |
| Mullions | 172 | 176 |
| Draw calls for the building | 4 + glass | unchanged |
| Occlusion ray-casts per env tick (20 Hz) | 1,392 × neighbours | 1,620 × neighbours |

The kinematics solver is per-surface (co-planar blades share one solution), so it
costs O(surfaces) regardless of how dense the grid gets.

One genuine regression was found and fixed rather than accepted:
[OcclusionDebug.tsx](src/components/twin3d/OcclusionDebug.tsx) allocated two
`Float32Array`s **and** two `BufferAttribute`s every single frame in ray mode —
about 24 kB/frame of garbage at the reference elevation's 495 modules, and it got
worse with the denser grid. Buffers are now allocated once with growth headroom,
written in place, flagged with `needsUpdate`, and bounded with `setDrawRange`; the
two ray colours became module constants instead of per-frame `THREE.Color`
allocations.

### Validation

Numerical check of the generated grid against the report:

| Check | Report | Generated | ✓ |
|---|---|---|---|
| Building dimensions | 25 × 40 × 19 m, 5 storeys | 25 × 40 × 19 m, 5 storeys | ✓ |
| Floor-to-floor | 3.8 m | 3.80 m | ✓ |
| Module (nominal) | 1.2 × 1.26 m | 1.2 × 1.26 m | ✓ |
| Module (as built) | — | 1.1905–1.2121 × 1.2667 m (≤1.01% off nominal) | ✓ |
| Columns per ring | 108 | 108 | ✓ |
| Rows per storey | 3 | 3 | ✓ |
| Panels per floor | 324 | 324 | ✓ |
| Total panels | 1,620 | 1,620 | ✓ |
| Façade area | ≈2,470 m² | 2,470 m² (100% of envelope) | ✓ |

Other shapes stay bounded and sensible under the same rules: triangle 1,305 ·
cylinder 1,440 · hexagon 1,350 · L-shape 2,010 panels. The worst case reachable
through the interactive sliders (10 storeys, 45 × 60 m) is 5,280 — still a single
instanced mesh.

System checks:

- `npx tsc --noEmit` — clean.
- `npx eslint` on every migrated file — no new errors. (Five pre-existing errors
  remain in `KinematicsDebug.tsx` and `ControlDeck.tsx`; confirmed present in the
  committed baseline and left alone as out of scope.)
- `/digital-twin` compiles and serves 200 with no runtime errors in the dev log;
  the server-rendered markup contains **"Commercial Office"** and **"1,620"**,
  i.e. the UI is reading the real generated geometry.
- Solar Physics Engine, Virtual Sensor Engine, PBIF and the Cyber-Physical
  Pipeline required **zero** changes — they were already geometry-agnostic, which
  is exactly what this migration was a test of.

### Documentation

- `PBIF_ENGINEERING_GUIDE.md` — new **§18 Building Geometry — The Engineering
  Case Study** (specification, the inconsistency and its resolution, panel
  generation strategy, the de-assumption table, physics verification, performance,
  and a CWCT/ASHRAE traceability block), plus a §14 progress-log entry.
- This file.

---

## Stage — Environmental Influences in the Cyber-Physical Pipeline

_2026-07-30_

### Context: what already existed

The Cyber-Physical Pipeline (`src/components/twin3d/ui/CyberPhysicalPipeline.tsx`)
is the primary lens on the Digital Twin. It reorganises every engineering panel
into one guided, top-to-bottom cause-and-effect story for the sunniest façade
module:

```text
1 Environment → 2 Sensor → 3 Embedded Controller → 4 Actuation → 5 Adaptive Façade
                                                                       │
                                            ◄──────────────────────────┘
                                              (closed feedback loop)
```

Each stage shows a plain-language **Inputs → Processing → Outputs** summary, an
output chip whose value visibly becomes the next stage's input, and an
**Engineering detail** toggle that reveals the full mathematics (Solar Geometry,
the PBIF decision breakdown, the kinematics solver, the sensor chain).

That flow works. It was not changed.

### Why Environmental Influences were introduced

The pipeline answered one question well — *how does sunlight cause the façade to
rotate?* — and a second question badly: *how do weather and environmental
conditions influence that?*

Two concrete problems:

1. **Weather was invisible in the story.** Temperature, rain and wind drive real
   decisions inside the controller, but a reader following the spine never saw
   where they entered.
2. **Where weather *was* shown, it was shown wrongly.** The Environment stage
   listed `28°C · 40% cloud · 12 km/h wind` as its inputs. That reads as "the
   environment measures temperature, cloud and wind, and passes all three to the
   sensor" — which is false. Only cloud changes the light. Temperature and wind
   never touch the sensing chain at all.

The obvious fix — drawing a pipeline per weather variable — would have been
worse. Four parallel chains destroy the single narrative, imply every variable
affects every subsystem, and make the interface unreadable for a beginner.

So instead: **one pipeline, with contextual influences that branch into the one
stage each genuinely acts on.**

### Educational design philosophy

Five rules governed the design. They are enforced structurally, not by taste, so
they cannot drift as content is added later:

1. **One story, not many.** There is exactly one signal path. Influences enter it
   from the side; they never form chains of their own.
2. **Attach only where the coupling is real.** A parameter appears at a stage if
   and only if the simulation actually reads it there. Nothing is drawn for
   visual symmetry.
3. **Hierarchy by construction.** The primary spine owns every strong visual cue:
   numbered badge, 13 px title, saturated stage accent, output chip, animated
   flow connector between stages. Influence cards are denied *all* of them —
   dashed side rail, 9.5 px type, desaturated accent, no output chip, no
   connector. The eye follows Sun → Façade first because the spine is the only
   thing with that weight.
4. **Teach the negative.** Every influence carries a **"Does not affect"** line.
   Preventing the wrong mental model — *wind reduces sunlight*, *rain dims the
   sensor*, *the sensor knows it is cloudy* — is exactly as valuable as stating
   the mechanism, and it is the specific misconception the naive design would
   have created.
5. **Two levels of disclosure.** Level 1 is one plain sentence, always visible.
   Level 2, on click, adds the mechanism, the traceable code path, the governing
   thresholds, the "does not affect" guard, and the citation.

### The mapping

| Parameter | Stage | What it actually does |
|---|---|---|
| **Cloud Cover** | 1 · Environment | Multiplies clear-sky GHI by the Cloud Modification Factor **before** geometry, occlusion or sensing. `"Reduces effective solar irradiance before sensor measurement."` |
| **Temperature** | 3 · Embedded Controller | Sets the Operational Objective via Thermal Demand. `"Influences thermal optimisation objectives within the controller."` |
| **Rain** | 3 · Embedded Controller | Raises the Weather Protection tier; the façade closes instead of tracking. `"Changes the controller's operating strategy to protect the façade."` |
| **Wind** | 3 · Embedded Controller | Structural-safety input, evaluated first; can override every other objective. `"Introduces mechanical safety constraints that may limit movement."` |
| **Wind** | 4 · Actuation | Reaches the servo as a movement constraint — tracking suspended, or deadband suppression. `"Restricts how far and how often the servo is allowed to move."` |
| — | 2 · Sensor | **Deliberately nothing.** |
| — | 5 · Adaptive Façade | **Deliberately nothing.** |

The two empty rows carry as much teaching weight as the five filled ones. In
place of a rail, the Sensor stage now states plainly:

> *No environmental influence enters here. The sensor cannot tell whether the
> light dropped because of cloud, a shadow or nightfall — it only converts
> whatever irradiance arrives.*

That is the central idea of the whole interface: **cloud reaches the controller
only as a smaller number — never as the fact "it is cloudy".**

### What a first-time user now learns

Reading top to bottom, without prior engineering knowledge:

- The Sun drives the sensing pipeline.
- Clouds reduce sunlight **before** it reaches the sensor.
- The sensor simply measures light; it does not know *why* the light changed.
- The Embedded Controller combines that light reading with temperature, rain and
  wind — resolved by a strict priority hierarchy — to make a decision.
- The Servo executes the controller's command, within whatever movement limits
  wind has imposed.
- The Adaptive Façade physically responds, and the new geometry feeds back into
  the Environment stage on the next cycle.

### UI architecture changes

**New reusable components** — `src/components/twin3d/ui/EnvironmentalInfluence.tsx`

| Component | Role |
|---|---|
| `InfluenceRail` | A side-entry group of influences feeding one stage. Renders a dashed left rail with an `↳` elbow and an `Environmental influence` label. Returns `null` for a stage with none — so "no influence" costs no space. |
| `InfluenceCard` | One influence: icon, label, live value, an `OVERRIDE` tag when it is overriding, the live effect on *this* stage, the one-line summary, and a click-to-expand engineering panel (mechanism · code path · thresholds · "does not affect" · reference). |
| `InfluenceLegend` | A two-item legend at the top of the pipeline: solid line = **signal path**, dashed line = **environmental influence**. It establishes the hierarchy before the user reads a single stage. |

**New pure model** — `src/lib/engine/environmentalInfluence.ts`

Framework-free, side-effect free, and the single authoritative declaration of the
mapping. It exports `describeEnvironmentalInfluences(inputs)` and
`influencesForStage(all, stage)`. The React layer renders what it is handed and
asserts no coupling of its own (guide §6, §11). Every threshold shown in the UI —
wind bands, rain bands, temperature bands, dynamic deadbands — is imported from
`src/lib/pbif/thresholds.ts`; the module defines exactly one constant of its own,
`CLOUD_NEGLIGIBLE`, and documents it.

**Modified** — `CyberPhysicalPipeline.tsx`

- `Stage` gains an optional `influences` slot, rendered **after** the summary and
  **before** the output chip. The position mirrors the engineering reality: an
  influence modifies what happens *inside* the stage, so it must be visible
  before that stage's output value.
- The Environment stage's input rows no longer list temperature and wind. They
  now read *"Sky: clear-sky GHI 812 W/m², attenuated by 40% cloud cover"* — only
  what this stage genuinely measures.
- The Controller stage now states its two input kinds separately: the light
  reading ("everything it knows about the sun") and the environmental context.
  Its engineering detail explains that this is the **only** stage that combines
  several inputs, and that they are resolved by a strict priority hierarchy
  (Structural Safety › Weather Protection › Solar Availability › Thermal Demand)
  so a safety constraint can never be outvoted by an energy objective.
- The Sensor stage gained its explicit "no influence enters here" note.

**Unchanged**: the five stages, their order, their accents, their output chips,
the animated `Flow` connectors, every existing `Engineering detail` body, and the
closed-loop footer. No physics, no PBIF logic, no control path was touched.

### Interaction

- **Default state.** Five stage cards down a strong vertical spine, with small
  dashed rails hanging off stages 1, 3 and 4. Influences that are not currently
  acting render at 55% opacity — present, but visibly quiet.
- **Weather changes.** As cloud rises, the cloud card's effect line updates live:
  `812 W/m² × 0.55 → 447 W/m² (−45%)`. As wind crosses 35 km/h the wind cards
  brighten to `active`; past 50 km/h they gain a red-tinted `OVERRIDE` tag and
  the actuation card reads *"Tracking suspended — blades held at the closed (0°)
  minimum-load posture."* Idle influences stay on screen rather than appearing
  from nowhere, so the user learns by watching a state transition.
- **Click an influence.** It expands in place with the mechanism, the code path
  as an indented `↳` chain, the governing thresholds, a bordered **Does not
  affect** callout, and the citation. The stage's own *Engineering detail* toggle
  is separate and unaffected — the two disclosure levels never fight.

### Validation

- `npx tsc --noEmit` — clean.
- `npx eslint` on the three touched files — clean.
- `/digital-twin` compiles and serves 200 with no runtime errors in the dev log.
- **Hierarchy check.** The primary spine retains 100% of its visual weight:
  numbered badges, 13 px titles, saturated accents, output chips and animated
  inter-stage connectors are all still exclusive to the five stages. Influence
  cards are 9.5 px on a dashed rail with desaturated accents and no connector, so
  the reading order Sun → Sensor → Controller → Servo → Façade is preserved by
  construction rather than by convention.
- **Accuracy check.** Each of the five influence descriptors was traced to real
  code before being written: cloud to `SolarPhysicsEngine.update()`, temperature
  to `assessThermalDemand()` → `determineObjective()`, rain to `assessRain()` →
  the Weather Protection rules, wind to `assessWind()` → the Structural Safety
  rules and then to `resolveTarget()`. Nothing is claimed that the simulation
  does not implement.

### Known inconsistency (documented, not changed)

`thresholds.ts` defines `WIND_SAFE_ANGLE = 90` (edge-on / feathered) and
`RAIN_SAFE_ANGLE = 135` (outward tilt), and the guide §15.6 describes both. The
current `trackingPolicy.resolveTarget()` ignores them and returns `0°` (fully
closed) for **both** `SAFE_MODE` and `WEATHER_PROTECTION`, matching its own
`behaviour` strings. The influence cards describe **what the code does** (0°,
closed), not what the constants suggest. Reconciling the two — either by wiring
the constants back in or by retiring them — is a separate decision and was left
alone here.

### Documentation

- `PBIF_ENGINEERING_GUIDE.md` — new **§17 Environmental Influence Model**
  (purpose, philosophy, mapping table, per-parameter justification,
  architecture, ISA-95 / CIBSE Guide H traceability block, forward
  compatibility), plus a §14 progress-log entry dated 2026-07-30.
- This file.

---

## Earlier stages

Summarised here for continuity; the authoritative record is
`PBIF_ENGINEERING_GUIDE.md` §14 (Implementation Progress Log) and §15–§16.

- **Cyber-Physical Pipeline** — the five-stage guided story that this stage
  extends, with every subsystem panel folded into its matching stage.
- **Solar Physics Engine** (`src/lib/engine/solarPhysics.ts`) — the single source
  of truth for incident angle, cosine projection, neighbour occlusion, diffuse
  contribution and effective irradiance per module.
- **Virtual Sensor Engine** (`src/lib/engine/virtualSensor.ts`) — effective
  irradiance → lux → LDR resistance → voltage divider → 12-bit ADC → filtered
  ADC. The controller sees only the final integer.
- **PBIF v1** (`src/lib/pbif/`) — deterministic, rule-based decision layer:
  situation assessment → solar resource → thermal demand → operational objective
  → decision → tracking policy. It never outputs an angle.
- **Façade Kinematics** (`src/lib/kinematics/`) — pure sun-vector → panel-rotation
  geometry; the sole authority on physical rotation.

---

## Stage 6.1 — UI Cleanup & Scene Scale Refinement

### Objective

Simplify the UI, lock the finalized engineering geometry, and improve the visual scale of the simulation to match the new 25 m × 40 m building footprint.

### Changes Made

- **Building Geometry Locked:** Removed sliders for Storeys, Width, and Length in `ControlDeck.tsx`, replacing them with read-only text fields matching the engineering constants (5 storeys, 19.0 m height, 25.0 m width, 40.0 m length).
- **Scene Scale Refinement:** Scaled down the trees and decorative vegetation in `cityLayout.ts` by 50% to better fit the compact commercial office footprint.
- **Simulation Neighbours:** Set `DEFAULT_NEIGHBORS` in `simulation.ts` to an empty array so that no neighbours are spawned by default on startup, while retaining the ability to add them manually.
- **Debugger Simplification:** Removed the Solar Debugger menu (`SolarOcclusionInspector.tsx`) and the `solarDebugMode` state. The 'Selected Module' interaction is now the sole active debugging interface, permanently enabled for interacting with individual panels in the 3D view.

---

## Stage 7.0 — Rooftop PV System (Geometry & Visual Integration)

### Objective
Implement the physical layout and rendering of the new 104.02 kW DC Rooftop PV system (189 LONGi 550 W bifacial modules) on the Commercial Office roof, creating a foundation for future electrical simulation stages.

### Changes Made

- **New Independent Subsystem (`RoofSolarArray.tsx`)**: Created a dedicated component for the PV array, entirely separate from the Adaptive Façade, Solar Physics, Virtual Sensor, and PBIF subsystems.
- **Procedural Geometric Layout**: Implemented an algorithm to dynamically fit exactly 189 panels on the 25 m × 40 m roof while maintaining clearance for the central HVAC plant and perimeter maintenance walkways.
- **Scene Graph Integration**: Injected the subsystem directly into `BuildingMesh.tsx`, so it intrinsically shares the overall building's orientation.
- **Instanced Rendering**: Mapped the 189 PV geometry transforms into a single highly efficient `InstancedMesh`.
- **UI Extension (`ControlDeck.tsx`)**: Added a fixed engineering summary panel for "Rooftop PV" beneath the primary building massing specs.

### Validation
- **Architecture check**: confirmed no changes were made to the Cyber-Physical Pipeline, Façade kinematics, PBIF logic, or Solar Physics engines. 
- **Type-Safety check**: `npx tsc --noEmit` runs completely clean with no new errors.
- **Documentation check**: Updates have been appended to both this `walkthrough.md` and the `PBIF_ENGINEERING_GUIDE.md` log.

---

## Stage 7.1 — Rooftop PV System (Solar Coupling & Irradiance)

### Objective
Connect the new Rooftop PV Array to the existing Solar Physics Engine so that it receives physically meaningful solar irradiance data (front irradiance only). This prepares the architecture for future electrical and thermal simulations, while maintaining a single authoritative solar model for both the façade and roof.

### Changes Made
- **Simulation Engine Extraction**: Moved the geometry generation of the PV modules into `src/lib/engine/pvArray.ts`. This allows the `SolarPhysicsEngine` to traverse and calculate exact physical parameters for the PV Array the same way it does for the Adaptive Façade.
- **Shared Solar Physics**: Extended `src/lib/engine/solarPhysics.ts` to compute Cosine Projection, Incident Angle, and Effective Irradiance for every PV module, using the existing map registries (`PV-[id]`).
- **Future-Ready Architecture**: Included stub parameters in the engine for `futureShadingFactor` and noted where bifacial rear-gain will be calculated in subsequent stages.
- **Visual Feedback**: PV panels now dynamically respond to irradiance changes (e.g. cloud cover or sun position) by tinting their surface brightness in `RoofSolarArray.tsx`.
- **Engineering UI Updates**: Added "Status", "Avg Roof Irradiance", "Selected Module Irradiance", and "Selected Module Incidence Angle" to the Control Deck to observe live physics data.

### Validation
- **Architecture check**: Validated no dual-sources of truth were created; both the Façade and PV Array use the exact same `SolarPhysicsEngine`.
- **Interactive check**: Verified clicking a PV module correctly highlights it and pipes its specific telemetry to the Control Deck.
- **Type-Safety check**: `npx tsc --noEmit` passes cleanly.

---

## Stage 7.1.5 — PV Interaction Cleanup & Debug Separation

### Objective
Separate the debugging and interaction logic between the active Cyber-Physical Façade pipeline and the passive Rooftop PV system. The PV array should behave strictly as an infrastructure asset rather than an interactive debugging target.

### Changes Made
- **Interaction Removal**: Stripped all click and hover event listeners (`onClick`, `onPointerMissed`) from the instanced mesh in `RoofSolarArray.tsx`.
- **UI Decoupling**: Removed per-panel telemetry (Module Irradiance, Incidence Angle, and Selected Module stats) from the Rooftop PV section of the `ControlDeck.tsx` Engineering UI.
- **Visual Cleanup**: Since PV modules are no longer selectable, the `SelectedModuleHighlight` and `OcclusionDebug` ray visualization components naturally exclude the PV array (they remain exclusive to façade panels).

### Validation
- **Simulation Integrity**: Internal calculations for `cosine projection`, `incident angle`, and `effective irradiance` are untouched in `solarPhysics.ts`, keeping the physical state available for the next electrical modeling stage.

---

## Stage 8.0 — Professional Engineering Vector & Ray Redesign

### Objective
Redesign the 3D visualization of the engineering debug vectors (surface normal, solar vector, etc.) and occlusion rays to achieve a professional CAD-like aesthetic, replacing the default game-engine look with clean, accurate engineering representations.

### Changes Made
- **Custom Engineering Arrows**: Replaced `THREE.ArrowHelper` with a custom `EngineeringArrow` in `KinematicsDebug.tsx`. This uses a combination of `CylinderGeometry` (shaft) and `ConeGeometry` (head) with `MeshStandardMaterial` for a smooth, shaded, and anti-aliased appearance.
- **Color Standardization**: Applied consistent engineering colors to vectors:
  - Surface Normal: Cyan (`#06b6d4`)
  - Panel Normal: Emerald (`#10b981`)
  - Solar Vector: Warm Yellow (`#fbbf24`)
  - Ground Sun (Shadow): White (`#ffffff`)
- **Scaling & Offsets**: Scaled arrows dynamically closer to panel dimensions (3m) rather than over-scaling to the building height. Added slight positional offsets to arrows originating from the same point to prevent z-fighting and improve readability.
- **Label Presentation**: Upgraded the HTML labels with a `backdrop-blur` dark glass aesthetic and repositioned them slightly further from the arrow tips to guarantee zero overlap.
- **Refined Occlusion Rays**: In `OcclusionDebug.tsx`, replaced opaque laser-like lines with thinner, semi-transparent rays (`opacity: 0.3`, `AdditiveBlending`) using a Green (Valid) and Red (Occluded) color scheme for a subtle analytical glow.
- **Performance**: Maintained rendering performance by preserving the single Float32Array buffer for ray rendering and reusing the custom arrow geometries.

### Validation
- **Visuals**: Vectors are now crisp, clean, and scaled proportionally to the active module.
- **Independence**: The Solar Telemetry panel remains completely untouched and functioning correctly.
- **Clean Code**: No new ESLint or TypeScript issues were introduced.

---

## Stage 7.2 — Rooftop PV System (DC Array Electrical Model)

### Objective
Implement the electrical model mapping raw geometric irradiance into tangible DC power output, stopping exactly at the DC Array Output before entering financial or inverter models.

### Changes Made
- **Architectural Isolation**: `PVElectricalEngine` tracks internal state (`PVModuleElectricalState`) and string logic (`PVString`), fully separated from the physical representation.
- **Engine Aggregation**: Connected physical modules directly to the `SolarPhysicsEngine` output (`getModuleEffectiveIrradiance`), producing linear power output up to the 550 W module limit. 
- **Array Metrics**: Aggregates the 189 modules logically into **9 strings of 21 modules**, maintaining live tallies of *Current DC Output*, *Average Irradiance*, *Operating Modules*, and *Array Utilization (%)*.
- **Telemetry UI**: Upgraded the `ControlDeck` PV pane to display the simulated electrical metrics live as the sun arcs across the sky.

### Validation
- **Electrical Metrics**: Installed Capacity displays correctly (103.95 kW DC), and current DC output correctly scales with the sun.
- **Type-Safety check**: TypeScript compilation and ESLint run cleanly.

---

## Stage 7.7 — Weather Scenario Engine

### Objective
Turn the weather from a purely manual simulator into a deterministic, scenario-driven engine that evolves with simulated time — while preserving Manual Mode untouched for demonstrations, and changing nothing downstream of the weather source.

### Changes Made
- **New engine — `WeatherScenarioEngine` (`src/lib/engine/weatherScenario.ts`)**: owns the scenario catalogue, every scenario's timeline and the interpolation across simulated time. It emits **only** the five driver fields (temperature, humidity, cloud cover, rain, wind speed). It performs no PBIF decisions and no solar calculations, and the `SolarPhysicsEngine` was not modified.
- **Three weather sources**: `manual` (existing behaviour, byte-for-byte), `scenario` (the engine owns the drivers), and `live-ai` — displayed as *Coming Soon*, reserved for Stage 8.1 and actively refused by `setMode()` so it can never silently drive the twin.
- **Seven scenarios**: Sunny Day, Partly Cloudy, **Tropical Mixed** (the recommended demonstration — sunny morning → cloud buildup → thunderstorm → heavy rain → rapid clearing → afternoon sunshine), Rainy Day, Thunderstorm, Heat Wave, Windy Day. Every driver value stays inside the Manual Mode slider envelopes.
- **Deterministic timeline**: each keyframe is exact at its own hour; smoothstep interpolation runs between them and the last keyframe wraps around midnight into the first, so the day is continuous with no jumps. Sampling is a pure function of the hour of day — no RNG, no accumulated state, no frame-rate dependence.
- **Simulation integration (`simulation.ts`)**: the weather source is resolved at the *top* of the existing environmental tier, before `computeSun`. Everything after that line is unchanged — solar, sensors, PBIF, servo, façade, PV, inverter, BEMS, battery and grid simply consume `this.weather` as they always have. Derived fields (visibility, pressure, gust strength, ground wetness, UV) remain owned by `weather.ts`.
- **Building presets defer to Manual**: `applyScenario()` (whole-building presets) now sets the weather source back to Manual, since those presets carry their own fixed weather.
- **UI (`ControlDeck` Weather tab + new `WeatherScenarioPanel.tsx`)**: a *Weather Source* radio group at the top; Manual shows the original sliders exactly as before; Scenario replaces them with the scenario selector and a live timeline that lists every period's time, label and five values, highlights the active period with a progress bar, and auto-scrolls with simulated time. The collapsed Weather summary names the active scenario and period.
- **Stage 8.1 interface**: read-only getters expose current / previous / active keyframe / next keyframe / upcoming keyframes / full timeline, plus a pure `forecast(fromHours, hoursAhead)`. No AI logic was implemented.

### Validation
- **Determinism**: traversing Tropical Mixed in coarse (0.5 h) and fine (0.01 h) steps produces byte-identical drivers at the same hour — so 1×, 5× and 10× playback all follow the identical curve. Pausing freezes the timeline and scrubbing jumps straight to the correct weather, because progression is derived from `clock.timeHours` alone.
- **Continuity**: sampled across the full 24 h loop of all seven scenarios, the largest step per 0.01 h is 0.06 °C and 0.36 km/h — including across midnight. The weather never jumps.
- **Keyframe fidelity**: every scenario returns its exact keyframe values at that keyframe's hour.
- **Manual Mode**: `update()` returns `null` and no weather field is touched; existing behaviour is unchanged.
- **Clean build**: `tsc --noEmit`, ESLint and `next build` all pass with no new issues.

---

## Stage 7.8 — Real-Time Forecast Mode (Open-Meteo Integration)

### Objective
Add a third, fully functional weather source — a real hourly forecast — without giving any subsystem but the Weather Scenario Engine the right to produce the current weather, and without touching anything downstream of it.

### New files
- `src/lib/engine/forecastProvider.ts` — the `ForecastProvider` abstraction, the normalised `ForecastSample` / `ForecastBundle` shapes, and `OpenMeteoProvider`.
- `src/lib/engine/liveForecast.ts` — `ForecastCache` and `LiveForecastEngine`.
- `src/components/twin3d/ui/ForecastPanel.tsx` — connection indicator, Forecast Data card, Refresh button, hourly timeline.

### Modified files
- `weatherScenario.ts` — generalised from "scenario playback" to "timeline playback"; `WeatherSourceMode` gained `forecast` and lost the `live-ai` placeholder; new `WeatherTimelineProvider` port.
- `simulation.ts`, `types.ts`, `store.ts`, `ControlDeck.tsx`, `WeatherScenarioPanel.tsx` — wiring, snapshot field, source selection and the shared timeline component.

### LiveForecastEngine architecture
Fetch → cache → convert → supply. It owns the refresh lifecycle (`start` / `stop` / `refresh`), the cache, and the sample→keyframe conversion. It performs **no** solar calculation, sensor simulation, PBIF, irradiance or façade logic, and it never writes to `Simulation.weather` — it only answers `getTimeline()` when the Weather Scenario Engine asks.

### ForecastProvider abstraction
The engine depends only on `ForecastProvider` (`id`, `name`, `fetchForecast`). `OpenMeteoProvider` is a constructor argument, so replacing the service — or substituting a recorded fixture in a test — changes nothing else. Providers return values already normalised into the twin's own units, so conversion is re-labelling rather than a second physics.

### Forecast cache
A 48 h hourly bundle held in memory and mirrored to `localStorage` (keyed to the site's coordinates, tolerance 0.05°). The simulation reads **only** the cache. Default refresh is 60 minutes, running only while Forecast Mode is selected; concurrent calls share one in-flight promise so the Refresh button cannot stack requests. Relocating the twin drops the bundle and re-fetches for the new site.

### API variables used
`temperature_2m`, `relative_humidity_2m`, `cloud_cover`, `precipitation`, `wind_speed_10m` — exactly the five drivers, with `wind_speed_unit=kmh` and `timezone=auto`. Pressure is deliberately **not** requested: `weather.ts` derives it, so fetching it would create a second, unused source of truth. Precipitation is normalised to the twin's 0–1 rain intensity via the named `RAIN_MM_PER_HOUR_FULL_INTENSITY = 10` (heavy tropical rain). Condition labels and icons are classified locally from those same values — no extra variable is downloaded for them.

### Timeline conversion
The simulation clock is an hour-of-day cursor, so the 48 h bundle is folded into a 24 h window: walk the samples chronologically from the hour containing "now" and keep the **first** sample seen for each hour of day, so every hour is filled by the forecast nearest in time; sort ascending. The result satisfies the exact timeline contract Scenario Mode already uses, so playback, smoothstep easing, the midnight wrap and determinism are shared code rather than a second path.

### Offline behaviour
A failed fetch is absorbed, never thrown at the simulation. If a bundle is cached (including one restored from `localStorage`), playback continues and the indicator turns amber — *"Forecast offline — using cached forecast (N min old)"*. If a failure occurs while no timeline has been built yet but the cache holds a bundle, the timeline is built from it in the failure path. With nothing cached at all, the engine returns `null` and the Weather Scenario Engine **holds** the last weather; null weather can never reach the simulation.

### Performance analysis
- **No API calls in `tick()`** — the network is touched only by `start()`, the hourly timer and the Refresh button.
- **No per-tick allocation** — playback blends into a reusable buffer (`blendInto`) and `Simulation` writes it with `Object.assign`, so the environmental tier allocates nothing. Verified by identity: two consecutive `update()` calls return the same object.
- **One interpolation, one playback** — `sampleTimeline` is the only interpolator; Forecast Mode reuses the Weather Scenario Engine wholesale.
- Timeline rebuilds happen on refresh only (hourly), and the UI memoises its rows on the engine's `version` counter rather than re-reading at the 8 Hz snapshot rate.
- `getStatus()` now returns a fresh object rather than a mutated singleton — required for React's reference equality to see cache-age changes, and costing one small object per snapshot poll, off the hot path.

### API rename
`WeatherScenarioEngine.forecast()` → `getScheduledWeather()`, so the timeline look-ahead is never confused with the Live Forecast Engine's real forecast data. `sampleWeatherScenario()` is retained as a wrapper over the new, more general `sampleTimeline()`.

### Validation checklist
Verified by bundling the engines and exercising them against the live API:
- ✓ **Forecast downloads** — 72 hourly samples from Open-Meteo for Kuala Lumpur, UTC+8, chronological with exact 1 h spacing; all units in range after normalisation.
- ✓ **Cache updates** — the bundle converts to 24 ascending keyframes, one per hour of day, no duplicates.
- ✓ **Simulation continues when offline** — with a dead provider and a warm cache: `connection=cached`, weather still produced (31.5 °C). With a cold cache: `connection=offline`, `update()` returns `null` and the weather is held.
- ✓ **Manual Mode unchanged** — `update()` returns `null`, no field touched.
- ✓ **Scenario Mode unchanged** — Tropical Mixed at 13:42 is bit-identical to Stage 7.7, whether reached in one step or 55.
- ✓ **Forecast interpolates smoothly** — max 0.053 °C per 0.01 h across the whole 24 h loop including midnight.
- ✓ **Timeline follows the simulation clock** — position is derived from `clock.timeHours` alone.
- ✓ **Speed determinism** — 14:35 sampled after a 0.5 h-step traversal and a 0.01 h-step traversal is identical (32.84 °C, cloud 0.536, wind 6.8 km/h).
- ✓ **Single producer** — `WeatherScenarioEngine` remains the only writer of the weather drivers; `LiveForecastEngine` only answers `getTimeline()`.
- ✓ **No downstream subsystem modified** — SolarPhysics, VirtualSensor, PBIF, servo, AdaptiveSkin, PV, BEMS, battery and grid are untouched.
- ✓ **TypeScript clean** (`tsc --noEmit`), **ESLint clean**, `next build` passes.

---

## Stage 7.8.1 — Forecast Transparency & Traceability

### Objective
Let anyone watching a demonstration verify that the twin is replaying **real** Open-Meteo data, by showing the actual forecast dates being simulated. Purely a transparency and UX improvement — the WeatherScenarioEngine, LiveForecastEngine and simulation clock all behave exactly as in Stage 7.8.

### Changes Made
- **Forecast Playback badge** — the headline readout: `▶ Replaying`, the forecast clock in large type, and the full date beneath (`15:30 MYT` / `2 Aug 2026`). It answers "is this real data?" at a glance, and shows `Standby` when no forecast is cached.
- **Current Forecast Timestamp** — derived by `replayInstantMs()` from the active keyframe's own forecast hour plus the *linear* segment progress the Weather Scenario Engine already publishes. Forecast segments are exactly one hour, so the value tracks the simulation clock continuously and exactly.
- **Expanded Forecast Data card** — Provider, Resolution, Location (with coordinates and IANA zone), **Forecast Issued**, Forecast Horizon, **Forecast Coverage** (`1 Aug 2026 17:00 MYT → 3 Aug 2026 16:00 MYT`), Last Updated, **Last Checked**, Cache Age, Next Refresh and Data Quality.
- **Dated timeline rows** — every hour now shows its calendar date beside the time (`2 Aug · 09:00`), alongside the existing icon, condition and five driver values, so the roll-over to the next day is obvious.
- **Mapping note** beneath the timeline: *"Simulation time is mapped to the downloaded Open-Meteo forecast. The simulation may progress faster than real time for demonstration purposes."*
- **Provenance plumbing** — `WeatherKeyframe.sourceEpochMs` (optional; scenarios leave it undefined) records the real forecast hour a keyframe replays. `ForecastStatus` gained `lastAttempt`, `coverageStart`, `coverageEnd`, `timezone`, `timezoneAbbreviation` and `utcOffsetSeconds`.
- **Site-local time** — `src/lib/dt/forecastTime.ts` is the single source of these formats. Timestamps render in the *forecast site's* timezone rather than the viewer's browser timezone, since a side-by-side check against Open-Meteo is the whole point.

### Notable decisions
- **"Last Updated" vs "Last Checked"** — the spec listed *Forecast Issued* and *Last Updated*, which are the same instant in this implementation. Rather than print one value under two labels, *Last Checked* now reports the last refresh **attempt**: it diverges from the issue time precisely when the twin is running on a cached forecast, which is the case worth surfacing.
- **Timezone label** — Open-Meteo reports the IANA zone correctly (`Asia/Kuala_Lumpur`) but abbreviates every zone as a bare offset (`GMT+8`). A small explicit table maps the twin's three shipped sites to their customary local names (MYT / SGT / GST) and falls back to the provider's own abbreviation for anything else, so no timezone is ever labelled with a guess.
- **Horizon trimmed at the provider** — whole days are still requested for a stable window, but each bundle is now trimmed to the declared 48 h. Previously the cache held 71 h while the card advertised a 48 h horizon; reported coverage is now exactly what is cached.

### Validation
Verified against the live API:
- ✓ **Provenance** — issue time, last-checked, and a coverage window of exactly 48 hourly samples (`1 Aug 17:00 MYT → 3 Aug 16:00 MYT`), labelled MYT from the provider's IANA zone.
- ✓ **Every row carries a real date** and its hour-of-day matches the timestamp it claims to replay, for all 24 rows.
- ✓ **Day transition is visible** — the 24 h window genuinely spans two dates (2 Aug and 1 Aug in the test run).
- ✓ **Timestamp tracks the clock** — sim 09:00 → 2 Aug 09:00 MYT, sim 15:30 → 2 Aug 15:30 MYT, sim 23:45 → 1 Aug 23:45 MYT; simulated and replayed clocks agree to within a rounded minute.
- ✓ **Playback unchanged** — forecast at 14:35 still 32.84 °C, Tropical Mixed at 13:42 still 26.65 °C (the Stage 7.7 value); still step-size independent and still allocation-free (consecutive `update()` calls return the same object).
- ✓ **Scenario keyframes carry no forecast provenance**, as designed.
- ✓ TypeScript, ESLint and `next build` all clean.

---

## Stage 7.8.2 — Forecast Timeline Ordering & Density

### Objective
Fix the Hourly Forecast reading out of chronological order, remove a control that Forecast Mode does not own, and fit more forecast hours on screen. UI/UX only — no engine or playback change.

### 1. Chronological timeline order (root cause)
The timeline was reading `… 2 Aug 16:00 → 1 Aug 17:00`, jumping back a day mid-list.

**Cause.** The playback timeline is *stored* ascending by **hour of day**, because that is the contract `segmentAt` interpolates against — it scans for `timeHours <= h` and wraps cyclically at midnight. The 24 entries are a contiguous real-time window, but that window starts at the hour containing "now", which is rarely 00:00. Stored order therefore begins mid-window (`2 Aug 00:00 …`) and reaches the older hours (`1 Aug 17:00 …`) at the end. The data was never wrong — the **reading order** was.

**Fix.** A new pure helper, `chronologicalOrder()`, returns keyframe indices sorted by `sourceEpochMs`, and `WeatherTimeline` gained an optional `order` prop that rotates the *view*. The stored array is untouched, so interpolation, determinism and the midnight wrap are exactly as before. Scenarios have no `sourceEpochMs`; the helper returns `null` for them and they keep storage order.

**Deliberately not done:** re-sorting the stored array by timestamp. That would break `segmentAt` outright. `CLAUDE.md` §5.3.1 now records the invariant so it is not "fixed" again later.

### 2. Month selector hidden in Forecast Mode
The month is a property of the downloaded forecast, not something the operator sets, so the picker is hidden when the weather source is Forecast. Manual and Scenario Mode are untouched and restore it exactly as before.

### 3. Denser timeline rows
Card padding `py-2 → py-1.5`, metric block `mt-1.5 → mt-1`, progress bar `mt-2 → mt-1.5`, explicit tight line-heights on the header and both metric lines (previously inheriting 1.5), separator arrow stripped of its vertical padding, and row spacing `space-y-1 → space-y-0.5`. Roughly a 20–25 % height reduction per entry — about three extra forecast hours visible in the same space. **No information was removed:** date, time, icon, condition, temperature, humidity, cloud, rain and wind all remain, as does the active-row progress bar.

### Validation
Verified against the live API:
- ✓ **Display order** — `1 Aug 17:00 → 1 Aug 18:00 → … → 2 Aug 15:00 → 2 Aug 16:00`: strictly increasing, exact 1 h steps, zero backward jumps across all 24 rows.
- ✓ **The bug is real and corrected** — storage order contained exactly 1 backward jump; display order contains none.
- ✓ **Interpolator contract intact** — stored timeline still strictly ascending by hour of day.
- ✓ **Active row tracks correctly through the rotation** — sim 09:00 → storage index 9, display row 17/24, `2 Aug 09:00 MYT`; sim 23:45 → storage index 23, display row 7/24, `1 Aug 23:45 MYT`.
- ✓ **Every row still maps to its own hour of day.**
- ✓ **Playback unchanged** — forecast at 14:35 still 32.84 °C, Tropical Mixed at 13:42 still 26.65 °C; still step-size independent and allocation-free.
- ✓ **Scenarios keep storage order** (`chronologicalOrder` → `null`).
- ✓ TypeScript, ESLint and `next build` all clean.

---

## Stage 7.8.3 — Forecast Playback Start Point & Panel Density

### Objective
Open Forecast Mode on the forecast hour happening *right now*, and fit the whole panel inside its window.

### 1. Forecast playback starts at today's hour
Switching the weather source to Forecast previously left the clock wherever it happened to be (the twin boots at 21 Sep, 07:00), so playback opened at an arbitrary point inside the downloaded window.

`Simulation.setWeatherSource()` now calls a new private `syncClockToSiteNow()` when — and only when — Forecast Mode is entered. It sets both the clock's **date** and **timeHours** from the site's current wall clock, using the building's own `timezone` offset, the same one the solar engine uses. So the twin's clock, its sun position and the forecast all refer to one site and one instant. Playback then advances naturally from there, exactly as before.

Two details worth noting:
- `lastEnergyTimeHours` is re-baselined in the same call. The jump is not elapsed time, so without this the BEMS could integrate a thermal step for an interval that never physically happened.
- This also resolves the month inconsistency flagged in Stage 7.8.2: the simulated month now matches the forecast's month rather than drifting independently, which is why hiding the Month selector in Forecast Mode is now not merely cosmetic.

Leaving Forecast Mode does **not** move the clock — Manual and Scenario Mode keep whatever time is on it.

### 2. Panel density
Reduced the fixed chrome above the timeline by roughly 120 px (~20 % of it), giving about a 15 % reduction in overall panel height:
- Section spacing `space-y-5 → space-y-3.5`; connection strip `py-2 → py-1.5`.
- Forecast Playback card: `p-3 → px-3 py-2`, and the time and date now share one baseline row instead of stacking, which alone removes a whole line.
- Forecast Data card: `p-3 → px-3 py-2.5`, row gap `gap-y-2 → gap-y-1.5`, and explicit tight line-heights on every label, value and secondary line (they were inheriting 1.5).
- Section label margins `mb-2 → mb-1.5`; mapping note `mt-2 → mt-1.5`.
- The timeline scroll viewport is capped at `34vh` for Forecast Mode (Scenario Mode keeps `38vh`) via a new optional `maxHeightClass` prop.

The savings deliberately come from the fixed chrome rather than the scroll viewport, so the denser rows from Stage 7.8.2 still translate into more forecast hours visible at once. **No information or functionality was removed.**

### Validation
Driven through a real `Simulation` instance against the live API:
- ✓ **Clock syncs on entry** — `21 Sep 2026 07:00` → `1 Aug 2026 17:57`, matching the site's current date and hour (UTC+8).
- ✓ **Opens on today** — replaying `1 Aug 2026 17:57 MYT`, at display row **1 of 24**, whose header reads `1 Aug 17:00`.
- ✓ **Advances naturally** — at 10×, `1 Aug 17:57 MYT` → `2 Aug 09:57 MYT`.
- ✓ **Leaving Forecast Mode does not move the clock.**
- ✓ TypeScript, ESLint and `next build` all clean.

---

## Stage 7.8.4 — "Now" Button (Return to Current Forecast)

### Objective
Let the operator scrub freely through the forecast and jump straight back to the hour happening right now, without switching weather source.

### Changes Made
- **`Simulation.returnToSiteNow()`** — a public wrapper that reuses the existing private `syncClockToSiteNow()`, then resamples the weather and triggers the environmental tier. No new clock, playback or forecast logic: it is exactly what entering Forecast Mode already does, made callable on demand.
- **`returnToNow()` store action** — calls it and pushes a snapshot immediately, so the Forecast Playback card lands on the new timestamp on click rather than up to one poll interval (~120 ms) later. The mirrored month follows the clock's new date.
- **"Now" button** — a compact pill in the Forecast Playback card header, beside the *Replaying* badge, so it sits with the timestamp it resets.
- **Guaranteed re-centre** — `WeatherTimeline` gained an optional `scrollKey`; the button bumps it so the auto-scroll re-runs even when the clock lands back inside the hour the timeline was already showing (where an `activeIndex`-only effect would not fire).

### Behaviour deliberately left alone
Speed, transport state and weather source are untouched. A twin paused at 10× stays paused at 10×; "Now" moves the clock, nothing else. In particular it does **not** resume a paused simulation — pausing is an explicit operator choice, and silently starting playback would be a surprise.

### Validation
Driven through a real `Simulation` against the live API:
- ✓ **Returns to now** — scrubbed to `2 Aug 03:15 MYT` (row 10/24), pressed Now, landed back on `1 Aug 18:20 MYT` (row 1/24), matching the site's current date and hour.
- ✓ **Nothing else disturbed** — speed 5× → 5×, playing true → true, source forecast → forecast.
- ✓ **Weather resampled on the call** — 24.87 °C at 03:15 → 28.64 °C at now, so the card is correct the moment it renders.
- ✓ **Idempotent** — pressing it again while already at now does not move the active hour.
- ✓ **Works while paused** and leaves the twin paused.
- ✓ TypeScript, ESLint and `next build` all clean.

---

## Stage 7.8.5 — Fix Hourly Forecast Auto-Scroll

### Symptom
Every time the simulation crossed into the next hour, the Hourly Forecast list jumped to the bottom instead of following the active hour.

### Cause
The auto-scroll measured the active row with `el.offsetTop`, which is relative to the nearest **positioned** ancestor — not to the scroll container. The list itself is unpositioned, so `offsetParent` resolved all the way up to the ControlDeck root, and `offsetTop` therefore included every section stacked above the timeline (connection strip, Forecast Playback card, Forecast Data card, section labels ≈ 500 px). Every computed scroll target was ~500 px too large, so early hours overshot wildly and later ones exceeded the maximum scroll and clamped to the bottom.

This affected Scenario Mode too; it was simply less visible there, because a scenario's 5–7 rows leave little scroll range for the error to show up in.

### Fix
Measure against the scroll container with `getBoundingClientRect()`. Rects are viewport-relative, so the difference between the row's and the container's rect is the row's true visual offset inside the list, whatever the positioning context; adding `container.scrollTop` converts it to a content offset, and subtracting half the leftover viewport centres it.

No positioning classes were added — the fix does not depend on a `relative` class surviving a future edit.

### Validation
`getBoundingClientRect` returns zeros under jsdom (no layout engine) and the project has no browser test runner, so this was verified **arithmetically** against a model of the real panel geometry — 24 rows × 63 px in a 300 px viewport (`max-h-[34vh]`), 500 px of panel above — evaluating both formulas over a full 24-hour traversal:
- ✗ **Old formula** — the active row was visible for only **4 of 24** hours, and pinned to the very bottom for **10 of 24**.
- ✓ **New formula** — the active row is visible for **24 of 24** hours.
- ✓ Re-centring the same row is idempotent (no drift when "Now" re-fires the effect on the current hour).
- ✓ The first row rests at the top and the last at the bottom — no overshoot at either end.
- ✓ TypeScript, ESLint and `next build` all clean.
