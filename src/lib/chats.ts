import type { Session } from "@/api/types";

const storageKey = (workspaceId: string) => `conductor:last-chat:${workspaceId}`;

export function rememberChat(workspaceId: string, sessionId: string): void {
  try {
    localStorage.setItem(storageKey(workspaceId), sessionId);
  } catch {
    // Chat navigation still works when browser storage is unavailable.
  }
}

export function lastChat(workspaceId: string, sessions: readonly Session[]): Session | undefined {
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(storageKey(workspaceId));
  } catch {
    // Fall back to the last chat in API order.
  }
  return sessions.find((session) => session.id === remembered) ?? sessions.at(-1);
}
