/**
 * Serves the curated "Implementation Documentation" layer
 * (`docs/ai/implementation/*.md`) to the Engineering Assistant, which runs
 * client-side (see `geminiConfig.ts`) and therefore cannot read the
 * filesystem directly. `docs/` is outside `public/` deliberately — it is a
 * human/AI-curated engineering source, not a static asset — so this route is
 * the one narrow, server-side bridge that reads it on request.
 *
 * The slug is resolved against `IMPLEMENTATION_DOCS`, never built into a raw
 * path from the request, so this can never read outside `docs/ai/implementation/`.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { IMPLEMENTATION_DOCS, type DocSlug } from '@/lib/assistant/implementationIndex'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = IMPLEMENTATION_DOCS[slug as DocSlug]

  if (!doc) {
    return NextResponse.json({ error: `Unknown implementation doc slug: ${slug}` }, { status: 404 })
  }

  try {
    const absolutePath = path.join(process.cwd(), doc.docPath)
    const content = await readFile(absolutePath, 'utf-8')
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        // Curated docs change rarely and deliberately — safe to cache in the browser per session.
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch {
    return NextResponse.json({ error: `Implementation doc not found on disk: ${doc.docPath}` }, { status: 404 })
  }
}
