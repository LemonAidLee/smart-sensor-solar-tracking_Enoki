'use client'

/**
 * LcdScreen — a realistic 20×4 character I²C LCD simulation (HD44780-style),
 * rendered exactly as the firmware would: four fixed-width, fixed-height rows
 * of monospace text on a backlit green field. Purely presentational — text is
 * supplied by `src/lib/embedded/panel.ts`'s `lcdLines()`.
 */
export function LcdScreen({ lines }: { lines: string[] }) {
  const rows = Array.from({ length: 4 }, (_, i) => (lines[i] ?? '').slice(0, 20).padEnd(20, ' '))

  return (
    <div className="rounded-lg border border-black/60 bg-[#0d0f0a] p-1.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]">
      <div
        className="rounded-[3px] px-2 py-1.5"
        style={{
          background: 'linear-gradient(180deg, #0f2416 0%, #06170d 100%)',
          boxShadow: 'inset 0 0 12px rgba(0,0,0,0.55)',
        }}
      >
        {rows.map((row, i) => (
          <div
            key={i}
            className="whitespace-pre font-mono text-[11.5px] font-bold leading-[1.55] tracking-[0.14em]"
            style={{ color: '#86faA4', textShadow: '0 0 6px rgba(124,252,154,0.65)' }}
          >
            {row}
          </div>
        ))}
      </div>
    </div>
  )
}
