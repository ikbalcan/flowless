/**
 * update_github_project — Commit/PR mesajından #123 çıkar, GitHub Projects'te ilgili issue'nun statüsünü güncelle
 * Config: github_projects.token, project_number, transitions
 * Mesajda #123 yoksa no-op (başarılı dön).
 */

import type { ITool, IToolContext } from '../core/tools/types.js'

export interface GitHubProjectsConfig {
  token?: string
  project_number: number
  /** Repo sahibi (org veya user). Yoksa event'ten alınır. */
  owner?: string
  transitions: Record<string, string>
}

function getToken(config?: { github_projects?: GitHubProjectsConfig }): string | undefined {
  const token =
    config?.github_projects?.token ??
    process.env.GITHUB_TOKEN
  return typeof token === 'string' && token.length > 0 ? token : undefined
}

function getConfig(ctx: IToolContext): GitHubProjectsConfig | undefined {
  const raw = (ctx.config as Record<string, unknown>)?.github_projects
  if (!raw || typeof raw !== 'object') return undefined
  const project_number = (raw as Record<string, unknown>).project_number as number | undefined
  const transitions = (raw as Record<string, unknown>).transitions as Record<string, string> | undefined
  if (!project_number || !transitions || typeof transitions !== 'object') return undefined
  return {
    token: (raw as Record<string, unknown>).token as string | undefined,
    project_number,
    owner: (raw as Record<string, unknown>).owner as string | undefined,
    transitions,
  }
}

/** Commit veya PR mesajından #123 formatında issue numaralarını çıkar. İlk eşleşmeyi döner. */
export function extractIssueRefs(text: string): number[] {
  const re = /#(\d+)/g
  const nums: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    nums.push(parseInt(m[1], 10))
  }
  return [...new Set(nums)]
}

/**
 * Commit mesajı işin bittiğini ima ediyor mu? (Todo → Done gibi geçişler için)
 * - GitHub: closes/fixes/resolves #N
 * - TR: tamamlandı, geliştirme tamamlandı, vb.
 * - EN: completed, done, finished (kelime sınırlarıyla)
 */
