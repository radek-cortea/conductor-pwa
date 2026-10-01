import { describe, expect, it } from "vitest";
import type { EffortId, ModelId } from "@/api/types";
import { agentModels, pickerAgents } from "@/lib/agent-models";

const models = [
  ...agentModels.claude.models,
  ...agentModels.codex.models,
  ...agentModels.cursor.models,
] satisfies readonly ModelId[];

const efforts = [
  ...agentModels.claude.efforts,
  ...agentModels.codex.efforts,
  ...agentModels.cursor.efforts,
] satisfies readonly EffortId[];

describe("agentModels", () => {
  it("keeps each default inside that agent's lists", () => {
    expect(models.length).toBeGreaterThan(0);
    expect(efforts.length).toBeGreaterThan(0);
    for (const agent of pickerAgents) {
      const entry = agentModels[agent];
      expect(entry.models).toContain(entry.defaultModel);
      expect(entry.efforts).toContain(entry.defaultEffort);
    }
  });
});
