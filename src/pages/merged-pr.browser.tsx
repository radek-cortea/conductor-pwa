import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { PR_STATUS_POLL_MS } from "@/api/github";
import { MergedPr } from "@/pages/merged-pr";
import { queryClient } from "@/query-client";
import { worker } from "@/test/worker";

const link = "https://github.com/cortea/conductor/pull/123";

function banner(project = "ws-first", prLink: string | null = link) {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MergedPr
          key={project}
          link={prLink ?? undefined}
          archived={false}
          pending={false}
          onArchive={() => {}}
        />
      </QueryClientProvider>
    </StrictMode>
  );
}

test("checks on open and every minute, keeps project PR across chats, and stops on close", async () => {
  let checks = 0;
  let merged = false;
  worker.use(
    http.get("https://api.github.com/repos/cortea/conductor/pulls/123", () => {
      checks++;
      return HttpResponse.json({ merged });
    }),
  );
  // Only fake interval clocks; browser rendering, MSW and assertion waits remain real.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const view = await render(banner());
    await expect.poll(() => queryClient.getQueryData(["github", "pull-request", link])).toBe(false);
    await expect.poll(() => queryClient.isFetching()).toBe(0);
    const initialChecks = checks; // StrictMode may abort/rejoin the first request.
    expect(initialChecks).toBeGreaterThan(0);
    expect(page.getByText("PR merged", { exact: true }).query()).toBeNull();
    await view.rerender(banner("ws-first", null));
    await vi.advanceTimersByTimeAsync(PR_STATUS_POLL_MS - 1);
    expect(checks).toBe(initialChecks);
    merged = true;
    await vi.advanceTimersByTimeAsync(1);
    await expect.element(page.getByText("PR merged", { exact: true })).toBeVisible();
    expect(checks).toBe(initialChecks + 1);

    await view.unmount();
    await vi.advanceTimersByTimeAsync(PR_STATUS_POLL_MS * 2);
    expect(checks).toBe(initialChecks + 1);

    const reopened = await render(banner());
    await expect.poll(() => checks).toBeGreaterThan(initialChecks + 1);
    await expect.poll(() => queryClient.isFetching()).toBe(0);
    const reopenedChecks = checks;
    // Another project without a link must not inherit the previous PR.
    await reopened.rerender(banner("ws-other", null));
    expect(page.getByText("PR merged", { exact: true }).query()).toBeNull();
    await vi.advanceTimersByTimeAsync(PR_STATUS_POLL_MS);
    expect(checks).toBe(reopenedChecks);
  } finally {
    vi.useRealTimers();
  }
});
