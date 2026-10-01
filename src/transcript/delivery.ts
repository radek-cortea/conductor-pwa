import { promptText } from "@/transcript/content";
import type { TranscriptEntry } from "@/transcript/types";
import type { TurnPhase } from "@/transcript/turn-phase";

export type DeliveryState = "sending" | "queued" | "sent" | "processing";
export type PendingPrompt = {
  serverId?: string;
  text: string;
  afterIndex: number;
  state?: "queued" | "sent";
};

export function promptConfirmed(
  prompt: PendingPrompt,
  entries: readonly TranscriptEntry[],
): boolean {
  return entries.some(
    (entry) =>
      entry.messageId === prompt.serverId ||
      (entry.kind === "user" &&
        entry.sessionIndex > prompt.afterIndex &&
        promptText(entry.text) === prompt.text.trim()),
  );
}

export function promptDelivery(prompt: PendingPrompt, phase: TurnPhase): DeliveryState {
  if (!prompt.serverId) return "sending";
  if (phase === "working") return "processing";
  if (phase === "settled" || prompt.state === "sent") return "sent";
  return prompt.state === "queued" ? "queued" : "sent";
}
