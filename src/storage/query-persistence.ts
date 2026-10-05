import { dehydrate, hydrate, QueryClient, type Query } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSave,
  persistQueryClientSubscribe,
  type PersistedClient,
  type Persister,
} from "@tanstack/react-query-persist-client";
import { createStore, del, get, set } from "idb-keyval";

export const CHAT_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const BUSTER = "chat-windows-v4";
const store = createStore("conductor-pwa", "query-cache");
let warned = false;
function storageWarning() {
  if (!warned) {
    warned = true;
    console.warn("Chat storage is unavailable; using an in-memory cache.");
  }
}

// TanStack's documented IndexedDB persister, with coalesced, ordered writes.
// https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient
export function createIDBPersister(key: string) {
  let pending: PersistedClient | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writes = Promise.resolve();
  let active = true;
  function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    const data = pending;
    pending = undefined;
    if (data && active)
      writes = writes
        .then(async () => {
          if (active) await set(key, data, store);
        })
        .catch(storageWarning);
    return writes;
  }
  const persister = {
    persistClient(client: PersistedClient) {
      if (!active) return;
      pending = client;
      if (!timer)
        timer = setTimeout(() => {
          void flush();
        }, 300);
    },
    async restoreClient() {
      try {
        return await get<PersistedClient>(key, store);
      } catch {
        storageWarning();
        return undefined;
      }
    },
    async removeClient() {
      pending = undefined;
      clearTimeout(timer);
      timer = undefined;
      await writes;
      try {
        await del(key, store);
      } catch {
        storageWarning();
      }
    },
    flush,
    async dispose(remove = false) {
      if (!remove) await flush();
      active = false;
      pending = undefined;
      clearTimeout(timer);
      if (remove) await persister.removeClient();
    },
  } satisfies Persister & { flush(): Promise<void>; dispose(remove?: boolean): Promise<void> };
  return persister;
}

export function shouldPersistChat(query: Query): boolean {
  return (
    query.state.status === "success" &&
    query.queryKey[0] === "sessions" &&
    query.queryKey[2] === "messages"
  );
}
const dehydrateOptions = {
  shouldDehydrateQuery: shouldPersistChat,
  shouldDehydrateMutation: () => false,
};
let active:
  | {
      scope: string;
      client: QueryClient;
      persister: ReturnType<typeof createIDBPersister>;
      unsubscribe: () => void;
    }
  | undefined;
let generation = 0;

export async function startMessagePersistence(
  apiKey: string | null,
  client: QueryClient,
): Promise<void> {
  const run = ++generation;
  if (!apiKey) {
    await stopMessagePersistence(client);
    return;
  }
  let scope: string;
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
    scope = `messages:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    if (run === generation) await stopMessagePersistence(client, false);
    storageWarning();
    return;
  }
  if (run !== generation) return;
  if (active?.scope === scope && active.client === client) return;
  const previous = active;
  active = undefined;
  previous?.unsubscribe();
  await previous?.persister.dispose();
  if (run !== generation) return;
  await client.cancelQueries();
  if (run !== generation) return;
  client.clear();
  const persister = createIDBPersister(scope);
  // Stage restoration: logout/account changes must not be undone by a late IDB read.
  const restored = new QueryClient({ defaultOptions: { queries: { gcTime: CHAT_CACHE_MAX_AGE } } });
  // Restore before router loaders mount; a provider alone cannot gate loaders.
  await persistQueryClientRestore({
    queryClient: restored,
    persister,
    buster: BUSTER,
    maxAge: CHAT_CACHE_MAX_AGE,
  });
  if (run !== generation) {
    restored.clear();
    await persister.dispose();
    return;
  }
  hydrate(client, dehydrate(restored, dehydrateOptions));
  restored.clear();
  active = {
    scope,
    client,
    persister,
    unsubscribe: persistQueryClientSubscribe({
      queryClient: client,
      persister,
      buster: BUSTER,
      dehydrateOptions,
    }),
  };
}

export async function flushStoredMessages(): Promise<void> {
  const current = active;
  if (!current) return;
  await persistQueryClientSave({
    queryClient: current.client,
    persister: current.persister,
    buster: BUSTER,
    dehydrateOptions,
  });
  await current.persister.flush();
}

export async function stopMessagePersistence(client: QueryClient, remove = true): Promise<void> {
  generation += 1;
  const current = active;
  active = undefined;
  current?.unsubscribe();
  await client.cancelQueries();
  client.clear();
  await current?.persister.dispose(remove);
}
