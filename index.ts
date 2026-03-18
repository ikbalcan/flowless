#!/usr/bin/env node
/**
 * Flowless — Ana giriş noktası
 * Input: GitHub webhook (GITHUB_WEBHOOK_SECRET set) veya Mock
 * Output: Tool-based (log_event, generate_doc, vb.)
 * Dashboard: http://localhost:4000
 */

import 'dotenv/config'
import { Agent } from './core/agent.js'
import { OpenAIProvider } from './core/llm/openai.js'
import { MockInputConnector } from './inputs/mock.js'
import { GitHubWebhookInputConnector } from './inputs/github-webhook.js'
import { dashboardStore } from './dashboard/store.js'
import { startDashboardServer } from './dashboard/server.js'
import { loadConfig } from './config/loader.js'

function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('[Flowless] Hata: OPENAI_API_KEY environment variable ayarlanmalı.')
    process.exit(1)
  }

  const config = loadConfig()
  const llm = new OpenAIProvider()
  const agent = new Agent({
    llm,
    config,
    contextWindow: 10,
    activeConnectors: ['mock'],
  })

  const handleEvent = async (event: import('./core/interfaces.js').FlowlessEvent) => {
    dashboardStore.addEvent(event)
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
      const processed = await agent.processEvent(event)
      dashboardStore.addActions(event.id, processed.map((p) => p.action))
      console.log('[Flowless] Agent', processed.length, 'aksiyon üretti')

      for (const { action, result } of processed) {
        dashboardStore.updateActionResult(event.id, action.id, result)
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

  startDashboardServer()
  console.log('[Flowless] Başlatıldı. Durdurmak için Ctrl+C')
}

main()
