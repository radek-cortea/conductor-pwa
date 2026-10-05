import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { workspaceQuery } from "@/api/queries";
import { WorkspaceHeader } from "@/pages/workspace-header";
import { TranscriptSkeleton } from "@/pages/skeletons";

const route = getRouteApi("/_authenticated/workspaces/$workspaceId");

export function WorkspacePending() {
  const { workspaceId } = route.useParams();
  const { workspacePreview } = route.useRouteContext();
  const workspace = useQuery({ ...workspaceQuery(workspaceId), enabled: false });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceHeader name={workspace.data?.name ?? workspacePreview?.name} />
      <TranscriptSkeleton />
    </div>
  );
}
