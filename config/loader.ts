/**
 * flowless.config.yaml loader
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface GitHubProjectsConfig {
  token?: string
  project_number: number
  /** Proje sahibi (org veya user) — verilmezse event'teki repo owner kullanılır */
  owner?: string
  transitions?: Record<string, string>
}

export interface FlowlessConfig {
  project: {
    name: string
  }
  tools: {
    active: string[]
  }
  branchRules?: Record<string, string[]>
  default?: string[]
  /** Slack Incoming Webhook URL — config öncelikli, yoksa SLACK_WEBHOOK_URL env */
  slack_webhook_url?: string
  /** GitHub Projects — #123 ile issue statüsü güncelleme */
  github_projects?: GitHubProjectsConfig
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
  return process.cwd()
}

/** ${VAR} formatında env değişkenlerini genişletir */
function expandEnv(val: string): string {
  return val.replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] ?? '')
}

/** Config içindeki string değerlerde ${VAR} genişletir */
function expandEnvInConfig(obj: unknown): unknown {
  if (typeof obj === 'string') return expandEnv(obj)
  if (Array.isArray(obj)) return obj.map(expandEnvInConfig)
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      out[k] = expandEnvInConfig(v)
    }
    return out
  }
  return obj
}

/** Proje kök dizini (flowless.config.yaml'ın bulunduğu yer) */
export function getProjectRoot(): string {
  return findConfigDir()
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
    const expanded = expandEnvInConfig(parsed) as Partial<FlowlessConfig>
    return {
      ...DEFAULT_CONFIG,
      ...expanded,
      project: { ...DEFAULT_CONFIG.project, ...expanded.project },
      tools: {
        ...DEFAULT_CONFIG.tools,
        ...expanded.tools,
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
