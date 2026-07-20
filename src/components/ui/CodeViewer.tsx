import { ScrollArea } from "@/components/ui/ScrollArea" // wait, we don't have shadcn scroll area. I will use standard CSS overflow.

interface CodeViewerProps {
  code: string
}

export function CodeViewer({ code }: CodeViewerProps) {
  const lines = code.split('\n')

  const highlightLine = (line: string) => {
    // 1. Separate comment to avoid highlighting inside comments
    const commentIdx = line.indexOf("//")
    let codePart = line
    let commentPart = ""
    if (commentIdx !== -1) {
      codePart = line.substring(0, commentIdx)
      commentPart = line.substring(commentIdx)
    }

    // Escape HTML
    const escapeHtml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    
    let html = escapeHtml(codePart)

    // 2. Syntax Replacements
    // Strings
    html = html.replace(/(&quot;.*?&quot;)/g, '<span style="color: #ce9178">$1</span>')
    // Includes <...>
    html = html.replace(/(&lt;[a-zA-Z0-9_.]+\.h&gt;)/g, '<span style="color: #ce9178">$1</span>')
    // Preprocessor
    html = html.replace(/(#(?:include|define|if|endif|pragma))/g, '<span style="color: #569cd6">$1</span>')
    // Keywords
    const keywords = ['const', 'int', 'float', 'double', 'char', 'unsigned', 'long', 'void', 'enum', 'switch', 'case', 'return', 'if', 'else', 'while', 'for', 'break', 'struct', 'true', 'false']
    const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g')
    html = html.replace(keywordRegex, '<span style="color: #569cd6">$1</span>')
    // Types & Classes
    const types = ['String', 'LiquidCrystal_I2C', 'Servo', 'DHT', 'WiFiClient', 'PubSubClient', 'FacadeState']
    const typeRegex = new RegExp(`\\b(${types.join('|')})\\b`, 'g')
    html = html.replace(typeRegex, '<span style="color: #4ec9b0">$1</span>')
    // Numbers (Hex and Decimal)
    html = html.replace(/\b(0x[0-9a-fA-F]+)\b/g, '<span style="color: #b5cea8">$1</span>')
    html = html.replace(/\b(\d+(\.\d+)?)\b/g, '<span style="color: #b5cea8">$1</span>')
    // Functions (word followed by open parenthesis)
    html = html.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span style="color: #dcdcaa">$1</span>')

    // 3. Re-attach comment
    if (commentPart) {
      html += `<span style="color: #6A9955">${escapeHtml(commentPart)}</span>`
    }

    return html
  }

  return (
    <div className="w-full h-full flex flex-col rounded-xl overflow-hidden border border-white/10 bg-[#1e1e1e] shadow-2xl">
      {/* macOS style Window Header */}
      <div className="flex items-center px-4 py-3 bg-[#252526] border-b border-black/40">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        <div className="mx-auto flex items-center">
          <span className="text-xs font-mono text-[#969696]">sketch.ino</span>
        </div>
      </div>
      
      {/* Code Container */}
      <div className="flex-1 overflow-auto py-4 custom-scrollbar text-[#d4d4d4]">
        <pre className="font-mono text-[13px] leading-[1.6]">
          {lines.map((line, i) => (
            <div key={i} className="flex px-4 hover:bg-[#2a2d2e] transition-colors">
              <span className="w-10 text-right pr-4 select-none text-[#858585] shrink-0 border-r border-[#404040] mr-4">
                {i + 1}
              </span>
              <span 
                className="whitespace-pre flex-1"
                dangerouslySetInnerHTML={{ __html: highlightLine(line) }} 
              />
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}
