/**
 * Flowless Core Interfaces
 * Core katmanı hiçbir dış servise bağımlı değildir.
 * Tüm dış dünya bu interface'ler üzerinden konuşur.
 */

/** Her inputtan gelen verinin normalize edilmiş hali */
export interface FlowlessEvent {
  id: string
  /** Nereden geldi: "github", "jira", "mock" */
  source: string
  /** Ne oldu: "commit_pushed", "pr_opened", "ticket_updated" */
  type: string
  /** Ham veri — normalizer işler */
  payload: unknown
  timestamp: Date
  metadata?: Record<string, unknown>
}

/** Core'un ürettiği, connector'ın uygulayacağı aksiyon */
export interface FlowlessAction {
  id: string
  /** "update_ticket", "create_comment", "generate_doc" */
  type: string
  /** Hangi connector uygulayacak */
  targetConnector: string
  /** Connector'a özel veri */
  payload: unknown
  /** AI neden bu aksiyona karar verdi */
  reasoning?: string
}

/** Her input kaynağının uygulaması gereken interface */
export interface IInputConnector {
  name: string
  listen(onEvent: (event: FlowlessEvent) => void): void
  stop(): void
}

/** Connector execute sonucu */
export interface FlowlessResult {
  success: boolean
  data?: unknown
  error?: string
}

/** Her hedef sistemin uygulaması gereken interface */
export interface IOutputConnector {
  name: string
  execute(action: FlowlessAction): Promise<FlowlessResult>
}
