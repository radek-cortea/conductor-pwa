import type { TranscriptMessage } from "@/api/types";

export const userFixture: TranscriptMessage = {
  id: "msg-user",
  sessionId: "ses-1",
  sessionIndex: 0,
  type: "userMessage",
  content: {
    type: "userMessage",
    message: "Please look at the login form.",
  },
  receivedAt: "2026-09-30T10:00:00.000Z",
};

export const assistantFixture: TranscriptMessage = {
  id: "msg-assistant",
  sessionId: "ses-1",
  sessionIndex: 1,
  type: "agent",
  content: {
    turnId: "turn-1",
    rawPayload: {
      message: {
        content: [
          {
            type: "text",
            text: "The login form validates the API key before it is stored.",
          },
        ],
      },
    },
  },
  receivedAt: "2026-09-30T10:00:02.000Z",
};

export const thinkingFixture: TranscriptMessage = {
  id: "msg-thinking",
  sessionId: "ses-1",
  sessionIndex: 2,
  type: "agent",
  content: {
    turnId: "turn-1",
    rawPayload: {
      message: {
        content: [{ type: "thinking", text: "Checking the form component." }],
      },
    },
  },
  receivedAt: "2026-09-30T10:00:03.000Z",
};

export const toolFixture: TranscriptMessage = {
  id: "msg-tool",
  sessionId: "ses-1",
  sessionIndex: 3,
  type: "agent",
  content: {
    turnId: "turn-1",
    rawPayload: {
      message: {
        content: [{ type: "tool_use", name: "read_file" }],
      },
    },
  },
  receivedAt: "2026-09-30T10:00:04.000Z",
};

export const unknownFixture: TranscriptMessage = {
  id: "msg-unknown",
  sessionId: "ses-1",
  sessionIndex: 4,
  type: "agent",
  content: { kind: "ping", ok: true },
  receivedAt: "2026-09-30T10:00:05.000Z",
};

export const assistantReply: TranscriptMessage = {
  id: "msg-reply",
  sessionId: "ses-1",
  sessionIndex: 6,
  type: "agent",
  content: {
    turnId: "turn-2",
    rawPayload: {
      message: {
        content: [{ type: "text", text: "The empty state invites you to start a workspace." }],
      },
    },
  },
  receivedAt: "2026-09-30T10:01:00.000Z",
};
