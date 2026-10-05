import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMessagePage, fetchSessions } from "@/api/fetch";
import { ApiError } from "@/api/errors";
import type { TranscriptMessage } from "@/api/types";
import { createQueryClient } from "@/query-client";
import { assistantFixture, unknownFixture } from "@/transcript/fixtures";
import {
  checkChatUnread,
  checkWorkspaceUnread,
  unreadSessionsQuery,
  UNREAD_SCAN_LIMIT,
  workspaceUnreadQuery,
} from "@/transcript/unread";

vi.mock("@/api/fetch", () => ({ fetchMessagePage: vi.fn(), fetchSessions: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const signal = () => new AbortController().signal;
const cursor = { sessionId: "session", messageId: "read-message" };
function event(index: number, visible = true): TranscriptMessage {
  return {
    ...(visible ? assistantFixture : unknownFixture),
    id: `message-${index}`,
    sessionIndex: index,
  };
}
function serve(messages: TranscriptMessage[]) {
  vi.mocked(fetchMessagePage).mockImplementation(async (_id, query) => {
    const offset =
      "offset" in query ? query.offset : messages.findIndex((m) => m.id === query.after) + 1;
    return {
      data: messages.slice(offset, offset + query.limit),
      offset,
      hasMore: offset + query.limit < messages.length,
    };
  });
}

describe("unread project checks", () => {
  it("finds unread conversation content with one cursor probe, without locating the tail", async () => {
    serve([event(0), event(1)]);
    expect(await checkChatUnread({ ...cursor, messageId: "message-0" }, signal())).toBe("unread");
    expect(fetchMessagePage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchMessagePage).mock.calls[0]![1]).toEqual({ after: "message-0", limit: 1 });
  });
  it("does not label a fully read chat unread", async () => {
    serve([event(0)]);
    expect(await checkChatUnread({ ...cursor, messageId: "message-0" }, signal())).toBe("read");
  });
  it("checks never-opened chats from the start and ignores empty chats", async () => {
    serve([event(0)]);
    expect(await checkChatUnread({ ...cursor, messageId: null }, signal())).toBe("unread");
    expect(vi.mocked(fetchMessagePage).mock.calls[0]![1]).toEqual({ offset: 0, limit: 1 });
    serve([]);
    expect(await checkChatUnread({ ...cursor, messageId: null }, signal())).toBe("read");
  });
  it("skips protocol noise to find a later reply, but does not call protocol-only activity unread", async () => {
    serve([event(0), event(1, false), event(2)]);
    expect(await checkChatUnread({ ...cursor, messageId: "message-0" }, signal())).toBe("unread");
    expect(vi.mocked(fetchMessagePage).mock.calls.at(-1)![1]).toEqual({
      after: "message-1",
      limit: 16,
    });
    serve([event(0), event(1, false)]);
    expect(await checkChatUnread({ ...cursor, messageId: "message-0" }, signal())).toBe("read");
  });
  it("treats unsupported agent payloads as unknown, not read", async () => {
    serve([{ ...event(0), content: { unexpected: "not a supported message" } }]);
    expect(await checkChatUnread({ ...cursor, messageId: null }, signal())).toBe("unknown");
  });
  it("bounds protocol-only scans and returns unknown rather than downloading all history", async () => {
    serve(Array.from({ length: 1000 }, (_, index) => event(index, false)));
    expect(await checkChatUnread({ ...cursor, messageId: null }, signal())).toBe("unknown");
    expect(
      vi.mocked(fetchMessagePage).mock.calls.reduce((sum, call) => sum + call[1].limit, 0),
    ).toBe(UNREAD_SCAN_LIMIT);
  });
  it("does not invent a read result for failed or inconsistent pages", async () => {
    vi.mocked(fetchMessagePage).mockRejectedValueOnce(new ApiError(404, "Missing chat."));
    await expect(checkChatUnread(cursor, signal())).rejects.toThrow("Missing chat");
    vi.mocked(fetchMessagePage).mockResolvedValueOnce({ data: [], offset: 0, hasMore: true });
    expect(await checkChatUnread(cursor, signal())).toBe("unknown");
  });
  it("counts unread content in any chat and checks the newest chat first", async () => {
    vi.mocked(fetchMessagePage).mockImplementation(async (id) => ({
      data: id === "older" ? [event(1)] : [],
      offset: 0,
      hasMore: false,
    }));
    expect(
      await checkWorkspaceUnread(
        [
          { sessionId: "older", messageId: null },
          { sessionId: "newer", messageId: null },
        ],
        signal(),
      ),
    ).toBe("unread");
    expect(vi.mocked(fetchMessagePage).mock.calls.map((call) => call[0])).toEqual([
      "newer",
      "older",
    ]);
  });
  it("never turns an incomplete chat scan into a read project", async () => {
    vi.mocked(fetchMessagePage).mockResolvedValue({ data: [], offset: 0, hasMore: true });
    expect(await checkWorkspaceUnread([cursor], signal())).toBe("unknown");
    expect(await checkWorkspaceUnread([], signal())).toBe("read");
  });
  it("preserves unknown availability failures but still finds unread content in another chat", async () => {
    vi.mocked(fetchMessagePage).mockRejectedValueOnce(new ApiError(404, "Missing chat."));
    expect(await checkWorkspaceUnread([cursor], signal())).toBe("unknown");
    vi.mocked(fetchMessagePage).mockRejectedValueOnce(new ApiError(503, "Unavailable."));
    vi.mocked(fetchMessagePage).mockResolvedValueOnce({
      data: [event(1)],
      offset: 0,
      hasMore: false,
    });
    expect(
      await checkWorkspaceUnread([{ sessionId: "older", messageId: null }, cursor], signal()),
    ).toBe("unread");
    vi.mocked(fetchMessagePage).mockRejectedValueOnce(new Error("Programming failure"));
    await expect(checkWorkspaceUnread([cursor], signal())).rejects.toThrow("Programming failure");
    vi.mocked(fetchMessagePage).mockRejectedValueOnce(new ApiError(401, "Unauthorized"));
    await expect(checkWorkspaceUnread([cursor], signal())).rejects.toThrow("Unauthorized");
  });
  it("stops after cancellation, including when a response arrives late", async () => {
    const controller = new AbortController();
    vi.mocked(fetchMessagePage).mockImplementation(async () => {
      controller.abort();
      return { data: [event(1)], offset: 0, hasMore: false };
    });
    await expect(checkChatUnread(cursor, controller.signal)).rejects.toThrow();
    vi.mocked(fetchMessagePage).mockClear();
    await expect(checkChatUnread(cursor, controller.signal)).rejects.toThrow();
    expect(fetchMessagePage).not.toHaveBeenCalled();
  });
  it("uses separate non-persisted queries, excluding archived chats at discovery", async () => {
    vi.mocked(fetchSessions).mockResolvedValue([]);
    const client = createQueryClient();
    await client.fetchQuery(unreadSessionsQuery("workspace", "activity"));
    expect(fetchSessions).toHaveBeenCalledWith("workspace", false, expect.any(AbortSignal));
    const first = workspaceUnreadQuery("workspace", "activity", [], [cursor]);
    const next = workspaceUnreadQuery(
      "workspace",
      "changed",
      [],
      [{ ...cursor, messageId: "new-read" }],
    );
    expect(first.queryKey).not.toEqual(next.queryKey);
    expect(first.meta).toBeUndefined();
    expect(first.refetchOnWindowFocus).toBe("always");
    expect(first.refetchInterval).toBe(60_000);
    client.clear();
  });
});
