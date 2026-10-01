import { callApi, clientForStoredKey, createConductorClient } from "@/api/client";
import { ApiError } from "@/api/errors";
import { z } from "zod";
import { PAGE_SIZE, collectList } from "@/api/paging";
import type {
  CreateMessageResponse,
  CreateSessionResponse,
  CreateWorkspaceResponse,
  EffortId,
  Me,
  ModelId,
  PickerAgent,
  PreviewResponse,
  Project,
  Session,
  SessionStatus,
  TranscriptPage,
  Workspace,
  WorkspaceStatus,
} from "@/api/types";

export async function fetchMe(apiKey: string, signal?: AbortSignal): Promise<Me> {
  const client = createConductorClient(apiKey);
  return callApi(() => client.GET("/me", { signal }));
}

export async function fetchProjects(signal: AbortSignal): Promise<Project[]> {
  const client = clientForStoredKey();
  return collectList((offset) =>
    callApi(() =>
      client.GET("/v0/projects", {
        params: { query: { limit: PAGE_SIZE, offset } },
        signal,
      }),
    ),
  );
}

export async function fetchWorkspaces(
  archived: boolean,
  creatorId: string,
  signal: AbortSignal,
): Promise<Workspace[]> {
  const client = clientForStoredKey();
  return collectList((offset) =>
    callApi(() =>
      client.GET("/v0/workspaces", {
        params: {
          query: {
            limit: PAGE_SIZE,
            offset,
            creator: creatorId,
            ...(archived ? { includeArchived: true } : {}),
          },
        },
        signal,
      }),
    ),
  );
}

export async function fetchWorkspace(workspaceId: string, signal: AbortSignal): Promise<Workspace> {
  const client = clientForStoredKey();
  return callApi(() =>
    client.GET("/v0/workspaces/{workspaceId}", {
      params: { path: { workspaceId } },
      signal,
    }),
  );
}

export async function fetchWorkspaceStatus(
  workspaceId: string,
  signal: AbortSignal,
): Promise<WorkspaceStatus> {
  const client = clientForStoredKey();
  return callApi(() =>
    client.GET("/v0/workspaces/{workspaceId}/status", {
      params: { path: { workspaceId } },
      signal,
    }),
  );
}

export async function fetchSessions(
  workspaceId: string,
  includeArchived: boolean,
  signal: AbortSignal,
): Promise<Session[]> {
  const client = clientForStoredKey();
  return collectList((offset) =>
    callApi(() =>
      client.GET("/v0/workspaces/{workspaceId}/sessions", {
        params: {
          path: { workspaceId },
          query: {
            limit: PAGE_SIZE,
            offset,
            ...(includeArchived ? { includeArchived: true } : {}),
          },
        },
        signal,
      }),
    ),
  );
}

export async function fetchPreview(
  workspaceId: string,
  signal: AbortSignal,
): Promise<PreviewResponse> {
  const client = clientForStoredKey();
  return callApi(() =>
    client.GET("/v0/workspaces/{workspaceId}/preview", {
      params: { path: { workspaceId } },
      signal,
    }),
  );
}

export async function fetchSession(sessionId: string, signal: AbortSignal): Promise<Session> {
  const client = clientForStoredKey();
  return callApi(() =>
    client.GET("/v0/sessions/{sessionId}", {
      params: { path: { sessionId } },
      signal,
    }),
  );
}

export async function fetchSessionStatus(
  sessionId: string,
  signal: AbortSignal,
): Promise<SessionStatus> {
  const client = clientForStoredKey();
  return callApi(() =>
    client.GET("/v0/sessions/{sessionId}/status", {
      params: { path: { sessionId } },
      signal,
    }),
  );
}

const transcriptPageSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      sessionId: z.string(),
      sessionIndex: z.number().finite(),
      type: z.string(),
      content: z.unknown(),
      receivedAt: z.string(),
    }),
  ),
  offset: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export async function fetchMessagePage(
  sessionId: string,
  query: { limit: number; offset: number } | { limit: number; after: string },
  signal: AbortSignal,
): Promise<TranscriptPage> {
  const client = clientForStoredKey();
  const page = await callApi(() =>
    client.GET("/v0/sessions/{sessionId}/messages", {
      params: { path: { sessionId }, query },
      signal,
    }),
  );
  if (!transcriptPageSchema.safeParse(page).success)
    throw new ApiError(502, "Conductor returned an unsupported message-page format.");
  return page;
}

export async function sendMessage(
  sessionId: string,
  message: string,
): Promise<CreateMessageResponse> {
  const client = clientForStoredKey();
  return callApi(() =>
    client.POST("/v0/sessions/{sessionId}/messages", {
      params: { path: { sessionId } },
      body: { message },
    }),
  );
}

export async function cancelSession(sessionId: string) {
  const client = clientForStoredKey();
  return callApi(() =>
    client.POST("/v0/sessions/{sessionId}/cancel", {
      params: { path: { sessionId } },
    }),
  );
}

export async function createWorkspace(input: {
  projectId: string;
  branch?: string;
  name?: string;
  agent: PickerAgent;
  model: ModelId;
  effort?: EffortId;
  message: string;
}): Promise<CreateWorkspaceResponse> {
  const client = clientForStoredKey();
  return callApi(() =>
    client.POST("/v0/workspaces", {
      body: {
        projectId: input.projectId,
        agent: input.agent,
        model: input.model,
        message: input.message,
        ...(input.branch ? { branch: input.branch } : {}),
        ...(input.name ? { name: input.name } : {}),
        ...(input.effort ? { effort: input.effort } : {}),
      },
    }),
  );
}

export async function createSession(input: {
  workspaceId: string;
  agent: PickerAgent;
  model: ModelId;
  effort?: EffortId;
  message?: string;
}): Promise<CreateSessionResponse> {
  const client = clientForStoredKey();
  return callApi(() =>
    client.POST("/v0/sessions", {
      body: {
        workspaceId: input.workspaceId,
        agent: input.agent,
        model: input.model,
        ...(input.effort ? { effort: input.effort } : {}),
        ...(input.message ? { message: input.message } : {}),
      },
    }),
  );
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<Workspace> {
  const client = clientForStoredKey();
  return callApi(() =>
    client.POST("/v0/workspaces/{workspaceId}/rename", {
      params: { path: { workspaceId } },
      body: { name },
    }),
  );
}

export async function archiveWorkspace(workspaceId: string) {
  const client = clientForStoredKey();
  return callApi(() =>
    client.POST("/v0/workspaces/{workspaceId}/archive", {
      params: { path: { workspaceId } },
    }),
  );
}

export async function restoreWorkspace(workspaceId: string) {
  const client = clientForStoredKey();
  return callApi(() =>
    client.POST("/v0/workspaces/{workspaceId}/unarchive", {
      params: { path: { workspaceId } },
    }),
  );
}

export async function sleepWorkspace(workspaceId: string) {
  const client = clientForStoredKey();
  return callApi(() =>
    client.POST("/v0/workspaces/{workspaceId}/sleep", {
      params: { path: { workspaceId } },
    }),
  );
}
