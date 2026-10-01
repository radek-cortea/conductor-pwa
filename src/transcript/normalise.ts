import type { TranscriptMessage } from "@/api/types";
import type { TranscriptEntry } from "@/transcript/types";

type Payload = Record<string, unknown>;
type EntryPart<T> = T extends unknown
  ? Omit<T, "id" | "messageId" | "receivedAt" | "sessionIndex" | "partIndex" | "offset">
  : never;
const containers = [
  "rawPayload",
  "payload",
  "data",
  "body",
  "event",
  "message",
  "content",
] as const;
const protocolTypes = new Set([
  "system",
  "result",
  "user",
  "tool_result",
  "stream_event",
  "ping",
  "usage",
  "item.started",
  "item.updated",
]);
const diagnosticNames = new Set([
  ...protocolTypes,
  "agent",
  "agentMessage",
  "userMessage",
  "assistant",
  "assistantMessage",
  "agent_message",
  "text",
  "output_text",
  "thinking",
  "tool_use",
  "tool_call",
  "reasoning",
  "command_execution",
  "commandExecution",
  "item.completed",
  "item/completed",
]);

function decode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    const lines = value.trim().split("\n");
    if (lines.length > 1 && lines.every((line) => line.trim().startsWith("{"))) {
      try {
        return lines.map((line) => JSON.parse(line) as unknown);
      } catch {
        /* not NDJSON */
      }
    }
    return value;
  }
}

function payload(value: unknown): Payload | null {
  value = decode(value);
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Payload)
    : null;
}

export function mergeMessages<T extends { id: string; sessionIndex: number }>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const message of [...existing, ...incoming]) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.sessionIndex - b.sessionIndex);
}

export function mergeEntries(
  existing: readonly TranscriptEntry[],
  incoming: readonly TranscriptEntry[],
): TranscriptEntry[] {
  const byId = new Map<string, TranscriptEntry>();
  for (const entry of [...existing, ...incoming]) byId.set(entry.id, entry);
  const sorted = [...byId.values()].sort(
    (a, b) => a.sessionIndex - b.sessionIndex || a.partIndex - b.partIndex,
  );
  const answers = new Set<string>();
  return sorted.filter((entry) => {
    if (entry.kind === "user") answers.clear();
    if (entry.kind !== "assistant") return true;
    const key = `${entry.turnId ?? ""}:${entry.text.trim()}`;
    if (entry.source === "result" && answers.has(key)) return false;
    answers.add(key);
    return true;
  });
}

export function takeNewest(entries: readonly TranscriptEntry[], cap: number): TranscriptEntry[] {
  return mergeEntries([], entries).slice(-cap);
}

export function normaliseMessages(messages: readonly TranscriptMessage[]): TranscriptEntry[] {
  return mergeEntries([], messages.flatMap(normaliseMessage));
}

