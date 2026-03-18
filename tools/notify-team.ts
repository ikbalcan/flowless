/**
 * notify_team — Ekibe bildirim gönder (şimdilik mock)
 */

import type { ITool, IToolContext } from '../core/tools/types.js'

export class NotifyTeamTool implements ITool {
  name = 'notify_team'
  description = "Ekibe Slack/email ile bildirim gönder. params: channel, message"

  async execute(ctx: IToolContext): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const { channel, message } = ctx.params as { channel?: string; message?: string }
    console.log(`[NotifyTeamTool] Mock: bildirim gönderilir`, { channel })
    return {
      success: true,
      data: { channel, mocked: true },
    }
  }
}
