#!/usr/bin/env node
/**
 * Flowless — Ana giriş noktası
 * Input: GitHub webhook (GITHUB_WEBHOOK_SECRET set) veya Mock
 * Output: Mock connector
 */

import 'dotenv/config'
import { Agent } from './core/agent.js'
import { OpenAIProvider } from './core/llm/openai.js'
import { MockInputConnector } from './inputs/mock.js'
import { GitHubWebhookInputConnector } from './inputs/github-webhook.js'
import { MockOutputConnector } from './connectors/mock.js'

function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('[Flowless] Hata: OPENAI_API_KEY environment variable ayarlanmalı.')
    process.exit(1)
  }

  const llm = new OpenAIProvider()
  const agent = new Agent({
    llm,
    contextWindow: 10,
    activeConnectors: ['mock'],
  })

  const mockOutput = new MockOutputConnector()

  const handleEvent = async (event: import('./core/interfaces.js').FlowlessEvent) => {
    console.log('[Flowless] Event alındı:', {
      id: event.id,
      source: event.source,
      type: event.type,
      timestamp: event.timestamp,
      ...(event.source === 'github' && {
        repo: (event.metadata as Record<string, unknown>)?.repository,
        branch: (event.metadata as Record<string, unknown>)?.branch,
      }),
    })

    try {
      const actions = await agent.processEvent(event)
      console.log('[Flowless] Agent', actions.length, 'aksiyon üretti')

      for (const action of actions) {
        const result = await mockOutput.execute(action)
        console.log('[Flowless] Action sonucu:', result.success ? '✓' : '✗', {
          type: action.type,
          reasoning: action.reasoning?.slice(0, 80),
          ...result,
        })
      }
    } catch (err) {
      console.error('[Flowless] Agent hatası:', err)
    }
  }

  if (process.env.GITHUB_WEBHOOK_SECRET) {
    const port = parseInt(process.env.WEBHOOK_PORT ?? '3000', 10)
    const githubInput = new GitHubWebhookInputConnector({
      secret: process.env.GITHUB_WEBHOOK_SECRET,
      port,
      path: '/webhook/github',
    })
    githubInput.listen(handleEvent)
    console.log('[Flowless] GitHub webhook aktif. ngrok ile tunnel açın: ngrok http', port)
    console.log('[Flowless] GitHub repo Settings → Webhooks → Payload URL: https://<ngrok-url>/webhook/github')
  } else {
    const mockInput = new MockInputConnector()
    mockInput.listen(handleEvent)
    console.log('[Flowless] Mock input aktif. Her 3 saniyede bir event gelecek.')
  }

  console.log('[Flowless] Başlatıldı. Durdurmak için Ctrl+C')
}

main()
