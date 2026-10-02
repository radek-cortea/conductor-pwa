import { http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { writeCredential } from "@/auth/credential";
import { rememberChat } from "@/lib/chats";
import { API_ORIGIN, requestsTo, TEST_API_KEY } from "@/test/handlers";
import { renderApp } from "@/test/render-app";
import { worker } from "@/test/worker";

function twoChats() {
  worker.use(
    http.get(`${API_ORIGIN}/v0/workspaces/:workspaceId/sessions`, () =>
      HttpResponse.json({
        data: [
          { id: "ses-live", name: "Login form", deepLink: "conductor://sessions/ses-live" },
          { id: "ses-new", name: "Opening chat", deepLink: "conductor://sessions/ses-new" },
        ],
        offset: 0,
        hasMore: false,
      }),
    ),
  );
}

test("workspace opens the last chat, switches tabs, and remembers the selection", async () => {
  writeCredential(TEST_API_KEY);
  twoChats();
  await renderApp("/workspaces/ws-ready");

  await expect
    .element(page.getByRole("tab", { name: /Opening chat/, selected: true }))
    .toBeVisible();
  expect(page.getByRole("heading", { name: "Opening chat" }).query()).toBeNull();
  await userEvent.fill(page.getByLabelText("Message"), "Unsent draft");
  await userEvent.click(page.getByRole("tab", { name: /Login form/ }));
  await expect.element(page.getByRole("tab", { name: /Login form/, selected: true })).toBeVisible();
  expect(page.getByRole("heading", { name: "Login form" }).query()).toBeNull();
  await expect.element(page.getByLabelText("Message")).toHaveValue("");

  await userEvent.click(page.getByRole("link", { name: "Workspaces", exact: true }));
  await expect.element(page.getByRole("main", { name: "Workspaces" })).toBeVisible();
  await userEvent.click(page.getByRole("link", { name: /Billing export/ }));
  await expect.element(page.getByRole("tab", { name: /Login form/, selected: true })).toBeVisible();
  await expect.element(page.getByLabelText("Message")).toBeVisible();
});

test("chat tabs support keyboard navigation", async () => {
  writeCredential(TEST_API_KEY);
  twoChats();
  await renderApp("/workspaces/ws-ready");
  await expect
    .element(page.getByRole("tab", { name: /Opening chat/, selected: true }))
    .toBeVisible();
  await userEvent.click(page.getByRole("tab", { name: /Opening chat/ }));
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(page.getByRole("tab", { name: /Login form/, selected: true })).toBeVisible();
  await userEvent.keyboard("{End}");
  await expect
    .element(page.getByRole("tab", { name: /Opening chat/, selected: true }))
    .toBeVisible();
});

test("missing or archived remembered chats fall back to the last available chat", async () => {
  writeCredential(TEST_API_KEY);
  rememberChat("ws-ready", "ses-archived");
  twoChats();
  await renderApp("/workspaces/ws-ready");
  await expect
    .element(page.getByRole("tab", { name: /Opening chat/, selected: true }))
    .toBeVisible();
});

test("new chat creates a tab and opens it", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces/ws-ready");
  await expect.element(page.getByRole("tab", { name: /Login form/, selected: true })).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "New chat", exact: true }));
  await userEvent.fill(page.getByLabelText("Opening message"), "Check the tests");
  await userEvent.click(page.getByRole("button", { name: "Start chat" }));

  await expect
    .poll(() => requestsTo("POST", "/v0/sessions").at(-1)?.body)
    .toMatchObject({
      workspaceId: "ws-ready",
      message: "Check the tests",
    });
  await expect.element(page.getByRole("tab", { name: /New chat/, selected: true })).toBeVisible();
  await expect.element(page.getByLabelText("Message")).toBeVisible();
});

test("the project header replaces the account bar and duplicate title row", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces/ws-ready");
  await expect
    .element(page.getByRole("heading", { name: "Billing export", exact: true }))
    .toBeVisible();
  const headers = document.querySelectorAll("header");
  expect(headers).toHaveLength(1);
  const header = headers[0]!;
  expect(header.querySelector("h1")?.textContent).toBe("Billing export");
  expect(
    header.contains(page.getByRole("link", { name: "Workspaces", exact: true }).element()),
  ).toBe(true);
  expect(
    header.contains(page.getByRole("button", { name: "Workspace actions", exact: true }).element()),
  ).toBe(true);
  expect(page.getByRole("link", { name: "Workspaces", exact: true }).element().textContent).toBe(
    "",
  );
  expect(page.getByRole("button", { name: "ada@example.com" }).query()).toBeNull();
  await userEvent.click(page.getByRole("link", { name: "Workspaces", exact: true }));
  await expect.element(page.getByRole("button", { name: "ada@example.com" })).toBeVisible();
  await expect.element(page.getByRole("link", { name: "Create", exact: true })).toBeVisible();
});

