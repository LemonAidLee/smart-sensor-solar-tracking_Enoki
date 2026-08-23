import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export async function GET() {
  try {
    // The sketch.ino is located at 'E&M Programming/sketch.ino' relative to the project root.
    const firmwarePath = path.join(process.cwd(), 'E&M Programming', 'sketch.ino')
    const content = await fs.readFile(firmwarePath, 'utf8')
    
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  } catch (error) {
    console.error('Failed to read firmware:', error)
    return new NextResponse('Failed to load firmware.', { status: 500 })
  }
}
