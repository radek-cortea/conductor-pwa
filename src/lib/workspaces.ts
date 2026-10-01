export type ActivityWorkspace = {
  lastActivityAt?: string;
};

export function activityTime(iso: string | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function sortWorkspacesByActivity<T extends ActivityWorkspace>(
  workspaces: readonly T[],
): T[] {
  return [...workspaces].sort(
    (left, right) => activityTime(right.lastActivityAt) - activityTime(left.lastActivityAt),
  );
}

export type RepositoryProject = {
  id: string;
  name: string;
  gitRemote: string;
};

export type GroupableWorkspace = ActivityWorkspace & {
  projectId?: string;
  repoUrl: string;
};

export type RepositoryGroup<T> = {
  key: string;
  label: string;
  workspaces: T[];
};

export function repositoryLabel(
  workspace: GroupableWorkspace,
  projects: readonly RepositoryProject[],
): string {
  const byId = workspace.projectId
    ? projects.find((project) => project.id === workspace.projectId)
    : undefined;
  const byRemote = projects.find((project) => project.gitRemote === workspace.repoUrl);
  return (byId ?? byRemote)?.name ?? workspace.repoUrl;
}

export function groupWorkspacesByRepository<T extends GroupableWorkspace>(
  workspaces: readonly T[],
  projects: readonly RepositoryProject[],
): RepositoryGroup<T>[] {
  const groups = new Map<string, RepositoryGroup<T>>();
  for (const workspace of sortWorkspacesByActivity(workspaces)) {
    const project =
      (workspace.projectId
        ? projects.find((item) => item.id === workspace.projectId)
        : undefined) ?? projects.find((item) => item.gitRemote === workspace.repoUrl);
    const key = project?.id ?? workspace.repoUrl;
    const label = project?.name ?? workspace.repoUrl;
    const existing = groups.get(key);
    if (existing) {
      existing.workspaces.push(workspace);
    } else {
      groups.set(key, { key, label, workspaces: [workspace] });
    }
  }
  return [...groups.values()];
}

export function filterWorkspaces<T extends { name: string; state?: string }>(
  workspaces: readonly T[],
  options: { archived: boolean; query: string; labelFor: (workspace: T) => string },
): T[] {
  const needle = options.query.trim().toLowerCase();
  return workspaces.filter((workspace) => {
    if (!options.archived && workspace.state === "archived") return false;
    if (!needle) return true;
    return (
      workspace.name.toLowerCase().includes(needle) ||
      options.labelFor(workspace).toLowerCase().includes(needle)
    );
  });
}
