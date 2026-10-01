import { describe, expect, it } from "vitest";
import {
  assistantFixture,
  thinkingFixture,
  toolFixture,
  unknownFixture,
  userFixture,
} from "@/transcript/fixtures";
import {
  mergeEntries,
  mergeMessages,
  normaliseMessage,
  normaliseMessages,
  messageFormat,
} from "@/transcript/normalise";

describe("transcript normaliser", () => {
  it("reads user text", () => {
    expect(normaliseMessage(userFixture)).toEqual([
      expect.objectContaining({
        kind: "user",
        id: "msg-user",
        text: "Please look at the login form.",
      }),
    ]);
  });

  it("reads assistant text", () => {
    expect(normaliseMessage(assistantFixture)).toEqual([
      expect.objectContaining({
        kind: "assistant",
        text: "The login form validates the API key before it is stored.",
        turnId: "turn-1",
      }),
    ]);
  });

  it("reads thinking text", () => {
    expect(normaliseMessage(thinkingFixture)).toEqual([
      expect.objectContaining({ kind: "thinking", text: "Checking the form component." }),
    ]);
  });

  it("reads a tool name", () => {
    expect(normaliseMessage(toolFixture)).toEqual([
      expect.objectContaining({ kind: "tool", name: "read_file" }),
    ]);
  });

  it("ignores unknown protocol payloads", () => {
    expect(normaliseMessage(unknownFixture)).toEqual([]);
  });

  it("reads JSON-encoded agent payloads", () => {
    expect(
      normaliseMessage({
        ...assistantFixture,
        content: {
          turnId: "turn-1",
          rawPayload: JSON.stringify({
            type: "assistant",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "An encoded answer." }],
            },
          }),
        },
      }),
    ).toEqual([
      expect.objectContaining({ kind: "assistant", text: "An encoded answer.", turnId: "turn-1" }),
    ]);
  });

  it("reads direct SDK messages and native thinking blocks", () => {
    expect(
      normaliseMessage({
        ...assistantFixture,
        content: {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Checking the code." },
              { type: "text", text: "Here is the answer." },
              { type: "tool_use", name: "Read" },
            ],
          },
        },
      }),
    ).toEqual([
      expect.objectContaining({ kind: "thinking", text: "Checking the code." }),
      expect.objectContaining({ kind: "assistant", text: "Here is the answer." }),
      expect.objectContaining({ kind: "tool", name: "Read" }),
    ]);
  });

  it.each([
    { type: "item.completed", item: { type: "agent_message", text: "Codex answer." } },
    { method: "item/completed", params: { item: { type: "agentMessage", text: "Codex answer." } } },
  ])("reads completed Codex agent items: %j", (rawPayload) => {
    expect(normaliseMessage({ ...assistantFixture, content: { rawPayload } })).toEqual([
      expect.objectContaining({ kind: "assistant", text: "Codex answer." }),
    ]);
  });

  it.each([
    { type: "agentMessage", content: "An answer." },
    { type: "assistantMessage", content: { type: "text", text: "An answer." } },
    {
      payload: {
        data: {
          type: "assistant",
          message: { role: "assistant", content: [{ type: "text", text: "An answer." }] },
        },
      },
    },
    { type: "text", text: "An answer." },
  ])("reads normalized and wrapped agent messages: %j", (rawPayload) => {
    expect(normaliseMessage({ ...assistantFixture, content: { rawPayload } })).toEqual([
      expect.objectContaining({ kind: "assistant", text: "An answer." }),
    ]);
  });

  it("renders a successful final result when it is the only answer event", () => {
    expect(
      normaliseMessage({
        ...assistantFixture,
        content: {
          rawPayload: {
            type: "result",
            subtype: "success",
            is_error: false,
            result: "The final answer.",
          },
        },
      }),
    ).toEqual([
      expect.objectContaining({ kind: "assistant", text: "The final answer.", source: "result" }),
    ]);
  });

  it("does not duplicate a final result already delivered as assistant text", () => {
    const assistant = normaliseMessage(assistantFixture);
    const result = normaliseMessage({
      ...assistantFixture,
      id: "result",
      sessionIndex: 2,
      content: {
        turnId: "turn-1",
        rawPayload: {
          type: "result",
          subtype: "success",
          result: "The login form validates the API key before it is stored.",
        },
      },
    });
    expect(mergeEntries(assistant, result)).toEqual([
      expect.objectContaining({
        kind: "assistant",
        text: "The login form validates the API key before it is stored.",
        final: true,
      }),
    ]);
    expect(assistant[0]).not.toHaveProperty("final");
  });

  it("attaches SDK tool inputs and matching outputs to inspectable calls", () => {
    const call = {
      ...toolFixture,
      content: {
        rawPayload: {
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", id: "tool-1", name: "Shell", input: { command: "echo hello" } },
            ],
          },
        },
      },
    };
    const result = {
      ...toolFixture,
      id: "tool-result",
      sessionIndex: 4,
      content: {
        rawPayload: {
          type: "user",
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "tool-1", content: "hello", is_error: false },
            ],
          },
        },
      },
    };
    expect(normaliseMessages([call, result])).toEqual([
      expect.objectContaining({
        kind: "tool",
        name: "Shell",
        input: '{\n  "command": "echo hello"\n}',
        output: "hello",
      }),
    ]);
  });

  it("keeps command execution details and the available tool name", () => {
    expect(
      normaliseMessage({
        ...toolFixture,
        content: {
          type: "item.completed",
          item: {
            type: "command_execution",
            name: "exec_command",
            command: "pnpm test",
            aggregated_output: "Tests passed",
            exit_code: 0,
          },
        },
      }),
    ).toEqual([
      expect.objectContaining({
        kind: "tool",
        name: "exec_command",
        input: "pnpm test",
        output: "Tests passed",
        exitCode: 0,
      }),
    ]);
  });

  it("marks a Claude end-turn response as final", () => {
    expect(
      normaliseMessage({
        ...assistantFixture,
        content: {
          type: "assistant",
          message: {
            role: "assistant",
            stop_reason: "end_turn",
            content: [{ type: "text", text: "Done." }],
          },
        },
      }),
    ).toEqual([expect.objectContaining({ kind: "assistant", final: true, text: "Done." })]);
  });

  it("reads Cursor text messages", () => {
    expect(
      normaliseMessage({
        ...assistantFixture,
        content: {
          rawPayload: { type: "assistant", message: "Cursor answer." },
        },
      }),
    ).toEqual([expect.objectContaining({ kind: "assistant", text: "Cursor answer." })]);
  });

  it.each([
    { type: "system", subtype: "init" },
    { type: "result", result: "Already shown in the assistant message." },
    { type: "stream_event", event: { type: "content_block_delta" } },
    {
      type: "user",
      message: { role: "user", content: [{ type: "tool_result", content: "Tool output." }] },
    },
    { type: "item.started", item: { type: "agent_message", text: "Partial answer." } },
    { type: "assistant", message: { content: [{ type: "text", text: "" }] } },
  ])("does not render lifecycle or tool-result events: %j", (rawPayload) => {
    expect(normaliseMessage({ ...assistantFixture, content: { rawPayload } })).toEqual([]);
  });

  it("decodes nested arrays and newline-delimited SDK events", () => {
    const raw = {
      body: [
        JSON.stringify({ type: "system" }) +
          "\n" +
          JSON.stringify({
            type: "assistant",
            message: { content: [{ type: "text", text: "NDJSON answer." }] },
          }),
      ],
    };
    expect(normaliseMessage({ ...assistantFixture, content: { rawPayload: raw } })).toEqual([
      expect.objectContaining({ kind: "assistant", text: "NDJSON answer." }),
    ]);
  });

  it("supports explicitly typed plain-text API messages", () => {
    expect(
      normaliseMessage({ ...assistantFixture, type: "assistant", content: "A plain answer." }),
    ).toEqual([expect.objectContaining({ kind: "assistant", text: "A plain answer." })]);
    expect(normaliseMessage({ ...userFixture, content: "A plain prompt." })).toEqual([
      expect.objectContaining({ kind: "user", text: "A plain prompt." }),
    ]);
  });

  it("ignores malformed text/tool fields instead of crashing", () => {
    expect(
      normaliseMessage({
        ...assistantFixture,
        content: {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: { bad: true } },
              { type: "thinking", thinking: 42 },
              { type: "tool_use", name: null },
            ],
          },
        },
      }),
    ).toEqual([]);
  });

  it("diagnostics omit text, credentials and unknown scalar values", () => {
    const format = messageFormat({
      ...assistantFixture,
      content: {
        type: "agentMessage",
        rawPayload: {
          type: "sk-secret-key",
          apiKey: "top-secret",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Private message https://private.example/" }],
          },
        },
      },
    });
    expect(format).toContain('"role":"assistant"');
    expect(format).not.toContain("Private message");
    expect(format).not.toContain("private.example");
    expect(format).not.toContain("sk-secret-key");
    expect(format).not.toContain("top-secret");
  });

  it("diagnostics do not leak private data embedded in object keys", () => {
    const format = messageFormat({
      ...assistantFixture,
      content: {
        rawPayload: {
          "Private prompt as a field name": { "conductor-credential-in-key": "anything" },
          type: "unknown",
        },
      },
    });
    expect(format).not.toContain("Private prompt");
    expect(format).not.toContain("conductor-credential-in-key");
    expect(format).toContain("<field-");
  });

  it("merges pages by message id and keeps sessionIndex order", () => {
    const first = [
      { id: "b", sessionIndex: 1 },
      { id: "a", sessionIndex: 0 },
    ];
    const second = [
      { id: "b", sessionIndex: 1, replaced: true },
      { id: "c", sessionIndex: 2 },
    ];
    expect(mergeMessages(first, second)).toEqual([
      { id: "a", sessionIndex: 0 },
      { id: "b", sessionIndex: 1, replaced: true },
      { id: "c", sessionIndex: 2 },
    ]);
  });
});
