/**
 * Normalizer — Ham payload → FlowlessEvent dönüşümü
 * Kaynak tipini tespit eder, event tipini belirler, payload'ı standart forma sokar.
 */

import type { FlowlessEvent } from './interfaces.js'

export interface RawEvent {
  source?: string
  type?: string
  payload?: unknown
  timestamp?: string | Date
  metadata?: Record<string, unknown>
}

/**
 * Ham event'i FlowlessEvent'e dönüştürür.
 */
export function normalize(raw: RawEvent): FlowlessEvent {
  const id = generateId()
  const timestamp = parseTimestamp(raw.timestamp)
  const source = raw.source ?? 'unknown'
  const type = raw.type ?? 'unknown'
  const payload = raw.payload ?? raw
  const metadata = raw.metadata

  return {
    id,
    source,
    type,
    payload,
    timestamp,
    metadata,
  }
}

/**
 * Mock ve test için kullanılabilecek varsayılan event üretir.
 */
export function createMockEvent(overrides: Partial<FlowlessEvent> = {}): FlowlessEvent {
  return normalize({
    source: 'mock',
    type: 'test_event',
    payload: { message: 'Test event payload' },
    metadata: overrides.metadata,
    ...overrides,
  })
}

/**
 * GitHub push webhook payload'ını FlowlessEvent'e dönüştürür.
 */
export interface GitHubPushPayload {
  ref?: string
  before?: string
  after?: string
  repository?: {
    id?: number
    name?: string
    full_name?: string
    html_url?: string
    owner?: { login?: string }
  }
  pusher?: { name?: string; email?: string }
  sender?: { login?: string }
  created?: boolean
  deleted?: boolean
  forced?: boolean
  commits?: Array<{
    id?: string
    message?: string
    timestamp?: string
    author?: { name?: string; email?: string }
    url?: string
    added?: string[]
    removed?: string[]
    modified?: string[]
  }>
  head_commit?: {
    id?: string
    message?: string
    timestamp?: string
    author?: { name?: string; email?: string }
    url?: string
    added?: string[]
    removed?: string[]
    modified?: string[]
  }
}

export function normalizeGitHubPush(
  payload: GitHubPushPayload,
  deliveryId: string
): FlowlessEvent {
  const id = `evt_gh_${deliveryId}`
  const headCommit = payload.head_commit ?? payload.commits?.[payload.commits.length - 1]
  const timestamp = headCommit?.timestamp
    ? new Date(headCommit.timestamp)
    : new Date()

  const branch = payload.ref?.replace(/^refs\/heads\//, '') ?? 'unknown'

  return {
    id,
    source: 'github',
    type: 'commit_pushed',
    payload: {
      branch,
      before: payload.before,
      after: payload.after,
      repository: payload.repository?.full_name ?? payload.repository?.name,
      repositoryUrl: payload.repository?.html_url,
      pusher: payload.pusher?.name ?? payload.sender?.login,
      commitCount: payload.commits?.length ?? 0,
      commits: payload.commits?.map((c) => ({
        id: c.id,
        message: c.message,
        author: c.author?.name,
        timestamp: c.timestamp,
        added: c.added ?? [],
        removed: c.removed ?? [],
        modified: c.modified ?? [],
      })),
      headCommit: headCommit
        ? {
            id: headCommit.id,
            message: headCommit.message,
            author: headCommit.author?.name,
            timestamp: headCommit.timestamp,
            added: headCommit.added ?? [],
            removed: headCommit.removed ?? [],
            modified: headCommit.modified ?? [],
          }
        : undefined,
      created: payload.created,
      deleted: payload.deleted,
      forced: payload.forced,
    },
    timestamp,
    metadata: {
      deliveryId,
      repository: payload.repository?.full_name,
      branch,
    },
  }
}

/**
 * GitHub create webhook payload'ını FlowlessEvent'e dönüştürür.
 * Branch veya tag oluşturulduğunda tetiklenir.
 */
export interface GitHubCreatePayload {
  ref?: string
  ref_type?: 'branch' | 'tag'
  master_branch?: string
  repository?: {
    id?: number
    name?: string
    full_name?: string
    html_url?: string
  }
  sender?: { login?: string }
}

export function normalizeGitHubCreate(
  payload: GitHubCreatePayload,
  deliveryId: string
): FlowlessEvent {
  const refType = payload.ref_type ?? 'branch'
  const ref = payload.ref ?? 'unknown'
  return {
    id: `evt_gh_${deliveryId}`,
    source: 'github',
    type: refType === 'tag' ? 'tag_created' : 'branch_created',
    payload: {
      ref,
      refType,
      repository: payload.repository?.full_name ?? payload.repository?.name,
      repositoryUrl: payload.repository?.html_url,
      creator: payload.sender?.login,
      masterBranch: payload.master_branch,
    },
    timestamp: new Date(),
    metadata: {
      deliveryId,
      repository: payload.repository?.full_name,
      branch: refType === 'branch' ? ref : undefined,
    },
  }
}

/**
 * GitHub pull_request webhook payload'ını FlowlessEvent'e dönüştürür.
 */
export interface GitHubPullRequestPayload {
  action?: string
  pull_request?: {
    number?: number
    title?: string
    body?: string
    state?: string
    html_url?: string
    head?: { ref?: string; sha?: string }
    base?: { ref?: string; sha?: string }
    user?: { login?: string }
  }
  repository?: {
    full_name?: string
    name?: string
    html_url?: string
  }
  sender?: { login?: string }
}

export function normalizeGitHubPullRequest(
  payload: GitHubPullRequestPayload,
  deliveryId: string
): FlowlessEvent {
  const pr = payload.pull_request
  const action = payload.action ?? 'unknown'
  const typeMap: Record<string, string> = {
    opened: 'pr_opened',
    closed: 'pr_closed',
    reopened: 'pr_reopened',
    synchronize: 'pr_updated',
  }
  const flowlessType = typeMap[action] ?? `pr_${action}`

  return {
    id: `evt_gh_${deliveryId}`,
    source: 'github',
    type: flowlessType,
    payload: {
      action,
      number: pr?.number,
      title: pr?.title,
      body: pr?.body,
      state: pr?.state,
      url: pr?.html_url,
      headBranch: pr?.head?.ref,
      baseBranch: pr?.base?.ref,
      author: pr?.user?.login ?? payload.sender?.login,
      repository: payload.repository?.full_name ?? payload.repository?.name,
      repositoryUrl: payload.repository?.html_url,
    },
    timestamp: new Date(),
    metadata: {
      deliveryId,
      repository: payload.repository?.full_name,
      branch: pr?.head?.ref,
    },
  }
}

/**
 * Diğer tüm GitHub event'leri için generic normalizer.
 * payload'ı olduğu gibi taşır, type: github_{eventType} olur.
 */
export function normalizeGitHubGeneric(
  payload: Record<string, unknown>,
  deliveryId: string,
  eventType: string
): FlowlessEvent {
  const repo = payload.repository as Record<string, unknown> | undefined
  const sender = payload.sender as Record<string, unknown> | undefined
  return {
    id: `evt_gh_${deliveryId}`,
    source: 'github',
    type: `github_${eventType}`,
    payload,
    timestamp: new Date(),
    metadata: {
      deliveryId,
      repository: repo?.full_name ?? repo?.name,
    },
  }
}

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function parseTimestamp(value: string | Date | undefined): Date {
  if (value instanceof Date) return value
  if (typeof value === 'string') return new Date(value)
  return new Date()
}
