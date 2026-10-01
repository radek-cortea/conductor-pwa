import { expect, it } from "vitest";
import { promptText, splitSystemInstructions } from "@/transcript/content";

it("separates system instructions without discarding the visible message", () => {
  const parts = splitSystemInstructions(
    "Before\n<system_instruction>Private rules</system_instruction>\nAfter",
  );
  expect(parts.map(({ kind, text }) => ({ kind, text }))).toEqual([
    { kind: "text", text: "Before\n" },
    { kind: "system", text: "Private rules" },
    { kind: "text", text: "\nAfter" },
  ]);
});
it("handles an unclosed system instruction block", () => {
  expect(splitSystemInstructions("<system_instruction>Rules")[0]).toMatchObject({
    kind: "system",
    text: "Rules",
  });
});
it("can compare an echoed prompt with added system instructions", () => {
  expect(promptText("<system_instruction>Rules</system_instruction>\nCheck the tests")).toBe(
    "Check the tests",
  );
});
