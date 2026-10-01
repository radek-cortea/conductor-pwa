import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { messagesQuery } from "@/api/queries";
import { loadSession } from "@/pages/loaders";

const { fetchMessages } = vi.hoisted(() => ({
  fetchMessages: vi.fn<(signal: AbortSignal) => Promise<unknown>>(),
}));
vi.mock("@/api/queries", () => {
  const fixed = (queryKey: readonly unknown[], data: unknown) => ({
    queryKey,
    queryFn: async () => data,
  });
  return {
    meQuery: () => fixed(["me"], {}),
    projectsQuery: () => fixed(["projects"], []),
    workspacesQuery: () => fixed(["workspaces"], []),
    workspaceQuery: (id: string) => fixed(["workspaces", id], {}),
    sessionsQuery: (id: string) => fixed(["workspaces", id, "sessions"], []),
    sessionQuery: (id: string) => fixed(["sessions", id], { id }),
    sessionStatusQuery: (id: string) => fixed(["sessions", id, "status"], { status: "idle" }),
    messagesQuery: (id: string) => ({
      queryKey: ["sessions", id, "messages"],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchMessages(signal),
    }),
  };
});

let client: QueryClient;
beforeEach(() => {
  fetchMessages.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());
function start(abortController = new AbortController()) {
  return loadSession({
    context: { queryClient: client },
    abortController,
    params: { sessionId: "chat" },
  });
}

describe("route/query cancellation lifecycle", () => {
  it("rejoins the request after the last observer is removed and remounted", async () => {
    let finish!: (value: unknown) => void;
    fetchMessages.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const loading = start();
    await vi.waitFor(() => expect(fetchMessages).toHaveBeenCalledTimes(1));
    const observer = new QueryObserver(client, messagesQuery("chat"));
    const unsubscribe = observer.subscribe(() => {});
    unsubscribe(); // StrictMode/Suspense removes the last observer, cancelling the shared request.
    const remounted = observer.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(fetchMessages).toHaveBeenCalledTimes(2));
      finish("loaded");
      expect((await loading)[2]).toBe("loaded");
      expect(client.getQueryState(["sessions", "chat", "messages"])?.error).toBeNull();
    } finally {
      remounted();
    }
  });

  it("does not restart requests when the route itself is aborted", async () => {
    fetchMessages.mockImplementation(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    const abort = new AbortController();
    const rejected = expect(start(abort)).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(fetchMessages).toHaveBeenCalledTimes(1));
    abort.abort();
    await rejected;
    expect(fetchMessages).toHaveBeenCalledTimes(1);
  });

  it.each([new ApiError(500, "Server failed"), new TypeError("Unexpected data")])(
    "does not swallow actual failures: %s",
    async (error) => {
      fetchMessages.mockRejectedValue(error);
      await expect(start()).rejects.toBe(error);
      expect(fetchMessages).toHaveBeenCalledTimes(1);
    },
  );
});
