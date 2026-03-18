/**
 * Bağlam yönetimi
 * Agent'a verilecek context: event detayı, geçmiş aksiyonlar, aktif connector'lar
 */

import type { FlowlessEvent, FlowlessAction } from './interfaces.js'

export interface AgentContext {
  /** Gelen event */
  event: FlowlessEvent
  /** Son N aksiyon (kısa bellek) */
  recentActions: FlowlessAction[]
  /** Aktif output connector isimleri */
  activeConnectors: string[]
  /** Proje/takım konfigürasyonu (genişletilebilir) */
  projectConfig?: Record<string, unknown>
}

const DEFAULT_CONTEXT_WINDOW = 10

/**
 * Geçmiş aksiyonlardan context penceresi oluşturur.
 */
export function createContext(
  event: FlowlessEvent,
  recentActions: FlowlessAction[],
  activeConnectors: string[],
  contextWindow: number = DEFAULT_CONTEXT_WINDOW
): AgentContext {
  const windowedActions = recentActions.slice(-contextWindow)
  return {
    event,
    recentActions: windowedActions,
    activeConnectors,
    projectConfig: {},
  }
}

/**
 * Context'i LLM promptu için metne çevirir.
 */
export function contextToPromptInput(context: AgentContext): string {
  const parts: string[] = []

  parts.push('## Mevcut Event')
  parts.push(JSON.stringify({
    id: context.event.id,
    source: context.event.source,
    type: context.event.type,
    payload: context.event.payload,
    timestamp: context.event.timestamp.toISOString(),
  }, null, 2))

  if (context.recentActions.length > 0) {
    parts.push('\n## Son Aksiyonlar (kısa bellek)')
    parts.push(JSON.stringify(
      context.recentActions.map((a) => ({
        type: a.type,
        targetConnector: a.targetConnector,
        reasoning: a.reasoning,
      })),
      null,
      2
    ))
  }

  parts.push('\n## Aktif Connector\'lar')
  parts.push(context.activeConnectors.join(', '))

  return parts.join('\n')
}
