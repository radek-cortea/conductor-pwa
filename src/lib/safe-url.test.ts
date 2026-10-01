import { expect, it } from "vitest";
import { safeWebUrl, safeMacUrl } from "@/lib/safe-url";

it("only permits explicit web URLs without embedded credentials or control characters", () => {
  expect(safeWebUrl("https://github.com/cortea/conductor/pull/1")).toBe(
    "https://github.com/cortea/conductor/pull/1",
  );
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,bad",
    "file:///etc/passwd",
    "//evil.example/",
    "https://user:secret@example.com",
    "java\nscript:alert(1)",
    "https://example.com/\u0000",
    undefined,
  ])
    expect(safeWebUrl(value)).toBeUndefined();
});
it("Mac links cannot become executable web links", () => {
  expect(safeMacUrl("conductor://workspaces/ws-ready")).toBe("conductor://workspaces/ws-ready");
  for (const value of [
    "javascript:alert(1)",
    "https://evil.example",
    "conductor://user:secret@workspaces/ws-ready",
    "conductor:\n//workspaces/id",
  ])
    expect(safeMacUrl(value)).toBeUndefined();
});