export function looksLikeCommitCompletion(text: string): boolean {
  if (!text.trim()) return false
  const t = text.trim()
  // GitHub issue kapatma anahtar kelimeleri (satır başı veya gövde)
  if (/\b(closes|closed|fix(?:es|ed)?|resolve[sd]?)\s+#?\d+/i.test(t)) return true
  // Türkçe
  if (/tamamland[ıi]|geliştirme\s+tamamland[ıi]|iş\s+tamam|bitti|geliştirme\s+bitti/im.test(t)) {
    return true
  }
  // İngilizce (incomplete vb. yanlış pozitiften kaçın)
  if (/\b(completed|finished)\b/i.test(t)) return true
  if (/\bdone\b/i.test(t) && !/\b(not\s+done|isn't\s+done|incomplete)\b/i.test(t)) return true
  if (/\bcomplete\b/i.test(t) && !/\bincomplete\b/i.test(t)) return true
  return false
}

async function ghGraphql<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub GraphQL ${res.status}: ${text}`)
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }
  return json.data as T
}

interface ProjectInfo {
  projectId: string
  statusFieldId: string
  statusOptions: Map<string, string>
}

type ProjectScanPage = {
  node?: {
    items?: {
      pageInfo: { hasNextPage: boolean; endCursor?: string }
      nodes: Array<{
        id: string
        content?: { number?: number; repository?: { nameWithOwner?: string } }
      }>
    }
  }
}

async function getProjectInfo(
  token: string,
  owner: string,
  projectNumber: number,
  isOrg: boolean
): Promise<ProjectInfo | null> {
  const query = isOrg
    ? `
      query($owner: String!, $num: Int!) {
        organization(login: $owner) {
          projectV2(number: $num) {
            id
            fields(first: 20) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options { id name }
                }
              }
            }
          }
        }
      }
    `
    : `
      query($owner: String!, $num: Int!) {
        user(login: $owner) {
          projectV2(number: $num) {
            id
            fields(first: 20) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options { id name }
                }
              }
            }
          }
        }
      }
    `
  const root = isOrg ? 'organization' : 'user'
  const data = await ghGraphql<Record<string, { projectV2?: { id: string; fields: { nodes: Array<{ id: string; name: string; options?: Array<{ id: string; name: string }> }> } } }>>(
    token,
    query,
    { owner, num: projectNumber }
  )
  const project = data?.[root]?.projectV2
  if (!project?.id) return null

  let statusFieldId = ''
  const statusOptions = new Map<string, string>()
  for (const node of project.fields?.nodes ?? []) {
    if (node.name === 'Status' && node.options) {
      statusFieldId = node.id
      for (const opt of node.options) {
        statusOptions.set(opt.name, opt.id)
      }
      break
    }
  }
  if (!statusFieldId) {
    throw new Error('Projede "Status" alanı bulunamadı')
  }
  return { projectId: project.id, statusFieldId, statusOptions }
}

async function findProjectItemByIssue(
  token: string,
  projectId: string,
  repoOwner: string,
  repoName: string,
  issueNumber: number
): Promise<string | null> {
  const query = `
    query($owner: String!, $repo: String!, $num: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $num) {
          id
          projectItems(first: 50) {
            nodes {
              id
              project {
                ... on ProjectV2 {
                  id
                }
              }
            }
          }
        }
      }
    }
  `
  const data = await ghGraphql<{
    repository?: {
      issue?: {
        id: string
        projectItems: { nodes: Array<{ id: string; project: { id: string } }> }
      }
    }
  }>(token, query, { owner: repoOwner, repo: repoName, num: issueNumber })

  const issue = data?.repository?.issue
  if (!issue) return null

  const item = issue.projectItems?.nodes?.find((n) => n.project?.id === projectId)
  if (item?.id) return item.id

  return findProjectItemByScanningProject(
    token,
    projectId,
    repoOwner,
    repoName,
    issueNumber
  )
}

/** Issue.projectItems boş veya eşleşmezse projede issue kartını tarar */
async function findProjectItemByScanningProject(
  token: string,
  projectId: string,
  repoOwner: string,
  repoName: string,
  issueNumber: number
): Promise<string | null> {
  const fullName = `${repoOwner}/${repoName}`
  let cursor: string | null = null
  for (let page = 0; page < 10; page++) {
    const query = `
      query($projectId: ID!, $after: String) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100, after: $after) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                content {
                  ... on Issue {
                    number
                    repository {
                      nameWithOwner
                    }
                  }
                }
              }
            }
          }
        }
      }
    `
    const pageData: ProjectScanPage = await ghGraphql<ProjectScanPage>(token, query, {
      projectId,
      after: cursor,
    })

    const pageItems = pageData.node?.items
    if (!pageItems?.nodes?.length) return null

    for (const n of pageItems.nodes) {
      const c = n.content
      if (c?.number === issueNumber && c.repository?.nameWithOwner === fullName) {
        return n.id
      }
    }

    if (!pageItems.pageInfo.hasNextPage || !pageItems.pageInfo.endCursor) break
    cursor = pageItems.pageInfo.endCursor
  }
  return null
}

async function updateItemStatus(
  token: string,
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string
): Promise<void> {
  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }
      ) {
        projectV2Item { id }
      }
    }
  `
  await ghGraphql(token, mutation, {
    projectId,
    itemId,
    fieldId,
    optionId,
  })
}

export class UpdateGitHubProjectTool implements ITool {
  name = 'update_github_project'
  description =
    "Commit veya PR mesajından #123 formatında issue ref'ini çıkar, GitHub Projects'te Status güncelle. Push'ta config'te commit_pushed_completed varsa ve mesaj tamamlanmayı gösteriyorsa (closes/fixes #N, tamamlandı, done) Done'a al; aksi halde commit_pushed statüsü. Mesajda #N yoksa no-op."

