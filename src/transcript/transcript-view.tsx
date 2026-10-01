import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { splitSystemInstructions } from "@/transcript/content";
import type { DeliveryState } from "@/transcript/delivery";
import type { HistoryDirection } from "@/transcript/load";
import type { MessagesState, ReadPosition, TranscriptEntry } from "@/transcript/types";
import { MessageMarkdown } from "@/transcript/message-markdown";
import { Button } from "@/ui/button";

export type VisibleEntry = TranscriptEntry & { delivery?: DeliveryState };
type Props = {
  entries: readonly VisibleEntry[];
  state: MessagesState;
  loadingHistory: boolean;
  historyFailed: boolean;
  finalMessageId?: string;
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
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest("summary"))
            atBottom.current = false;
        }}
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
        <div ref={content} className="flex flex-col px-4 py-4">
          {props.entries.length === 0 ? (
            <p className="text-muted-foreground">
              {props.state.endOffset < props.state.total || props.state.startOffset > 0
                ? "Loading conversation…"
                : "No messages yet. Send a prompt to start the turn."}
            </p>
          ) : (
            props.entries
              .filter((entry) => entry.kind !== "unknown")
              .map((entry, index, entries) => (
                <div
                  key={entry.id}
                  data-entry-id={entry.id}
                  className={
                    index === 0
                      ? undefined
                      : entry.kind === "tool" && entries[index - 1]?.kind === "tool"
                        ? "mt-2"
                        : "mt-3"
                  }
                >
                  <TranscriptRow
                    entry={entry}
                    final={
                      entry.kind === "assistant" &&
                      (entry.final || entry.id === props.finalMessageId)
                    }
                  />
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

function Disclosure({
  label,
  children,
  compact = false,
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={compact ? "text-xs leading-4 text-gray-400" : "rounded-md border px-3 py-1"}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        className={
          compact
            ? "cursor-pointer text-xs leading-4 break-words"
            : "min-h-11 cursor-pointer py-2 text-sm break-words"
        }
      >
        {label}
      </summary>
      {open ? <div className={compact ? "mt-2" : "pb-2"}>{children}</div> : null}
    </details>
  );
}

function MessageBody({ text, markdown = false }: { text: string; markdown?: boolean }) {
  return (
    <>
      {splitSystemInstructions(text).map((part) =>
        part.kind === "system" ? (
          <Disclosure key={part.start} label="System instructions">
            <pre className="text-xs break-words whitespace-pre-wrap text-muted-foreground">
              {part.text.trim()}
            </pre>
          </Disclosure>
        ) : markdown ? (
          <MessageMarkdown key={part.start} text={part.text} />
        ) : (
          <p key={part.start} className="break-words whitespace-pre-wrap">
            {part.text}
          </p>
        ),
      )}
    </>
  );
}

function TranscriptRow({ entry, final }: { entry: VisibleEntry; final?: boolean }) {
  if (entry.kind === "user")
    return (
      <div className="ml-8 rounded-lg bg-secondary px-3 py-3">
        <p className="text-xs font-medium text-muted-foreground">You</p>
        <MessageBody text={entry.text} />
        {entry.delivery ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {
              { sending: "Sending", queued: "Queued", sent: "Sent", processing: "Processing" }[
                entry.delivery
              ]
            }
          </p>
        ) : null}
      </div>
    );
  if (entry.kind === "assistant")
    return (
      <div
        className={`transcript-markdown${final ? " rounded-md border-l-2 border-primary/50 bg-primary/5 px-3 py-2" : ""}`}
      >
        {final ? <p className="mb-2 text-xs font-medium text-primary">Final response</p> : null}
        <MessageBody text={entry.text} markdown />
      </div>
    );
  if (entry.kind === "thinking")
    return (
      <Disclosure label="Thinking">
        <p className="break-words whitespace-pre-wrap text-muted-foreground">{entry.text}</p>
      </Disclosure>
    );
  if (entry.kind === "tool")
    return (
      <Disclosure compact label={`Tool · ${entry.name}${entry.error ? " (failed)" : ""}`}>
        <div className="grid gap-2 text-xs">
          {entry.input !== undefined ? (
            <div>
              <p className="font-medium text-muted-foreground">Input</p>
              <pre className="break-words whitespace-pre-wrap">{entry.input}</pre>
            </div>
          ) : null}
          {entry.output !== undefined ? (
            <div>
              <p className="font-medium text-muted-foreground">Output</p>
              <pre className="break-words whitespace-pre-wrap">{entry.output || "(no output)"}</pre>
            </div>
          ) : null}
          {entry.exitCode !== undefined ? (
            <p className={entry.error ? "text-destructive" : "text-muted-foreground"}>
              Exit code: {entry.exitCode}
            </p>
          ) : null}
          {entry.input === undefined && entry.output === undefined ? (
            <p className="text-muted-foreground">No additional tool details were provided.</p>
          ) : entry.output === undefined ? (
            <p className="text-muted-foreground">Output is not available in the loaded messages.</p>
          ) : null}
        </div>
      </Disclosure>
    );
  return null;
}
