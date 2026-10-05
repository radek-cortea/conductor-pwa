import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { readPositionKey } from "@/transcript/load";
import type { ReadPosition } from "@/transcript/types";
import { unreadSessionsQuery, workspaceUnreadQuery } from "@/transcript/unread";

export function WorkspaceUnread({
  workspaceId,
  activity,
}: {
  workspaceId: string;
  activity?: string;
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
  if (unread.data === "unread") {
    return (
      <span
        role="img"
        aria-label="Unread messages"
        title="Unread messages"
        className="size-2 shrink-0 rounded-full bg-purple-700"
      />
    );
  }
  if (sessions.isError || unread.isError || unread.data === "unknown") {
    return <span className="sr-only">Unread status unavailable</span>;
  }
  return null;
}
