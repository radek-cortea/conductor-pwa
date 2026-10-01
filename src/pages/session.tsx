import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { SendHorizontal, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/api/errors";
import { cancelSession, sendMessage } from "@/api/fetch";
import { messagesQuery, sessionStatusQuery } from "@/api/queries";
import { copyText } from "@/lib/copy";
import { sessionStatusLabel } from "@/lib/labels";
import { TranscriptSkeleton } from "@/pages/skeletons";
import { loadHistory, markRead, type HistoryDirection } from "@/transcript/load";
import { TranscriptView, type VisibleEntry } from "@/transcript/transcript-view";
import { turnPhase } from "@/transcript/turn-phase";
import type { ReadPosition, TranscriptEntry } from "@/transcript/types";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";

const sessionRoute = getRouteApi("/_authenticated/workspaces/$workspaceId/sessions/$sessionId");
type TurnCycle = { awaiting: boolean; seenWorking: boolean; afterIndex: number };
type OptimisticMessage = {
  localId: string;
  serverId?: string;
  text: string;
  receivedAt: string;
  state?: "queued" | "sent";
};

export function SessionPage() {
  const { sessionId } = sessionRoute.useParams();
  return <SessionChat key={sessionId} sessionId={sessionId} />;
}

function SessionChat({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery(sessionStatusQuery(sessionId));
  const messages = useQuery(messagesQuery(sessionId));
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);
  const [turn, setTurn] = useState<TurnCycle>({
    awaiting: false,
    seenWorking: false,
    afterIndex: -1,
  });
  const [windowReady, setWindowReady] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const entries = messages.data?.entries;
  const confirmedIds = useMemo(
    () => new Set(Object.values(messages.data?.byOffset ?? {}).map((message) => message.id)),
    [messages.data?.byOffset],
  );
  const status = statusQuery.data?.status;
  const newerAgentEntry = Boolean(
    entries?.some((entry) => isAgentEntry(entry) && entry.sessionIndex > turn.afterIndex),
  );
  const phase = turnPhase({
    status,
    seenWorking: turn.seenWorking || status === "working",
    sendUnconfirmed: turn.awaiting,
    newerAgentEntry,
  });

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void loadHistory(queryClient, sessionId, "initial", abort.signal)
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          toast.error(
            error instanceof ApiError ? error.userMessage : "Could not restore the chat position.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setWindowReady(true);
      });
    return () => abort.abort();
  }, [queryClient, sessionId]);

  useEffect(() => {
    if (!turn.awaiting) return;
    if (phase === "settled") {
      // Synchronize the local send cycle with external network acknowledgements.
      // oxlint-disable-next-line react/set-state-in-effect
      setTurn((current) => ({ ...current, awaiting: false, seenWorking: false }));
    } else if (status === "working" && !turn.seenWorking) {
      // oxlint-disable-next-line react/set-state-in-effect
      setTurn((current) => ({ ...current, seenWorking: true }));
    }
  }, [phase, status, turn.awaiting, turn.seenWorking]);

  const history = useMutation({
    mutationFn: (direction: HistoryDirection) =>
      loadHistory(
        queryClient,
        sessionId,
        direction,
        controller.current?.signal ?? new AbortController().signal,
      ),
    onError: (error) => {
      if (!controller.current?.signal.aborted)
        toast.error(
          error instanceof ApiError
            ? error.userMessage
            : "Could not load chat history. Scroll to retry.",
        );
    },
  });
  const { mutateAsync: loadMore } = history;
  const onLoad = useCallback(
    async (direction: HistoryDirection) => {
      try {
        await loadMore(direction);
        return true;
      } catch {
        return false;
      }
    },
    [loadMore],
  );
  const onRead = useCallback(
    (position: ReadPosition) => markRead(queryClient, sessionId, position),
    [queryClient, sessionId],
  );

  const send = useMutation({
    mutationFn: (input: { localId: string; message: string }) =>
      sendMessage(sessionId, input.message),
    onSuccess: async (result, input) => {
      setOptimistic((items) =>
        items.map((item) =>
          item.localId === input.localId
            ? { ...item, serverId: result.messageId, state: result.state }
            : item,
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "status"] }),
        queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "messages"] }),
      ]);
    },
    onError: (error, input) => {
      setOptimistic((items) => items.filter((item) => item.localId !== input.localId));
      setDraft((current) => current || input.message);
      setTurn({ awaiting: false, seenWorking: false, afterIndex: -1 });
      toast.error(error instanceof ApiError ? error.userMessage : "Could not send the prompt.");
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelSession(sessionId),
    onSuccess: async () => {
      toast.success("Turn cancelled");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "status"] }),
        queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "messages"] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.userMessage : "Could not cancel the turn."),
  });
  function submitPrompt() {
    const text = draft.trim();
    if (!text || send.isPending) return;
    const localId = crypto.randomUUID();
    setOptimistic((items) => [
      ...items.filter((item) => !item.serverId || !confirmedIds.has(item.serverId)),
      { localId, text, receivedAt: new Date().toISOString() },
    ]);
    setDraft("");
    const data = messages.data;
    setTurn({
      awaiting: true,
      seenWorking: status === "working",
      afterIndex: data?.byOffset[data.total - 1]?.sessionIndex ?? -1,
    });
    if (data && data.endOffset < data.total) void onLoad("latest");
    send.mutate({ localId, message: text });
  }

  const visible = useMemo<VisibleEntry[]>(() => {
    return [
      ...(entries ?? []),
      ...optimistic
        .filter((item) => !item.serverId || !confirmedIds.has(item.serverId))
        .map((item) => ({
          kind: "user" as const,
          id: item.serverId ?? item.localId,
          messageId: item.serverId ?? item.localId,
          text: item.text,
          receivedAt: item.receivedAt,
          sessionIndex: Number.MAX_SAFE_INTEGER,
          partIndex: 0,
          pending: true,
          queued: item.state === "queued" || !item.serverId,
        })),
    ];
  }, [entries, optimistic, confirmedIds]);
  if (messages.isPending || !windowReady) return <TranscriptSkeleton />;
  if (!messages.data)
    return (
      <p role="alert" className="px-4 py-3 text-destructive">
        Could not load this chat.{" "}
        <Button
          variant="ghost"
          onClick={() => {
            void messages.refetch();
          }}
        >
          Retry
        </Button>
      </p>
    );
  const errorText = statusQuery.data?.errorMessage || statusQuery.data?.lastError;
  const unsupported = messages.data.unsupportedFormats ?? [];

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      {status === "error" ? (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {errorText || sessionStatusLabel("error")}
        </p>
      ) : null}
      {messages.isError ? (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          Could not refresh messages. Showing the saved conversation.
        </p>
      ) : null}
      {unsupported.length > 0 && !entries?.some((entry) => entry.kind === "assistant") ? (
        <div role="alert" className="px-4 py-2 text-sm text-muted-foreground">
          Some agent messages use an unsupported format.
          <Button
            variant="ghost"
            onClick={() => {
              void copyText(unsupported.join("\n")).then((copied) =>
                toast[copied ? "success" : "error"](
                  copied
                    ? "Event format copied (no message text or credentials)"
                    : "Could not copy the event format",
                ),
              );
            }}
          >
            Copy event format
          </Button>
        </div>
      ) : null}
      <TranscriptView
        entries={visible}
        state={messages.data}
        onLoad={onLoad}
        onRead={onRead}
        loadingHistory={history.isPending}
        historyFailed={history.isError}
      />
      <form
        className="shrink-0 bg-background px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(event) => {
          event.preventDefault();
          submitPrompt();
        }}
      >
        <label htmlFor="composer" className="sr-only">
          Message
        </label>
        <div className="relative">
          <Textarea
            id="composer"
            value={draft}
            placeholder="Send a prompt"
            className="min-h-24 resize-none pr-28 pb-12"
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submitPrompt();
              }
            }}
          />
          <div className="absolute right-2 bottom-2 flex gap-1">
            {phase === "pending" || phase === "working" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label="Cancel turn"
                title="Cancel turn"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                <Square aria-hidden="true" />
              </Button>
            ) : null}
            <Button
              type="submit"
              size="icon"
              className="size-11"
              aria-label="Send"
              title="Send"
              disabled={!draft.trim() || send.isPending}
            >
              <SendHorizontal aria-hidden="true" />
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}

function isAgentEntry(entry: TranscriptEntry): boolean {
  return entry.kind === "assistant" || entry.kind === "thinking" || entry.kind === "tool";
}
