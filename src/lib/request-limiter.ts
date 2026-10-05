// Background list checks must not flood the API or start after route/account cancellation.
export function createRequestLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function limit<T>(signal: AbortSignal, request: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const start = () => {
        signal.removeEventListener("abort", abort);
        active++;
        resolve();
      };
      const abort = () => {
        const index = queue.indexOf(start);
        if (index >= 0) queue.splice(index, 1);
        reject(signal.reason);
      };
      if (active < concurrency) start();
      else {
        queue.push(start);
        signal.addEventListener("abort", abort, { once: true });
      }
    });
    try {
      signal.throwIfAborted();
      return await request();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
