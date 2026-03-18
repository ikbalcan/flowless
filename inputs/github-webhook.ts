/**
 * GitHub Webhook Input Connector
 * HTTP POST ile GitHub webhook eventlerini dinler.
 * X-Hub-Signature-256 ile imza doğrulaması yapar.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IInputConnector } from '../core/interfaces.js'
import type { FlowlessEvent } from '../core/interfaces.js'
import { normalizeGitHubPush, type GitHubPushPayload } from '../core/normalizer.js'

export interface GitHubWebhookConfig {
  /** Webhook secret (GITHUB_WEBHOOK_SECRET) */
  secret: string
  /** Dinlenecek port (varsayılan 3000) */
  port?: number
  /** Webhook path (varsayılan /webhook/github) */
  path?: string
}

export class GitHubWebhookInputConnector implements IInputConnector {
  name = 'github-webhook'
  private config: GitHubWebhookConfig
  private server: ReturnType<typeof createServer> | null = null
  private onEventCallback: ((event: FlowlessEvent) => void) | null = null

  constructor(config: GitHubWebhookConfig) {
    if (!config.secret) {
      throw new Error('GITHUB_WEBHOOK_SECRET gerekli')
    }
    this.config = {
      port: 3000,
      path: '/webhook/github',
      ...config,
    }
  }

  listen(onEvent: (event: FlowlessEvent) => void): void {
    this.onEventCallback = onEvent

    this.server = createServer((req, res) => {
      this.handleRequest(req, res)
    })

    this.server.listen(this.config.port, () => {
      console.log(
        `[GitHubWebhook] Dinleniyor: http://0.0.0.0:${this.config.port}${this.config.path}`
      )
    })
  }

  stop(): void {
    if (this.server) {
      this.server.close()
      this.server = null
    }
    this.onEventCallback = null
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST' || req.url !== this.config.path) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(chunk as Buffer)
    }
    const body = Buffer.concat(chunks).toString('utf8')

    const signature = req.headers['x-hub-signature-256'] as string | undefined
    const eventType = req.headers['x-github-event'] as string | undefined
    const deliveryId = req.headers['x-github-delivery'] as string | undefined

    if (!signature || !eventType) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing signature or event headers' }))
      return
    }

    if (!this.verifySignature(body, signature)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid signature' }))
      return
    }

    if (eventType !== 'push') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ received: true, skipped: `Event type: ${eventType}` }))
      return
    }

    try {
      const payloadJson = this.extractPayload(body, req.headers['content-type'])
      const payload = JSON.parse(payloadJson) as GitHubPushPayload
      const event = normalizeGitHubPush(payload, deliveryId ?? `delivery_${Date.now()}`)

      this.onEventCallback?.(event)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ received: true, eventId: event.id }))
    } catch (err) {
      console.error('[GitHubWebhook] Parse hatası:', err)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid payload' }))
    }
  }

  /** application/json veya application/x-www-form-urlencoded destekler */
  private extractPayload(body: string, contentType?: string): string {
    const type = (contentType ?? '').split(';')[0].trim().toLowerCase()
    if (type === 'application/x-www-form-urlencoded') {
      const params = new URLSearchParams(body)
      const payload = params.get('payload')
      if (!payload) throw new Error('payload parametresi bulunamadı')
      return payload
    }
    return body
  }

  private verifySignature(body: string, signature: string): boolean {
    if (!signature.startsWith('sha256=')) return false

    const expected = 'sha256=' + createHmac('sha256', this.config.secret)
      .update(body)
      .digest('hex')

    if (expected.length !== signature.length) return false

    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    } catch {
      return false
    }
  }
}
