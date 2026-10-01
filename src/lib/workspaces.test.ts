import { describe, expect, it } from "vitest";
import {
  filterWorkspaces,
  groupWorkspacesByRepository,
  sortWorkspacesByActivity,
} from "@/lib/workspaces";

const projects = [
  { id: "proj-a", name: "Alpha", gitRemote: "https://github.com/acme/alpha" },
  { id: "proj-b", name: "Beta", gitRemote: "https://github.com/acme/beta" },
];

const workspaces = [
  {
    id: "old",
    name: "Old notes",
    projectId: "proj-a",
    repoUrl: "https://github.com/acme/alpha",
    lastActivityAt: "2026-09-01T00:00:00.000Z",
    state: "ready",
  },
  {
    id: "new",
    name: "Billing export",
    projectId: "proj-a",
    repoUrl: "https://github.com/acme/alpha",
    lastActivityAt: "2026-09-30T00:00:00.000Z",
    state: "ready",
  },
  {
    id: "remote",
    name: "Matched by remote",
    repoUrl: "https://github.com/acme/beta",
    lastActivityAt: "2026-09-20T00:00:00.000Z",
    state: "sleeping",
  },
  {
    id: "orphan",
    name: "No project",
    repoUrl: "https://github.com/acme/orphan",
    state: "ready",
  },
  {
    id: "archived",
    name: "Old migration",
    projectId: "proj-a",
    repoUrl: "https://github.com/acme/alpha",
    lastActivityAt: "2026-09-28T00:00:00.000Z",
    state: "archived",
  },
];

describe("workspace sort and grouping", () => {
  it("sorts by lastActivityAt descending and sinks missing activity", () => {
    expect(sortWorkspacesByActivity(workspaces).map((item) => item.id)).toEqual([
      "new",
      "archived",
      "remote",
      "old",
      "orphan",
    ]);
  });

  it("groups by project id or git remote and keeps activity order", () => {
    const groups = groupWorkspacesByRepository(workspaces, projects);
    expect(groups.map((group) => group.label)).toEqual([
      "Alpha",
      "Beta",
      "https://github.com/acme/orphan",
    ]);
    expect(groups[0]?.workspaces.map((item) => item.id)).toEqual(["new", "archived", "old"]);
    expect(groups[1]?.workspaces.map((item) => item.id)).toEqual(["remote"]);
  });

  it("hides archived workspaces until the filter asks for them, and filters by name", () => {
    const labelFor = (workspace: (typeof workspaces)[number]) => workspace.repoUrl;
    const active = filterWorkspaces(workspaces, { archived: false, query: "", labelFor });
    expect(active.map((item) => item.id)).not.toContain("archived");
    const withArchived = filterWorkspaces(workspaces, { archived: true, query: "", labelFor });
    expect(withArchived.map((item) => item.id)).toContain("archived");
    const named = filterWorkspaces(workspaces, { archived: false, query: "billing", labelFor });
    expect(named.map((item) => item.id)).toEqual(["new"]);
  });
});
