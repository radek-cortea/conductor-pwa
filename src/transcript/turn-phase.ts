import type { SessionPhase } from "@/api/types";

export type TurnPhase = "pending" | "working" | "settled";

export function turnPhase(input: {
  status: SessionPhase | undefined;
  seenWorking: boolean;
  sendUnconfirmed: boolean;
  newerAgentEntry: boolean;
}): TurnPhase {
  if (input.status === "error") return "settled";
  if (input.status === "working") return "working";
  if (input.newerAgentEntry) return "settled";
  if (input.sendUnconfirmed && !input.seenWorking) return "pending";
  if (input.status === "idle" && input.seenWorking) return "settled";
  if (input.sendUnconfirmed) return "pending";
  return "settled";
}
