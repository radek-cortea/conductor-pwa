import { createFileRoute } from "@tanstack/react-router";
import { loadSession } from "@/pages/loaders";
import { RouteError } from "@/pages/route-error";
import { SessionPage } from "@/pages/session";
import { TranscriptSkeleton } from "@/pages/skeletons";

export const Route = createFileRoute("/_authenticated/workspaces/$workspaceId/sessions/$sessionId")(
  {
    loader: (args) => loadSession(args),
    component: SessionPage,
    errorComponent: RouteError,
    pendingComponent: TranscriptSkeleton,
    head: () => ({ meta: [{ title: "Conductor PWA" }] }),
  },
);
