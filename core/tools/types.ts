/**
 * Tool interface — her tool bunu implement eder.
 * Function calling yerine tek completion + JSON parse kullanıyoruz.
 */

import type { FlowlessEvent, FlowlessResult } from '../interfaces.js'
import type { ILLMProvider } from '../llm/types.js'

export interface IToolContext {
  event: FlowlessEvent
  params: Record<string, unknown>
  /** LLM erişimi (generate_doc vb. için) */
  llm?: ILLMProvider
  /** Proje kök dizini */
  projectRoot?: string
  /** Flowless config (slack_webhook_url, github_projects vb.) */
  config?: {
    slack_webhook_url?: string
    github_projects?: import('../../config/loader.js').GitHubProjectsConfig
  }
  /** Bu event için seçilen tool listesi (notify_team mesajında kullanılır) */
  selections?: Array<{ tool: string }>
  /** Bu pipeline'da önce çalışan tool'ların sonuçları (generate_doc → notify_team geçişi için) */
  priorResults?: Array<{ tool: string; result: FlowlessResult }>
}

export interface ITool {
  /** Tool adı — registry key ile aynı */
  name: string
  /** Kısa açıklama — LLM prompt'a gider */
  description: string
  /** Tool'u çalıştır */
  execute(context: IToolContext): Promise<FlowlessResult>
}
