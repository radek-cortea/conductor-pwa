import { describe, expect, it } from "vitest";
import type { TranscriptMessage } from "@/api/types";
import { assistantFixture, toolFixture, userFixture } from "@/transcript/fixtures";
import { projectMessages } from "@/transcript/load";
import { formatTurnDuration, latestTurnTiming } from "@/transcript/turn-timing";
import type { MessagesState } from "@/transcript/types";

function state(messages: TranscriptMessage[]): MessagesState {
  return projectMessages({
    byOffset: Object.fromEntries(messages.map((message, index) => [index, message])),
    entries: [],
    startOffset: 0,
    endOffset: messages.length,
    total: messages.length,
    tailId: messages.at(-1)?.id ?? null,
    pollHasMore: false,
    viewId: "test",
    unsupportedFormats: [],
  });
}
const startedAt = Date.parse(userFixture.receivedAt);
const endedAt = Date.parse(assistantFixture.receivedAt);

describe("latest turn timing", () => {
  it("measures a finished turn using received timestamps", () => {
    expect(latestTurnTiming(state([userFixture, assistantFixture]), "settled")).toEqual({
      running: false,
      startedAt,
      endedAt,
    });
    expect(latestTurnTiming(state([userFixture, toolFixture]), "settled")).toEqual({
      running: false,
      startedAt,
      endedAt: Date.parse(toolFixture.receivedAt),
    });
  });
  it("uses the final SDK result timestamp even when its reply is deduplicated", () => {
    const result = {
      ...assistantFixture,
      id: "result",
      sessionIndex: 2,
      receivedAt: "2026-09-30T10:00:04.000Z",
      content: {
        type: "result",
        subtype: "success",
        result: "The login form validates the API key before it is stored.",
      },
    };
    expect(latestTurnTiming(state([userFixture, assistantFixture, result]), "settled")).toEqual({
      running: false,
      startedAt,
      endedAt: startedAt + 4_000,
    });
  });
  it("continues timing until the phase settles, even with assistant text", () => {
    expect(latestTurnTiming(state([userFixture, assistantFixture]), "working")).toEqual({
      running: true,
      startedAt,
    });
  });
  it("does not treat an unanswered prompt as a finished turn", () => {
    expect(latestTurnTiming(state([userFixture]), "settled")).toBeUndefined();
  });
  it("uses only the latest prompt, not an earlier identical one", () => {
    const next = {
      ...userFixture,
      id: "next",
      sessionIndex: 2,
      receivedAt: "2026-09-30T10:01:00.000Z",
    };
    expect(latestTurnTiming(state([userFixture, assistantFixture, next]), "working")).toEqual({
      running: true,
      startedAt: Date.parse(next.receivedAt),
    });
    expect(
      latestTurnTiming(state([userFixture, assistantFixture, next]), "settled"),
    ).toBeUndefined();
  });
  it("starts a newly sent prompt before the API echo and includes queued time", () => {
    const local = { text: "Next", afterIndex: 1, receivedAt: "2026-09-30T10:01:00.000Z" };
    expect(latestTurnTiming(state([userFixture, assistantFixture]), "pending", local)).toEqual({
      running: true,
      startedAt: Date.parse(local.receivedAt),
    });
    const echo = {
      ...userFixture,
      id: "next",
      sessionIndex: 2,
      receivedAt: "2026-09-30T10:01:01.000Z",
      content: { type: "userMessage", message: "Next" },
    };
    expect(
      latestTurnTiming(state([userFixture, assistantFixture, echo]), "working", local),
    ).toEqual({ running: true, startedAt: Date.parse(local.receivedAt) });
  });
  it("does not use an older local send for a newer external turn", () => {
    const next = {
      ...userFixture,
      id: "next",
      sessionIndex: 2,
      receivedAt: "2026-09-30T10:01:00.000Z",
      content: { type: "userMessage", message: "External prompt" },
    };
    const local = {
      text: "Please look at the login form.",
      afterIndex: -1,
      receivedAt: userFixture.receivedAt,
    };
    expect(
      latestTurnTiming(state([userFixture, assistantFixture, next]), "working", local),
    ).toEqual({ running: true, startedAt: Date.parse(next.receivedAt) });
  });
  it("can use a cached prompt outside the visible window", () => {
    const data = state([userFixture, assistantFixture]);
    data.startOffset = 1;
    expect(latestTurnTiming(projectMessages(data), "settled")).toEqual({
      running: false,
      startedAt,
      endedAt,
    });
  });
  it("never connects a sparse old probe across a cache gap", () => {
    const data = state([userFixture, assistantFixture, { ...assistantFixture, sessionIndex: 2 }]);
    delete data.byOffset[1];
    expect(latestTurnTiming(data, "settled")).toEqual({
      running: false,
      startedAt: undefined,
      endedAt,
    });
    expect(latestTurnTiming(data, "working")).toEqual({ running: true, startedAt: undefined });
  });
  it("does not display invalid timestamps or negative durations", () => {
    expect(
      latestTurnTiming(
        state([userFixture, { ...assistantFixture, receivedAt: "invalid" }]),
        "settled",
      ),
    ).toBeUndefined();
    expect(
      latestTurnTiming(
        state([userFixture, { ...assistantFixture, receivedAt: "2026-09-30T09:59:59.000Z" }]),
        "settled",
      ),
    ).toBeUndefined();
  });
});

describe("duration formatting", () => {
  it("shows tenths and handles longer turns and clock skew", () => {
    expect(formatTurnDuration(0)).toBe("0.0s");
    expect(formatTurnDuration(1_299)).toBe("1.2s");
    expect(formatTurnDuration(60_100)).toBe("1m 0.1s");
    expect(formatTurnDuration(3_661_200)).toBe("1h 1m 1.2s");
    expect(formatTurnDuration(-100)).toBe("0.0s");
  });
});
