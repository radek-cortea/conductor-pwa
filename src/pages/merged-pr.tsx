import { useQuery } from "@tanstack/react-query";
import { GitMerge } from "lucide-react";
import { useState } from "react";
import { pullRequestMergedQuery } from "@/api/github";
import { Button } from "@/ui/button";

export function MergedPr({
  link,
  archived,
  pending,
  onArchive,
}: {
  link: string | undefined;
  archived: boolean;
  pending: boolean;
  onArchive: () => void;
}) {
  // Keep the discovered project PR when switching to a chat without a PR link.
  // The parent keys this component by workspace, so it cannot leak across projects.
  const [knownLink, setKnownLink] = useState(link);
  if (link && link !== knownLink) setKnownLink(link);
  const merged = useQuery(pullRequestMergedQuery(link ?? knownLink));
  if (merged.data !== true) return null;

  return (
    <div
      role="status"
      aria-label="Pull request merged"
      className="flex shrink-0 items-center gap-2 border-b bg-purple-50 px-4 py-2 text-purple-900"
    >
      <GitMerge aria-hidden="true" className="size-4" />
      <span className="flex-1 text-sm font-semibold">PR merged</span>
      {!archived ? (
        <Button
          type="button"
          size="sm"
          className="bg-purple-900 text-white hover:bg-purple-800"
          disabled={pending}
          onClick={onArchive}
        >
          Archive
        </Button>
      ) : null}
    </div>
  );
}
