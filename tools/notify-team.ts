/**
 * notify_team — Ekibe Slack ile bildirim gönder
 * slack_webhook_url (config veya SLACK_WEBHOOK_URL env) varsa gerçek Slack'e, yoksa mock (log).
 */

import type { ITool, IToolContext } from '../core/tools/types.js'

function getWebhookUrl(ctx: IToolContext): string | undefined {
  const fromConfig = ctx.config?.slack_webhook_url
  if (fromConfig && typeof fromConfig === 'string' && fromConfig.startsWith('https://')) {
    return fromConfig
  }
  const fromEnv = process.env.SLACK_WEBHOOK_URL
  if (fromEnv && fromEnv.startsWith('https://')) {
    return fromEnv
  }
  return undefined
}

function buildSlackMessage(ctx: IToolContext): string {
  const p = ctx.event.payload as Record<string, unknown>
  const { message } = ctx.params as { message?: string }
  const lines: string[] = []

  const repo = (p.repository as string) ?? ''
  const branch = (p.branch as string) ?? (p.headBranch as string) ?? ''
  const repoUrl = p.repositoryUrl as string | undefined

  if (repo || branch) {
    lines.push(`*${repo}${repo && branch ? ' · ' : ''}${branch}*`)
  }

  const headCommit = p.headCommit as Record<string, unknown> | undefined
  const commits = p.commits as Array<Record<string, unknown>> | undefined
  const commitMsg = headCommit?.message ?? commits?.[0]?.message
  if (commitMsg) {
    lines.push('')
    lines.push(String(commitMsg).split('\n')[0])
  }

  const selections = ctx.selections ?? []
  if (selections.length > 0) {
    const toolNames = selections.map((s) => s.tool).join(', ')
    lines.push('')
    lines.push(`Aksiyonlar: ${toolNames}`)
  }

  if (message && typeof message === 'string') {
    lines.push('')
    lines.push(message)
  }

  const after = (p.after as string) ?? headCommit?.id
  const commitUrl = repoUrl && after
    ? `${String(repoUrl).replace(/\/$/, '')}/commit/${after}`
    : p.url ?? headCommit?.url
  if (commitUrl) {
    lines.push('')
    lines.push(String(commitUrl))
  }

  return lines.join('\n').trim() || 'Flowless bildirimi'
}

export class NotifyTeamTool implements ITool {
  name = 'notify_team'
  description =
    "Ekibe Slack ile bildirim gönder. params: channel (opsiyonel), message (AI özeti). Gerçek Slack için flowless.config.yaml'da slack_webhook_url veya SLACK_WEBHOOK_URL env kullan."

  async execute(ctx: IToolContext): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const { channel } = ctx.params as { channel?: string }
    const webhookUrl = getWebhookUrl(ctx)

    const text = buildSlackMessage(ctx)

    if (!webhookUrl) {
      console.log(`[NotifyTeamTool] Mock: bildirim gönderilir`, { channel, preview: text.slice(0, 80) })
      return {
        success: true,
        data: { channel, mocked: true },
      }
    }

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Slack HTTP ${res.status}: ${errText}`)
      }

      console.log(`[NotifyTeamTool] Slack'e gönderildi`)
      return {
        success: true,
        data: { channel, sent: true },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[NotifyTeamTool] Slack hatası:', msg)
      return {
        success: false,
        error: msg,
      }
    }
  }
}
