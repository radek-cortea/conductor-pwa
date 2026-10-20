import { delay, http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { writeCredential } from "@/auth/credential";
import { API_ORIGIN, requestsTo, TEST_API_KEY } from "@/test/handlers";
import { worker } from "@/test/worker";
import {
  assistantFixture,
  thinkingFixture,
  toolFixture,
  unknownFixture,
  userFixture,
} from "@/transcript/fixtures";
import { messagesKey, MESSAGE_PAGE_SIZE } from "@/transcript/load";
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

test.each(["messages", "status"])(
  "a cold chat survives a slow %s request and StrictMode observer remounts",
  async (resource) => {
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
      await expect
        .element(page.getByText("The login form validates the API key before it is stored."), {
          timeout: 8_000,
        })
        .toBeVisible();
      await expect.element(page.getByLabelText("Message")).toBeVisible();
      expect(page.getByRole("heading", { name: "Could not load this page" }).query()).toBeNull();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  },
);

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

test("instructions, thinking and tools are collapsed, and final answers have no special decoration", async () => {
  writeCredential(TEST_API_KEY);
  serveTranscript([
    {
      ...userFixture,
      sessionIndex: 0,
      content: {
        type: "userMessage",
        message: "<system_instruction>Hidden instruction rule.</system_instruction>\nDo the work.",
      },
    },
    {
      ...toolFixture,
      sessionIndex: 1,
      content: {
        turnId: "turn",
        rawPayload: {
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", id: "call", name: "Shell", input: { command: "echo hello" } },
            ],
          },
        },
      },
    },
    {
      ...toolFixture,
      id: "tool-result",
      sessionIndex: 2,
      content: {
        rawPayload: {
          type: "user",
          message: {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: "call", content: "hello" }],
          },
        },
      },
    },
    { ...thinkingFixture, sessionIndex: 3 },
    {
      ...assistantFixture,
      sessionIndex: 4,
      content: {
        turnId: "turn",
        rawPayload: {
          type: "assistant",
          message: {
            stop_reason: "end_turn",
            content: [{ type: "text", text: "The final answer." }],
          },
        },
      },
    },
    {
      ...assistantFixture,
      id: "result",
      sessionIndex: 5,
      content: {
        turnId: "turn",
        rawPayload: { type: "result", subtype: "success", result: "The final answer." },
      },
    },
  ]);
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByText("The final answer.", { exact: true })).toBeVisible();
  expect(page.getByText("Final response", { exact: true }).query()).toBeNull();
  expect(page.getByText("Final message", { exact: true }).query()).toBeNull();
  const finalReply = page
    .getByText("The final answer.", { exact: true })
    .element()
    .closest<HTMLElement>(".transcript-markdown")!;
  expect(finalReply.className).toBe("transcript-markdown");
  const finalStyle = getComputedStyle(finalReply);
  expect(finalStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(finalStyle.borderLeftWidth).toBe("0px");
  expect(finalStyle.padding).toBe("0px");
  const thinking = page.getByText("Thinking", { exact: true }).element();
  const tool = page.getByText("Tool · Shell", { exact: true }).element();
  expect(thinking.closest("details")!.className).toBe(tool.closest("details")!.className);
  const thinkingStyle = getComputedStyle(thinking);
  expect(thinkingStyle.fontSize).toBe("12px");
  expect(thinkingStyle.lineHeight).toBe("16px");
  expect(thinkingStyle.color).toBe(getComputedStyle(tool).color);
  expect(getComputedStyle(thinking.closest("details")!).borderTopWidth).toBe("0px");
  expect(getComputedStyle(thinking.closest("details")!).padding).toBe("0px");
  expect(page.getByText("Checking the form component.", { exact: true }).query()).toBeNull();
  await userEvent.click(page.getByText("Thinking", { exact: true }));
  await expect
    .element(page.getByText("Checking the form component.", { exact: true }))
    .toBeVisible();
  expect(
    getComputedStyle(page.getByText("Checking the form component.", { exact: true }).element())
      .color,
  ).toBe(thinkingStyle.color);
  const instructions = page.getByText("System instructions", { exact: true }).element();
  expect(instructions.closest("details")!.className).toBe(tool.closest("details")!.className);
  const instructionsStyle = getComputedStyle(instructions);
  expect(instructionsStyle.fontSize).toBe("12px");
  expect(instructionsStyle.lineHeight).toBe("16px");
  expect(instructionsStyle.color).toBe(getComputedStyle(tool).color);
  const instructionsDetailsStyle = getComputedStyle(instructions.closest("details")!);
  expect(instructionsDetailsStyle.borderTopWidth).toBe("0px");
  expect(instructionsDetailsStyle.padding).toBe("0px");
  expect(page.getByText("Hidden instruction rule.").query()).toBeNull();
  expect(page.getByText("hello", { exact: true }).query()).toBeNull();
  await userEvent.click(page.getByText("System instructions", { exact: true }));
  await expect.element(page.getByText("Hidden instruction rule.", { exact: true })).toBeVisible();
  expect(
    getComputedStyle(page.getByText("Hidden instruction rule.", { exact: true }).element()).color,
  ).toBe(instructionsStyle.color);
  await userEvent.click(page.getByText("Tool · Shell", { exact: true }));
  await expect.element(page.getByText("hello", { exact: true })).toBeVisible();
  await expect.element(page.getByText(/"command": "echo hello"/)).toBeVisible();
});

