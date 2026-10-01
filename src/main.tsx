import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setUnauthorizedHandler } from "@/auth/unauthorized";
import { queryClient } from "@/query-client";
import { router } from "@/router";
import { Toaster } from "@/ui/sonner";
import { readCredential } from "@/auth/credential";
import {
  startMessagePersistence,
  flushStoredMessages,
  stopMessagePersistence,
} from "@/storage/query-persistence";
import "@/register-sw";
import "@/index.css";

setUnauthorizedHandler(() => {
  void stopMessagePersistence(queryClient).then(() => router.navigate({ to: "/sign-in" }));
});

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element missing");
}

if (import.meta.env.PROD && window.top !== window.self) {
  // Pages cannot set frame-ancestors through a meta CSP. Do not expose a signed-in
  // UI to clickjacking: refuse framed production startup before reading credentials.
  root.textContent = "Open Conductor PWA directly in a browser tab.";
} else {
  await startMessagePersistence(readCredential(), queryClient);
  window.addEventListener("pagehide", () => {
    void flushStoredMessages();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushStoredMessages();
  });

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </StrictMode>,
  );
}
