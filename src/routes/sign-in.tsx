import { createFileRoute, redirect } from "@tanstack/react-router";
import { readCredential } from "@/auth/credential";
import { RouteError } from "@/pages/route-error";
import { SignInPage } from "@/pages/sign-in";

export const Route = createFileRoute("/sign-in")({
  beforeLoad: () => {
    if (readCredential()) {
      throw redirect({ to: "/workspaces", search: { archived: false, q: "" } });
    }
  },
  component: SignInPage,
  loader: () => undefined,
  errorComponent: RouteError,
  head: () => ({ meta: [{ title: "Conductor PWA" }] }),
});
