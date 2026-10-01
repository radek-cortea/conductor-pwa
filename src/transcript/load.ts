import type { QueryClient } from "@tanstack/react-query";
import { fetchMessagePage } from "@/api/fetch";
import type { TranscriptMessage, TranscriptPage } from "@/api/types";
import { normaliseMessages, unsupportedMessageFormats } from "@/transcript/normalise";
import type { MessagesState, ReadPosition } from "@/transcript/types";

// Small windows; the viewport asks for more only when needed.
export const MESSAGE_PAGE_SIZE = 16;
export const messagesKey = (sessionId: string) => ["sessions", sessionId, "messages"] as const;
export const readPositionKey = (sessionId: string) => ["chat-read", sessionId] as const;
export type HistoryDirection = "older" | "newer" | "latest" | "initial";

function putPage(byOffset: MessagesState["byOffset"], page: TranscriptPage, offset: number) {
  page.data.forEach((message, index) => {
    byOffset[offset + index] = message;
  });
}

export function projectMessages(state: MessagesState): MessagesState {
  const messages: TranscriptMessage[] = [];
  const offsets = new Map<string, number>();
  for (let offset = state.startOffset; offset < state.endOffset; offset += 1) {
    const message = state.byOffset[offset];
    if (message) {
      messages.push(message);
      offsets.set(message.id, offset);
    }
  }
  const entries = normaliseMessages(messages).map((entry) => ({
    ...entry,
    offset: offsets.get(entry.messageId),
  }));
  const noUnreadContent =
    state.initialPosition === "unread" && state.endOffset >= state.total && entries.length === 0;
  return {
    ...state,
    entries,
    unsupportedFormats: unsupportedMessageFormats(messages),
    ...(noUnreadContent ? ({ initialPosition: "latest", unreadOffset: null } as const) : {}),
  };
}

// The public API has no count/tail endpoint. Seek the end with one-event probes
// rather than downloading every old message. Persisted sessions skip this seek.
async function findTotal(
  sessionId: string,
  signal: AbortSignal,
  byOffset: MessagesState["byOffset"],
  first: TranscriptPage,
  baseOffset = 0,
): Promise<number> {
  if (!first.hasMore) return baseOffset + first.data.length;
  let low = baseOffset + first.data.length;
  let high = Math.max(MESSAGE_PAGE_SIZE, low);
  for (;;) {
    signal.throwIfAborted();
    const page = await fetchMessagePage(sessionId, { limit: 1, offset: high }, signal);
    putPage(byOffset, page, high);
    if (page.data.length === 0) break;
    if (!page.hasMore) return high + page.data.length;
    low = high + page.data.length;
    high *= 2;
    if (high > 2 ** 30) throw new Error("Transcript exceeds supported pagination range.");
  }
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const page = await fetchMessagePage(sessionId, { limit: 1, offset: mid }, signal);
    putPage(byOffset, page, mid);
    if (page.data.length) {
      if (!page.hasMore) return mid + page.data.length;
      low = mid + page.data.length;
    } else high = mid;
  }
  return low;
}

function cachedWindow(state: Pick<MessagesState, "byOffset">, start: number, end: number): boolean {
  for (let index = start; index < end; index += 1) if (!state.byOffset[index]) return false;
  return true;
}

export async function loadTranscript(
  sessionId: string,
  signal: AbortSignal,
  cached?: MessagesState,
  read?: ReadPosition,
): Promise<MessagesState> {
  if (cached?.byOffset && cached.tailId && Number.isFinite(cached.total)) {
    const page = await fetchMessagePage(
      sessionId,
      { limit: MESSAGE_PAGE_SIZE, after: cached.tailId },
      signal,
    );
    const known = new Set(Object.values(cached.byOffset).map((message) => message.id));
    const incoming = page.data.filter((message) => !known.has(message.id));
    const byOffset = { ...cached.byOffset };
    putPage(byOffset, { ...page, data: incoming }, cached.total);
    // A long offline backlog is sparse history, not thousands of forward polls.
    const total =
      page.hasMore && incoming.length > 0
        ? await findTotal(sessionId, signal, byOffset, { ...page, data: incoming }, cached.total)
        : cached.total + incoming.length;
    return projectMessages({
      ...cached,
      byOffset,
      total,
      endOffset:
        cached.endOffset === cached.total ? cached.total + incoming.length : cached.endOffset,
      tailId: byOffset[total - 1]?.id ?? incoming.at(-1)?.id ?? cached.tailId,
      pollHasMore: false,
    });
  }
  const byOffset: MessagesState["byOffset"] = {};
  const first = await fetchMessagePage(sessionId, { limit: MESSAGE_PAGE_SIZE, offset: 0 }, signal);
  putPage(byOffset, first, 0);
  const total = await findTotal(sessionId, signal, byOffset, first);
  const unread = read && read.offset >= 0 && read.offset < total - 1 ? read.offset + 1 : null;
  const startOffset = unread ?? Math.max(0, total - MESSAGE_PAGE_SIZE);
  const endOffset = Math.min(total, startOffset + MESSAGE_PAGE_SIZE);
  if (!cachedWindow({ byOffset }, startOffset, endOffset)) {
    putPage(
      byOffset,
      await fetchMessagePage(
        sessionId,
        { limit: endOffset - startOffset, offset: startOffset },
        signal,
      ),
      startOffset,
    );
  }
  return projectMessages({
    byOffset,
    entries: [],
    startOffset,
    endOffset,
    total,
    tailId: byOffset[total - 1]?.id ?? null,
    pollHasMore: false,
    viewId: crypto.randomUUID(),
    initialPosition: unread === null ? "latest" : "unread",
    unreadOffset: unread,
    unsupportedFormats: [],
  });
}

