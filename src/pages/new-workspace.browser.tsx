import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { writeCredential } from "@/auth/credential";
import { requestsTo, TEST_API_KEY } from "@/test/handlers";
import { renderApp } from "@/test/render-app";

test("creation options are remembered when reopening the form, without retaining name or prompt", async () => {
  writeCredential(TEST_API_KEY);
  const first = await renderApp("/workspaces/new");
  await expect.element(page.getByRole("heading", { name: "Start a workspace" })).toBeVisible();
  expect(page.getByText(/Pick a repository and an opening prompt/).query()).toBeNull();
  await userEvent.click(page.getByRole("combobox", { name: "Project" }));
  await userEvent.click(page.getByRole("option", { name: "Conductor" }));
  await userEvent.fill(page.getByLabelText("Branch"), "main");
  await userEvent.click(page.getByRole("combobox", { name: "Agent", exact: true }));
  await userEvent.click(page.getByRole("option", { name: "codex", exact: true }));
  await userEvent.click(page.getByRole("combobox", { name: "Model", exact: true }));
  await userEvent.click(page.getByRole("option", { name: "gpt-5.5", exact: true }));
  await userEvent.click(page.getByRole("combobox", { name: "Effort", exact: true }));
  await userEvent.click(page.getByRole("option", { name: "low", exact: true }));
  await userEvent.fill(page.getByLabelText("Name", { exact: true }), "Unique name");
  await userEvent.fill(page.getByLabelText("Opening message"), "Private prompt");
  await first.unmount();
  await renderApp("/workspaces/new");
  await expect
    .element(page.getByRole("combobox", { name: "Project" }))
    .toHaveTextContent("Conductor");
  await expect.element(page.getByLabelText("Branch")).toHaveValue("main");
  await expect
    .element(page.getByRole("combobox", { name: "Agent", exact: true }))
    .toHaveTextContent("codex");
  await expect
    .element(page.getByRole("combobox", { name: "Model", exact: true }))
    .toHaveTextContent("gpt-5.5");
  await expect
    .element(page.getByRole("combobox", { name: "Effort", exact: true }))
    .toHaveTextContent("low");
  await expect.element(page.getByLabelText("Name", { exact: true })).toHaveValue("");
  await expect.element(page.getByLabelText("Opening message")).toHaveValue("");
});

test("new workspace posts the project, agent, model, and message", async () => {
  writeCredential(TEST_API_KEY);
  await renderApp("/workspaces/new");

  await expect.element(page.getByRole("heading", { name: "Start a workspace" })).toBeVisible();
  await userEvent.click(page.getByRole("combobox", { name: "Project" }));
  await userEvent.click(page.getByRole("option", { name: "Conductor" }));
  await userEvent.fill(page.getByLabelText("Opening message"), "Look at the login form");
  await userEvent.click(page.getByRole("button", { name: "Start a workspace" }));

  await expect
    .poll(() => requestsTo("POST", "/v0/workspaces").at(-1)?.body)
    .toMatchObject({
      projectId: "proj-conductor",
      agent: "claude",
      model: "opus-5-1m",
      message: "Look at the login form",
    });
  await expect
    .element(page.getByRole("tab", { name: /Opening chat/, selected: true }))
    .toBeVisible();
});
