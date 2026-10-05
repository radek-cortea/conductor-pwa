import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { writeCredential } from "@/auth/credential";
import { messagesKey, markRead } from "@/transcript/load";
import type { MessagesState } from "@/transcript/types";
import { queryClient } from "@/query-client";
import { API_ORIGIN, TEST_API_KEY } from "@/test/handlers";
import { renderApp } from "@/test/render-app";
import { worker } from "@/test/worker";

const link = "https://github.com/cortea/conductor/pull/123";
function cachePr(prLink = link) {
  const message = {
    id: "pr-message",
    sessionId: "ses-live",
    sessionIndex: 1,
    type: "agent",
    receivedAt: "2026-10-01T10:00:00Z",
    content: { type: "assistant", text: `PR: ${prLink}` },
  };
  queryClient.setQueryData<MessagesState>(messagesKey("ses-live"), {
    byOffset: { 1: message },
    entries: [],
    startOffset: 1,
    endOffset: 2,
    total: 2,
    tailId: message.id,
    pollHasMore: false,
    viewId: "cached-pr",
    initialPosition: "latest",
    unreadOffset: null,
    unsupportedFormats: [],
  });
  return message;
}

test("main list uses blue for unread content and a separate purple icon for verified merged PRs", async () => {
  writeCredential(TEST_API_KEY);
  const message = cachePr();
  markRead(queryClient, "ses-live", { messageId: "read", offset: 0, sessionIndex: 0 });
  let probes = 0;
  worker.use(
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, ({ request }) => {
      probes++;
      const url = new URL(request.url);
      expect(url.searchParams.get("after")).toBe("read");
      expect(url.searchParams.get("limit")).toBe("1");
      return HttpResponse.json({ data: [message], offset: 1, hasMore: false });
    }),
    http.get("https://api.github.com/repos/cortea/conductor/pulls/123", ({ request }) => {
      expect(request.headers.get("authorization")).toBeNull();
      return HttpResponse.json({ merged: true });
    }),
  );
  await renderApp("/workspaces");
  const unread = page.getByRole("img", { name: "Unread messages", exact: true });
  const merged = page.getByRole("img", { name: "PR merged", exact: true });
  await expect.element(unread).toBeVisible();
  await expect.element(merged).toBeVisible();
  expect(unread.element().classList.contains("bg-blue-600")).toBe(true);
  expect(merged.element().classList.contains("text-purple-900")).toBe(true);
  expect(merged.element().querySelector("svg")).not.toBeNull();
  expect(probes).toBeGreaterThan(0); // Only the unread cursor probes above; no transcript downloads/tail seeks.
});

test.each([false, "unavailable"])("does not use purple for %s PR status", async (merged) => {
  writeCredential(TEST_API_KEY);
  cachePr();
  let checks = 0;
  worker.use(
    http.get("https://api.github.com/repos/cortea/conductor/pulls/123", () => {
      checks++;
      return merged === "unavailable"
        ? HttpResponse.json({}, { status: 404 })
        : HttpResponse.json({ merged });
    }),
  );
  await renderApp("/workspaces");
  await expect.poll(() => checks).toBeGreaterThan(0);
  expect(page.getByRole("img", { name: "PR merged", exact: true }).query()).toBeNull();
  await expect
    .element(page.getByRole("img", { name: "Unread messages", exact: true }))
    .toBeVisible();
});

test("merged status does not leak to other projects sharing the same repository", async () => {
  writeCredential(TEST_API_KEY);
  cachePr();
  worker.use(
    http.get(`${API_ORIGIN}/v0/workspaces`, () =>
      HttpResponse.json({
        data: ["ws-ready", "ws-other"].map((id) => ({
          id,
          name: id === "ws-ready" ? "Known PR project" : "Unknown PR project",
          creatorId: "user-ada",
          state: "ready",
          repoUrl: "https://github.com/cortea/conductor",
          createdAt: "2026-10-01T00:00:00Z",
          deepLink: `conductor://workspaces/${id}`,
        })),
        offset: 0,
        hasMore: false,
      }),
    ),
    http.get(`${API_ORIGIN}/v0/workspaces/:workspaceId/sessions`, ({ params }) =>
      HttpResponse.json({
        data: [
          {
            id: params.workspaceId === "ws-ready" ? "ses-live" : "ses-other",
            deepLink: "conductor://sessions/synthetic",
          },
        ],
        offset: 0,
        hasMore: false,
      }),
    ),
    http.get("https://api.github.com/repos/cortea/conductor/pulls/123", () =>
      HttpResponse.json({ merged: true }),
    ),
  );
  await renderApp("/workspaces");
  const merged = page.getByRole("img", { name: "PR merged", exact: true });
  await expect.element(merged).toBeVisible();
  expect(
    page
      .getByRole("link", { name: /Known PR project/ })
      .element()
      .contains(merged.element()),
  ).toBe(true);
  expect(
    page
      .getByRole("link", { name: /Unknown PR project/ })
      .element()
      .querySelector('[aria-label="PR merged"]'),
  ).toBeNull();
});

test("cached PR links for unrelated repositories do not trigger a GitHub status request", async () => {
  writeCredential(TEST_API_KEY);
  cachePr("https://github.com/other/repository/pull/123");
  let checks = 0;
  worker.use(
    http.get("https://api.github.com/**", () => {
      checks++;
      return HttpResponse.json({ merged: true });
    }),
  );
  await renderApp("/workspaces");
  await expect
    .element(page.getByRole("img", { name: "Unread messages", exact: true }))
    .toBeVisible();
  expect(page.getByRole("img", { name: "PR merged", exact: true }).query()).toBeNull();
  expect(checks).toBe(0);
});
