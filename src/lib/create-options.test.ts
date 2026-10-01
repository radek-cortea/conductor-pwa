import { expect, it } from "vitest";
import { createOptionsKey, readCreateOptions, writeCreateOptions } from "@/lib/create-options";
import type { KeyValueStore } from "@/auth/credential";

function store(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
it("remembers options, not workspace names or prompts, scoped to the user and organization", () => {
  const storage = store();
  const key = createOptionsKey("ada", "org");
  writeCreateOptions(
    key,
    {
      projectId: "project",
      branch: "main",
      agent: "codex",
      model: "gpt-5.5",
      effort: "high",
      name: "Unique name",
      message: "Private prompt",
    },
    storage,
  );
  expect(readCreateOptions(key, ["project"], storage)).toEqual({
    projectId: "project",
    branch: "main",
    agent: "codex",
    model: "gpt-5.5",
    effort: "high",
  });
  expect(storage.getItem(key)).not.toContain("Private prompt");
  expect(storage.getItem(key)).not.toContain("Unique name");
  expect(readCreateOptions(createOptionsKey("other", "org"), ["project"], storage).projectId).toBe(
    "",
  );
  expect(readCreateOptions(key, [], storage)).toMatchObject({ projectId: "", branch: "" });
});
it("falls back safely for corrupt storage and obsolete agent choices", () => {
  const storage = store();
  storage.setItem("key", "not JSON");
  expect(readCreateOptions("key", [], storage).agent).toBe("claude");
  writeCreateOptions(
    "key",
    { projectId: "project", branch: "", agent: "codex", model: "obsolete", effort: "obsolete" },
    storage,
  );
  expect(readCreateOptions("key", ["project"], storage)).toMatchObject({
    model: "gpt-5.6-sol",
    effort: "high",
  });
});
it("handles unavailable storage without blocking workspace creation", () => {
  const storage: KeyValueStore = {
    getItem: () => {
      throw new Error("Disabled");
    },
    setItem: () => {
      throw new Error("Disabled");
    },
    removeItem: () => {},
  };
  expect(readCreateOptions("key", [], storage).projectId).toBe("");
  expect(() =>
    writeCreateOptions(
      "key",
      { projectId: "", branch: "", agent: "claude", model: "opus-5-1m", effort: "high" },
      storage,
    ),
  ).not.toThrow();
});
