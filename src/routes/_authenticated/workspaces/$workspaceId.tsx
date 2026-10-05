import { createFileRoute } from "@tanstack/react-router";
import { loadWorkspace, loadWorkspaceSessions } from "@/pages/loaders";
import { workspaceSearchSchema } from "@/pages/search";
import { RouteError } from "@/pages/route-error";
import { WorkspacePending } from "@/pages/workspace-pending";
import { knownWorkspace } from "@/lib/known-workspace";
import { WorkspaceLayout } from "@/pages/workspace-layout";

export const Route = createFileRoute("/_authenticated/workspaces/$workspaceId")({
  validateSearch: (search) => workspaceSearchSchema.parse(search),
  beforeLoad: ({ context, params }) => ({
    workspacePreview: knownWorkspace(context.queryClient, params.workspaceId),
  }),
  loaderDeps: ({ search }) => ({ archived: search.archived }),
  loader: (args) => Promise.all([loadWorkspace(args), loadWorkspaceSessions(args)]),
  component: WorkspaceLayout,
  errorComponent: RouteError,
  pendingComponent: WorkspacePending,
  head: () => ({ meta: [{ title: "Conductor PWA" }] }),
});
