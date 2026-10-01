import { z } from "zod";

export const CREDENTIAL_STORAGE_KEY = "conductor.credential";

const credentialSchema = z.object({
  apiKey: z.string().min(1),
});

export type KeyValueStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function browserStore(): KeyValueStore {
  return localStorage;
}

export function readCredential(store: KeyValueStore = browserStore()): string | null {
  const raw = store.getItem(CREDENTIAL_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = credentialSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.apiKey : null;
  } catch {
    return null;
  }
}

export function writeCredential(apiKey: string, store: KeyValueStore = browserStore()): void {
  const stored = credentialSchema.parse({ apiKey });
  store.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(stored));
}

export function clearCredential(store: KeyValueStore = browserStore()): void {
  store.removeItem(CREDENTIAL_STORAGE_KEY);
}
