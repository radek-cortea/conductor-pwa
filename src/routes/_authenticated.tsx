import { createFileRoute, redirect } from "@tanstack/react-router";
import { readCredential } from "@/auth/credential";
import { AuthenticatedLayout } from "@/pages/authenticated-layout";
import { loadAccount } from "@/pages/loaders";
import { RouteError } from "@/pages/route-error";
import { AuthenticatedPending } from "@/pages/authenticated-pending";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: () => {
    if (!readCredential()) {
      throw redirect({ to: "/sign-in" });
    }
  },
  component: AuthenticatedLayout,
  loader: (args) => loadAccount(args),
  errorComponent: RouteError,
  pendingComponent: AuthenticatedPending,
  head: () => ({ meta: [{ title: "Conductor PWA" }] }),
});
