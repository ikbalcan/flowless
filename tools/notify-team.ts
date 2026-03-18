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
  const pusher = p.pusher as string | undefined
  const commitCount = (p.commitCount as number) ?? 0
  const headCommit = p.headCommit as Record<string, unknown> | undefined
  const commits = p.commits as Array<Record<string, unknown>> | undefined

  // Başlık: Net, insan odaklı
  const branchLabel = branch === 'main' ? 'main' : branch
  lines.push(`🚀 *${repo}* · \`${branchLabel}\` güncellendi`)
  lines.push('')

  // Kim ne yaptı + dosya istatistikleri
  const who = pusher ? `*${pusher}* tarafından ` : ''
  const count = commitCount > 0 ? commitCount : (commits?.length ?? 1)
  const countText = count === 1 ? '1 commit' : `${count} commit`
  lines.push(`${who}${countText} push edildi.`)

  // Etkilenen dosya sayısı (headCommit'ten)
  const added = (headCommit?.added as string[]) ?? []
  const removed = (headCommit?.removed as string[]) ?? []
  const modified = (headCommit?.modified as string[]) ?? []
  const uniqueFiles = new Set([...added, ...removed, ...modified]).size
  if (uniqueFiles > 0) {
    lines.push(`${uniqueFiles} dosya etkilendi.`)
  }
  lines.push('')

  // AI özet — en değerli bilgi, öne çıkar
  if (message && typeof message === 'string' && message.trim()) {
    lines.push(message.trim())
    lines.push('')
  }

  // Son commit kısa özet (tek satır, max ~90 karakter)
  const rawCommitMsg = headCommit?.message ?? commits?.[0]?.message
  if (rawCommitMsg) {
    const firstLine = String(rawCommitMsg).split('\n')[0].trim()
    const short = firstLine.length > 90 ? firstLine.slice(0, 87) + '...' : firstLine
    lines.push(`_${short}_`)
    lines.push('')
  }

  // Link
  const after = (p.after as string) ?? headCommit?.id
  const commitUrl = repoUrl && after
    ? `${String(repoUrl).replace(/\/$/, '')}/commit/${after}`
    : (p.url as string) ?? (headCommit?.url as string)
  if (commitUrl) {
    lines.push(`<${commitUrl}|Detaylar için tıkla →>`)
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
