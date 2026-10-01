function hasControls(value: string): boolean {
  return [...value].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127);
}

// Never let API/message content introduce executable or credential-bearing URLs.
export function safeWebUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || hasControls(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password) return undefined;
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function safeMacUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("conductor://") || hasControls(value))
    return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "conductor:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
