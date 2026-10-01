import { createFileRoute } from "@tanstack/react-router";
import { loadWorkspace, loadWorkspaceSessions } from "@/pages/loaders";
import { workspaceSearchSchema } from "@/pages/search";
import { RouteError } from "@/pages/route-error";
import { ListSkeleton } from "@/pages/skeletons";
import { WorkspaceLayout } from "@/pages/workspace-layout";

export const Route = createFileRoute("/_authenticated/workspaces/$workspaceId")({
  validateSearch: (search) => workspaceSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ archived: search.archived }),
  loader: (args) => Promise.all([loadWorkspace(args), loadWorkspaceSessions(args)]),
  component: WorkspaceLayout,
  errorComponent: RouteError,
  pendingComponent: ListSkeleton,
  head: () => ({ meta: [{ title: "Conductor PWA" }] }),
});
