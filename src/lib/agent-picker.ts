import { agentModels, pickerAgents } from "@/lib/agent-models";
import type { PickerAgent } from "@/api/types";

export function isPickerAgent(value: string): value is PickerAgent {
  return pickerAgents.some((agent) => agent === value);
}

export function applyAgentChange(
  agent: PickerAgent,
  model: string,
  effort: string,
): { model: string; effort: string } {
  const next = agentModels[agent];
  return {
    model: next.models.some((item) => item === model) ? model : next.defaultModel,
    effort: next.efforts.some((item) => item === effort) ? effort : next.defaultEffort,
  };
}
