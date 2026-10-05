import { http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { writeCredential } from "@/auth/credential";
import { queryClient } from "@/query-client";
import { API_ORIGIN, TEST_API_KEY } from "@/test/handlers";
import { renderApp } from "@/test/render-app";
import { worker } from "@/test/worker";
import { assistantFixture } from "@/transcript/fixtures";

function gate() {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release };
}
const workspace = {
  id: "ws-ready",
  name: "Server project name",
  state: "ready",
  repoUrl: "https://github.com/cortea/conductor",
  createdAt: "2026-10-01T10:00:00Z",
  deepLink: "conductor://workspaces/ws-ready",
};

test("navigation carries the known project name through context while details and tabs load", async () => {
  writeCredential(TEST_API_KEY);
  const detail = gate();
  const chats = gate();
  worker.use(
    http.get(`${API_ORIGIN}/v0/workspaces/ws-ready`, async () => {
      await detail.pending;
      return HttpResponse.json(workspace);
    }),
    http.get(`${API_ORIGIN}/v0/workspaces/ws-ready/sessions`, async () => {
      await chats.pending;
      return HttpResponse.json({
        data: [{ id: "ses-live", name: "Login form", deepLink: "conductor://sessions/ses-live" }],
        offset: 0,
        hasMore: false,
      });
    }),
  );
  const errors = vi.spyOn(console, "error");
  try {
    await renderApp("/workspaces");
    await expect.element(page.getByText("Billing export")).toBeVisible();
    await userEvent.click(page.getByRole("link", { name: /Billing export/ }));
    await expect
      .element(page.getByRole("heading", { name: "Billing export", exact: true }))
      .toBeVisible();
    await expect.element(page.getByRole("link", { name: "Workspaces", exact: true })).toBeVisible();
    expect(document.querySelectorAll("header")).toHaveLength(1);
    expect(page.getByRole("button", { name: "ada@example.com" }).query()).toBeNull();
    expect(queryClient.getQueryData(["workspaces", "ws-ready"])).toBeUndefined();
    detail.release();
    await expect
      .element(page.getByRole("heading", { name: "Server project name", exact: true }))
      .toBeVisible();
    expect(page.getByRole("tab", { name: /Login form/ }).query()).toBeNull();
    chats.release();
    await expect.element(page.getByLabelText("Message")).toBeVisible();
    expect(errors).not.toHaveBeenCalled();
  } finally {
    detail.release();
    chats.release();
    errors.mockRestore();
  }
});

test("a cold deep link shows its back button before details, then the name before transcript data", async () => {
  writeCredential(TEST_API_KEY);
  const detail = gate();
  const transcript = gate();
  worker.use(
    http.get(`${API_ORIGIN}/v0/workspaces/ws-ready`, async () => {
      await detail.pending;
      return HttpResponse.json(workspace);
    }),
    http.get(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, async () => {
      await transcript.pending;
      return HttpResponse.json({ data: [assistantFixture], offset: 0, hasMore: false });
    }),
  );
  const errors = vi.spyOn(console, "error");
  try {
    await renderApp("/workspaces/ws-ready/sessions/ses-live");
    await expect.element(page.getByRole("link", { name: "Workspaces", exact: true })).toBeVisible();
    expect(document.querySelectorAll("header")).toHaveLength(1);
    detail.release();
    await expect
      .element(page.getByRole("heading", { name: "Server project name", exact: true }))
      .toBeVisible();
    expect(
      page.getByText("The login form validates the API key before it is stored.").query(),
    ).toBeNull();
    transcript.release();
    await expect.element(page.getByLabelText("Message")).toBeVisible();
    expect(errors).not.toHaveBeenCalled();
  } finally {
    detail.release();
    transcript.release();
    errors.mockRestore();
  }
});

test("a cold project keeps its header even while the account loader is pending", async () => {
  writeCredential(TEST_API_KEY);
  const account = gate();
  worker.use(
    http.get(`${API_ORIGIN}/me`, async () => {
      await account.pending;
      return HttpResponse.json({
        userId: "user-ada",
        email: "ada@example.com",
        authMethod: "api-key",
      });
    }),
  );
  const errors = vi.spyOn(console, "error");
  try {
    await renderApp("/workspaces/ws-ready/sessions/ses-live");
    await expect.element(page.getByRole("link", { name: "Workspaces", exact: true })).toBeVisible();
    expect(document.querySelectorAll("header")).toHaveLength(1);
    expect(queryClient.getQueryData(["me"])).toBeUndefined();
    account.release();
    await expect.element(page.getByLabelText("Message")).toBeVisible();
    expect(errors).not.toHaveBeenCalled();
  } finally {
    account.release();
    errors.mockRestore();
  }
});

test("the pending header's back button cancels loading without a late route/error takeover", async () => {
  writeCredential(TEST_API_KEY);
  const detail = gate();
  worker.use(
    http.get(`${API_ORIGIN}/v0/workspaces/ws-ready`, async () => {
      await detail.pending;
      return HttpResponse.json(workspace);
    }),
  );
  const errors = vi.spyOn(console, "error");
  try {
    await renderApp("/workspaces");
    await userEvent.click(page.getByRole("link", { name: /Billing export/ }));
    await expect
      .element(page.getByRole("heading", { name: "Billing export", exact: true }))
      .toBeVisible();
    await userEvent.click(page.getByRole("link", { name: "Workspaces", exact: true }));
    await expect.element(page.getByRole("main", { name: "Workspaces" })).toBeVisible();
    detail.release();
    await expect.element(page.getByRole("button", { name: "ada@example.com" })).toBeVisible();
    expect(page.getByRole("heading", { name: "Could not load this page" }).query()).toBeNull();
    expect(errors).not.toHaveBeenCalled();
  } finally {
    detail.release();
    errors.mockRestore();
  }
});
