# AI Knowledge Manifest

## Metadata
- **Engineering Knowledge Version**: v1.0
- **Current Stage**: 8.3.3
- **Last Updated**: Stage 8.3.3
- **Purpose**: Knowledge Manifest to guide future AI assistants.

---

## 1. Purpose
This document is a stable "Knowledge Manifest" designed to orient future AI assistants. It defines where engineering knowledge lives, which files are authoritative, and how they should be maintained. It minimizes unnecessary context reading and prevents documentation drift.

---

## 2. Knowledge Map

### Architecture Guide
- **Location**: `CLAUDE.md`
- **Purpose**: Project architecture, coding rules, subsystem responsibilities, and developer conventions.

### Implementation History
- **Location**: `walkthrough.md`
- **Purpose**: Chronological implementation log. Historical only. Never use as the primary architectural reference.

### Engineering Knowledge
- **Location**: `src/lib/knowledge/`
- **Purpose**: Static engineering textbook. Contains subsystem definitions, concepts, assumptions, equations, references, and limitations.

### Live Engineering Context
- **Location**: `src/lib/assistant/contextBuilder.ts`
- **Purpose**: Live subsystem summaries. Read-only. Current simulation state.

### Engineering Reasoning
- **Location**: `src/lib/assistant/reasoningEngine.ts`
- **Purpose**: Deterministic reasoning. Relationship traversal. Structured explanations.

### Prediction
- **Location**: `src/lib/prediction/`
- **Purpose**: Future projections.

### What-If
- **Location**: `src/lib/whatif/`
- **Purpose**: Sandbox engineering studies.

---

## 3. Read Order
Standard reading sequence for future AI assistants:

1. **`CLAUDE.md`**
2. **`AI_KNOWLEDGE.md`** (This file)
3. **Read only the specific subsystem files required for the requested task.**
4. **`walkthrough.md`** (ONLY if historical implementation details are explicitly required.)

---

## 4. Documentation Governance

- **`CLAUDE.md`**: Updated ONLY when architecture changes.
- **`walkthrough.md`**: Updated after implementation stages.
- **`src/lib/knowledge/` (EngineeringKnowledgeBase)**: Updated ONLY when the user explicitly requests updating engineering knowledge. Do NOT update automatically.
- **`AI_KNOWLEDGE.md`**: Updated ONLY when knowledge locations change, new AI subsystems are introduced, or documentation responsibilities change. Do NOT update after ordinary feature implementations.

---

## 5. Future AI Architecture
The intended pipeline for AI-assisted reasoning in the Digital Twin:

`EngineeringKnowledgeBase` 
↓ 
`EngineeringContextBuilder` 
↓ 
`EngineeringReasoningEngine` 
↓ 
Future Engineering Assistant 
↓ 
*(Optional Future LLM)*

*(This pipeline is informational only.)*

---

## 6. AI Rules

Future AI assistants MUST adhere to the following policies:
- Read `CLAUDE.md` first.
- Read `AI_KNOWLEDGE.md` second.
- Read only the files necessary for the requested task.
- Avoid reading `walkthrough.md` unless historical information is explicitly required.
- Never modify the EngineeringKnowledgeBase unless explicitly instructed by the user.
- Treat EngineeringKnowledgeBase as the authoritative engineering reference.
- Treat `walkthrough.md` as historical implementation notes only.