// A history request can finish during a poll. Preserve its window and cached rows.
export function mergePolledMessages(
  current: MessagesState | undefined,
  incoming: MessagesState,
): MessagesState {
  if (!current?.byOffset || !Number.isFinite(current.total)) return incoming;
  const total = Math.max(current.total, incoming.total);
  const sameView = current.viewId === incoming.viewId;
  const byOffset = { ...current.byOffset, ...incoming.byOffset };
  return projectMessages({
    ...current,
    byOffset,
    total,
    startOffset: sameView
      ? Math.min(current.startOffset, incoming.startOffset)
      : current.startOffset,
    endOffset: sameView ? Math.max(current.endOffset, incoming.endOffset) : current.endOffset,
    tailId: byOffset[total - 1]?.id ?? current.tailId,
    pollHasMore: incoming.pollHasMore,
  });
}

export async function loadHistory(
  client: QueryClient,
  sessionId: string,
  direction: HistoryDirection,
  signal: AbortSignal,
): Promise<void> {
  const key = messagesKey(sessionId);
  const snapshot = client.getQueryData<MessagesState>(key);
  if (!snapshot?.byOffset || !Number.isFinite(snapshot.total)) return;
  const read = client.getQueryData<ReadPosition>(readPositionKey(sessionId));
  const unread =
    direction === "initial" && read && read.offset >= 0 && read.offset < snapshot.total - 1
      ? read.offset + 1
      : null;
  const start =
    direction === "older"
      ? Math.max(0, snapshot.startOffset - MESSAGE_PAGE_SIZE)
      : direction === "newer"
        ? snapshot.endOffset
        : (unread ?? Math.max(0, snapshot.total - MESSAGE_PAGE_SIZE));
  const end =
    direction === "older"
      ? snapshot.startOffset
      : Math.min(snapshot.total, start + MESSAGE_PAGE_SIZE);
  if (start >= end) return;
  const page = cachedWindow(snapshot, start, end)
    ? null
    : await client.fetchQuery({
        // AbortSignal controls transport lifetime, not the identity of an immutable page.
        // oxlint-disable-next-line query/exhaustive-deps
        queryKey: ["message-page", sessionId, start, end - start],
        queryFn: ({ signal: querySignal }) =>
          fetchMessagePage(
            sessionId,
            { limit: end - start, offset: start },
            AbortSignal.any([signal, querySignal]),
          ),
        staleTime: Infinity,
      });
  signal.throwIfAborted();
  client.setQueryData<MessagesState>(key, (current) => {
    if (!current || current.viewId !== snapshot.viewId) return current;
    const byOffset = { ...current.byOffset };
    if (page) putPage(byOffset, page, start);
    return projectMessages({
      ...current,
      byOffset,
      startOffset:
        direction === "latest" || direction === "initial"
          ? start
          : Math.min(start, current.startOffset),
      endOffset:
        direction === "latest" || direction === "initial" ? end : Math.max(end, current.endOffset),
      ...(direction === "latest" || direction === "initial"
        ? ({
            viewId: crypto.randomUUID(),
            initialPosition: unread === null ? "latest" : "unread",
            unreadOffset: unread,
          } as const)
        : {}),
    });
  });
}

export function markRead(client: QueryClient, sessionId: string, position: ReadPosition): void {
  client.setQueryData<ReadPosition>(readPositionKey(sessionId), (previous) =>
    !previous || position.offset > previous.offset ? position : previous,
  );
}
