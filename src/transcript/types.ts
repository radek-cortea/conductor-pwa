import type { TranscriptMessage } from "@/api/types";

export type TranscriptEntry = {
  id: string;
  messageId: string;
  sessionIndex: number;
  partIndex: number;
  receivedAt: string;
  offset?: number;
} & (
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; turnId?: string; source?: "result"; final?: boolean }
  | { kind: "thinking"; text: string; turnId?: string }
  | {
      kind: "tool";
      name: string;
      turnId?: string;
      toolId?: string;
      input?: string;
      output?: string;
      exitCode?: number;
      error?: boolean;
    }
  | { kind: "unknown" }
);

export type MessagesState = {
  // Sparse, durable cache of fetched events, indexed by their API offset.
  byOffset: Record<number, TranscriptMessage>;
  entries: TranscriptEntry[];
  startOffset: number;
  endOffset: number;
  total: number;
  tailId: string | null;
  pollHasMore: boolean;
  viewId: string;
  unsupportedFormats: string[];
};
