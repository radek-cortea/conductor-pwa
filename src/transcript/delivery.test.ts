import { expect, it } from "vitest";
import { promptConfirmed, promptDelivery } from "@/transcript/delivery";
import { normaliseMessage } from "@/transcript/normalise";
import { userFixture } from "@/transcript/fixtures";

it("does not label a sending or processing message as queued", () => {
  const prompt = { text: "Task", afterIndex: 10 };
  expect(promptDelivery(prompt, "pending")).toBe("sending");
  expect(promptDelivery({ ...prompt, serverId: "accepted", state: "queued" }, "working")).toBe(
    "processing",
  );
  expect(promptDelivery({ ...prompt, serverId: "accepted", state: "queued" }, "settled")).toBe(
    "sent",
  );
  expect(promptDelivery({ ...prompt, serverId: "accepted", state: "queued" }, "pending")).toBe(
    "queued",
  );
  expect(promptDelivery({ ...prompt, serverId: "accepted", state: "sent" }, "pending")).toBe(
    "sent",
  );
});
it("reconciles different API/SDK IDs but does not match an old copy of the same prompt", () => {
  const prompt = { text: "Task", afterIndex: 10, serverId: "api-id" };
  const echo = normaliseMessage({
    ...userFixture,
    id: "sdk-id",
    sessionIndex: 11,
    content: {
      type: "userMessage",
      message: "<system_instruction>Rules</system_instruction>\nTask",
    },
  });
  expect(promptConfirmed(prompt, echo)).toBe(true);
  expect(promptConfirmed({ ...prompt, afterIndex: 11 }, echo)).toBe(false);
});
