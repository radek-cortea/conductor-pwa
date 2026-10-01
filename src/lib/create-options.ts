import { z } from "zod";
import type { KeyValueStore } from "@/auth/credential";
import { agentModels } from "@/lib/agent-models";

const schema = z.object({
  projectId: z.string(),
  branch: z.string(),
  agent: z.enum(["claude", "codex", "cursor"]),
  model: z.string(),
  effort: z.string(),
});
export type CreateOptions = z.infer<typeof schema>;

export function createOptionsKey(userId: string, organizationId: string): string {
  return `conductor.create-options.v1:${encodeURIComponent(userId)}:${encodeURIComponent(organizationId)}`;
}

export function readCreateOptions(
  key: string,
  projectIds: readonly string[],
  store: KeyValueStore = localStorage,
): CreateOptions {
  const fallback: CreateOptions = {
    projectId: "",
    branch: "",
    agent: "claude",
    model: agentModels.claude.defaultModel,
    effort: agentModels.claude.defaultEffort,
  };
  try {
    const parsed = schema.safeParse(JSON.parse(store.getItem(key) ?? "null"));
    if (!parsed.success) return fallback;
    const options = parsed.data;
    const config = agentModels[options.agent];
    return {
      ...options,
      projectId: projectIds.includes(options.projectId) ? options.projectId : "",
      branch: projectIds.includes(options.projectId) ? options.branch : "",
      model: (config.models as readonly string[]).includes(options.model)
        ? options.model
        : config.defaultModel,
      effort: (config.efforts as readonly string[]).includes(options.effort)
        ? options.effort
        : config.defaultEffort,
    };
  } catch {
    return fallback;
  }
}

export function writeCreateOptions(
  key: string,
  values: unknown,
  store: KeyValueStore = localStorage,
): void {
  // Zod strips workspace names, prompt text and any other non-option fields.
  const parsed = schema.safeParse(values);
  if (!parsed.success) return;
  try {
    store.setItem(key, JSON.stringify(parsed.data));
  } catch {
    /* Storage may be disabled/full. */
  }
}
