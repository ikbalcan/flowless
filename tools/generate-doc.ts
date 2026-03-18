/**
 * generate_doc — Commit'ten dokümantasyon üret
 */

import type { ITool, IToolContext } from '../core/tools/types.js'

export class GenerateDocTool implements ITool {
  name = 'generate_doc'
  description = "Commit mesajı ve değişikliklerden dokümantasyon üret. params: format (md, html)"

  async execute(ctx: IToolContext): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const payload = ctx.event.payload as Record<string, unknown>
    const commits = (payload.commits as unknown[]) ?? []
    const headCommit = payload.headCommit as Record<string, unknown> | undefined
    console.log(`[GenerateDocTool] Dokümantasyon üretilecek:`, {
      commitCount: commits.length,
      headMessage: headCommit?.message,
    })
    return {
      success: true,
      data: {
        generated: true,
        commitCount: commits.length,
        mocked: true,
      },
    }
  }
}
