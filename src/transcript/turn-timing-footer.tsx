import { useEffect, useState } from "react";
import { formatTurnDuration, type TurnTiming } from "@/transcript/turn-timing";

export function TurnTimingFooter({ timing }: { timing: TurnTiming }) {
  const [observedAt] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!timing.running) return;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [timing.running]);

  return (
    <p data-testid="turn-timing" aria-live="off" className="mt-2 text-xs leading-4 text-gray-400">
      {timing.running ? (
        <>
          In progress · {timing.startedAt === undefined ? "observed " : ""}
          {formatTurnDuration(now - (timing.startedAt ?? observedAt))}
        </>
      ) : (
        <>
          {timing.startedAt === undefined
            ? "Finished · duration unavailable"
            : `Finished in ~${formatTurnDuration(timing.endedAt - timing.startedAt)}`}
          {" · ended "}
          <time dateTime={new Date(timing.endedAt).toISOString()}>
            {new Date(timing.endedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "medium",
            })}
          </time>
        </>
      )}
    </p>
  );
}
