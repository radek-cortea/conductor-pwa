import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMessagePage } from "@/api/fetch";
import type { TranscriptMessage } from "@/api/types";
import { createQueryClient } from "@/query-client";
import { assistantFixture, unknownFixture } from "@/transcript/fixtures";
import {
  loadHistory,
  loadTranscript,
  mergePolledMessages,
  MESSAGE_PAGE_SIZE,
  messagesKey,
} from "@/transcript/load";
import type { MessagesState } from "@/transcript/types";

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

  it("starts at the latest window without read/unread state", async () => {
    serve(events(100));
    const state = await loadTranscript("ses-1", signal());
    expect(state.startOffset).toBe(100 - MESSAGE_PAGE_SIZE);
    expect(state.entries.at(-1)).toMatchObject({ text: "Answer 99." });
    expect(state).not.toHaveProperty("unreadOffset");
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

  it("fills forward from an older history window without losing its start", async () => {
    serve(events(100));
    const client = createQueryClient();
    const state = await loadTranscript("ses-1", signal());
    client.setQueryData(messagesKey("ses-1"), { ...state, startOffset: 31, endOffset: 47 });
    await loadHistory(client, "ses-1", "newer", signal());
    const next = client.getQueryData<MessagesState>(messagesKey("ses-1"))!;
    expect(next.startOffset).toBe(31);
    expect(next.endOffset).toBe(31 + 2 * MESSAGE_PAGE_SIZE);
    client.clear();
  });

  it("reopens persisted older history at the latest window, ignoring legacy read cursors", async () => {
    serve(events(100));
    const client = createQueryClient();
    const state = await loadTranscript("ses-1", signal());
    client.setQueryData(messagesKey("ses-1"), {
      ...state,
      startOffset: 20,
      endOffset: 36,
      initialPosition: "unread",
      unreadOffset: 21,
    });
    client.setQueryData(["chat-read", "ses-1"], { messageId: "event-20", offset: 20 });
    await loadHistory(client, "ses-1", "initial", signal());
    const reopened = client.getQueryData<MessagesState>(messagesKey("ses-1"));
    expect(reopened?.startOffset).toBe(84);
    expect(reopened).not.toHaveProperty("unreadOffset");
    expect(reopened).not.toHaveProperty("initialPosition");
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
