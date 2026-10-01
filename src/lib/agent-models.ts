import type { EffortId, ModelId, PickerAgent } from "@/api/types";

/**
 * The OpenAPI document lists every model on every agent and does not encode the
 * legal pairing. This map is the pairings the API accepts. Each id satisfies the
 * generated union, so a spec refresh fails the typecheck when a listed model
 * disappears. `gpt-6.1-sol` is included because the pinned spec accepts it for Codex.
 */
export const agentModels = {
  claude: {
    models: [
      "fable-5-1",
      "fable-5",
      "opus-5-5-1m",
      "opus-5-1m",
      "opus-4-8-1m",
      "opus-4-8",
      "opus-4-7-1m",
      "opus-4-7",
      "opus-4-6-1m",
      "sonnet-5-5-1m",
      "sonnet-5-1m",
      "sonnet-4-6-1m",
      "sonnet-4-6",
      "haiku-4-5",
    ] as const satisfies readonly ModelId[],
    efforts: ["low", "medium", "high", "xhigh", "max"] as const satisfies readonly EffortId[],
    defaultModel: "opus-5-1m" as const satisfies ModelId,
    defaultEffort: "high" as const satisfies EffortId,
  },
  codex: {
    models: [
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.3-codex-spark",
      "gpt-5.3-codex",
      "gpt-5.2-codex",
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-daybreak-blue-latest",
    ] as const satisfies readonly ModelId[],
    efforts: [
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ] as const satisfies readonly EffortId[],
    defaultModel: "gpt-5.6-sol" as const satisfies ModelId,
    defaultEffort: "high" as const satisfies EffortId,
  },
  cursor: {
    models: [
      "auto",
      "composer-2.5",
      "grok-4.7",
      "grok-4.6",
      "grok-4.5",
    ] as const satisfies readonly ModelId[],
    efforts: ["low", "medium", "high", "xhigh"] as const satisfies readonly EffortId[],
    defaultModel: "composer-2.5" as const satisfies ModelId,
    defaultEffort: "high" as const satisfies EffortId,
  },
} as const satisfies Record<
  PickerAgent,
  {
    models: readonly ModelId[];
    efforts: readonly EffortId[];
    defaultModel: ModelId;
    defaultEffort: EffortId;
  }
>;

export const pickerAgents = ["claude", "codex", "cursor"] as const satisfies readonly PickerAgent[];

export function agentDefaults(agent: PickerAgent) {
  return agentModels[agent];
}
