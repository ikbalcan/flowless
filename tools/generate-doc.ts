/**
 * generate_doc — Commit'ten dokümantasyon üret
 * OpenAI ile commit mesajı, değişen dosyalar ve branch bilgisinden .md üretir.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ITool, IToolContext } from '../core/tools/types.js'
import { getProjectRoot } from '../config/loader.js'

function shortHash(id: string | undefined): string {
  if (!id || typeof id !== 'string') return 'unknown'
  return id.slice(0, 7)
}

export class GenerateDocTool implements ITool {
  name = 'generate_doc'
  description =
    "Commit mesajı, değiştirilen dosyalar ve branch bilgisinden dokümantasyon üret. Başlıklar: özet, değişiklikler, etkilenen alanlar, önerilen sonraki adımlar."

  async execute(ctx: IToolContext): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const payload = ctx.event.payload as Record<string, unknown>
    const branch = (payload.branch as string) ?? 'unknown'
    const commits = (payload.commits as Array<Record<string, unknown>>) ?? []
    const headCommit = payload.headCommit as Record<string, unknown> | undefined

    const llm = ctx.llm
    const projectRoot = ctx.projectRoot ?? getProjectRoot()

    if (!llm) {
      return {
        success: false,
        error: 'generate_doc: LLM provider gereklidir',
      }
    }

    const commitMessages = commits.map((c) => c.message as string).filter(Boolean)
    const allAdded = commits.flatMap((c) => ((c.added as string[]) ?? []))
    const allRemoved = commits.flatMap((c) => ((c.removed as string[]) ?? []))
    const allModified = commits.flatMap((c) => ((c.modified as string[]) ?? []))
    const changedFiles = {
      added: [...new Set(allAdded)],
      removed: [...new Set(allRemoved)],
      modified: [...new Set(allModified)],
    }

    const inputForLLM = {
      branch,
      commitMessages,
      changedFiles,
      headCommitId: headCommit?.id,
      repository: payload.repository,
    }

    const systemPrompt = `Sen bir dokümantasyon uzmanısın. Commit bilgilerinden Markdown formatında dokümantasyon üretiyorsun.

Üreteceğin dokümantasyonda MUTLAKA şu başlıklar olmalı (Türkçe):
1. ## Özet — Kısa bir paragrafta ne yapıldığını özetle
2. ## Değişiklikler — Yapılan değişikliklerin listesi
3. ## Etkilenen Alanlar — Hangi modüller/dosyalar etkilendi
4. ## Önerilen Sonraki Adımlar — Takımın yapması gerekenler

Başka metin ekleme. Sadece Markdown döndür.`

    const userContent = `Aşağıdaki commit bilgilerinden dokümantasyon üret:\n\n${JSON.stringify(
      inputForLLM,
      null,
      2
    )}`

    try {
      const mdContent = await llm.complete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        { maxTokens: 2048, temperature: 0.3 }
      )

      const headId = (headCommit?.id ?? commits[commits.length - 1]?.id) as string | undefined
      const hash = shortHash(headId)
      const dateStr = new Date().toISOString().slice(0, 10)
      const filename = `${dateStr}-${hash}.md`
      const outDir = join(projectRoot, 'docs', 'generated')
      const outPath = join(outDir, filename)

      mkdirSync(outDir, { recursive: true })
      writeFileSync(outPath, mdContent.trim(), 'utf-8')

      console.log(`[GenerateDocTool] Dokümantasyon kaydedildi: ${outPath}`)

      return {
        success: true,
        data: {
          path: outPath,
          filename,
          content: mdContent.trim(),
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[GenerateDocTool] Hata:', msg)
      return {
        success: false,
        error: msg,
      }
    }
  }
}