test("workspace uses icon controls and keeps archived chats in the tab menu", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces/ws-ready");
  await expect.element(page.getByRole("tab", { name: /Login form/, selected: true })).toBeVisible();
  await expect.element(page.getByRole("link", { name: "Workspaces", exact: true })).toBeVisible();
  expect(page.getByText("https://github.com/cortea/conductor").query()).toBeNull();
  expect(page.getByText("Copy link").query()).toBeNull();
  expect(page.getByRole("heading", { name: "Login form" }).query()).toBeNull();
  expect(page.getByRole("link", { name: "Open in Mac app" }).query()).toBeNull();
  await expect.element(page.getByRole("img", { name: "Working" })).toBeVisible();
  expect(page.getByRole("menuitemcheckbox", { name: "Show archived chats" }).query()).toBeNull();

  await userEvent.click(page.getByRole("button", { name: "Chat tab menu" }));
  await expect
    .element(page.getByRole("menuitemcheckbox", { name: "Show archived chats" }))
    .toHaveAttribute("aria-checked", "false");
  await userEvent.click(page.getByRole("menuitemcheckbox", { name: "Show archived chats" }));
  await expect.element(page.getByRole("tab", { name: /Login form/, selected: true })).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Chat tab menu" }));
  await expect
    .element(page.getByRole("menuitemcheckbox", { name: "Show archived chats" }))
    .toHaveAttribute("aria-checked", "true");
  await userEvent.keyboard("{Escape}");
  await userEvent.click(page.getByRole("button", { name: "Workspace actions" }));
  await expect.element(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect.element(page.getByRole("menuitem", { name: "Copy Mac app link" })).toBeVisible();
  await expect
    .element(page.getByRole("menuitem", { name: "Open in Mac app" }))
    .toHaveAttribute("href", "conductor://workspaces/ws-ready");
});

function withPullRequest() {
  worker.use(
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, () =>
      HttpResponse.json({
        data: [
          {
            id: "pr-answer",
            sessionId: "ses-live",
            sessionIndex: 0,
            type: "agent",
            receivedAt: "2026-10-01T10:00:00Z",
            content: {
              type: "assistant",
              message: {
                role: "assistant",
                content: [
                  { type: "text", text: "PR: https://github.com/cortea/conductor/pull/123" },
                ],
              },
            },
          },
        ],
        offset: 0,
        hasMore: false,
      }),
    ),
  );
}

test("workspace actions copy Mac and matching GitHub PR links", async () => {
  writeCredential(TEST_API_KEY);
  withPullRequest();
  const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  try {
    await renderApp("/workspaces/ws-ready");
    await expect
      .element(page.getByRole("tab", { name: /Login form/, selected: true }))
      .toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Workspace actions" }));
    await userEvent.click(page.getByRole("menuitem", { name: "Copy Mac app link" }));
    expect(clipboard).toHaveBeenLastCalledWith("conductor://workspaces/ws-ready");
    await userEvent.click(page.getByRole("button", { name: "Workspace actions" }));
    await userEvent.click(page.getByRole("menuitem", { name: "Copy GitHub PR link" }));
    expect(clipboard).toHaveBeenLastCalledWith("https://github.com/cortea/conductor/pull/123");
  } finally {
    clipboard.mockRestore();
  }
});

test("merged PR appears between the project header and tabs and archives the project", async () => {
  writeCredential(TEST_API_KEY);
  withPullRequest();
  let checks = 0;
  let archives = 0;
  worker.use(
    http.get("https://api.github.com/repos/cortea/conductor/pulls/123", ({ request }) => {
      checks++;
      expect(request.headers.get("authorization")).toBeNull();
      return HttpResponse.json({ merged: true });
    }),
    http.post(`${API_ORIGIN}/v0/workspaces/ws-ready/archive`, () => {
      archives++;
      return HttpResponse.json({ workspaceId: "ws-ready", status: "archived" });
    }),
  );
  await renderApp("/workspaces/ws-ready");
  const banner = page.getByRole("status", { name: "Pull request merged" });
  await expect.element(banner).toBeVisible();
  expect(checks).toBeGreaterThan(0);
  expect(banner.element().previousElementSibling?.tagName).toBe("HEADER");
  expect(banner.element().nextElementSibling?.querySelector('[role="tablist"]')).not.toBeNull();
  expect(banner.element().classList.contains("text-purple-900")).toBe(true);
  await userEvent.click(page.getByRole("button", { name: "Archive", exact: true }));
  await expect.element(page.getByRole("main", { name: "Workspaces" })).toBeVisible();
  expect(archives).toBe(1);
});

test.each([false, "unavailable"])(
  "does not show merged banner for %s GitHub status",
  async (merged) => {
    writeCredential(TEST_API_KEY);
    withPullRequest();
    let checks = 0;
    worker.use(
      http.get("https://api.github.com/repos/cortea/conductor/pulls/123", () => {
        checks++;
        return merged === "unavailable"
          ? HttpResponse.json({ message: "Not Found" }, { status: 404 })
          : HttpResponse.json({ merged });
      }),
    );
    await renderApp("/workspaces/ws-ready");
    await expect.poll(() => checks).toBeGreaterThan(0);
    expect(page.getByText("PR merged", { exact: true }).query()).toBeNull();
    await expect.element(page.getByLabelText("Message")).toBeVisible();
  },
);

test("a workspace without chats keeps new chat available", async () => {
  writeCredential(TEST_API_KEY);
  worker.use(
    http.get(`${API_ORIGIN}/v0/workspaces/:workspaceId/sessions`, () =>
      HttpResponse.json({ data: [], offset: 0, hasMore: false }),
    ),
  );
  await renderApp("/workspaces/ws-ready");
  await expect
    .element(page.getByText("No chats in this workspace yet. Start a new chat."))
    .toBeVisible();
  await expect.element(page.getByRole("button", { name: "New chat", exact: true })).toBeVisible();
});
