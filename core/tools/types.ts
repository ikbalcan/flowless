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
}

export interface ITool {
  /** Tool adı — registry key ile aynı */
  name: string
  /** Kısa açıklama — LLM prompt'a gider */
  description: string
  /** Tool'u çalıştır */
  execute(context: IToolContext): Promise<FlowlessResult>
}
