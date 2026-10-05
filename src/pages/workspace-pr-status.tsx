import { useQueries, useQuery } from "@tanstack/react-query";
import { GitMerge } from "lucide-react";
import { useCallback } from "react";
import { pullRequestMergedQuery } from "@/api/github";
import { messagesQuery } from "@/api/queries";
import type { Session } from "@/api/types";
import { findPullRequestLink } from "@/lib/pull-request";
import type { MessagesState } from "@/transcript/types";

export function WorkspacePrStatus({
  chats,
  repoUrl,
}: {
  chats: readonly Session[];
  repoUrl: string;
}) {
  const selectLink = useCallback(
    (state: MessagesState) => findPullRequestLink(repoUrl, Object.values(state.byOffset ?? {})),
    [repoUrl],
  );
  const links = useQueries({
    queries: chats.map((chat) => ({
      ...messagesQuery(chat.id),
      // Observe only already-fetched/persisted conversations. Never load histories
      // or seek their tails just to decorate the main list.
      enabled: false,
      select: selectLink,
    })),
  });
  const link = links.findLast((query) => query.data)?.data;
  const merged = useQuery(pullRequestMergedQuery(link));
  if (merged.data !== true) return null;
  return (
    <span role="img" aria-label="PR merged" title="PR merged" className="shrink-0 text-purple-900">
      <GitMerge aria-hidden="true" className="size-4" />
    </span>
  );
}
