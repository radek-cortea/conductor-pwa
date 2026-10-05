import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { readPositionKey } from "@/transcript/load";
import type { ReadPosition } from "@/transcript/types";
import { unreadSessionsQuery, workspaceUnreadQuery } from "@/transcript/unread";
import { WorkspacePrStatus } from "@/pages/workspace-pr-status";

export function WorkspaceUnread({
  workspaceId,
  activity,
  repoUrl,
}: {
  workspaceId: string;
  activity?: string;
  repoUrl: string;
}) {
  const client = useQueryClient();
  const sessions = useQuery(unreadSessionsQuery(workspaceId, activity));
  const chats = (sessions.data ?? []).filter((session) => !session.archivedAt);
  const reads = useQueries({
    queries: chats.map((session) => ({
      queryKey: readPositionKey(session.id),
      // Subscribe to the PWA's existing cursors without creating or fetching a read position.
      queryFn: () => client.getQueryData<ReadPosition>(readPositionKey(session.id)) ?? null,
      enabled: false,
    })),
  });
  const cursors = chats.map((session, index) => ({
    sessionId: session.id,
    messageId: reads[index]?.data?.messageId ?? null,
  }));
  const unread = useQuery(workspaceUnreadQuery(workspaceId, activity, sessions.data, cursors));
  return (
    <>
      {unread.data === "unread" ? (
        <span
          role="img"
          aria-label="Unread messages"
          title="Unread in this PWA (local to this browser)"
          className="size-2 shrink-0 rounded-full bg-blue-600"
        />
      ) : sessions.isError || unread.isError || unread.data === "unknown" ? (
        <span className="sr-only">Unread status unavailable</span>
      ) : null}
      <WorkspacePrStatus chats={chats} repoUrl={repoUrl} />
    </>
  );
}
