import { expect, test } from "vitest";
import { http, HttpResponse } from "msw";
import { worker } from "@/test/worker";
import { page, userEvent } from "vitest/browser";
import { writeCredential } from "@/auth/credential";
import { API_ORIGIN, requestsTo, TEST_API_KEY } from "@/test/handlers";
import { renderApp } from "@/test/render-app";

test("home has compact controls and an ungrouped, borderless workspace list", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces");

  await expect.element(page.getByRole("main", { name: "Workspaces" })).toBeVisible();
  await expect.element(page.getByText("Billing export")).toBeVisible();
  await expect.poll(() => document.title).toBe("Conductor PWA");
  await expect.element(page.getByText("cortea", { exact: true })).toBeVisible();
  expect(page.getByRole("link", { name: "Conductor PWA", exact: true }).query()).toBeNull();
  expect(document.querySelector("header img")).toBeNull();
  expect(page.getByRole("button", { name: "Sign out", exact: true }).query()).toBeNull();
  await expect.element(page.getByRole("button", { name: "ada@example.com" })).toBeVisible();
  expect(page.getByRole("heading", { name: "Workspaces" }).query()).toBeNull();
  expect(page.getByRole("heading", { name: "Conductor" }).query()).toBeNull();
  expect(page.getByText("Newest activity first.").query()).toBeNull();
  expect(page.getByText("https://github.com/cortea/conductor").query()).toBeNull();
  expect(
    page.getByRole("link", { name: "Create", exact: true }).element().querySelector("svg"),
  ).toBeNull();
  const controls = [
    page.getByRole("button", { name: "Search workspaces" }),
    page.getByRole("link", { name: "Create", exact: true }),
    page.getByRole("link", { name: "Show archived" }),
  ].map((control) => control.element().getBoundingClientRect());
  expect(new Set(controls.map((rect) => rect.top)).size).toBe(1);
  expect(controls.at(-1)?.right).toBeLessThanOrEqual(window.innerWidth);
  expect(page.getByText("Old migration").query()).toBeNull();
  expect(page.getByText("Grace's workspace").query()).toBeNull();
  expect(
    page
      .getByRole("link", { name: /Billing export/ })
      .element()
      .classList.contains("border"),
  ).toBe(false);

  await userEvent.click(page.getByRole("link", { name: "Show archived" }));
  await expect.element(page.getByText("Old migration")).toBeVisible();
  await expect.element(page.getByText("Billing export")).toBeVisible();
  await expect.element(page.getByRole("link", { name: "Hide archived" })).toBeVisible();
  expect(page.getByText("Grace's workspace").query()).toBeNull();
  expect(page.getByText("Grace's archived workspace").query()).toBeNull();
  for (const request of requestsTo("GET", "/v0/workspaces")) {
    expect(new URLSearchParams(request.search).get("creator")).toBe("user-ada");
  }
});

test("only the workspace list scrolls, with actions pinned to the viewport bottom", async () => {
  writeCredential(TEST_API_KEY);
  worker.use(
    http.get(`${API_ORIGIN}/v0/workspaces`, () =>
      HttpResponse.json({
        data: Array.from({ length: 40 }, (_, index) => ({
          id: `workspace-${index}`,
          projectId: "proj-conductor",
          name: `Workspace ${index}`,
          creatorId: "user-ada",
          state: "ready",
          repoUrl: "https://github.com/cortea/conductor",
          createdAt: "2026-10-01T00:00:00Z",
          deepLink: `conductor://workspaces/workspace-${index}`,
        })),
        offset: 0,
        hasMore: false,
      }),
    ),
  );
  await renderApp("/workspaces");
  await expect.element(page.getByText("Workspace 0", { exact: true })).toBeVisible();
  const list = page.getByRole("region", { name: "Workspace list" }).element();
  const actions = page.getByRole("region", { name: "Workspace actions" }).element();
  const before = actions.getBoundingClientRect();
  expect(before.bottom).toBeCloseTo(window.innerHeight, 0);
  expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
  list.scrollTop = list.scrollHeight;
  await expect.poll(() => list.scrollTop).toBeGreaterThan(0);
  expect(actions.getBoundingClientRect().top).toBeCloseTo(before.top, 0);
  expect(document.documentElement.scrollTop).toBe(0);
  expect(document.body.scrollHeight).toBeLessThanOrEqual(window.innerHeight);
});

test("search is revealed by the magnifying glass and closing it clears the filter", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces");
  await expect.element(page.getByText("Billing export")).toBeVisible();
  expect(page.getByRole("textbox", { name: "Search workspaces" }).query()).toBeNull();
  await userEvent.click(page.getByRole("button", { name: "Search workspaces" }));
  await expect.element(page.getByRole("textbox", { name: "Search workspaces" })).toBeVisible();
  await userEvent.fill(page.getByRole("textbox", { name: "Search workspaces" }), "Does not match");
  await expect.element(page.getByText("No workspaces match that filter")).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Close search" }));
  await expect.element(page.getByText("Billing export")).toBeVisible();
  expect(page.getByRole("textbox", { name: "Search workspaces" }).query()).toBeNull();
});
