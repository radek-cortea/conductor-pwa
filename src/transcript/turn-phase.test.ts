import { describe, expect, it } from "vitest";
import { turnPhase } from "@/transcript/turn-phase";

describe("turn phase", () => {
  it("stays pending while the first status after a send is still idle", () => {
    expect(
      turnPhase({
        status: "idle",
        seenWorking: false,
        sendUnconfirmed: true,
        newerAgentEntry: false,
      }),
    ).toBe("pending");
  });

  it("is working once status is working", () => {
    expect(
      turnPhase({
        status: "working",
        seenWorking: true,
        sendUnconfirmed: true,
        newerAgentEntry: false,
      }),
    ).toBe("working");
  });

  it("settles on idle only after working was seen", () => {
    expect(
      turnPhase({
        status: "idle",
        seenWorking: true,
        sendUnconfirmed: true,
        newerAgentEntry: false,
      }),
    ).toBe("settled");
  });

  it("settles when a newer agent entry arrives before working is observed", () => {
    expect(
      turnPhase({
        status: "idle",
        seenWorking: false,
        sendUnconfirmed: true,
        newerAgentEntry: true,
      }),
    ).toBe("settled");
  });

  it("settles on error", () => {
    expect(
      turnPhase({
        status: "error",
        seenWorking: false,
        sendUnconfirmed: true,
        newerAgentEntry: false,
      }),
    ).toBe("settled");
  });

  it("is settled when nothing has been sent", () => {
    expect(
      turnPhase({
        status: "idle",
        seenWorking: false,
        sendUnconfirmed: false,
        newerAgentEntry: false,
      }),
    ).toBe("settled");
  });
});
