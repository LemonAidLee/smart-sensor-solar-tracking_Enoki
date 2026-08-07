# AI Implementation Documentation Update Guide

**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

This guide outlines how the **Engineering Implementation Knowledge Layer** (`docs/ai/implementation/`) should be maintained by future AI assistants (Claude, Gemini, etc.) and human engineers. 

These documents are the **primary source of truth** for the Engineering Assistant. They must be manually and intentionally updated whenever physical algorithms, engine responsibilities, or mathematical constants change. Do **NOT** use automatic documentation generators.

## General Maintenance Rules

1. **Do not copy raw source code.** Documentation must explain the engineering theory and implementation pipeline in a way that allows a reader to understand the physics without reading the code.
2. **Preserve the structure.** Every document must include standard sections (Overview, Responsibilities, Inputs, Outputs, Internal Calculation Pipeline, Engineering Theory, Equations, Constants, Engineering References, Assumptions, Limitations, Dependencies, Consumers, Public API, Source Files).
3. **Ensure traceability.** Equations and constants must cite the specific source files where they are implemented.
4. **Update `AI_IMPLEMENTATION_INDEX.md`.** If a new subsystem is created, you must add it to the index and bump the `Last Updated` date.

## When to Update Documentation

Updates are required **ONLY** when the underlying engineering logic, data flow, or physics models change. UI styling, rendering, and pure refactoring do not warrant updates.

### Examples

#### Example 1: UI styling changes
- **Scenario:** The color of the solar vectors is changed from yellow to orange.
- **Action:** **No documentation update required.** This is a presentation layer change.

#### Example 2: Building Thermal equation changes
- **Scenario:** The thermal mass lag coefficient (τ) is modified to account for a new concrete thickness.
- **Action:** **Update `building_thermal.md`.** Update the 'Equations', 'Constants', and 'Assumptions' sections to reflect the new thermal mass model.

#### Example 3: PBIF decision logic changes
- **Scenario:** The PBIF control hierarchy is adjusted to prioritize thermal demand over solar availability during extreme heatwaves.
- **Action:** **Update `pbif.md`.** Update the 'Internal Calculation Pipeline' and 'Decision Trees' to reflect the new state machine logic.

#### Example 4: Building Lighting constants change
- **Scenario:** The target indoor illuminance is changed from 500 lux to 300 lux.
- **Action:** **Update `building_lighting.md`.** Update the 'Constants' table with the new target lux value and file citation.

#### Example 5: New Subsystem (e.g., Financial Analytics)
- **Scenario:** A new engine is added to calculate energy costs.
- **Action:** **Create a new file** (e.g., `financial_analytics.md`), populate all standard structural sections, and **update `AI_IMPLEMENTATION_INDEX.md`** to list the new subsystem. Update any consumers (e.g., `prediction.md` or `what_if.md`) if they now depend on this new engine.

## The AI's Role

Future AIs (like Gemini) will read these documents via `promptBuilder.ts` to answer complex user questions such as:
- *"How is indoor heat gain calculated?"*
- *"Why is HVAC demand increasing?"*
- *"How does PBIF determine façade angles?"*

Keeping this layer accurate ensures the AI's answers remain deterministic, grounded in the twin's actual physics, and free from hallucination.
