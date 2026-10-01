import { http, HttpResponse } from "msw";
import {
  assistantFixture,
  assistantReply,
  unknownFixture,
  userFixture,
} from "@/transcript/fixtures";
import type { TranscriptMessage } from "@/api/types";

export const API_ORIGIN = "https://api.conductor.build";
export const TEST_API_KEY = "conductor-test-key";

export type RecordedRequest = {
  method: string;
  pathname: string;
  search: string;
  body: unknown;
};

export const recorded: RecordedRequest[] = [];

let followUp: TranscriptMessage | null = null;
let createdSession = false;
let sentPrompt: string | null = null;

export function resetApiState(): void {
  recorded.length = 0;
  followUp = null;
  createdSession = false;
  sentPrompt = null;
}

export function requestsTo(method: string, pathname: string): RecordedRequest[] {
  return recorded.filter((entry) => entry.method === method && entry.pathname === pathname);
}

const project = {
  id: "proj-conductor",
  name: "Conductor",
  gitRemote: "https://github.com/cortea/conductor",
};

const readyWorkspace = {
  id: "ws-ready",
  projectId: "proj-conductor",
  name: "Billing export",
  creatorId: "user-ada",
  state: "ready" as const,
  repoUrl: "https://github.com/cortea/conductor",
  createdAt: "2026-09-01T10:00:00.000Z",
  deepLink: "conductor://workspaces/ws-ready",
  lastActivityAt: "2026-09-30T09:00:00.000Z",
};

const archivedWorkspace = {
  id: "ws-archived",
  projectId: "proj-conductor",
  name: "Old migration",
  creatorId: "user-ada",
  state: "archived" as const,
  repoUrl: "https://github.com/cortea/conductor",
  createdAt: "2026-08-01T10:00:00.000Z",
  deepLink: "conductor://workspaces/ws-archived",
  lastActivityAt: "2026-08-02T09:00:00.000Z",
};

function guardQuery(url: URL): void {
  for (const key of url.searchParams.keys()) {
    if (/key|token|authorization|secret/i.test(key)) {
      throw new Error("Credential appeared in the query string");
    }
  }
}

