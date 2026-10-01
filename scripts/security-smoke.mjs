import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

// Run after a Pages build. Fresh contexts and mocked API responses: no real keys.
const origin = "http://127.0.0.1:43124";
const base = process.env.PAGES_BASE_PATH || "/";
const server = spawn(
  "pnpm",
  ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", "43124", "--strictPort"],
  { detached: true, stdio: "ignore" },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin + base)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, "Preview did not start");
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    const context = await browser.newContext({ viewport });
    const errors = [];
    const requests = [];
    await context.route("https://api.conductor.build/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      const data = {
        "/me": { userId: "security-user", email: "smoke@example.test", authMethod: "api-key" },
        "/v0/projects": {
          data: [
            { id: "project", name: "Conductor", gitRemote: "https://github.com/cortea/conductor" },
          ],
          offset: 0,
          hasMore: false,
        },
        "/v0/workspaces": { data: [], offset: 0, hasMore: false },
      };
      assert(path in data, path);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data[path]),
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(origin + base + "#/sign-in");
    await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    assert(csp.includes("script-src 'self'"));
    assert(!csp.includes("'unsafe-eval'"));
    assert.equal(
      await page.locator('meta[name="referrer"]').getAttribute("content"),
      "no-referrer",
    );
    await page.waitForFunction(() => document.querySelector("img")?.naturalWidth > 0);
    await page.getByLabel("API key", { exact: true }).fill("production-security-smoke-key");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("main", { name: "Workspaces", exact: true }).waitFor();
    await page.getByRole("link", { name: "Create", exact: true }).click();
    await page.getByRole("heading", { name: "Start a workspace", exact: true }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: "Start a workspace", exact: true }).waitFor();
    await page.waitForFunction(async () =>
      Boolean((await navigator.serviceWorker.getRegistration())?.active),
    );
    assert.deepEqual(errors, []);
    const injection = await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.__cspExecuted = true";
      document.head.appendChild(script);
      return window.__cspExecuted === true;
    });
    assert.equal(injection, false);
    const blocked = await page.evaluate(async () => {
      try {
        await fetch("https://attacker.invalid/blocked");
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(blocked, true);
    const before = requests.length;
    await context.route(origin + "/frame-harness", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<iframe src="${origin + base}#/workspaces/new"></iframe>`,
      }),
    );
    const framePage = await context.newPage();
    await framePage.goto(origin + "/frame-harness");
    await framePage
      .frameLocator("iframe")
      .getByText("Open Conductor PWA directly in a browser tab.", { exact: true })
      .waitFor();
    assert.equal(requests.length, before);
    console.log(
      JSON.stringify({
        viewport,
        navigationAndReload: true,
        normalConsoleErrors: 0,
        cspBlocksInlineScript: true,
        cspBlocksExfiltration: true,
        framedStartupBlockedBeforeApiAccess: true,
      }),
    );
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  process.kill(-server.pid, "SIGTERM");
}
