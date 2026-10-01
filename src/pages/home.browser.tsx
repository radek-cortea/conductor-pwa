import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { writeCredential } from "@/auth/credential";
import { requestsTo, TEST_API_KEY } from "@/test/handlers";
import { renderApp } from "@/test/render-app";

test("home has compact controls and an ungrouped, borderless workspace list", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces");

  await expect.element(page.getByRole("main", { name: "Workspaces" })).toBeVisible();
  await expect.element(page.getByText("Billing export")).toBeVisible();
  await expect.poll(() => document.title).toBe("Conductor PWA");
  expect(
    page
      .getByRole("link", { name: "Conductor PWA", exact: true })
      .element()
      .querySelector("img")
      ?.getAttribute("src"),
  ).toBe("/favicon.svg");
  expect(page.getByRole("heading", { name: "Workspaces" }).query()).toBeNull();
  expect(page.getByRole("heading", { name: "Conductor" }).query()).toBeNull();
  expect(page.getByText("Newest activity first.").query()).toBeNull();
  expect(page.getByText("https://github.com/cortea/conductor").query()).toBeNull();
  const controls = [
    page.getByRole("button", { name: "Search workspaces" }),
    page.getByRole("link", { name: "Start workspace" }),
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
