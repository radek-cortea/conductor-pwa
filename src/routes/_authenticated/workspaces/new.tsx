import { createFileRoute } from "@tanstack/react-router";
import { loadProjects } from "@/pages/loaders";
import { NewWorkspacePage } from "@/pages/new-workspace";
import { RouteError } from "@/pages/route-error";
import { ListSkeleton } from "@/pages/skeletons";

export const Route = createFileRoute("/_authenticated/workspaces/new")({
  loader: (args) => loadProjects(args),
  component: NewWorkspacePage,
  errorComponent: RouteError,
  pendingComponent: ListSkeleton,
  head: () => ({ meta: [{ title: "Conductor PWA" }] }),
});
