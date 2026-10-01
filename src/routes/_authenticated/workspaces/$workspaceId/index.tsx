import { createFileRoute, redirect } from "@tanstack/react-router";
import { lastChat } from "@/lib/chats";
import { loadWorkspaceSessions } from "@/pages/loaders";
import { RouteError } from "@/pages/route-error";
import { ListSkeleton } from "@/pages/skeletons";

export const Route = createFileRoute("/_authenticated/workspaces/$workspaceId/")({
  loaderDeps: ({ search }) => ({ archived: search.archived }),
  loader: async (args) => {
    const sessions = await loadWorkspaceSessions(args);
    const session = lastChat(
      args.params.workspaceId,
      sessions.filter((item) => args.deps.archived || !item.archivedAt),
    );
    if (session) {
      throw redirect({
        to: "/workspaces/$workspaceId/sessions/$sessionId",
        params: { workspaceId: args.params.workspaceId, sessionId: session.id },
        search: { archived: args.deps.archived },
        replace: true,
      });
    }
  },
  component: () => null,
  errorComponent: RouteError,
  pendingComponent: ListSkeleton,
});
