import type { TranscriptMessage } from "@/api/types";

// The public workspace API exposes no PR field. Use a real link present in the
// fetched conversation/tool results, and only if it belongs to this repository.
export function findPullRequestLink(
  repoUrl: string,
  messages: readonly TranscriptMessage[],
): string | undefined {
  const repo = repoUrl
    .match(
      /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/i,
    )?.[1]
    ?.toLowerCase();
  if (!repo) return undefined;
  function scan(value: unknown, depth = 0): string | undefined {
    if (depth > 12) return undefined;
    if (typeof value === "string") {
      const matches = Array.from(
        value.matchAll(/https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d*)/g),
      );
      const match = matches.findLast((item) => item[1]?.toLowerCase() === repo);
      if (match) return `https://github.com/${match[1]}/pull/${match[2]}`;
      try {
        const decoded = JSON.parse(value) as unknown;
        if (decoded !== value) return scan(decoded, depth + 1);
      } catch {
        /* ordinary text */
      }
    } else if (value && typeof value === "object") {
      for (const child of Object.values(value)) {
        const link = scan(child, depth + 1);
        if (link) return link;
      }
    }
    return undefined;
  }
  for (const message of [...messages].sort((a, b) => b.sessionIndex - a.sessionIndex)) {
    const link = scan(message.content);
    if (link) return link;
  }
  return undefined;
}
