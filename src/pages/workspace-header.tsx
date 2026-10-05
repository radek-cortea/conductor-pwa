import { Link } from "@tanstack/react-router";
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/ui/button";

export function WorkspaceHeader({ name, children }: { name?: string; children?: ReactNode }) {
  return (
    <header className="z-20 flex shrink-0 items-center gap-2 border-b bg-background px-4 pt-[max(0.25rem,env(safe-area-inset-top))] pb-1">
      <Button asChild variant="ghost" size="icon" className="shrink-0">
        <Link
          to="/workspaces"
          search={{ archived: false, q: "" }}
          aria-label="Workspaces"
          title="Back to workspaces"
        >
          <ChevronLeft aria-hidden="true" />
        </Link>
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold" title={name}>
        {name ?? "Loading project…"}
      </h1>
      {children ?? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Workspace actions"
          disabled
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      )}
    </header>
  );
}