export function normaliseMessage(message: TranscriptMessage): TranscriptEntry[] {
  const decoded = decode(message.content);
  const content = payload(decoded);
  const userText =
    content?.type === "userMessage" || ["user", "userMessage"].includes(message.type)
      ? typeof content?.message === "string"
        ? content.message
        : typeof decoded === "string"
          ? decoded
          : undefined
      : undefined;
  const base = {
    messageId: message.id,
    receivedAt: message.receivedAt,
    sessionIndex: message.sessionIndex,
  };
  if (userText !== undefined)
    return [{ ...base, kind: "user", id: message.id, partIndex: 0, text: userText }];

  const entries: TranscriptEntry[] = [];
  function add(part: EntryPart<TranscriptEntry>) {
    const partIndex = entries.length;
    entries.push({ ...base, ...part, id: `${message.id}:${partIndex}`, partIndex });
  }
  function visit(value: unknown, assistant = false, turnId?: string, depth = 0): void {
    if (depth > 12) return;
    value = decode(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child, assistant, turnId, depth + 1);
      return;
    }
    if (typeof value === "string") {
      if (assistant && value.trim())
        add({ kind: "assistant", text: value, ...(turnId ? { turnId } : {}) });
      return;
    }
    const raw = payload(value);
    if (!raw) return;
    if (typeof raw.turnId === "string") turnId = raw.turnId;
    const turn = turnId ? { turnId } : {};
    const type = typeof raw.type === "string" ? raw.type : undefined;
    const text = raw.type === "thinking" ? (raw.thinking ?? raw.text) : raw.text;

    if (type === "result") {
      if (
        raw.subtype === "success" &&
        raw.is_error !== true &&
        typeof raw.result === "string" &&
        raw.result.trim()
      )
        add({ kind: "assistant", text: raw.result, source: "result", ...turn });
      return;
    }
    // SDK user messages are tool results, not prompts or agent replies.
    if (raw.role === "user" || (type && protocolTypes.has(type))) return;
    if (typeof raw.method === "string" && /(?:delta|started)$/.test(raw.method)) return;
    if ((type === "text" || type === "output_text") && typeof text === "string" && text.trim()) {
      add({ kind: "assistant", text, ...turn });
      return;
    }
    if (type === "thinking" && typeof text === "string" && text.trim()) {
      add({ kind: "thinking", text, ...turn });
      return;
    }
    if ((type === "tool_use" || type === "tool_call") && typeof raw.name === "string") {
      add({ kind: "tool", name: raw.name, ...turn });
      return;
    }
    if (type === "item.completed" || raw.method === "item/completed") {
      const item = raw.item ?? payload(raw.params)?.item;
      visit(item, false, turnId, depth + 1);
      return;
    }
    if (type === "reasoning") {
      const reasoning =
        typeof text === "string"
          ? text
          : Array.isArray(raw.summary)
            ? raw.summary.filter((s) => typeof s === "string").join("\n")
            : "";
      if (reasoning.trim()) add({ kind: "thinking", text: reasoning, ...turn });
      return;
    }
    if (type === "command_execution" || type === "commandExecution") {
      add({ kind: "tool", name: "Shell", ...turn });
      return;
    }
    assistant ||=
      raw.role === "assistant" ||
      ["assistant", "assistantMessage", "agentMessage", "agent_message"].includes(type ?? "");
    if (assistant && typeof text === "string" && text.trim()) {
      add({ kind: "assistant", text, ...turn });
      return;
    }
    // Only follow documented message containers, never tool inputs/results or usage metadata.
    for (const key of containers) {
      if (raw[key] === undefined) continue;
      const before = entries.length;
      // An unparseable rawPayload must not become a JSON/log-shaped chat bubble.
      const childAssistant = key === "message" || key === "content" ? assistant : false;
      visit(raw[key], childAssistant, turnId, depth + 1);
      if (entries.length > before) return;
    }
  }
  visit(decoded, ["assistant", "assistantMessage", "agentMessage"].includes(message.type));
  return entries;
}

// Copyable, structural diagnostics: no prompt text, tool output, credentials or URLs.
export function messageFormat(message: TranscriptMessage): string {
  function shape(value: unknown, depth = 0): unknown {
    if (depth > 5) return "…";
    value = decode(value);
    if (Array.isArray(value)) return value.slice(0, 1).map((item) => shape(item, depth + 1));
    const raw = payload(value);
    if (!raw) return `<${typeof value}>`;
    return Object.fromEntries(
      Object.entries(raw)
        .slice(0, 16)
        .filter(([key]) => !/secret|password|token|authorization|apiKey/i.test(key))
        .map(([key, child]) => [
          key,
          (key === "type" || key === "role" || key === "method") &&
          typeof child === "string" &&
          diagnosticNames.has(child)
            ? child
            : shape(child, depth + 1),
        ]),
    );
  }
  return JSON.stringify({
    type: diagnosticNames.has(message.type) ? message.type : "<string>",
    content: shape(message.content),
  });
}

export function unsupportedMessageFormats(messages: readonly TranscriptMessage[]): string[] {
  const formats = new Set<string>();
  for (const message of messages) {
    if (!/agent|assistant/i.test(message.type) || normaliseMessage(message).length) continue;
    let raw = payload(message.content);
    for (let depth = 0; raw && depth < 12; depth += 1) {
      const inner: Payload | null =
        containers.map((key) => payload(raw?.[key])).find(Boolean) ?? null;
      if (!inner) break;
      raw = inner;
    }
    if (raw && (protocolTypes.has(String(raw.type)) || raw.kind === "ping")) continue;
    formats.add(messageFormat(message));
  }
  return [...formats].slice(0, 3);
}

export function newestMessageId(messages: readonly TranscriptMessage[]): string | null {
  return mergeMessages([], messages).at(-1)?.id ?? null;
}
