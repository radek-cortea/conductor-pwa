import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HistoryDirection } from "@/transcript/load";
import type { MessagesState, ReadPosition, TranscriptEntry } from "@/transcript/types";
import { MessageMarkdown } from "@/transcript/message-markdown";
import { Button } from "@/ui/button";

export type VisibleEntry = TranscriptEntry & { pending?: boolean; queued?: boolean };
type Props = {
  entries: readonly VisibleEntry[];
  state: MessagesState;
  loadingHistory: boolean;
  historyFailed: boolean;
  onLoad: (direction: HistoryDirection) => Promise<boolean>;
  onRead: (position: ReadPosition) => void;
};
type Anchor = { id: string; top: number; keepBottom: boolean };

export function TranscriptView(props: Props) {
  const { state, entries, loadingHistory } = props;
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  }, [props]);
  const busy = useRef(false);
  const atBottom = useRef(true);
  const anchor = useRef<Anchor | null>(null);
  const previous = useRef<{ viewId: string; start: number; end: number; total: number } | null>(
    null,
  );
  const previousTop = useRef(0);
  const touchY = useRef<number | null>(null);
  const [showLatest, setShowLatest] = useState(false);

  const captureAnchor = useCallback(() => {
    const viewport = scroll.current;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const row = Array.from(viewport.querySelectorAll<HTMLElement>("[data-entry-id]")).find(
      (node) => node.getBoundingClientRect().bottom > bounds.top,
    );
    anchor.current = row
      ? {
          id: row.dataset.entryId!,
          top: row.getBoundingClientRect().top - bounds.top,
          keepBottom: atBottom.current && viewport.scrollHeight <= viewport.clientHeight + 2,
        }
      : null;
  }, []);

  const measureRead = useCallback(() => {
    const viewport = scroll.current;
    if (!viewport || document.visibilityState !== "visible") return;
    const { entries, state, onRead } = latest.current;
    const bounds = viewport.getBoundingClientRect();
    const visible = new Set(
      Array.from(viewport.querySelectorAll<HTMLElement>("[data-entry-id]"))
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.bottom <= bounds.bottom + 1 && rect.bottom > bounds.top;
        })
        .map((node) => node.dataset.entryId),
    );
    const read = entries
      .filter((entry) => entry.offset !== undefined && visible.has(entry.id))
      .at(-1);
    if (read && read.offset !== undefined)
      onRead({ messageId: read.messageId, sessionIndex: read.sessionIndex, offset: read.offset });
    if (read && atBottom.current && state.endOffset >= state.total) {
      const tail = state.byOffset[state.total - 1];
      if (tail)
        onRead({ messageId: tail.id, sessionIndex: tail.sessionIndex, offset: state.total - 1 });
    }
  }, []);

  const request = useCallback(
    async (direction: HistoryDirection) => {
      const current = latest.current;
      if (busy.current || current.loadingHistory) return;
      if (direction === "older" && current.state.startOffset === 0) return;
      if (direction === "newer" && current.state.endOffset >= current.state.total) return;
      captureAnchor();
      busy.current = true;
      try {
        await current.onLoad(direction);
      } finally {
        busy.current = false;
      }
    },
    [captureAnchor],
  );

  const fillViewport = useCallback(() => {
    const viewport = scroll.current;
    const { state, loadingHistory, historyFailed } = latest.current;
    if (!viewport || !viewport.clientHeight || loadingHistory || historyFailed || busy.current)
      return;
    if (viewport.scrollHeight <= viewport.clientHeight + 2) {
      if (state.endOffset < state.total) void request("newer");
      else if (state.startOffset > 0) void request("older");
    }
  }, [request]);

  const updatePosition = useCallback(() => {
    const viewport = scroll.current;
    if (!viewport) return;
    atBottom.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 24;
    setShowLatest(!atBottom.current || latest.current.state.endOffset < latest.current.state.total);
    previousTop.current = viewport.scrollTop;
    captureAnchor();
    measureRead();
  }, [captureAnchor, measureRead]);

  useLayoutEffect(() => {
    const viewport = scroll.current;
    if (!viewport) return;
    const old = previous.current;
    if (!old || old.viewId !== state.viewId) {
      viewport.scrollTop = state.initialPosition === "unread" ? 0 : viewport.scrollHeight;
    } else if (state.startOffset < old.start) {
      const saved = anchor.current;
      if (saved?.keepBottom) viewport.scrollTop = viewport.scrollHeight;
      else if (saved) {
        const row = Array.from(viewport.querySelectorAll<HTMLElement>("[data-entry-id]")).find(
          (node) => node.dataset.entryId === saved.id,
        );
        if (row)
          viewport.scrollTop +=
            row.getBoundingClientRect().top - viewport.getBoundingClientRect().top - saved.top;
      }
    } else if (state.endOffset > old.end && old.end >= old.total && atBottom.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
    previous.current = {
      viewId: state.viewId,
      start: state.startOffset,
      end: state.endOffset,
      total: state.total,
    };
    updatePosition();
    const frame = requestAnimationFrame(fillViewport);
    return () => cancelAnimationFrame(frame);
  }, [entries, state, loadingHistory, updatePosition, fillViewport]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const viewport = scroll.current;
      if (
        viewport &&
        atBottom.current &&
        latest.current.state.endOffset >= latest.current.state.total
      )
        viewport.scrollTop = viewport.scrollHeight;
      updatePosition();
      fillViewport();
    });
    if (scroll.current) observer.observe(scroll.current);
    if (content.current) observer.observe(content.current);
    document.addEventListener("visibilitychange", measureRead);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", measureRead);
    };
  }, [updatePosition, fillViewport, measureRead]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroll}
        role="log"
        aria-label="Conversation"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{ overflowAnchor: "none" }}
        onScroll={() => {
          const viewport = scroll.current;
          if (!viewport) return;
          const upwards = viewport.scrollTop < previousTop.current;
          updatePosition();
          if (upwards && viewport.scrollTop < 96) void request("older");
          else if (
            !upwards &&
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96
          )
            void request("newer");
        }}
        onWheel={(event) => {
          const viewport = scroll.current;
          if (!viewport) return;
          if (event.deltaY < 0 && viewport.scrollTop < 96) void request("older");
          else if (
            event.deltaY > 0 &&
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96
          )
            void request("newer");
        }}
        onTouchStart={(event) => {
          touchY.current = event.touches.length === 1 ? (event.touches[0]?.clientY ?? null) : null;
        }}
        onTouchMove={(event) => {
          const viewport = scroll.current;
          const y = event.touches.length === 1 ? event.touches[0]?.clientY : undefined;
          if (!viewport || y === undefined || touchY.current === null) return;
          const delta = y - touchY.current;
          if (Math.abs(delta) < 8) return;
          touchY.current = y;
          // At an unread boundary, touch intent may not produce a scroll event.
          if (delta > 0 && viewport.scrollTop < 96) void request("older");
          else if (
            delta < 0 &&
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96
          )
            void request("newer");
        }}
        onKeyDown={(event) => {
          const viewport = scroll.current;
          if (!viewport) return;
          if (["ArrowUp", "PageUp", "Home"].includes(event.key) && viewport.scrollTop < 96)
            void request("older");
          else if (
            ["ArrowDown", "PageDown", "End"].includes(event.key) &&
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96
          )
            void request("newer");
        }}
      >
        <div ref={content} className="flex flex-col gap-3 px-4 py-4">
          {props.entries.length === 0 ? (
            <p className="text-muted-foreground">
              {props.state.endOffset < props.state.total || props.state.startOffset > 0
                ? "Loading conversation…"
                : "No messages yet. Send a prompt to start the turn."}
            </p>
          ) : (
            props.entries
              .filter((entry) => entry.kind !== "unknown")
              .map((entry) => (
                <div key={entry.id} data-entry-id={entry.id}>
                  <TranscriptRow entry={entry} />
                </div>
              ))
          )}
        </div>
      </div>
      {props.loadingHistory ? (
        <span
          role="status"
          className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground"
        >
          Loading history…
        </span>
      ) : null}
      {showLatest ? (
        <Button
          type="button"
          variant="secondary"
          className="absolute bottom-3 left-1/2 min-h-11 -translate-x-1/2"
          onClick={() => {
            if (props.state.endOffset < props.state.total) void request("latest");
            else scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
          }}
        >
          Latest
        </Button>
      ) : null}
    </div>
  );
}

function TranscriptRow({ entry }: { entry: VisibleEntry }) {
  if (entry.kind === "user")
    return (
      <div className="ml-8 rounded-lg bg-secondary px-3 py-3">
        <p className="text-xs font-medium text-muted-foreground">You</p>
        <p className="break-words whitespace-pre-wrap">{entry.text}</p>
        {entry.pending ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {entry.queued ? "Queued" : "Sending"}
          </p>
        ) : null}
      </div>
    );
  if (entry.kind === "assistant")
    return (
      <div className="transcript-markdown">
        <MessageMarkdown text={entry.text} />
      </div>
    );
  if (entry.kind === "thinking")
    return (
      <details className="rounded-md border px-3 py-2">
        <summary className="min-h-11 cursor-pointer py-2">Thinking</summary>
        <p className="pb-2 break-words whitespace-pre-wrap text-muted-foreground">{entry.text}</p>
      </details>
    );
  if (entry.kind === "tool")
    return <p className="text-sm text-muted-foreground">Tool · {entry.name}</p>;
  return null;
}