async function readBody(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const text = await request.clone().text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function remember(request: Request, body: unknown): void {
  const url = new URL(request.url);
  guardQuery(url);
  recorded.push({
    method: request.method,
    pathname: url.pathname,
    search: url.search,
    body,
  });
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

function unauthorized() {
  return HttpResponse.json({ userMessage: "That key is not valid." }, { status: 401 });
}

function accepted(request: Request): boolean {
  return bearer(request) === TEST_API_KEY;
}

function list(url: URL, rows: unknown[]) {
  const offset = Number(url.searchParams.get("offset") ?? "0");
  if (offset > 0) return { data: [], offset, hasMore: false };
  return { data: rows, offset: 0, hasMore: false };
}

function workspaceFor(id: string) {
  if (id === archivedWorkspace.id) return archivedWorkspace;
  if (id === "ws-new") {
    return {
      ...readyWorkspace,
      id,
      name: "New billing workspace",
      state: "initializing" as const,
      lifecycleStep: "preparing" as const,
      deepLink: "conductor://workspaces/ws-new",
    };
  }
  return { ...readyWorkspace, id };
}

export const handlers = [
  http.get(`${API_ORIGIN}/me`, async ({ request }) => {
    remember(request, undefined);
    if (!accepted(request)) return unauthorized();
    return HttpResponse.json({
      userId: "user-ada",
      name: "Ada",
      email: "ada@example.com",
      authMethod: "api-key",
    });
  }),
  http.get(`${API_ORIGIN}/v0/projects`, async ({ request }) => {
    remember(request, undefined);
    if (!accepted(request)) return unauthorized();
    return HttpResponse.json(list(new URL(request.url), [project]));
  }),
  http.get(`${API_ORIGIN}/v0/workspaces`, async ({ request }) => {
    remember(request, undefined);
    if (!accepted(request)) return unauthorized();
    const url = new URL(request.url);
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const rows = [
      readyWorkspace,
      archivedWorkspace,
      { ...readyWorkspace, id: "ws-other", creatorId: "user-grace", name: "Grace's workspace" },
      {
        ...archivedWorkspace,
        id: "ws-other-archived",
        creatorId: "user-grace",
        name: "Grace's archived workspace",
      },
    ].filter(
      (workspace) =>
        (includeArchived || workspace.state !== "archived") &&
        (!url.searchParams.has("creator") ||
          workspace.creatorId === url.searchParams.get("creator")),
    );
    return HttpResponse.json(list(url, rows));
  }),
  http.post(`${API_ORIGIN}/v0/workspaces`, async ({ request }) => {
    const body = await readBody(request);
    remember(request, body);
    if (!accepted(request)) return unauthorized();
    return HttpResponse.json(
      {
        workspaceId: "ws-new",
        sessionId: "ses-new",
        deepLink: "conductor://workspaces/ws-new",
        initialMessage: {
          messageId: "msg-open",
          state: "queued",
          deepLink: "conductor://sessions/ses-new",
        },
      },
      { status: 201 },
    );
  }),
  http.get(`${API_ORIGIN}/v0/workspaces/:workspaceId/status`, async ({ request, params }) => {
    remember(request, undefined);
    if (!accepted(request)) return unauthorized();
    const workspaceId = String(params.workspaceId);
    return HttpResponse.json({
      workspaceId,
      status: workspaceId === "ws-new" ? "initializing" : "ready",
      lifecycleStep: workspaceId === "ws-new" ? "preparing" : undefined,
      updatedAt: "2026-09-30T09:00:00.000Z",
    });
  }),
  http.get(`${API_ORIGIN}/v0/workspaces/:workspaceId/sessions`, async ({ request, params }) => {
    remember(request, undefined);
    if (!accepted(request)) return unauthorized();
    const rows =
      params.workspaceId === "ws-new"
        ? [
            {
              id: "ses-new",
              deepLink: "conductor://sessions/ses-new",
              name: "Opening chat",
            },
          ]
        : [
            {
              id: "ses-live",
              deepLink: "conductor://sessions/ses-live",
              name: "Login form",
            },
          ];
    if (createdSession)
      rows.push({
        id: "ses-created",
        deepLink: "conductor://sessions/ses-created",
        name: "New chat",
      });
    return HttpResponse.json(list(new URL(request.url), rows));
  }),
  http.get(`${API_ORIGIN}/v0/workspaces/:workspaceId/preview`, async ({ request }) => {
    remember(request, undefined);
    if (!accepted(request)) return unauthorized();
    return HttpResponse.json({ preview: null });
  }),
  http.get(`${API_ORIGIN}/v0/workspaces/:workspaceId`, async ({ request, params }) => {
    remember(request, undefined);
    if (!accepted(request)) return unauthorized();
    return HttpResponse.json(workspaceFor(String(params.workspaceId)));
  }),
  http.get(`${API_ORIGIN}/v0/sessions/:sessionId/status`, async ({ request, params }) => {
    remember(request, undefined);
    if (!accepted(request)) return unauthorized();
    return HttpResponse.json({
      workspaceId: "ws-ready",
      sessionId: String(params.sessionId),
      status: "working",
      updatedAt: "2026-09-30T09:00:00.000Z",
    });
  }),
  http.get(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, async ({ request, params }) => {
    remember(request, undefined);
    if (!accepted(request)) return unauthorized();
    const url = new URL(request.url);
    const sessionId = String(params.sessionId);
    const rows: TranscriptMessage[] = [
      { ...userFixture, sessionId },
      {
        ...assistantFixture,
        sessionId,
        content: {
          turnId: "turn-1",
          rawPayload: JSON.stringify(
            (assistantFixture.content as { rawPayload: unknown }).rawPayload,
          ),
        },
      },
      { ...unknownFixture, sessionId },
      ...(sentPrompt
        ? [
            {
              ...userFixture,
              id: "msg-sent",
              sessionId,
              sessionIndex: 5,
              content: { type: "userMessage", message: sentPrompt },
            },
          ]
        : []),
      ...(followUp ? [followUp] : []),
    ];
    const after = url.searchParams.get("after");
    const offset = after
      ? rows.findIndex((row) => row.id === after) + 1
      : Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    return HttpResponse.json({
      data: rows.slice(offset, offset + limit),
      offset,
      hasMore: offset + limit < rows.length,
    });
  }),
  http.get(`${API_ORIGIN}/v0/sessions/:sessionId`, async ({ request, params }) => {
    remember(request, undefined);
    if (!accepted(request)) return unauthorized();
    const sessionId = String(params.sessionId);
    return HttpResponse.json({
      id: sessionId,
      deepLink: `conductor://sessions/${sessionId}`,
      name:
        sessionId === "ses-new"
          ? "Opening chat"
          : sessionId === "ses-created"
            ? "New chat"
            : "Login form",
    });
  }),
  http.post(`${API_ORIGIN}/v0/sessions/:sessionId/messages`, async ({ request, params }) => {
    const body = await readBody(request);
    remember(request, body);
    if (!accepted(request)) return unauthorized();
    const sessionId = String(params.sessionId);
    followUp = { ...assistantReply, sessionId };
    sentPrompt = (body as { message: string }).message;
    return HttpResponse.json(
      {
        messageId: "msg-sent",
        state: "queued",
        deepLink: `conductor://sessions/${sessionId}`,
      },
      { status: 201 },
    );
  }),
  http.post(`${API_ORIGIN}/v0/sessions/:sessionId/cancel`, async ({ request, params }) => {
    const body = await readBody(request);
    remember(request, body);
    if (!accepted(request)) return unauthorized();
    return HttpResponse.json({
      workspaceId: "ws-ready",
      sessionId: String(params.sessionId),
      status: "idle",
      canceledQueuedMessages: 0,
    });
  }),
  http.post(`${API_ORIGIN}/v0/sessions`, async ({ request }) => {
    const body = await readBody(request);
    remember(request, body);
    if (!accepted(request)) return unauthorized();
    createdSession = true;
    return HttpResponse.json(
      {
        id: "ses-created",
        name: "New chat",
        deepLink: "conductor://sessions/ses-created",
      },
      { status: 201 },
    );
  }),
];
