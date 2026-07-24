'use client'

import { FloatingWindow } from './FloatingWindow'
import { WORKSPACE_TOOLS, resolveDefaultX } from './workspaceTools'

/**
 * WorkspaceWindows — mounts every engineering tool as an independent
 * FloatingWindow. Each window renders nothing until its Tool Dock icon opens it
 * (AnimatePresence inside FloatingWindow handles the open/close animation), so
 * when nothing is open the workspace is calm and the building is the hero.
 *
 * Default X is resolved from the current viewport width so windows first appear
 * just left of the dock, cascading inward.
 */
export function WorkspaceWindows() {
  return (
    <>
      {WORKSPACE_TOOLS.map((tool, i) => (
        <FloatingWindow
          key={tool.id}
          id={tool.id}
          title={tool.label}
          icon={tool.icon}
          accent={tool.accent}
          defaultX={resolveDefaultX(i, tool.defaultW)}
          defaultY={tool.defaultY}
          defaultW={tool.defaultW}
        >
          <tool.Body />
        </FloatingWindow>
      ))}
    </>
  )
}
