import { queryOptions } from "@tanstack/react-query";

export const PR_STATUS_POLL_MS = 60_000;

// Separate, anonymous transport: never send the Conductor credential to GitHub.
// Private repositories and rate-limited requests are unavailable, not unmerged.
export async function fetchPullRequestMerged(link: string, signal?: AbortSignal): Promise<boolean> {
  const match = link.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)$/);
  if (!match || match[1] === "." || match[1] === ".." || match[2] === "." || match[2] === "..") {
    throw new Error("Invalid GitHub PR link.");
  }
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetch(
    `https://api.github.com/repos/${match[1]}/${match[2]}/pulls/${match[3]}`,
    {
      headers: { Accept: "application/vnd.github+json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    },
  );
  if (!response.ok) throw new Error("GitHub PR status is unavailable.");
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("merged" in data) ||
    typeof data.merged !== "boolean"
  ) {
    throw new Error("Invalid GitHub PR status.");
  }
  return data.merged;
}

export function pullRequestMergedQuery(link: string | undefined) {
  return queryOptions({
    queryKey: ["github", "pull-request", link] as const,
    queryFn: ({ signal }) => fetchPullRequestMerged(link!, signal),
    enabled: Boolean(link),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: PR_STATUS_POLL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
}
