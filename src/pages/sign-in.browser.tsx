import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { CREDENTIAL_STORAGE_KEY } from "@/auth/credential";
import { queryClient } from "@/query-client";
import { TEST_API_KEY } from "@/test/handlers";
import { renderApp } from "@/test/render-app";

test("sign-in stores a key only after /me succeeds", async () => {
  const signedOut = await renderApp("/sign-in");
  await expect.element(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(localStorage.getItem(CREDENTIAL_STORAGE_KEY)).toBeNull();

  await userEvent.fill(page.getByLabelText("API key"), "rejected-key");
  await userEvent.click(page.getByRole("button", { name: "Sign in" }));

  await expect.element(page.getByRole("alert")).toHaveTextContent("That key is not valid.");
  expect(localStorage.getItem(CREDENTIAL_STORAGE_KEY)).toBeNull();
  await expect.element(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await userEvent.fill(page.getByLabelText("API key"), TEST_API_KEY);
  await userEvent.click(page.getByRole("button", { name: "Sign in" }));

  await expect.element(page.getByRole("main", { name: "Workspaces" })).toBeVisible();
  await expect.element(page.getByText("ada@example.com")).toBeVisible();
  expect(localStorage.getItem(CREDENTIAL_STORAGE_KEY)).toContain(TEST_API_KEY);

  signedOut.unmount();
  queryClient.clear();
  const reopened = await renderApp("/");
  await expect.element(page.getByRole("main", { name: "Workspaces" })).toBeVisible();
  await reopened.unmount();
});
