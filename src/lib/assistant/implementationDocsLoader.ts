/**
 * Client-side loader for the Implementation Documentation layer. Fetches
 * through `/api/assistant-docs/[slug]` (the one server-side reader of
 * `docs/ai/implementation/*.md`) and caches per browser session — the docs
 * are curated, not live data, so re-fetching them per question would be pure
 * waste (`promptBuilder.ts` calls this on every escalated question).
 *
 * A failed fetch is never fatal: the assistant falls back to reasoning from
 * the Engineering Knowledge Base and live context alone, per CLAUDE.md's
 * "Never fabricate" rule — a missing implementation doc is a gap, not a
 * license to invent one.
 */

import { type DocSlug } from './implementationIndex'

const cache = new Map<DocSlug, string>()
const inFlight = new Map<DocSlug, Promise<string | null>>()

async function fetchDoc(slug: DocSlug): Promise<string | null> {
  try {
    const res = await fetch(`/api/assistant-docs/${slug}`)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function loadOne(slug: DocSlug): Promise<string | null> {
  const cached = cache.get(slug)
  if (cached !== undefined) return cached

  let pending = inFlight.get(slug)
  if (!pending) {
    pending = fetchDoc(slug)
    inFlight.set(slug, pending)
  }

  const content = await pending
  inFlight.delete(slug)
  if (content !== null) cache.set(slug, content)
  return content
}

/** Loads exactly the requested docs, in order, skipping any that fail to
 *  load rather than failing the whole batch. */
export async function loadImplementationDocs(slugs: readonly DocSlug[]): Promise<{ slug: DocSlug; content: string }[]> {
  const results = await Promise.all(slugs.map(async (slug) => ({ slug, content: await loadOne(slug) })))
  return results.filter((r): r is { slug: DocSlug; content: string } => r.content !== null)
}