  async execute(
    ctx: IToolContext
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const cfg = getConfig(ctx)
    const token = getToken(ctx.config as Record<string, unknown>)

    if (!token) {
      console.log('[UpdateGitHubProjectTool] GITHUB_TOKEN veya github_projects.token yok, atlanıyor')
      return { success: true, data: { skipped: 'no_token' } }
    }
    if (!cfg) {
      console.log('[UpdateGitHubProjectTool] github_projects config yok, atlanıyor')
      return { success: true, data: { skipped: 'no_config' } }
    }

    const eventType = ctx.event.type

    const p = ctx.event.payload as Record<string, unknown>
    const repoFull = (p.repository as string) ?? (ctx.event.metadata?.repository as string) ?? ''
    const [repoOwner, repoName] = repoFull.split('/')
    if (!repoOwner || !repoName) {
      return { success: true, data: { skipped: 'no_repo' } }
    }
    const owner = cfg.owner ?? repoOwner

    let text = ''
    if (eventType === 'commit_pushed') {
      const headCommit = p.headCommit as Record<string, unknown> | undefined
      const commits = p.commits as Array<Record<string, unknown>> | undefined
      text = (headCommit?.message as string) ?? commits?.[0]?.message as string ?? ''
    } else if (eventType === 'pr_opened' || eventType === 'pr_merged' || eventType.startsWith('pr_')) {
      text = ((p.title as string) ?? '') + '\n' + ((p.body as string) ?? '')
    }

    /** Push'ta mesaj tamamlanmayı gösteriyorsa ve config'te varsa Done (veya başka) statü */
    let targetStatus: string | undefined
    if (eventType === 'commit_pushed') {
      const doneTransition = cfg.transitions.commit_pushed_completed
      if (doneTransition && looksLikeCommitCompletion(text)) {
        targetStatus = doneTransition
      } else {
        targetStatus = cfg.transitions.commit_pushed
      }
    } else {
      targetStatus = cfg.transitions[eventType]
    }

    if (!targetStatus) {
      return { success: true, data: { skipped: 'no_transition', eventType } }
    }

    const issueNumbers = extractIssueRefs(text)
    if (issueNumbers.length === 0) {
      return { success: true, data: { skipped: 'no_issue_ref' } }
    }

    let projectInfo = await getProjectInfo(token, owner, cfg.project_number, true)
    if (!projectInfo) {
      projectInfo = await getProjectInfo(token, owner, cfg.project_number, false)
    }
    if (!projectInfo) {
      return {
        success: false,
        error: `Proje bulunamadı: ${owner}/projects/${cfg.project_number}`,
      }
    }

    const optionId = projectInfo.statusOptions.get(targetStatus)
    if (!optionId) {
      return {
        success: false,
        error: `Status seçeneği "${targetStatus}" bulunamadı. Mevcut: ${[...projectInfo.statusOptions.keys()].join(', ')}`,
      }
    }

    const updated: number[] = []
    const notFound: number[] = []

    for (const issueNum of issueNumbers) {
      const itemId = await findProjectItemByIssue(
        token,
        projectInfo.projectId,
        repoOwner,
        repoName,
        issueNum
      )
      if (!itemId) {
        notFound.push(issueNum)
        continue
      }
      await updateItemStatus(
        token,
        projectInfo.projectId,
        itemId,
        projectInfo.statusFieldId,
        optionId
      )
      updated.push(issueNum)
    }

    if (updated.length > 0) {
      console.log(`[UpdateGitHubProjectTool] Güncellendi: #${updated.join(', #')} → ${targetStatus}`)
    }
    if (notFound.length > 0) {
      console.log(`[UpdateGitHubProjectTool] Projede bulunamadı: #${notFound.join(', #')}`)
    }

    return {
      success: true,
      data: {
        updated,
        notFound,
        status: targetStatus,
      },
    }
  }
}
