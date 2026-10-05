import { queryOptions } from "@tanstack/react-query";
import { fetchMessagePage, fetchSessions } from "@/api/fetch";
import { ApiError } from "@/api/errors";
import type { Session } from "@/api/types";
import { createRequestLimiter } from "@/lib/request-limiter";
import { normaliseMessage, unsupportedMessageFormats } from "@/transcript/normalise";

export type UnreadStatus = "unread" | "read" | "unknown";
export type ChatCursor = { sessionId: string; messageId: string | null };
export const UNREAD_POLL_MS = 60_000;
export const UNREAD_SCAN_LIMIT = 64;
const limitRequest = createRequestLimiter(3);

export async function checkChatUnread(
  { sessionId, messageId }: ChatCursor,
  signal: AbortSignal,
): Promise<UnreadStatus> {
  let after = messageId;
  let scanned = 0;
  let unsupported = false;
  while (scanned < UNREAD_SCAN_LIMIT) {
    const limit = scanned === 0 ? 1 : Math.min(16, UNREAD_SCAN_LIMIT - scanned);
    const page = await limitRequest(signal, () =>
      fetchMessagePage(sessionId, after ? { after, limit } : { offset: 0, limit }, signal),
    );
    signal.throwIfAborted();
    if (
      page.data.some((message) =>
        normaliseMessage(message).some((entry) => entry.kind !== "unknown"),
      )
    ) {
      return "unread";
    }
    unsupported ||= unsupportedMessageFormats(page.data).length > 0;
    if (!page.hasMore) return unsupported ? "unknown" : "read";
    const next = page.data.at(-1)?.id;
    // Never label incomplete/protocol-only scans as read or download an entire history.
    if (!next || next === after) return "unknown";
    after = next;
    scanned += page.data.length;
  }
  return "unknown";
}

export async function checkWorkspaceUnread(cursors: readonly ChatCursor[], signal: AbortSignal) {
  let status: UnreadStatus = "read";
  // Most projects' new content is in their newest chat; stop at the first unread one.
  for (const cursor of [...cursors].reverse()) {
    let chat: UnreadStatus;
    try {
      chat = await checkChatUnread(cursor, signal);
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof ApiError) || error.status === 401) throw error;
      // An unavailable chat is unknown, but another chat may still be unread.
      chat = "unknown";
    }
    if (chat === "unread") return chat;
    if (chat === "unknown") status = "unknown";
  }
  return status;
}

export function unreadSessionsQuery(workspaceId: string, activity: string | undefined) {
  return queryOptions({
    queryKey: ["workspace-unread-sessions", workspaceId, activity] as const,
    gcTime: UNREAD_POLL_MS,
    queryFn: ({ signal }) => limitRequest(signal, () => fetchSessions(workspaceId, false, signal)),
    staleTime: UNREAD_POLL_MS,
    refetchInterval: UNREAD_POLL_MS,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: false,
  });
}

export function workspaceUnreadQuery(
  workspaceId: string,
  activity: string | undefined,
  sessions: readonly Session[] | undefined,
  cursors: readonly ChatCursor[],
) {
  return queryOptions({
    queryKey: ["workspace-unread", workspaceId, activity, cursors] as const,
    gcTime: UNREAD_POLL_MS,
    queryFn: ({ signal }) => checkWorkspaceUnread(cursors, signal),
    enabled: sessions !== undefined,
    staleTime: UNREAD_POLL_MS,
    refetchInterval: UNREAD_POLL_MS,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: false,
  });
}
