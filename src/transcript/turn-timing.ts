import { promptConfirmed, type PendingPrompt } from "@/transcript/delivery";
import { normaliseMessage } from "@/transcript/normalise";
import type { TurnPhase } from "@/transcript/turn-phase";
import type { MessagesState, TranscriptEntry } from "@/transcript/types";

export type TurnTiming =
  | { running: true; startedAt?: number }
  | { running: false; startedAt?: number; endedAt: number };
type LocalPrompt = PendingPrompt & { receivedAt: string };

function timestamp(value: string | undefined): number | undefined {
  const time = value === undefined ? NaN : Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

// Only inspect the contiguous cached tail. A sparse probe before a gap cannot
// establish which prompt started this turn. No additional history requests.
export function latestTurnTiming(
  state: MessagesState | undefined,
  phase: TurnPhase,
  local?: LocalPrompt,
): TurnTiming | undefined {
  if (!state) return undefined;
  let user: TranscriptEntry | undefined;
  let endedAt: number | undefined;
  for (let offset = state.total - 1; offset >= 0; offset--) {
    const message = state.byOffset[offset];
    if (!message) break;
    const entries = normaliseMessage(message);
    user = entries.findLast((entry) => entry.kind === "user");
    if (user) break;
    if (endedAt === undefined && entries.some((entry) => entry.kind !== "unknown"))
      endedAt = timestamp(message.receivedAt);
  }
  const running = phase !== "settled";
  const localIsCurrent = local && (user ? promptConfirmed(local, [user]) : running);
  const startedAt = timestamp(localIsCurrent ? local.receivedAt : user?.receivedAt);
  // A queued local prompt can precede its API echo; do not reuse the prior
  // turn's end time or start while waiting for the new turn to arrive.
  if (local && running && (!user || user.sessionIndex <= local.afterIndex))
    return { running: true, startedAt: timestamp(local.receivedAt) };
  if (running) return { running, startedAt };
  if (endedAt === undefined || (startedAt !== undefined && endedAt < startedAt)) return undefined;
  return { running, startedAt, endedAt };
}

export function formatTurnDuration(milliseconds: number): string {
  const tenths = Math.floor(Math.max(0, milliseconds) / 100);
  const hours = Math.floor(tenths / 36_000);
  const minutes = Math.floor((tenths % 36_000) / 600);
  const seconds = ((tenths % 600) / 10).toFixed(1);
  return `${hours ? `${hours}h ` : ""}${minutes || hours ? `${minutes}m ` : ""}${seconds}s`;
}
