import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "vitest-browser-react";
import { setUnauthorizedHandler } from "@/auth/unauthorized";
import { queryClient } from "@/query-client";
import { createAppRouter } from "@/router";
import { Toaster } from "@/ui/sonner";

export async function renderApp(path: string) {
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  setUnauthorizedHandler(() => {
    void router.navigate({ to: "/sign-in" });
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </StrictMode>,
  );
}
