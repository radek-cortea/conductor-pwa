import { delay, http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { writeCredential } from "@/auth/credential";
import { queryClient } from "@/query-client";
import { API_ORIGIN, TEST_API_KEY } from "@/test/handlers";
import { renderApp } from "@/test/render-app";
import { worker } from "@/test/worker";
import { markRead, readPositionKey } from "@/transcript/load";

function message(id: string, sessionId: string, index = 0, text = "New reply") {
  return {
    id,
    sessionId,
    sessionIndex: index,
    type: "agent",
    receivedAt: "2026-10-01T10:00:00Z",
    content: { type: "assistant", text },
  };
}
function serveMessages(rows: ReturnType<typeof message>[], probes: string[] = []) {
  worker.use(
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, ({ request, params }) => {
      const url = new URL(request.url);
      const after = url.searchParams.get("after");
      const chat = rows.filter((row) => row.sessionId === params.sessionId);
      const offset = after
        ? chat.findIndex((row) => row.id === after) + 1
        : Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 16);
      probes.push(String(params.sessionId));
      return HttpResponse.json({
        data: chat.slice(offset, offset + limit),
        offset,
        hasMore: offset + limit < chat.length,
      });
    }),
  );
}
function unreadDot() {
  return page.getByRole("img", { name: "Unread messages", exact: true });
}

test("unread dots use local cursors across all non-archived chats and clear only after reading", async () => {
  writeCredential(TEST_API_KEY);
  worker.use(
    http.get(`${API_ORIGIN}/v0/workspaces/:workspaceId/sessions`, () =>
      HttpResponse.json({
        data: [
          { id: "older", deepLink: "conductor://sessions/older" },
          { id: "read", deepLink: "conductor://sessions/read" },
          {
            id: "archived",
            archivedAt: "2026-10-01T00:00:00Z",
            deepLink: "conductor://sessions/archived",
          },
        ],
        offset: 0,
        hasMore: false,
      }),
    ),
  );
  const probes: string[] = [];
  serveMessages(
    [
      message("old-unread", "older"),
      message("already-read", "read"),
      message("archived-unread", "archived"),
    ],
    probes,
  );
  markRead(queryClient, "read", { messageId: "already-read", offset: 0, sessionIndex: 0 });
  await renderApp("/workspaces");
  await expect.element(unreadDot()).toBeVisible();
  expect(probes).toContain("older");
  expect(probes).not.toContain("archived");
  expect(queryClient.getQueryData(readPositionKey("older"))).toBeUndefined();
  markRead(queryClient, "older", { messageId: "old-unread", offset: 0, sessionIndex: 0 });
  await expect.poll(() => unreadDot().query()).toBeNull();
  await expect.element(page.getByText("Billing export")).toBeVisible();
});

test("opening a project alone does not clear unread, but viewing the latest reply does", async () => {
  writeCredential(TEST_API_KEY);
  serveMessages([
    message("read", "ses-live", 0),
    message("long-reply", "ses-live", 1, "Unread content.\n\n".repeat(250)),
    message("latest", "ses-live", 2, "Final short reply"),
  ]);
  markRead(queryClient, "ses-live", { messageId: "read", offset: 0, sessionIndex: 0 });
  await renderApp("/workspaces");
  await expect.element(unreadDot()).toBeVisible();
  await userEvent.click(page.getByRole("link", { name: /Billing export/ }));
  await expect.element(page.getByRole("log", { name: "Conversation" })).toBeVisible();
  expect(queryClient.getQueryData(readPositionKey("ses-live"))).toMatchObject({
    messageId: "read",
  });
  await userEvent.click(page.getByRole("link", { name: "Workspaces", exact: true }));
  await expect.element(unreadDot()).toBeVisible();
  await userEvent.click(page.getByRole("link", { name: /Billing export/ }));
  const log = page.getByRole("log", { name: "Conversation" });
  await expect.element(log).toBeVisible();
  log.element().scrollTop = log.element().scrollHeight;
  await expect
    .poll(() => queryClient.getQueryData(readPositionKey("ses-live")))
    .toMatchObject({ messageId: "latest" });
  await userEvent.click(page.getByRole("link", { name: "Workspaces", exact: true }));
  await expect.element(page.getByRole("main", { name: "Workspaces" })).toBeVisible();
  await expect.poll(() => unreadDot().query()).toBeNull();
});

test("slow and unavailable unread checks never block the home list or claim a project is read", async () => {
  writeCredential(TEST_API_KEY);
  worker.use(
    http.get(`${API_ORIGIN}/v0/workspaces/:workspaceId/sessions`, async () => {
      await delay(1500);
      return HttpResponse.json({ message: "Unavailable" }, { status: 503 });
    }),
  );
  await renderApp("/workspaces");
  await expect.element(page.getByRole("link", { name: /Billing export/ })).toBeVisible();
  await expect.element(page.getByRole("link", { name: "Create", exact: true })).toBeVisible();
  expect(page.getByText("Unread status unavailable").query()).toBeNull();
  await expect.element(page.getByText("Unread status unavailable")).toBeInTheDocument();
  expect(unreadDot().query()).toBeNull();
});

