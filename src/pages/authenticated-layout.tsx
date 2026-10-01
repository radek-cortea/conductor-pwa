import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { meQuery } from "@/api/queries";
import { clearCredential } from "@/auth/credential";
import { Button } from "@/ui/button";
import { AppBrand } from "@/ui/app-brand";
import { stopMessagePersistence } from "@/storage/query-persistence";

export function AuthenticatedLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useQuery(meQuery());

  async function signOut() {
    clearCredential();
    await stopMessagePersistence(queryClient);
    await navigate({ to: "/sign-in" });
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-background px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <Link to="/workspaces" search={{ archived: false, q: "" }} className="shrink-0 text-base">
          <AppBrand />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm text-muted-foreground">{me.data?.email ?? "Signed in"}</p>
          <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
