import { queryOptions } from "@tanstack/react-query";
import {
  fetchMe,
  fetchPreview,
  fetchProjects,
  fetchSession,
  fetchSessionStatus,
  fetchSessions,
  fetchWorkspace,
  fetchWorkspaceStatus,
  fetchWorkspaces,
} from "@/api/fetch";
import { ApiError } from "@/api/errors";
import { readCredential } from "@/auth/credential";
import type { SessionPhase, SessionStatus } from "@/api/types";
import { queryClient } from "@/query-client";
import { loadTranscript, mergePolledMessages, messagesKey } from "@/transcript/load";
import type { MessagesState } from "@/transcript/types";
import { CHAT_CACHE_MAX_AGE } from "@/storage/query-persistence";

export const HOME_STALE_MS = 60_000;
export const HOME_REFETCH_MS = 15_000;
export const ACTIVE_POLL_MS = 2_000;
export const QUIET_POLL_MS = 6_000;

export function sessionPollInterval(status: SessionPhase | undefined): number {
  return status === "working" ? ACTIVE_POLL_MS : QUIET_POLL_MS;
}

export function meQuery() {
  return queryOptions({
    queryKey: ["me"] as const,
    queryFn: ({ signal }) => {
      const apiKey = readCredential();
      if (!apiKey) throw new ApiError(401, "Sign in to continue.");
      return fetchMe(apiKey, signal);
    },
    staleTime: HOME_STALE_MS,
  });
}

export function projectsQuery() {
  return queryOptions({
    queryKey: ["projects"] as const,
    queryFn: ({ signal }) => fetchProjects(signal),
    staleTime: HOME_STALE_MS,
    refetchInterval: HOME_REFETCH_MS,
  });
}

export function workspacesQuery(archived: boolean) {
  return queryOptions({
    queryKey: ["workspaces", { archived }] as const,
    queryFn: async ({ signal, client }) => {
      const me = await client.ensureQueryData(meQuery());
      return fetchWorkspaces(archived, me.userId, signal);
    },
    staleTime: HOME_STALE_MS,
    refetchInterval: HOME_REFETCH_MS,
  });
}

export function workspaceQuery(workspaceId: string) {
  return queryOptions({
    queryKey: ["workspaces", workspaceId] as const,
    queryFn: ({ signal }) => fetchWorkspace(workspaceId, signal),
    staleTime: HOME_STALE_MS,
  });
}

export function workspaceStatusQuery(workspaceId: string) {
  return queryOptions({
    queryKey: ["workspaces", workspaceId, "status"] as const,
    queryFn: ({ signal }) => fetchWorkspaceStatus(workspaceId, signal),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "initializing" || status === "updating") return ACTIVE_POLL_MS;
      return false;
    },
  });
}

export function sessionsQuery(workspaceId: string, archived: boolean) {
  return queryOptions({
    queryKey: ["workspaces", workspaceId, "sessions", { archived }] as const,
    queryFn: ({ signal }) => fetchSessions(workspaceId, archived, signal),
  });
}

export function previewQuery(workspaceId: string) {
  return queryOptions({
    queryKey: ["workspaces", workspaceId, "preview"] as const,
    queryFn: async ({ signal }) => {
      try {
        return await fetchPreview(workspaceId, signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) throw error;
        return { preview: null };
      }
    },
    retry: false,
    staleTime: HOME_STALE_MS,
  });
}

export function sessionQuery(sessionId: string) {
  return queryOptions({
    queryKey: ["sessions", sessionId] as const,
    queryFn: ({ signal }) => fetchSession(sessionId, signal),
  });
}

export function sessionStatusQuery(sessionId: string) {
  return queryOptions({
    queryKey: ["sessions", sessionId, "status"] as const,
    queryFn: ({ signal }) => fetchSessionStatus(sessionId, signal),
    refetchInterval: (query) => sessionPollInterval(query.state.data?.status),
  });
}

export function messagesQuery(sessionId: string) {
  return queryOptions({
    queryKey: messagesKey(sessionId),
    meta: { persist: true },
    gcTime: CHAT_CACHE_MAX_AGE,
    queryFn: async ({ signal, client }) => {
      const cached = client.getQueryData<MessagesState>(messagesKey(sessionId));
      const incoming = await loadTranscript(sessionId, signal, cached);
      return mergePolledMessages(
        client.getQueryData<MessagesState>(messagesKey(sessionId)),
        incoming,
      );
    },
    refetchInterval: (query) => {
      if (query.state.data?.pollHasMore) return 100;
      const status = queryClient.getQueryData<SessionStatus>([
        "sessions",
        sessionId,
        "status",
      ])?.status;
      return sessionPollInterval(status);
    },
  });
}
