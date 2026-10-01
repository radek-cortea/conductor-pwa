import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, LogOut } from "lucide-react";
import { meQuery, projectsQuery } from "@/api/queries";
import { signOutCredential } from "@/auth/credential";
import { organizationName } from "@/lib/organization";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { stopMessagePersistence } from "@/storage/query-persistence";

export function AuthenticatedLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { workspaceId } = useParams({ strict: false });
  const me = useQuery(meQuery());
  const projects = useQuery({ ...projectsQuery(), enabled: !workspaceId });
  const organization =
    organizationName(
      me.data,
      (projects.data ?? []).map((project) => project.gitRemote),
    ) ?? "Organization";
  const atHome = pathname === "/workspaces" || pathname === "/workspaces/";
  const email = me.data?.email || "Account";

  async function signOut() {
    signOutCredential();
    await stopMessagePersistence(queryClient);
    await navigate({ to: "/sign-in" });
  }

  return (
    <div className="mx-auto flex h-dvh min-h-dvh w-full max-w-3xl flex-col">
      {!workspaceId ? (
        <header className="z-20 flex shrink-0 items-center justify-between gap-2 border-b bg-background px-4 pt-[max(0.25rem,env(safe-area-inset-top))] pb-1">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {!atHome ? (
              <Link
                to="/workspaces"
                search={{ archived: false, q: "" }}
                className="flex min-h-11 shrink-0 items-center gap-1 text-sm"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Workspaces
              </Link>
            ) : null}
            <span className="truncate text-xs text-muted-foreground" title={organization}>
              {organization}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 max-w-44 min-w-0 gap-1 px-2 text-xs"
                aria-label={email}
                title="Account menu"
              >
                <span className="truncate">{email}</span>
                <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  void signOut();
                }}
              >
                <LogOut aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
