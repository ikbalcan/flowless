/**
 * Agent — AI Reasoning + Tool Selection
 * Function calling yerine tek completion + JSON parse. Maliyet düşük.
 */

import type { FlowlessEvent, FlowlessAction } from './interfaces.js'
import type { FlowlessResult } from './interfaces.js'
import type { ILLMProvider } from './llm/types.js'
export interface ProcessedAction {
  action: FlowlessAction
  result: FlowlessResult
}
import { createContext, contextToPromptInput } from './context.js'
import { getTool, getAllTools } from '../tools/index.js'
import type { FlowlessConfig } from '../config/loader.js'
import { getToolsForBranch, getProjectRoot } from '../config/loader.js'

function buildSystemPrompt(
  toolNames: string[],
  toolDescriptions: Map<string, string>
): string {
  const toolList = toolNames
    .map((name) => `- ${name}: ${toolDescriptions.get(name) ?? ''}`)
    .join('\n')

  return `Sen Flowless ajanısın. Geliştirme süreçlerini izleyen bir asistansın.

Görevin: Gelen event'i yorumla ve uygun tool'u/tool'ları seç.

## Mevcut Tool Listesi (sadece bunlardan seç):
${toolList}

## Kurallar
- Event'e göre uygun tool'u seç. Birden fazla seçebilirsin (örn: main branch commit için hem generate_doc hem notify_team).
- "tools" alanına array ver. Her eleman: { "tool": "tool_adı", "params": {}, "reasoning": "neden bu tool, neden bu paramlar" }
- Tek tool için: { "tools": [{ "tool": "log_event", "params": {}, "reasoning": "..." }] }
- reasoning ZORUNLU ve DETAYLI olmalı.
- params tool'a göre değişir. Boş {} olabilir.
- notify_team seçildiğinde params.message ZORUNLU: Takımı bilgilendiren 1-2 cümle Türkçe özet yaz. Ne değişti, neden önemli, aksiyon gerekirse belirt. Teknik jargondan kaçın, anlaşılır olsun.

## Cevap formatı (SADECE JSON, başka metin yok):
{
  "tools": [
    {
      "tool": "tool_adı",
      "params": {},
      "reasoning": "Bu event'i X olarak yorumluyorum çünkü... Bu tool'u seçtim çünkü..."
    }
  ]
}`
}

export interface AgentConfig {
  llm: ILLMProvider
  config: FlowlessConfig
  contextWindow?: number
  activeConnectors: string[]
}

export class Agent {
  private agentConfig: AgentConfig

  constructor(agentConfig: AgentConfig) {
    this.agentConfig = agentConfig
  }

  async processEvent(event: FlowlessEvent): Promise<ProcessedAction[]> {
    const branch = this.getBranchFromEvent(event)
    const allowedTools = getToolsForBranch(this.agentConfig.config, branch)

    const allTools = getAllTools()
    const toolDescriptions = new Map(
      allTools.map((t) => [t.name, t.description] as const)
    )
    const systemPrompt = buildSystemPrompt(allowedTools, toolDescriptions)

    const context = createContext(
      event,
      [],
      this.agentConfig.activeConnectors,
      this.agentConfig.contextWindow ?? 10
    )
    const userInput = contextToPromptInput(context)

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content:
          userInput +
          '\n\nBu event için hangi tool/tool\'ları kullanmalısın? Sadece JSON döndür.',
      },
    ]

    const rawResponse = await this.agentConfig.llm.complete(messages, {
      maxTokens: 2048,
      temperature: 0.3,
      jsonMode: true,
    })

    let selections = this.parseToolSelection(rawResponse)
    // Sıra: update_github_project (önce statü) → generate_doc → notify_team → ...
    const order = { update_github_project: 0, generate_doc: 1, notify_team: 2, log_event: 3, update_ticket: 4, create_comment: 5 }
    selections = [...selections].sort(
      (a, b) => (order[a.tool as keyof typeof order] ?? 5) - (order[b.tool as keyof typeof order] ?? 5)
    )
    const processed: ProcessedAction[] = []
    const projectRoot = getProjectRoot()

    for (let i = 0; i < selections.length; i++) {
      const sel = selections[i]
      const tool = getTool(sel.tool)

      if (!tool) {
        console.warn(`[Agent] Bilinmeyen tool: ${sel.tool}, atlanıyor`)
        continue
      }

      const action: FlowlessAction = {
        id: `act_${Date.now()}_${event.id.slice(-6)}_${i}`,
        type: sel.tool,
        targetConnector: 'mock',
        payload: sel.params,
        reasoning: sel.reasoning,
      }

      let result: FlowlessResult = { success: false, error: 'Tool çalıştırılmadı' }
      try {
        const priorResults = processed
          .map((p) => ({ tool: p.action.type, result: p.result }))
        result = await tool.execute({
          event,
          params: sel.params,
          llm: this.agentConfig.llm,
          projectRoot,
          config: this.agentConfig.config,
          selections: selections.map((s) => ({ tool: s.tool })),
          priorResults,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Agent] Tool execute hatası: ${sel.tool}`, msg)
        result = { success: false, error: msg }
      }

      processed.push({ action, result })
    }

    return processed
  }

  private getBranchFromEvent(event: FlowlessEvent): string | undefined {
    if (event.source === 'github' && event.metadata) {
      return (event.metadata as Record<string, unknown>).branch as string
    }
    const payload = event.payload as Record<string, unknown>
    return payload?.branch as string | undefined
  }

  private parseToolSelection(raw: string): Array<{ tool: string; params: Record<string, unknown>; reasoning: string }> {
    try {
      const parsed = JSON.parse(raw) as {
        tool?: string
        params?: Record<string, unknown>
        reasoning?: string
        tools?: Array<{ tool: string; params?: Record<string, unknown>; reasoning?: string }>
      }

      if (parsed.tools && Array.isArray(parsed.tools)) {
        return parsed.tools.map((t) => ({
          tool: String(t.tool ?? 'log_event'),
          params: (t.params as Record<string, unknown>) ?? {},
          reasoning: String(t.reasoning ?? ''),
        }))
      }

      if (parsed.tool) {
        return [
          {
            tool: String(parsed.tool),
            params: (parsed.params as Record<string, unknown>) ?? {},
            reasoning: String(parsed.reasoning ?? ''),
          },
        ]
      }

      return []
    } catch {
      return []
    }
  }
}