test("offscreen rows are checked lazily and background request concurrency is bounded", async () => {
  writeCredential(TEST_API_KEY);
  let active = 0;
  let maximum = 0;
  const checked: string[] = [];
  const originalFetch = window.fetch.bind(window);
  // Count live client requests, not mock-server handlers that keep running after abort.
  const fetchSpy = vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (
      !url.startsWith(`${API_ORIGIN}/v0/workspaces/`) ||
      !new URL(url).pathname.endsWith("/sessions")
    ) {
      return originalFetch(input, init);
    }
    maximum = Math.max(maximum, ++active);
    try {
      return await originalFetch(input, init);
    } finally {
      active--;
    }
  });
  worker.use(
    http.get(`${API_ORIGIN}/v0/workspaces`, () =>
      HttpResponse.json({
        data: Array.from({ length: 40 }, (_, index) => ({
          id: `ws-${index}`,
          name: `Project ${index}`,
          creatorId: "user-ada",
          state: "ready",
          repoUrl: "https://github.com/cortea/conductor",
          createdAt: "2026-10-01T00:00:00Z",
          deepLink: `conductor://workspaces/ws-${index}`,
        })),
        offset: 0,
        hasMore: false,
      }),
    ),
    http.get(`${API_ORIGIN}/v0/workspaces/:workspaceId/sessions`, async ({ params }) => {
      checked.push(String(params.workspaceId));
      await delay(100);
      return HttpResponse.json({ data: [], offset: 0, hasMore: false });
    }),
  );
  try {
    await renderApp("/workspaces");
    await expect.poll(() => checked.length).toBeGreaterThan(0);
    expect(checked).not.toContain("ws-39");
    const list = page.getByRole("region", { name: "Workspace list" });
    list.element().scrollTop = list.element().scrollHeight;
    await expect.poll(() => checked.includes("ws-39")).toBe(true);
    expect(maximum).toBeGreaterThan(0);
    expect(maximum).toBeLessThanOrEqual(3);
  } finally {
    fetchSpy.mockRestore();
  }
});

test("unread checks pause while hidden and recheck immediately on resume", async () => {
  writeCredential(TEST_API_KEY);
  let visibility: DocumentVisibilityState = "visible";
  const visibilitySpy = vi
    .spyOn(document, "visibilityState", "get")
    .mockImplementation(() => visibility);
  let checks = 0;
  let hasNewContent = false;
  worker.use(
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, () => {
      checks++;
      return HttpResponse.json({
        data: hasNewContent ? [message("new", "ses-live")] : [],
        offset: 0,
        hasMore: false,
      });
    }),
  );
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    await renderApp("/workspaces");
    await expect.poll(() => checks).toBeGreaterThan(0);
    await expect.poll(() => queryClient.isFetching()).toBe(0);
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await expect
      .poll(() =>
        queryClient
          .getQueryCache()
          .findAll({ queryKey: ["workspace-unread"] })
          .some((query) => query.isActive()),
      )
      .toBe(false);
    const before = checks;
    hasNewContent = true;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(checks).toBe(before);
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await expect.element(unreadDot()).toBeVisible();
    expect(checks).toBeGreaterThan(before);
  } finally {
    visibilitySpy.mockRestore();
    document.dispatchEvent(new Event("visibilitychange"));
    vi.useRealTimers();
  }
});

test("late unread responses cannot restore an account's state after sign-out", async () => {
  writeCredential(TEST_API_KEY);
  let probes = 0;
  worker.use(
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, async () => {
      probes++;
      await delay(300);
      return HttpResponse.json({ data: [message("late", "ses-live")], offset: 0, hasMore: false });
    }),
  );
  await renderApp("/workspaces");
  await expect.poll(() => probes).toBeGreaterThan(0);
  await userEvent.click(page.getByRole("button", { name: "ada@example.com" }));
  await userEvent.click(page.getByRole("menuitem", { name: "Sign out" }));
  await expect.element(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await delay(400);
  expect(queryClient.getQueryCache().findAll({ queryKey: ["workspace-unread"] })).toHaveLength(0);
  expect(queryClient.getQueryData(readPositionKey("ses-live"))).toBeUndefined();
});

test("minute polling detects new replies and logout clears unread state", async () => {
  writeCredential(TEST_API_KEY);
  let mergedRows = [message("read", "ses-live")];
  let checks = 0;
  worker.use(
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, () => {
      checks++;
      return HttpResponse.json({ data: mergedRows.slice(1), offset: 1, hasMore: false });
    }),
  );
  markRead(queryClient, "ses-live", { messageId: "read", sessionIndex: 0, offset: 0 });
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    await renderApp("/workspaces");
    await expect.poll(() => checks).toBeGreaterThan(0);
    await expect.poll(() => queryClient.isFetching()).toBe(0);
    expect(unreadDot().query()).toBeNull();
    mergedRows = [...mergedRows, message("new", "ses-live", 1)];
    await vi.advanceTimersByTimeAsync(60_000);
    await expect.element(unreadDot()).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "ada@example.com" }));
    await userEvent.click(page.getByRole("menuitem", { name: "Sign out" }));
    await expect.element(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    expect(queryClient.getQueryData(readPositionKey("ses-live"))).toBeUndefined();
    expect(queryClient.getQueryCache().findAll({ queryKey: ["workspace-unread"] })).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});
