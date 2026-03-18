/**
 * OpenAI LLM Provider
 * OPENAI_API_KEY environment variable'dan alınır.
 */

import OpenAI from 'openai'
import type { ILLMProvider, LLMMessage, LLMCompletionOptions } from './types.js'

export class OpenAIProvider implements ILLMProvider {
  readonly name = 'openai'
  private client: OpenAI

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.OPENAI_API_KEY
    if (!key) {
      throw new Error(
        'OPENAI_API_KEY bulunamadı. Environment variable olarak ayarlayın.'
      )
    }
    this.client = new OpenAI({ apiKey: key })
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.3,
      response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('OpenAI boş cevap döndü')
    }
    return content
  }
}
