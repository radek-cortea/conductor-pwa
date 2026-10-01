import { z } from "zod";

const archivedFlag = z.preprocess((value) => value === true || value === "true", z.boolean());
const queryText = z.preprocess((value) => (typeof value === "string" ? value : ""), z.string());

export const homeSearchSchema = z.object({
  archived: archivedFlag,
  q: queryText,
});

export const workspaceSearchSchema = z.object({
  archived: archivedFlag,
});

export type HomeSearch = z.infer<typeof homeSearchSchema>;
export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>;
