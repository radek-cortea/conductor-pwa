import { expect, it } from "vitest";
import { createQueryClient } from "@/query-client";
import { knownWorkspace } from "@/lib/known-workspace";

const workspace = {
  id: "ws-1",
  name: "Known name",
  state: "ready",
  repoUrl: "https://github.com/example/repo",
  createdAt: "2026-10-01T00:00:00Z",
  deepLink: "conductor://workspaces/ws-1",
};
it("uses cached detail before lists without seeding fresh detail query data", () => {
  const client = createQueryClient();
  client.setQueryData(["workspaces", { archived: false }], [workspace], { updatedAt: 100 });
  client.setQueryData(
    ["workspaces", { archived: true }],
    [{ ...workspace, name: "Newer list name" }],
    { updatedAt: 200 },
  );
  expect(knownWorkspace(client, "ws-1")?.name).toBe("Newer list name");
  expect(client.getQueryData(["workspaces", "ws-1"])).toBeUndefined();
  client.setQueryData(["workspaces", "ws-1"], { ...workspace, name: "Detail name" });
  expect(knownWorkspace(client, "ws-1")?.name).toBe("Detail name");
  expect(knownWorkspace(client, "missing")).toBeUndefined();
  client.clear();
  expect(knownWorkspace(client, "ws-1")).toBeUndefined();
});
