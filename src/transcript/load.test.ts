import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMessagePage } from "@/api/fetch";
import type { TranscriptMessage } from "@/api/types";
import { createQueryClient } from "@/query-client";
import { assistantFixture, unknownFixture } from "@/transcript/fixtures";
import {
  loadHistory,
  loadTranscript,
  markRead,
  mergePolledMessages,
  MESSAGE_PAGE_SIZE,
  messagesKey,
  readPositionKey,
} from "@/transcript/load";
import type { MessagesState, ReadPosition } from "@/transcript/types";

vi.mock("@/api/fetch", () => ({ fetchMessagePage: vi.fn() }));
beforeEach(() => {
  vi.mocked(fetchMessagePage).mockReset();
});
const signal = () => new AbortController().signal;
function serve(messages: TranscriptMessage[]) {
  vi.mocked(fetchMessagePage).mockImplementation(async (_id, query) => {
    const offset =
      "offset" in query
        ? query.offset
        : messages.findIndex((message) => message.id === query.after) + 1;
    return {
      data: messages.slice(offset, offset + query.limit),
      offset,
      hasMore: offset + query.limit < messages.length,
    };
  });
}
function events(count: number): TranscriptMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    ...assistantFixture,
    id: `event-${index}`,
    sessionIndex: index,
    content: {
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: `Answer ${index}.` }] },
    },
  }));
}