test("the latest message has a ticking gray timer that freezes with duration and end time", async () => {
  writeCredential(TEST_API_KEY);
  const start = Date.now() - 1_000;
  let status = "working";
  const rows: TranscriptMessage[] = [
    { ...userFixture, receivedAt: new Date(start).toISOString() },
    { ...assistantFixture, receivedAt: new Date(start + 500).toISOString() },
  ];
  serveTranscript(rows);
  worker.use(
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/status`, () =>
      HttpResponse.json({ status, updatedAt: new Date().toISOString() }),
    ),
  );
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  const footer = page.getByTestId("turn-timing");
  await expect.element(footer).toHaveTextContent(/In progress · \d+\.\ds/);
  const initial = footer.element().textContent;
  await expect.poll(() => footer.element().textContent).not.toBe(initial);
  expect(document.querySelectorAll('[data-testid="turn-timing"]')).toHaveLength(1);
  const style = getComputedStyle(footer.element());
  expect(style.fontSize).toBe("12px");
  expect(style.lineHeight).toBe("16px");
  expect(footer.element().classList.contains("text-gray-400")).toBe(true);
  expect(style.borderTopWidth).toBe("0px");
  expect(footer.element().previousElementSibling?.getAttribute("data-entry-id")).toBe(
    "msg-assistant:0",
  );

  const end = new Date(start + 2_750).toISOString();
  rows.push({
    ...assistantFixture,
    id: "timed-final",
    sessionIndex: 2,
    receivedAt: end,
    content: { type: "result", subtype: "success", result: "Timed final reply." },
  });
  status = "idle";
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: messagesKey("ses-live") }),
    queryClient.invalidateQueries({ queryKey: ["sessions", "ses-live", "status"] }),
  ]);
  await expect.element(footer).toHaveTextContent("Finished in ~2.7s · ended");
  expect(footer.element().querySelector("time")?.dateTime).toBe(end);
  expect(footer.element().previousElementSibling?.getAttribute("data-entry-id")).toBe(
    "timed-final:0",
  );
  const finished = footer.element().textContent;
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(footer.element().textContent).toBe(finished);
});

test("missing prompts show unavailable duration or observed progress without resetting on each message", async () => {
  writeCredential(TEST_API_KEY);
  const rows = [assistantFixture];
  serveTranscript(rows);
  let status = "idle";
  worker.use(
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/status`, () =>
      HttpResponse.json({ status, updatedAt: new Date().toISOString() }),
    ),
  );
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect
    .element(page.getByTestId("turn-timing"))
    .toHaveTextContent("Finished · duration unavailable · ended");
  expect(page.getByTestId("turn-timing").element().querySelector("time")?.dateTime).toBe(
    assistantFixture.receivedAt,
  );
  status = "working";
  await queryClient.invalidateQueries({ queryKey: ["sessions", "ses-live", "status"] });
  const footer = page.getByTestId("turn-timing");
  await expect.element(footer).toHaveTextContent(/In progress · observed \d+\.\ds/);
  const node = footer.element();
  const initial = node.textContent;
  await expect.poll(() => footer.element().textContent).not.toBe(initial);
  rows.push({ ...assistantFixture, id: "next-part", sessionIndex: 2 });
  await queryClient.invalidateQueries({ queryKey: messagesKey("ses-live") });
  expect(footer.element()).toBe(node);
});

test("tool rows are small, gray and borderless, with half-line-height gaps", async () => {
  writeCredential(TEST_API_KEY);
  serveTranscript(
    Array.from({ length: 3 }, (_, index) => ({
      ...toolFixture,
      id: `compact-tool-${index}`,
      sessionIndex: index,
      content: { type: "command_execution", command: "echo hello" },
    })),
  );
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.poll(() => document.querySelectorAll("[data-entry-id] summary").length).toBe(3);
  const summaries = Array.from(document.querySelectorAll<HTMLElement>("[data-entry-id] summary"));
  const style = getComputedStyle(summaries[0]!);
  expect(style.fontSize).toBe("12px");
  expect(style.lineHeight).toBe("16px");
  expect(summaries[0]!.closest("details")!.classList.contains("text-gray-400")).toBe(true);
  expect(getComputedStyle(summaries[0]!.closest("details")!).borderTopWidth).toBe("0px");
  for (let index = 1; index < summaries.length; index++) {
    const row = summaries[index]!.closest("[data-entry-id]")!;
    const previous = summaries[index - 1]!.closest("[data-entry-id]")!;
    expect(row.getBoundingClientRect().top - previous.getBoundingClientRect().bottom).toBeCloseTo(
      parseFloat(style.lineHeight) / 2,
      1,
    );
  }
});

