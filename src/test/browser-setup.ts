import { cleanup } from "vitest-browser-react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { queryClient } from "@/query-client";
import { resetApiState } from "@/test/handlers";
import { worker } from "@/test/worker";
import { stopMessagePersistence } from "@/storage/query-persistence";
import "@/index.css";

beforeAll(async () => {
  await worker.start({
    onUnhandledFrame({ frame }) {
      if (frame.protocol !== "http") return;
      const data = frame.data as { request?: Request };
      const request = data.request;
      if (!request) return;
      const url = new URL(request.url);
      if (url.hostname === "api.conductor.build") {
        throw new Error(`Unhandled ${request.method} ${url.pathname}`);
      }
    },
    quiet: true,
  });
});

afterEach(async () => {
  await stopMessagePersistence(queryClient);
  localStorage.clear();
  queryClient.clear();
  resetApiState();
  worker.resetHandlers();
  cleanup();
});

afterAll(() => {
  worker.stop();
});
