import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPullRequestMerged, PR_STATUS_POLL_MS, pullRequestMergedQuery } from "@/api/github";

const link = "https://github.com/cortea/conductor/pull/123";
afterEach(() => vi.unstubAllGlobals());

describe("GitHub PR status", () => {
  it("uses a separate anonymous, uncached, redirect-rejecting transport", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ merged: true })));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    expect(await fetchPullRequestMerged(link, controller.signal)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/cortea/conductor/pulls/123",
      expect.objectContaining({
        headers: { Accept: "application/vnd.github+json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        redirect: "error",
      }),
    );
    const signal = fetch.mock.calls[0]![1].signal as AbortSignal;
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it.each([false, true])("only accepts an explicit merged boolean (%s)", async (merged) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ merged }))));
    expect(await fetchPullRequestMerged(link)).toBe(merged);
  });

  it.each([403, 404, 429, 500])(
    "does not treat unavailable status %s as unmerged",
    async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
      await expect(fetchPullRequestMerged(link)).rejects.toThrow("unavailable");
    },
  );

  it.each([{ state: "closed" }, { merged: "true" }, null])(
    "rejects malformed status %j",
    async (data) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
      await expect(fetchPullRequestMerged(link)).rejects.toThrow("Invalid GitHub PR status");
    },
  );

  it.each([
    "https://evil.example/cortea/conductor/pull/1",
    "https://github.com/cortea/conductor/pull/1?token=secret",
    "https://github.com/../conductor/pull/1",
    "https://github.com/cortea/conductor/pull/0",
  ])("rejects unsafe links without making a request", async (unsafe) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(fetchPullRequestMerged(unsafe)).rejects.toThrow("Invalid GitHub PR link");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks on every mount, polls once a minute while visible, and waits for a link", () => {
    const options = pullRequestMergedQuery(link);
    expect(options.refetchInterval).toBe(PR_STATUS_POLL_MS);
    expect(options.refetchOnMount).toBe("always");
    expect(options.refetchOnWindowFocus).toBe(true);
    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.retry).toBe(false);
    expect(pullRequestMergedQuery(undefined).enabled).toBe(false);
  });
});
