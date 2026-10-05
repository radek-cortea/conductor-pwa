import { expect, test } from "vitest";
import { createQueryClient } from "@/query-client";
import { assistantFixture, userFixture } from "@/transcript/fixtures";
import { messagesKey, readPositionKey } from "@/transcript/load";
import { normaliseMessages } from "@/transcript/normalise";
import type { MessagesState } from "@/transcript/types";
import {
  createIDBPersister,
  flushStoredMessages,
  startMessagePersistence,
  stopMessagePersistence,
} from "@/storage/query-persistence";

function state(): MessagesState {
  return {
    byOffset: { 0: userFixture, 1: assistantFixture },
    entries: normaliseMessages([userFixture, assistantFixture]),
    startOffset: 0,
    endOffset: 2,
    total: 2,
    tailId: assistantFixture.id,
    pollHasMore: false,
    viewId: "test-window",
    initialPosition: "latest",
    unreadOffset: null,
    unsupportedFormats: [],
  };
}

test("IndexedDB restores messages and read positions, but not identity, credentials, or mutations", async () => {
  const first = createQueryClient();
  await startMessagePersistence("persistence-owner-A", first);
  first.setQueryData(messagesKey("ses-1"), state());
  const cursor = { messageId: assistantFixture.id, sessionIndex: 1, offset: 1 };
  first.setQueryData(readPositionKey("ses-1"), cursor);
  first.setQueryData(["me"], { apiKey: "must-not-be-persisted", email: "private@example.com" });
  first.setQueryData(["sessions", "ses-1", "status"], { status: "working" });
  first.setQueryData(["workspace-unread", "ws-1"], "unread");
  first.setQueryData(["workspace-unread-sessions", "ws-1"], [{ id: "ses-1" }]);
  await flushStoredMessages();
  await stopMessagePersistence(first, false);

  const reopened = createQueryClient();
  await startMessagePersistence("persistence-owner-A", reopened);
  expect(reopened.getQueryData<MessagesState>(messagesKey("ses-1"))?.byOffset[1]).toEqual(
    assistantFixture,
  );
  expect(reopened.getQueryData(readPositionKey("ses-1"))).toEqual(cursor);
  expect(reopened.getQueryData(["me"])).toBeUndefined();
  expect(reopened.getQueryData(["sessions", "ses-1", "status"])).toBeUndefined();
  expect(reopened.getQueryData(["workspace-unread", "ws-1"])).toBeUndefined();
  expect(reopened.getQueryData(["workspace-unread-sessions", "ws-1"])).toBeUndefined();
  await stopMessagePersistence(reopened);
});

test("another credential cannot hydrate the previous user's chats", async () => {
  const client = createQueryClient();
  await startMessagePersistence("persistence-owner-A", client);
  client.setQueryData(messagesKey("ses-1"), state());
  await flushStoredMessages();
  await startMessagePersistence("persistence-owner-B", client);
  expect(client.getQueryData(messagesKey("ses-1"))).toBeUndefined();
  await stopMessagePersistence(client);
  await startMessagePersistence("persistence-owner-A", client);
  expect(client.getQueryData(messagesKey("ses-1"))).toBeDefined();
  await stopMessagePersistence(client);
});

test("signing out removes persisted chats and cancels pending writes", async () => {
  const client = createQueryClient();
  await startMessagePersistence("persistence-owner-A", client);
  client.setQueryData(messagesKey("ses-1"), state());
  // No flush: the coalesced write is still pending when logout happens.
  await stopMessagePersistence(client);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await startMessagePersistence("persistence-owner-A", client);
  expect(client.getQueryData(messagesKey("ses-1"))).toBeUndefined();
  await stopMessagePersistence(client);
});

test("a cancelled restore cannot rehydrate chats after sign-out", async () => {
  const client = createQueryClient();
  await startMessagePersistence("persistence-owner-A", client);
  client.setQueryData(messagesKey("ses-1"), state());
  await flushStoredMessages();
  await stopMessagePersistence(client, false);
  const restoring = startMessagePersistence("persistence-owner-A", client);
  await stopMessagePersistence(client);
  await restoring;
  expect(client.getQueryData(messagesKey("ses-1"))).toBeUndefined();
  // Remove the snapshot that existed before the cancelled restoration.
  await startMessagePersistence("persistence-owner-A", client);
  await stopMessagePersistence(client);
});

test("the native IndexedDB persister round-trips structured data", async () => {
  const persister = createIDBPersister("test-native-roundtrip");
  const data = {
    timestamp: Date.now(),
    buster: "test",
    clientState: { mutations: [], queries: [] },
  };
  persister.persistClient(data);
  await persister.flush();
  expect(await persister.restoreClient()).toEqual(data);
  await persister.dispose(true);
  expect(await persister.restoreClient()).toBeUndefined();
});
