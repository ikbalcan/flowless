/**
 * Tool registry — tool adı → sınıf
 * Dinamik çağrı için reflection benzeri kullanım
 */

import type { ITool } from '../core/tools/types.js'
import { LogEventTool } from './log-event.js'
import { UpdateTicketTool } from './update-ticket.js'
import { UpdateGitHubProjectTool } from './update-github-project.js'
import { CreateCommentTool } from './create-comment.js'
import { GenerateDocTool } from './generate-doc.js'
import { NotifyTeamTool } from './notify-team.js'

const TOOL_CLASSES: (new () => ITool)[] = [
  LogEventTool,
  UpdateTicketTool,
  UpdateGitHubProjectTool,
  CreateCommentTool,
  GenerateDocTool,
  NotifyTeamTool,
]

const registry = new Map<string, ITool>()

for (const C of TOOL_CLASSES) {
  const instance = new C()
  registry.set(instance.name, instance)
}

export function getTool(name: string): ITool | undefined {
  return registry.get(name)
}

export function getAllTools(): ITool[] {
  return Array.from(registry.values())
}

export function getToolNames(): string[] {
  return Array.from(registry.keys())
}
