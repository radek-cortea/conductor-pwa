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
  | { kind: "assistant"; text: string; turnId?: string; source?: "result" }
  | { kind: "thinking"; text: string; turnId?: string }
  | { kind: "tool"; name: string; turnId?: string }
  | { kind: "unknown" }
);

export type ReadPosition = { messageId: string; sessionIndex: number; offset: number };

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
  initialPosition: "unread" | "latest";
  unreadOffset: number | null;
  unsupportedFormats: string[];
};
