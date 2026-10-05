import type { QueryClient } from "@tanstack/react-query";
import type { Workspace } from "@/api/types";

// Carry already-fetched list data through the router context, not URLs/storage.
// Do not seed it as fresh detail-query data: the real workspace loader still runs.
export function knownWorkspace(client: QueryClient, workspaceId: string): Workspace | undefined {
  const detail = client.getQueryData<Workspace>(["workspaces", workspaceId]);
  if (detail) return detail;
  const lists = client
    .getQueryCache()
    .findAll({ queryKey: ["workspaces"] })
    .filter((query) => query.queryKey.length === 2 && Array.isArray(query.state.data))
    .sort((left, right) => right.state.dataUpdatedAt - left.state.dataUpdatedAt);
  for (const query of lists) {
    const workspace = (query.state.data as Workspace[]).find((item) => item.id === workspaceId);
    if (workspace) return workspace;
  }
  return undefined;
}
