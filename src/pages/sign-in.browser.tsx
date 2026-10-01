import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  CREDENTIAL_STORAGE_KEY,
  readCredential,
  readRememberedCredential,
  signOutCredential,
  writeCredential,
} from "@/auth/credential";
import { queryClient } from "@/query-client";
import { TEST_API_KEY } from "@/test/handlers";
import { renderApp } from "@/test/render-app";

test("the email opens an account menu, and sign-out offers the remembered key to reuse or forget", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces");
  await expect.element(page.getByRole("button", { name: "ada@example.com" })).toBeVisible();
  expect(page.getByRole("button", { name: "Sign out", exact: true }).query()).toBeNull();
  await userEvent.click(page.getByRole("button", { name: "ada@example.com" }));
  await userEvent.click(page.getByRole("menuitem", { name: "Sign out" }));
  await expect.element(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(readCredential()).toBeNull();
  expect(readRememberedCredential()).toBe(TEST_API_KEY);
  await expect.element(page.getByLabelText("API key")).toHaveValue(TEST_API_KEY);
  await userEvent.click(page.getByRole("button", { name: "Forget saved key" }));
  await expect.element(page.getByLabelText("API key")).toHaveValue("");
  expect(readRememberedCredential()).toBeNull();
  expect(localStorage.getItem(CREDENTIAL_STORAGE_KEY)).toBeNull();
});

test("a remembered signed-out key can be used without retyping it", async () => {
  writeCredential(TEST_API_KEY);
  signOutCredential();
  await renderApp("/sign-in");
  await expect.element(page.getByLabelText("API key")).toHaveValue(TEST_API_KEY);
  await userEvent.click(page.getByRole("button", { name: "Sign in", exact: true }));
  await expect.element(page.getByRole("main", { name: "Workspaces" })).toBeVisible();
  expect(readCredential()).toBe(TEST_API_KEY);
});

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

  await signedOut.unmount();
  queryClient.clear();
  const reopened = await renderApp("/");
  await expect.element(page.getByRole("main", { name: "Workspaces" })).toBeVisible();
  await reopened.unmount();
});
