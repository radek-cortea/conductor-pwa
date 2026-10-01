import { useQuery } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Archive, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { projectsQuery, workspaceStatusQuery, workspacesQuery } from "@/api/queries";
import type { Workspace } from "@/api/types";
import { formatActivity, lifecycleLabel, workspaceStatusLabel } from "@/lib/labels";
import { filterWorkspaces, sortWorkspacesByActivity } from "@/lib/workspaces";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { ListSkeleton } from "@/pages/skeletons";

const homeRoute = getRouteApi("/_authenticated/workspaces/");

export function HomePage() {
  const search = homeRoute.useSearch();
  const navigate = homeRoute.useNavigate();
  const projects = useQuery(projectsQuery());
  const workspaces = useQuery(workspacesQuery(search.archived));
  const [searchOpen, setSearchOpen] = useState(Boolean(search.q));

  if (projects.isPending || workspaces.isPending) return <ListSkeleton />;

  const visible = sortWorkspacesByActivity(
    filterWorkspaces(workspaces.data ?? [], {
      archived: search.archived,
      query: search.q,
      labelFor: (workspace) =>
        [
          workspace.repoUrl,
          projects.data?.find((project) => project.id === workspace.projectId)?.name ?? "",
        ].join(" "),
    }),
  );

  return (
    <main
      aria-label="Workspaces"
      className="flex flex-1 flex-col pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={searchOpen ? "Close search" : "Search workspaces"}
          aria-expanded={searchOpen}
          aria-controls="workspace-search"
          onClick={() => {
            setSearchOpen(!searchOpen);
            if (searchOpen && search.q)
              void navigate({ search: { archived: search.archived, q: "" }, replace: true });
          }}
        >
          {searchOpen ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
        </Button>
        <Button asChild className="min-h-11 flex-1 px-3">
          <Link to="/workspaces/new">
            <Plus aria-hidden="true" />
            Start workspace
          </Link>
        </Button>
        <Button asChild variant="ghost" className="min-h-11 shrink-0 gap-1 px-2">
          <Link
            to="/workspaces"
            search={{ archived: !search.archived, q: search.q }}
            aria-pressed={search.archived}
          >
            <Archive aria-hidden="true" />
            {search.archived ? "Hide archived" : "Show archived"}
          </Link>
        </Button>
      </div>
      {searchOpen ? (
        <div id="workspace-search" className="px-4 pb-3">
          <Input
            autoFocus
            aria-label="Search workspaces"
            value={search.q}
            placeholder="Search workspaces"
            className="min-h-11"
            onChange={(event) => {
              void navigate({
                search: { archived: search.archived, q: event.target.value },
                replace: true,
              });
            }}
          />
        </div>
      ) : null}
      {visible.length === 0 ? (
        <div className="px-4 py-8">
          <h2 className="text-lg font-medium">
            {search.q || search.archived ? "No workspaces match that filter" : "No workspaces yet"}
          </h2>
          <p className="mt-2 text-muted-foreground">
            Start a workspace to give an agent an opening prompt.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col px-4">
          {visible.map((workspace) => (
            <li key={workspace.id}>
              <WorkspaceRow workspace={workspace} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function WorkspaceRow({ workspace }: { workspace: Workspace }) {
  const active = workspace.state === "initializing" || workspace.state === "updating";
  const status = useQuery({ ...workspaceStatusQuery(workspace.id), enabled: active });
  const phase = status.data?.status ?? workspace.state;
  const step = lifecycleLabel(status.data?.lifecycleStep ?? workspace.lifecycleStep);

  return (
    <Link
      to="/workspaces/$workspaceId"
      params={{ workspaceId: workspace.id }}
      search={{ archived: false }}
      className="flex min-h-16 flex-col gap-1 rounded-md px-2 py-3 hover:bg-accent"
    >
      <span className="font-medium">{workspace.name}</span>
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{workspaceStatusLabel(phase)}</Badge>
        {active ? <span className="text-muted-foreground">{step}</span> : null}
        <span className="text-muted-foreground">{formatActivity(workspace.lastActivityAt)}</span>
      </span>
    </Link>
  );
}
