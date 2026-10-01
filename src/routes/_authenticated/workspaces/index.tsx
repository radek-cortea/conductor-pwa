import { createFileRoute } from "@tanstack/react-router";
import { loadHome } from "@/pages/loaders";
import { HomePage } from "@/pages/home";
import { RouteError } from "@/pages/route-error";
import { homeSearchSchema } from "@/pages/search";
import { ListSkeleton } from "@/pages/skeletons";

export const Route = createFileRoute("/_authenticated/workspaces/")({
  validateSearch: (search) => homeSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ archived: search.archived }),
  loader: (args) => loadHome(args),
  component: HomePage,
  errorComponent: RouteError,
  pendingComponent: ListSkeleton,
  head: () => ({ meta: [{ title: "Conductor PWA" }] }),
});
