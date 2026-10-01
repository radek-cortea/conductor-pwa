import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { writeCredential } from "@/auth/credential";
import { requestsTo, TEST_API_KEY } from "@/test/handlers";
import { renderApp } from "@/test/render-app";

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