describe("viewport transcript windows", () => {
  it("seeks a 2,161-event transcript's final answer without walking all its messages", async () => {
    const data = events(2161).map((event, index) =>
      index === 2156 ? event : { ...event, content: unknownFixture.content },
    );
    serve(data);
    const state = await loadTranscript("ses-1", signal());
    expect(state.total).toBe(2161);
    expect(state.startOffset).toBe(2161 - MESSAGE_PAGE_SIZE);
    expect(state.endOffset).toBe(2161);
    expect(state.entries).toEqual([
      expect.objectContaining({ kind: "assistant", text: "Answer 2156.", offset: 2156 }),
    ]);
    const calls = vi.mocked(fetchMessagePage).mock.calls;
    expect(calls.length).toBeLessThan(40);
    expect(calls.reduce((sum, call) => sum + call[1].limit, 0)).toBeLessThan(100);
  });

  it("starts at the first unread event, rather than skipping to the end", async () => {
    serve(events(100));
    const state = await loadTranscript("ses-1", signal(), undefined, {
      messageId: "event-30",
      sessionIndex: 30,
      offset: 30,
    });
    expect(state.initialPosition).toBe("unread");
    expect(state.startOffset).toBe(31);
    expect(state.entries[0]).toMatchObject({ text: "Answer 31." });
    expect(state.endOffset).toBe(31 + MESSAGE_PAGE_SIZE);
  });

  it("starts at the latest window when everything has been read", async () => {
    serve(events(100));
    const state = await loadTranscript("ses-1", signal(), undefined, {
      messageId: "event-99",
      sessionIndex: 99,
      offset: 99,
    });
    expect(state.initialPosition).toBe("latest");
    expect(state.startOffset).toBe(100 - MESSAGE_PAGE_SIZE);
  });

  it("polls after the tail cursor and preserves fetched history", async () => {
    const data = events(100);
    serve(data);
    const old = await loadTranscript("ses-1", signal());
    data.push(
      ...events(2).map((event, index) => ({
        ...event,
        id: `event-${100 + index}`,
        sessionIndex: 100 + index,
      })),
    );
    const state = await loadTranscript("ses-1", signal(), old);
    expect(vi.mocked(fetchMessagePage).mock.calls.at(-1)?.[1]).toEqual({
      limit: MESSAGE_PAGE_SIZE,
      after: "event-99",
    });
    expect(state.total).toBe(102);
    expect(state.endOffset).toBe(102);
    expect(state.byOffset[84]).toEqual(old.byOffset[84]);
  });

  it("seeks a large cached-session backlog instead of forward-polling every event", async () => {
    const data = events(100);
    serve(data);
    const old = await loadTranscript("ses-1", signal());
    data.push(
      ...events(800).map((event, index) => ({
        ...event,
        id: `event-${100 + index}`,
        sessionIndex: 100 + index,
      })),
    );
    vi.mocked(fetchMessagePage).mockClear();
    const next = await loadTranscript("ses-1", signal(), old);
    expect(next.total).toBe(900);
    expect(next.tailId).toBe("event-899");
    expect(next.endOffset).toBe(100 + MESSAGE_PAGE_SIZE);
    expect(vi.mocked(fetchMessagePage).mock.calls.length).toBeLessThan(25);
    const client = createQueryClient();
    client.setQueryData(messagesKey("ses-1"), next);
    await loadHistory(client, "ses-1", "latest", signal());
    expect(client.getQueryData<MessagesState>(messagesKey("ses-1"))?.startOffset).toBe(
      900 - MESSAGE_PAGE_SIZE,
    );
    client.clear();
  });

  it("loads older windows without the old 200-entry discard limit", async () => {
    serve(events(240));
    const client = createQueryClient();
    client.setQueryData(messagesKey("ses-1"), await loadTranscript("ses-1", signal()));
    for (let n = 0; n < 14; n += 1) await loadHistory(client, "ses-1", "older", signal());
    const state = client.getQueryData<MessagesState>(messagesKey("ses-1"))!;
    expect(state.startOffset).toBe(0);
    expect(state.entries).toHaveLength(240);
    const calls = vi.mocked(fetchMessagePage).mock.calls.length;
    await loadHistory(client, "ses-1", "older", signal());
    expect(vi.mocked(fetchMessagePage).mock.calls).toHaveLength(calls);
    client.clear();
  });

  it("fills forward from unread history without losing the first unread position", async () => {
    serve(events(100));
    const client = createQueryClient();
    const state = await loadTranscript("ses-1", signal(), undefined, {
      messageId: "event-30",
      sessionIndex: 30,
      offset: 30,
    });
    client.setQueryData(messagesKey("ses-1"), state);
    await loadHistory(client, "ses-1", "newer", signal());
    const next = client.getQueryData<MessagesState>(messagesKey("ses-1"))!;
    expect(next.startOffset).toBe(31);
    expect(next.endOffset).toBe(31 + 2 * MESSAGE_PAGE_SIZE);
    expect(next.unreadOffset).toBe(31);
    client.clear();
  });

  it("reopens persisted history at the last unread position or the latest screen", async () => {
    serve(events(100));
    const client = createQueryClient();
    client.setQueryData(messagesKey("ses-1"), await loadTranscript("ses-1", signal()));
    markRead(client, "ses-1", { messageId: "event-20", sessionIndex: 20, offset: 20 });
    await loadHistory(client, "ses-1", "initial", signal());
    expect(client.getQueryData<MessagesState>(messagesKey("ses-1"))?.startOffset).toBe(21);
    markRead(client, "ses-1", { messageId: "event-99", sessionIndex: 99, offset: 99 });
    await loadHistory(client, "ses-1", "initial", signal());
    expect(client.getQueryData<MessagesState>(messagesKey("ses-1"))?.startOffset).toBe(84);
    client.clear();
  });

  it("never moves a read cursor backwards when scrolling into old messages", () => {
    const client = createQueryClient();
    const last = { messageId: "event-99", sessionIndex: 99, offset: 99 };
    markRead(client, "ses-1", last);
    markRead(client, "ses-1", { messageId: "event-10", sessionIndex: 10, offset: 10 });
    expect(client.getQueryData<ReadPosition>(readPositionKey("ses-1"))).toEqual(last);
    client.clear();
  });

  it("does not overwrite a concurrently loaded history window with a poll", async () => {
    serve(events(100));
    const old = await loadTranscript("ses-1", signal());
    const current = { ...old, startOffset: 68 };
    const merged = mergePolledMessages(current, old);
    expect(merged.startOffset).toBe(68);
    const jumped = { ...current, viewId: "new-view", startOffset: 84 };
    expect(mergePolledMessages(jumped, old).startOffset).toBe(84);
  });
});
