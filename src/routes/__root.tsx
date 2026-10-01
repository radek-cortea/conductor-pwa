import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { RootDocument } from "@/pages/document-shell";
import { RouteError } from "@/pages/route-error";

export type RouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootDocument,
  loader: () => undefined,
  errorComponent: RouteError,
  head: () => ({
    meta: [{ title: "Conductor PWA" }, { name: "theme-color", content: "#ffffff" }],
  }),
});
