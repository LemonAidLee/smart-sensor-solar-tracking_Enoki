"use client"

import { useState, useEffect } from "react"
import { Terminal, Copy, Check, AlertCircle } from "lucide-react"

export function FirmwareViewer() {
  const [code, setCode] = useState<string>("// Loading ESP32 firmware...")
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchCode = async () => {
      try {
        const res = await fetch('/api/firmware')
        if (!res.ok) throw new Error("Failed to fetch")
        const text = await res.text()
        setCode(text)
      } catch (err) {
        console.error(err)
        setCode("// Error loading sketch.ino.\n// Please check the server logs.")
        setError(true)
      }
    }
    fetchCode()
  }, [])

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="w-full bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-2xl h-[600px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-emerald" />
          <span className="text-sm font-mono text-gray-300">E&M Programming/sketch.ino</span>
        </div>
        <button 
          onClick={copyToClipboard}
          disabled={error}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors text-xs font-mono text-gray-400 hover:text-white"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "COPIED" : "COPY RAW"}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-6 relative group" data-lenis-prevent>
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 flex-col gap-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <p className="text-sm font-mono text-red-400">Failed to load firmware.</p>
          </div>
        )}
        <pre className="text-[13px] leading-relaxed font-mono text-gray-300 whitespace-pre">
          <code dangerouslySetInnerHTML={{ __html: highlightSyntax(code) }} />
        </pre>
      </div>
    </div>
  )
}

// Simple regex-based syntax highlighter for C++ / Arduino
function highlightSyntax(code: string) {
  // Escape HTML first
  let html = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Strings (first pass, no tags exist yet except our encoded ones)
  html = html.replace(/"([^"\\]|\\.)*"/g, '<span class="text-amber-300">$&</span>');

  // Comments
  html = html.replace(/(<[^>]+>)|(\/\/.*)/g, (match, tag, comment) => {
    if (tag) return tag;
    return `<span class="text-gray-500">${match}</span>`;
  });

  // Macros
  html = html.replace(/(<[^>]+>)|(#\w+)/g, (match, tag, macro) => {
    if (tag) return tag;
    return `<span class="text-purple-400">${match}</span>`;
  });

  // Builtins
  const builtins = /\b(Serial|pinMode|digitalWrite|digitalRead|analogRead|delay|millis|map|constrain|attach|write)\b/;
  html = html.replace(new RegExp(`(<[^>]+>)|(${builtins.source})`, 'g'), (match, tag) => {
    if (tag) return tag;
    return `<span class="text-blue-400">${match}</span>`;
  });

  // Keywords
  const keywords = /\b(int|float|void|bool|if|else|for|while|return|true|false|const|String|byte)\b/;
  html = html.replace(new RegExp(`(<[^>]+>)|(${keywords.source})`, 'g'), (match, tag) => {
    if (tag) return tag;
    return `<span class="text-emerald-400">${match}</span>`;
  });

  // Numbers
  const numbers = /\b\d+(\.\d+)?\b/;
  html = html.replace(new RegExp(`(<[^>]+>)|(${numbers.source})`, 'g'), (match, tag) => {
    if (tag) return tag;
    return `<span class="text-orange-400">${match}</span>`;
  });

  return html;
}
