/**
 * Provider-agnostic LLM interface
 * OpenAI, Anthropic, Gemini vb. için aynı arayüz kullanılır.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMCompletionOptions {
  /** Maksimum token sayısı */
  maxTokens?: number
  /** Sıcaklık (0-2) */
  temperature?: number
  /** JSON mode (bazı provider'lar destekler) */
  jsonMode?: boolean
}

export interface ILLMProvider {
  readonly name: string

  /**
   * Mesaj listesi ile tamamlama yapar.
   * @returns LLM'den gelen metin cevabı
   */
  complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<string>
}
