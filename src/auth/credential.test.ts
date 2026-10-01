import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_STORAGE_KEY,
  clearCredential,
  readCredential,
  readRememberedCredential,
  signOutCredential,
  writeCredential,
  type KeyValueStore,
} from "@/auth/credential";

function memoryStore(initial?: string): KeyValueStore {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(CREDENTIAL_STORAGE_KEY, initial);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("credential storage", () => {
  it("treats a missing value as signed out", () => {
    expect(readCredential(memoryStore())).toBeNull();
  });

  it("reads a key that was stored as the expected object", () => {
    const store = memoryStore();
    writeCredential("cond_live_key", store);
    expect(readCredential(store)).toBe("cond_live_key");
    clearCredential(store);
    expect(readCredential(store)).toBeNull();
  });

  it("signs out without forgetting the saved key, and can explicitly delete it", () => {
    const store = memoryStore();
    writeCredential("cond_saved_key", store);
    signOutCredential(store);
    expect(readCredential(store)).toBeNull();
    expect(readRememberedCredential(store)).toBe("cond_saved_key");
    writeCredential(readRememberedCredential(store)!, store);
    expect(readCredential(store)).toBe("cond_saved_key");
    clearCredential(store);
    expect(readCredential(store)).toBeNull();
    expect(readRememberedCredential(store)).toBeNull();
  });

  it("rejects garbage and the wrong shape", () => {
    expect(readCredential(memoryStore("not-json"))).toBeNull();
    expect(readCredential(memoryStore("42"))).toBeNull();
    expect(readCredential(memoryStore(JSON.stringify({ apiKey: "" })))).toBeNull();
    expect(readCredential(memoryStore(JSON.stringify({ apiKey: 12 })))).toBeNull();
    expect(readCredential(memoryStore(JSON.stringify({ token: "cond_live_key" })))).toBeNull();
  });
});
