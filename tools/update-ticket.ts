/**
 * update_ticket — Ticket statüsü güncelle (şimdilik mock)
 */

import type { ITool, IToolContext } from '../core/tools/types.js'

export class UpdateTicketTool implements ITool {
  name = 'update_ticket'
  description = "Jira/Linear ticket statüsünü güncelle. params: ticketId, status"

  async execute(ctx: IToolContext): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const { ticketId, status } = ctx.params as { ticketId?: string; status?: string }
    console.log(`[UpdateTicketTool] Mock: ticket güncellenir`, { ticketId, status })
    return {
      success: true,
      data: { ticketId, status, mocked: true },
    }
  }
}
