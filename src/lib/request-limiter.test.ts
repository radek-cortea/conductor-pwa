import { expect, it } from "vitest";
import { createRequestLimiter } from "@/lib/request-limiter";

it("bounds concurrent requests and does not start cancelled queued account/route work", async () => {
  const limit = createRequestLimiter(2);
  const releases = Array.from({ length: 4 }, () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  });
  let active = 0;
  let maximum = 0;
  const started: number[] = [];
  const controllers = releases.map(() => new AbortController());
  const jobs = releases.map((release, index) =>
    limit(controllers[index]!.signal, async () => {
      started.push(index);
      maximum = Math.max(maximum, ++active);
      await release.promise;
      active--;
      return index;
    }),
  );
  const cancelled = expect(jobs[2]).rejects.toThrow();
  controllers[2]!.abort();
  await cancelled;
  expect(started).toEqual([0, 1]);
  releases[0]!.resolve();
  await jobs[0];
  await Promise.resolve();
  expect(started).toEqual([0, 1, 3]);
  releases[1]!.resolve();
  releases[3]!.resolve();
  await Promise.all([jobs[1], jobs[3]]);
  expect(maximum).toBe(2);
  expect(active).toBe(0);
});
