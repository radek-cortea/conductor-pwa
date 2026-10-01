import { createFileRoute, redirect } from "@tanstack/react-router";
import { readCredential } from "@/auth/credential";
import { IndexRedirect } from "@/pages/document-shell";
import { RouteError } from "@/pages/route-error";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (readCredential()) {
      throw redirect({ to: "/workspaces", search: { archived: false, q: "" } });
    }
    throw redirect({ to: "/sign-in" });
  },
  component: IndexRedirect,
  loader: () => undefined,
  errorComponent: RouteError,
  head: () => ({ meta: [{ title: "Conductor PWA" }] }),
});