test("a processed prompt is not stuck queued, even when the SDK echo has a different ID", async () => {
  writeCredential(TEST_API_KEY);
  let posted: string | undefined;
  worker.use(
    http.post(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, async ({ request }) => {
      posted = ((await request.json()) as { message: string }).message;
      return HttpResponse.json(
        {
          messageId: "api-accepted-id",
          state: "queued",
          deepLink: "conductor://sessions/ses-live",
        },
        { status: 201 },
      );
    }),
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, async ({ request }) => {
      const url = new URL(request.url);
      if (!url.searchParams.has("after"))
        return HttpResponse.json({
          data: [userFixture, assistantFixture, unknownFixture],
          offset: 0,
          hasMore: false,
        });
      if (!posted) return HttpResponse.json({ data: [], offset: 3, hasMore: false });
      await delay(1_500);
      return HttpResponse.json({
        data: [
          {
            ...userFixture,
            id: "sdk-echo-id",
            sessionIndex: 5,
            content: {
              type: "userMessage",
              message: `<system_instruction>System rules</system_instruction>\n${posted}`,
            },
          },
          {
            ...assistantFixture,
            id: "new-reply",
            sessionIndex: 6,
            content: {
              type: "assistant",
              message: { content: [{ type: "text", text: "Prompt processed." }] },
            },
          },
        ],
        offset: 3,
        hasMore: false,
      });
    }),
  );
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByLabelText("Message")).toBeVisible();
  await userEvent.fill(page.getByLabelText("Message"), "Check this prompt");
  await userEvent.click(page.getByRole("button", { name: "Send", exact: true }));
  await expect.element(page.getByText("Processing", { exact: true })).toBeVisible();
  expect(page.getByText("Queued", { exact: true }).query()).toBeNull();
  await expect
    .element(page.getByText("Prompt processed.", { exact: true }), { timeout: 5_000 })
    .toBeVisible();
  await expect.element(page.getByText("Check this prompt", { exact: true })).toBeVisible();
  expect(document.querySelector('[data-entry-id="api-accepted-id"]')).toBeNull();
});

test("send and cancel controls are inside the prompt textarea", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByLabelText("Message")).toBeVisible();
  const textarea = page.getByLabelText("Message").element();
  expect(textarea.getAttribute("rows")).toBe("1");
  const input = textarea.getBoundingClientRect();
  expect(input.height).toBe(40);
  for (const name of ["Send", "Cancel turn"]) {
    const button = page
      .getByRole("button", { name, exact: true })
      .element()
      .getBoundingClientRect();
    expect(button.width).toBe(28);
    expect(button.height).toBe(28);
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

test("opening a chat begins at the latest answer and ignores legacy read state", async () => {
  writeCredential(TEST_API_KEY);
  serveTranscript(answers(100));
  queryClient.setQueryData(["chat-read", "ses-live"], { messageId: "event-30", offset: 30 });
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByText("Answer 99.")).toBeVisible();
  const state = queryClient.getQueryData<MessagesState>(messagesKey("ses-live"))!;
  expect(state.startOffset).toBe(84);
  expect(page.getByText("Answer 31.").query()).toBeNull();
});

test("a touch swipe at a history boundary loads older messages without requiring a scroll event", async () => {
  writeCredential(TEST_API_KEY);
  serveTranscript(answers(100));
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByText("Answer 99.")).toBeVisible();
  const viewport = page.getByRole("log", { name: "Conversation" }).element();
  viewport.scrollTop = 0;
  viewport.dispatchEvent(
    Object.assign(new Event("touchstart", { bubbles: true }), { touches: [{ clientY: 200 }] }),
  );
  viewport.dispatchEvent(
    Object.assign(new Event("touchmove", { bubbles: true }), { touches: [{ clientY: 245 }] }),
  );
  await expect
    .poll(() => queryClient.getQueryData<MessagesState>(messagesKey("ses-live"))?.startOffset)
    .toBe(68);
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
  await expect.element(page.getByRole("link", { name: "Workspaces", exact: true })).toBeVisible();
});

test("cancel posts to the cancel route", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces/ws-ready/sessions/ses-live");
  await expect.element(page.getByRole("button", { name: "Cancel turn" })).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Cancel turn" }));
  await expect.poll(() => requestsTo("POST", "/v0/sessions/ses-live/cancel")).toHaveLength(1);
});
