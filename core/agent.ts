/**
 * Agent — AI Reasoning + Action Planning
 * FlowlessEvent alır, LLM'e sorar, FlowlessAction üretir.
 */

import type { FlowlessEvent, FlowlessAction } from './interfaces.js'
import type { ILLMProvider } from './llm/types.js'
import { createContext, contextToPromptInput } from './context.js'

const SYSTEM_PROMPT = `Sen Flowless ajanısın. Geliştirme süreçlerini izleyen bir asistansın.

Görevin: Gelen event'i yorumla ve yapılması gereken aksiyonları planla.

ÖNEMLİ — Event tipleri:
- GitHub: source "github", type "commit_pushed" — gerçek commit eventleri. payload'da repository, branch, commits, headCommit (message, author) bilgisi vardır. Bunları kullan.
- Mock: source "mock", "mock_event_X" — test eventleri. Gerçek SDLC gibi yorumla.
- Her event mutlaka bir süreç adımını temsil eder — yorumla ve aksiyon üret

Kurallar:
- HER EVENT İÇİN MUTLAKA EN AZ 1 AKSİYON ÜRET. Boş liste asla dönme.
- Sadece "activeConnectors" listesindeki connector'lara aksiyon ata (genelde "mock")
- "type" alanı "log_event" olabilir — bu kabul edilebilir
- "reasoning" alanı ZORUNLU ve DETAYLI olmalı: Event'i nasıl yorumladığını, neden bu aksiyona karar verdiğini, süreç bağlamında ne anlama geldiğini açıkla (2-3 cümle)
- Event'i gerçek bir geliştirme süreci olayı gibi hayal et ve buna uygun reasoning yaz

Cevaplarını MUTLAKA şu JSON formatında ver (başka metin ekleme):
{
  "actions": [
    {
      "type": "log_event",
      "targetConnector": "mock",
      "payload": { "eventId": "...", "interpretation": "..." },
      "reasoning": "Bu event'i [commit/PR/ticket/deployment] olarak yorumluyorum çünkü... Süreç açısından şu adım gerekiyor..."
    }
  ]
}`

export interface AgentConfig {
  /** LLM provider */
  llm: ILLMProvider
  /** Kaç önceki aksiyon hafızada tutulsun */
  contextWindow?: number
  /** Aktif output connector isimleri */
  activeConnectors: string[]
  /** Geçmiş aksiyonlar (harici olarak yönetilebilir) */
  recentActions?: FlowlessAction[]
}

export class Agent {
  private config: AgentConfig
  private _recentActions: FlowlessAction[] = []

  constructor(config: AgentConfig) {
    this.config = {
      ...config,
      recentActions: config.recentActions ?? [],
    }
    this._recentActions = [...(config.recentActions ?? [])]
  }

  /**
   * Event alır, AI ile yorumlar, FlowlessAction listesi üretir.
   */
  async processEvent(event: FlowlessEvent): Promise<FlowlessAction[]> {
    const context = createContext(
      event,
      this._recentActions,
      this.config.activeConnectors,
      this.config.contextWindow ?? 10
    )

    const userInput = contextToPromptInput(context)

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: userInput },
    ]

    const rawResponse = await this.config.llm.complete(messages, {
      maxTokens: 2048,
      temperature: 0.3,
      jsonMode: true,
    })

    const actions = this.parseResponse(rawResponse, event.id)

    // Hafızaya ekle
    for (const a of actions) {
      this._recentActions.push(a)
    }
    // Pencereyi aşanları sil
    const window = this.config.contextWindow ?? 10
    if (this._recentActions.length > window) {
      this._recentActions = this._recentActions.slice(-window)
    }

    return actions
  }

  private parseResponse(raw: string, eventId: string): FlowlessAction[] {
    try {
      const parsed = JSON.parse(raw) as { actions?: unknown[] }
      const actions = parsed?.actions ?? []

      if (!Array.isArray(actions) || actions.length === 0) {
        return []
      }

      return actions.map((a, i) => this.toFlowlessAction(a, eventId, i))
    } catch {
      return []
    }
  }

  private toFlowlessAction(
    raw: unknown,
    eventId: string,
    index: number
  ): FlowlessAction {
    const obj = raw as Record<string, unknown>
    return {
      id: `act_${Date.now()}_${eventId.slice(-6)}_${index}`,
      type: String(obj.type ?? 'unknown'),
      targetConnector: String(obj.targetConnector ?? 'mock'),
      payload: obj.payload ?? {},
      reasoning: obj.reasoning != null ? String(obj.reasoning) : undefined,
    }
  }
}
