import { expect, test, vi } from "vitest";
import { fetchMe } from "@/api/fetch";
import { readCredential, readRememberedCredential, writeCredential } from "@/auth/credential";
import { setUnauthorizedHandler } from "@/auth/unauthorized";

test("API requests keep credentials in headers and reject redirects, referrers, cookies and HTTP caching", async () => {
  let request: Request | undefined;
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    request = input as Request;
    return new Response(JSON.stringify({ userId: "test-user" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  try {
    await fetchMe("security-test-key");
    expect(request?.url).toBe("https://api.conductor.build/me");
    expect(request?.headers.get("Authorization")).toBe("Bearer security-test-key");
    expect(request?.redirect).toBe("error");
    expect(request?.cache).toBe("no-store");
    expect(request?.credentials).toBe("omit");
    expect(request?.referrerPolicy).toBe("no-referrer");
  } finally {
    fetch.mockRestore();
  }
});

test("a stale 401 cannot sign out a new key, and server echoes are redacted from errors and stacks", async () => {
  writeCredential("current-security-key");
  const notify = vi.fn();
  setUnauthorizedHandler(notify);
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          userMessage: "Bearer stale-security-key; current-security-key was echoed",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );
  try {
    const error = await fetchMe("stale-security-key").catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain("stale-security-key");
    expect(String(error)).not.toContain("current-security-key");
    if (error instanceof Error) expect(error.stack).not.toContain("stale-security-key");
    expect(readCredential()).toBe("current-security-key");
    expect(notify).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
    setUnauthorizedHandler(() => {});
  }
});

test("a current key rejected with 401 becomes inactive but remains available to forget", async () => {
  writeCredential("rejected-security-key");
  const notify = vi.fn();
  setUnauthorizedHandler(notify);
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response("{}", { status: 401, headers: { "Content-Type": "application/json" } }),
    );
  try {
    await expect(fetchMe("rejected-security-key")).rejects.toMatchObject({ status: 401 });
    expect(readCredential()).toBeNull();
    expect(readRememberedCredential()).toBe("rejected-security-key");
    expect(notify).toHaveBeenCalledOnce();
  } finally {
    fetch.mockRestore();
    setUnauthorizedHandler(() => {});
  }
});
