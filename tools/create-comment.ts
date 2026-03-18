/**
 * create_comment — PR veya ticket'a yorum ekle (şimdilik mock)
 */

import type { ITool, IToolContext } from '../core/tools/types.js'

export class CreateCommentTool implements ITool {
  name = 'create_comment'
  description = "PR veya ticket'a yorum ekle. params: targetUrl veya targetId, body"

  async execute(ctx: IToolContext): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const { targetUrl, targetId, body } = ctx.params as {
      targetUrl?: string
      targetId?: string
      body?: string
    }
    console.log(`[CreateCommentTool] Mock: yorum eklenir`, { targetUrl, targetId })
    return {
      success: true,
      data: { target: targetUrl ?? targetId, mocked: true },
    }
  }
}
