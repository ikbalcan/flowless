/**
 * log_event — Event'i logla
 */

import type { ITool, IToolContext } from '../core/tools/types.js'

export class LogEventTool implements ITool {
  name = 'log_event'
  description = "Event'i logla, kayıt altına al"

  async execute(ctx: IToolContext): Promise<{ success: boolean; data?: unknown; error?: string }> {
    console.log(`[LogEventTool] Event loglandı:`, {
      eventId: ctx.event.id,
      source: ctx.event.source,
      type: ctx.event.type,
      params: ctx.params,
    })
    return {
      success: true,
      data: { eventId: ctx.event.id, loggedAt: new Date().toISOString() },
    }
  }
}
