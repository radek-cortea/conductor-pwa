import { describe, expect, it } from "vitest";
import { assistantFixture, toolFixture } from "@/transcript/fixtures";
import { findPullRequestLink } from "@/lib/pull-request";

describe("available project PR links", () => {
  it("finds a real PR in a final response for the current repository", () => {
    expect(
      findPullRequestLink("https://github.com/cortea/conductor.git", [
        {
          ...assistantFixture,
          content: {
            type: "assistant",
            text: "Created https://github.com/cortea/conductor/pull/123.",
          },
        },
      ]),
    ).toBe("https://github.com/cortea/conductor/pull/123");
  });
  it("reads encoded tool results and SSH remotes", () => {
    expect(
      findPullRequestLink("git@github.com:cortea/conductor.git", [
        {
          ...toolFixture,
          content: JSON.stringify({
            rawPayload: {
              type: "user",
              message: {
                content: [
                  {
                    type: "tool_result",
                    content: JSON.stringify({
                      html_url: "https://github.com/cortea/conductor/pull/99",
                    }),
                  },
                ],
              },
            },
          }),
        },
      ]),
    ).toBe("https://github.com/cortea/conductor/pull/99");
  });
  it("does not copy unrelated repository or non-GitHub links", () => {
    expect(
      findPullRequestLink("https://github.com/cortea/conductor", [
        {
          ...assistantFixture,
          content: {
            text: "https://github.com/other/repo/pull/1 https://evil.example/cortea/conductor/pull/2",
          },
        },
      ]),
    ).toBeUndefined();
  });
  it("prefers the most recent link and strips query parameters", () => {
    expect(
      findPullRequestLink("https://github.com/cortea/conductor", [
        {
          ...assistantFixture,
          sessionIndex: 1,
          content: { text: "https://github.com/cortea/conductor/pull/1" },
        },
        {
          ...assistantFixture,
          sessionIndex: 2,
          content: { text: "https://github.com/cortea/conductor/pull/2?tracking=private" },
        },
      ]),
    ).toBe("https://github.com/cortea/conductor/pull/2");
  });
});
