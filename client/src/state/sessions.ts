import type {
  ProjectTree,
  SessionProjectGroup,
  SessionSummary,
} from '../protocol/types'

export interface ProjectSessionRow {
  projectId: string
  projectLabel: string
  repoLabel: string
  groupLabel: string
  groupPath: string
  session: SessionSummary
}

export function projectSessionRows(
  project: ProjectTree | null,
): ProjectSessionRow[] {
  if (!project) return []
  const rows: ProjectSessionRow[] = []
  for (const repo of project.repos ?? []) {
    for (const group of repo.groups ?? []) {
      for (const session of group.sessions ?? []) {
        rows.push({
          projectId: project.id,
          projectLabel: project.label,
          repoLabel: repo.label,
          groupLabel: group.label,
          groupPath: group.path || session.cwd || '',
          session,
        })
      }
    }
  }
  return rows
}

export function groupProjectRowsByFolder(
  rows: ProjectSessionRow[],
): Array<{ key: string; label: string; path: string; rows: ProjectSessionRow[] }> {
  const grouped = new Map<string, ProjectSessionRow[]>()
  for (const row of rows) {
    const key = row.groupPath || row.groupLabel || 'No working directory'
    grouped.set(key, [...(grouped.get(key) ?? []), row])
  }
  return [...grouped.entries()].map(([key, groupedRows]) => ({
    key,
    label: groupedRows[0]?.groupLabel || 'Working directory',
    path: groupedRows[0]?.groupPath || '',
    rows: groupedRows,
  }))
}

export function sessionMatches(
  row: SessionSummary,
  query: string,
  context: Partial<ProjectSessionRow> = {},
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [
    row.title,
    row.preview,
    row.source,
    row.cwd,
    row.git_branch,
    row.git_repo_root,
    row.model,
    context.projectLabel,
    context.repoLabel,
    context.groupLabel,
    context.groupPath,
  ].some(value => String(value ?? '').toLowerCase().includes(needle))
}

export function projectGroups(project: ProjectTree | null): SessionProjectGroup[] {
  return project?.repos.flatMap(repo => repo.groups ?? []) ?? []
}
