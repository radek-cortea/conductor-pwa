import { createRouter, type RouterHistory } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { queryClient } from "@/query-client";
import { routeTree } from "@/routeTree.gen";

export function createAppRouter(client: QueryClient = queryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient: client },
    history,
    defaultPreloadStaleTime: 0,
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
