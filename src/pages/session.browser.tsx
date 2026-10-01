import { delay, http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { writeCredential } from "@/auth/credential";
import { API_ORIGIN, requestsTo, TEST_API_KEY } from "@/test/handlers";
import { worker } from "@/test/worker";
import { assistantFixture, toolFixture, unknownFixture } from "@/transcript/fixtures";
import { markRead, messagesKey, MESSAGE_PAGE_SIZE } from "@/transcript/load";
import type { MessagesState } from "@/transcript/types";
import type { TranscriptMessage } from "@/api/types";
import { queryClient } from "@/query-client";
import { renderApp } from "@/test/render-app";

function serveTranscript(messages: TranscriptMessage[]) {
  const requests: { offset: number; limit: number; after: boolean }[] = [];
  worker.use(
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      const after = query.get("after");
      const offset = after
        ? messages.findIndex((message) => message.id === after) + 1
        : Number(query.get("offset") ?? 0);
      const limit = Number(query.get("limit") ?? 100);
      requests.push({ offset, limit, after: Boolean(after) });
      return HttpResponse.json({
        data: messages.slice(offset, offset + limit),
        offset,
        hasMore: offset + limit < messages.length,
      });
    }),
  );
  return requests;
}
function answers(count: number) {
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

test.each(["messages", "status"])("a cold chat survives a slow %s request and StrictMode observer remounts", async (resource) => {
  writeCredential(TEST_API_KEY);
  worker.use(
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/${resource}`, async ({ request }) => {
      await delay(1_500);
      if (resource === "status") return HttpResponse.json({ status: "working" });
      const url = new URL(request.url);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const rows = url.searchParams.has("after") ? [] : [assistantFixture];
      return HttpResponse.json({ data: rows, offset, hasMore: false });
    }),
  );
  const errors = vi.spyOn(console, "error");
  try {
    await renderApp("/workspaces/ws-ready/sessions/ses-live");
    await expect.element(page.getByText("The login form validates the API key before it is stored."), { timeout: 8_000 }).toBeVisible();
    await expect.element(page.getByLabelText("Message")).toBeVisible();
    expect(page.getByRole("heading", { name: "Could not load this page" }).query()).toBeNull();
    expect(errors).not.toHaveBeenCalled();
  } finally { errors.mockRestore(); }
});

test("session renders assistant text, sends a prompt, and appends the next poll", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect
    .element(page.getByText("The login form validates the API key before it is stored."))
    .toBeVisible();
  expect(page.getByText("Unrecognised event").query()).toBeNull();
  expect(page.getByRole("button", { name: "Load more messages" }).query()).toBeNull();
  const prompt = "Check the empty state";
  await userEvent.fill(page.getByLabelText("Message"), prompt);
  await userEvent.click(page.getByRole("button", { name: "Send", exact: true }));
  await expect
    .poll(() => requestsTo("POST", "/v0/sessions/ses-live/messages").at(-1)?.body)
    .toEqual({ message: prompt });
  await expect.element(page.getByText(prompt)).toBeVisible();
  await expect
    .element(page.getByText("The empty state invites you to start a workspace."), {
      timeout: 8_000,
    })
    .toBeVisible();
});

test("send and cancel controls are inside the prompt textarea", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByLabelText("Message")).toBeVisible();
  const input = page.getByLabelText("Message").element().getBoundingClientRect();
  for (const name of ["Send", "Cancel turn"]) {
    const button = page
      .getByRole("button", { name, exact: true })
      .element()
      .getBoundingClientRect();
    expect(button.left).toBeGreaterThanOrEqual(input.left);
    expect(button.right).toBeLessThanOrEqual(input.right);
    expect(button.top).toBeGreaterThanOrEqual(input.top);
    expect(button.bottom).toBeLessThanOrEqual(input.bottom);
  }
});

test("chat scrolls to the answer while keeping the composer on screen", async () => {
  writeCredential(TEST_API_KEY);
  serveTranscript([
    ...Array.from({ length: 60 }, (_, index) => ({
      ...toolFixture,
      id: `tool-${index}`,
      sessionIndex: index,
    })),
    { ...assistantFixture, sessionIndex: 60 },
  ]);
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  const answer = page.getByText("The login form validates the API key before it is stored.");
  await expect.element(answer).toBeVisible();
  await expect
    .poll(() => answer.element().getBoundingClientRect().bottom)
    .toBeLessThanOrEqual(window.innerHeight);
  expect(
    page.getByLabelText("Message").element().getBoundingClientRect().bottom,
  ).toBeLessThanOrEqual(window.innerHeight);
});

test("a 2,161-event chat seeks its final answer before filling the viewport", async () => {
  writeCredential(TEST_API_KEY);
  const data = answers(2161).map((message, index) => ({
    ...message,
    content: index === 2156 ? message.content : { type: "system" },
  }));
  const requests = serveTranscript(data);
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  const answer = page.getByText("Answer 2156.");
  await expect.element(answer, { timeout: 8_000 }).toBeVisible();
  await expect
    .poll(() => answer.element().getBoundingClientRect().bottom)
    .toBeLessThanOrEqual(window.innerHeight);
  const firstWindow = requests.findIndex(
    (request) => request.offset >= 2145 && request.limit === MESSAGE_PAGE_SIZE,
  );
  expect(firstWindow).toBeGreaterThan(0);
  expect(
    requests.slice(0, firstWindow + 1).reduce((sum, request) => sum + request.limit, 0),
  ).toBeLessThan(100);
  expect(page.getByRole("button", { name: "Load more messages" }).query()).toBeNull();
});

test("blank viewport space automatically fetches more history", async () => {
  writeCredential(TEST_API_KEY);
  const data = answers(80).map((message, index) => ({
    ...message,
    content: [10, 30, 50, 79].includes(index) ? message.content : { type: "system" },
  }));
  serveTranscript(data);
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByText("Answer 79.")).toBeVisible();
  await expect
    .poll(() => queryClient.getQueryData<MessagesState>(messagesKey("ses-live"))?.startOffset)
    .toBe(0);
  await expect.element(page.getByText("Answer 10.")).toBeVisible();
});

test("scrolling up loads older messages and preserves the visible row", async () => {
  writeCredential(TEST_API_KEY);
  serveTranscript(answers(200));
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByText("Answer 199.")).toBeVisible();
  const viewport = page.getByRole("log", { name: "Conversation" }).element();
  viewport.scrollTop = 0;
  viewport.dispatchEvent(new Event("scroll"));
  await expect
    .poll(() => queryClient.getQueryData<MessagesState>(messagesKey("ses-live"))?.startOffset)
    .toBe(168);
  const row = page.getByText("Answer 184.").element().getBoundingClientRect();
  expect(row.top).toBeGreaterThanOrEqual(viewport.getBoundingClientRect().top - 1);
  expect(row.top).toBeLessThan(viewport.getBoundingClientRect().top + 50);
  viewport.scrollTop = 0;
  viewport.dispatchEvent(new Event("scroll"));
  await expect
    .poll(() => queryClient.getQueryData<MessagesState>(messagesKey("ses-live"))?.startOffset)
    .toBe(152);
});

test("opening a chat begins at unread messages, not at the latest answer", async () => {
  writeCredential(TEST_API_KEY);
  serveTranscript(answers(100));
  markRead(queryClient, "ses-live", { messageId: "event-30", sessionIndex: 30, offset: 30 });
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByText("Answer 31.")).toBeVisible();
  const state = queryClient.getQueryData<MessagesState>(messagesKey("ses-live"))!;
  expect(state.initialPosition).toBe("unread");
  expect(state.unreadOffset).toBe(31);
  const viewport = page
    .getByRole("log", { name: "Conversation" })
    .element()
    .getBoundingClientRect();
  expect(page.getByText("Answer 31.").element().getBoundingClientRect().top).toBeLessThan(
    viewport.top + 50,
  );
  expect(page.getByText("Answer 99.").query()).toBeNull();
});

test("a touch swipe at the unread boundary loads older messages without requiring a scroll event", async () => {
  writeCredential(TEST_API_KEY);
  serveTranscript(answers(100));
  markRead(queryClient, "ses-live", { messageId: "event-30", sessionIndex: 30, offset: 30 });
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByText("Answer 31.")).toBeVisible();
  const viewport = page.getByRole("log", { name: "Conversation" }).element();
  expect(viewport.scrollTop).toBe(0);
  viewport.dispatchEvent(
    Object.assign(new Event("touchstart", { bubbles: true }), { touches: [{ clientY: 200 }] }),
  );
  viewport.dispatchEvent(
    Object.assign(new Event("touchmove", { bubbles: true }), { touches: [{ clientY: 245 }] }),
  );
  await expect
    .poll(() => queryClient.getQueryData<MessagesState>(messagesKey("ses-live"))?.startOffset)
    .toBe(15);
});

test("wrapped arrays and NDJSON payloads render rather than crashing the chat", async () => {
  writeCredential(TEST_API_KEY);
  serveTranscript([
    {
      ...assistantFixture,
      content: {
        type: "agentMessage",
        rawPayload: {
          body: [
            JSON.stringify({ type: "system" }) +
              "\n" +
              JSON.stringify({
                type: "assistant",
                message: {
                  role: "assistant",
                  content: [{ type: "text", text: "The wrapped final response." }],
                },
              }),
            { type: "text", text: { malformed: true } },
          ],
        },
      },
    },
  ]);
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByText("The wrapped final response.")).toBeVisible();
  await expect.element(page.getByLabelText("Message")).toBeVisible();
});

test("unsupported agent formats offer structural diagnostics without exposing message text", async () => {
  writeCredential(TEST_API_KEY);
  serveTranscript([
    {
      ...unknownFixture,
      content: {
        type: "agentMessage",
        unfamiliarContainer: { text: "Private prompt", apiKey: "private-key" },
      },
    },
  ]);
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect
    .element(page.getByText("Some agent messages use an unsupported format."))
    .toBeVisible();
  await expect.element(page.getByRole("button", { name: "Copy event format" })).toBeVisible();
  expect(page.getByText("Private prompt").query()).toBeNull();
});

test("a malformed message page leaves navigation available instead of throwing a render error", async () => {
  writeCredential(TEST_API_KEY);
  worker.use(
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, () =>
      HttpResponse.json({ data: null, offset: 0, hasMore: false }),
    ),
  );
  await renderApp(
    "/workspaces/b33e8a95-b827-461a-95f8-4e5c8b1ff9ee/sessions/2dc86f2d-466b-4e76-9a71-d8b0afaeeb60?archived=false",
  );
  await expect
    .element(page.getByRole("heading", { name: "Could not load this page" }))
    .toBeVisible();
  await expect
    .element(page.getByText("Conductor returned an unsupported message-page format."))
    .toBeVisible();
  await expect.element(page.getByRole("link", { name: "Conductor PWA" })).toBeVisible();
});

test("cancel posts to the cancel route", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByRole("button", { name: "Cancel turn" })).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Cancel turn" }));
  await expect.poll(() => requestsTo("POST", "/v0/sessions/ses-live/cancel")).toHaveLength(1);
});
