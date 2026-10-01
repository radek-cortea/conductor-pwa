import type { operations } from "@/api/generated/schema";

type JsonOf<T> = T extends { content: { "application/json": infer Body } } ? Body : never;

type Ok<Op> = Op extends { responses: infer Responses }
  ? 200 extends keyof Responses
    ? JsonOf<Responses[200]>
    : never
  : never;

type Created<Op> = Op extends { responses: infer Responses }
  ? 201 extends keyof Responses
    ? JsonOf<Responses[201]>
    : never
  : never;

export type Me = Ok<operations["me.get"]>;
export type Project = Ok<operations["project.get"]>;
export type Workspace = Ok<operations["workspace.get"]>;
export type WorkspaceStatus = Ok<operations["workspace.status.get"]>;
export type Session = Ok<operations["session.get"]>;
export type SessionStatus = Ok<operations["session.status.get"]>;
export type PreviewResponse = Ok<operations["workspace.preview.get"]>;
export type TranscriptPage = Ok<operations["session.messages.list"]>;
export type TranscriptMessage = TranscriptPage["data"][number];
export type CreateWorkspaceResponse = Created<operations["workspace.create"]>;
export type CreateSessionResponse = Created<operations["session.create"]>;
export type CreateMessageResponse = Created<operations["message.create"]>;

type CreateWorkspaceBody =
  operations["workspace.create"]["requestBody"]["content"]["application/json"];
type ProjectWorkspaceBody = Extract<CreateWorkspaceBody, { projectId: string }>;

export type AgentId = NonNullable<ProjectWorkspaceBody["agent"]>;
export type ModelId = NonNullable<ProjectWorkspaceBody["model"]>;
export type EffortId = NonNullable<ProjectWorkspaceBody["effort"]>;
export type PickerAgent = Exclude<AgentId, "acp">;

export type SessionPhase = NonNullable<SessionStatus["status"]>;
export type WorkspacePhase = NonNullable<WorkspaceStatus["status"]>;
