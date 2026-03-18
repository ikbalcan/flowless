/**
 * flowless.config.yaml loader
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface FlowlessConfig {
  project: {
    name: string
  }
  tools: {
    active: string[]
  }
  branchRules?: Record<string, string[]>
  default?: string[]
}

const DEFAULT_CONFIG: FlowlessConfig = {
  project: { name: 'flowless' },
  tools: {
    active: ['log_event', 'update_ticket', 'create_comment', 'generate_doc', 'notify_team'],
  },
  branchRules: {
    main: ['generate_doc', 'notify_team'],
    develop: ['log_event', 'create_comment'],
  },
  default: ['log_event'],
}

function findConfigDir(): string {
  const searchDirs = [
    join(__dirname, '..'),
    process.cwd(),
  ]
  for (const dir of searchDirs) {
    let current = dir
    for (let i = 0; i < 5; i++) {
      if (existsSync(join(current, 'flowless.config.yaml'))) return current
      current = join(current, '..')
    }
  }
  return join(__dirname, '..')
}

export function loadConfig(): FlowlessConfig {
  const configDir = findConfigDir()
  const configPath = join(configDir, 'flowless.config.yaml')

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG
  }

  try {
    const content = readFileSync(configPath, 'utf-8')
    const parsed = parseYaml(content) as Partial<FlowlessConfig>
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      project: { ...DEFAULT_CONFIG.project, ...parsed.project },
      tools: {
        ...DEFAULT_CONFIG.tools,
        ...parsed.tools,
      },
    }
  } catch (err) {
    console.warn('[Flowless] Config parse hatası:', err)
    return DEFAULT_CONFIG
  }
}

/**
 * Branch'a göre aktif tool listesi döner
 */
export function getToolsForBranch(
  config: FlowlessConfig,
  branch?: string
): string[] {
  if (branch && config.branchRules?.[branch]) {
    return config.branchRules[branch]
  }
  return config.default ?? config.tools.active
}
