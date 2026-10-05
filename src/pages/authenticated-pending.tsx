import { useMatch } from "@tanstack/react-router";
import { ListSkeleton } from "@/pages/skeletons";
import { WorkspacePending } from "@/pages/workspace-pending";

export function AuthenticatedPending() {
  const project = useMatch({ from: "/_authenticated/workspaces/$workspaceId", shouldThrow: false });
  if (!project) return <ListSkeleton />;
  return (
    <div className="mx-auto flex h-dvh min-h-dvh w-full max-w-3xl flex-col">
      <WorkspacePending />
    </div>
  );
}
