export type MessagePart = { kind: "text" | "system"; text: string; start: number };

export function splitSystemInstructions(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const tags = /<system_instruction\b[^>]*>([\s\S]*?)(?:<\/system_instruction\s*>|$)/gi;
  let start = 0;
  for (const match of text.matchAll(tags)) {
    if (match.index > start)
      parts.push({ kind: "text", text: text.slice(start, match.index), start });
    parts.push({ kind: "system", text: match[1] ?? "", start: match.index });
    start = match.index + match[0].length;
  }
  if (start < text.length) parts.push({ kind: "text", text: text.slice(start), start });
  return parts;
}

export function promptText(text: string): string {
  return splitSystemInstructions(text)
    .filter((part) => part.kind === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}
