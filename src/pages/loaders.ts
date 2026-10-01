import { isCancelledError, type QueryClient } from "@tanstack/react-query";
import {
  messagesQuery,
  meQuery,
  projectsQuery,
  sessionQuery,
  sessionStatusQuery,
  sessionsQuery,
  workspaceQuery,
  workspacesQuery,
} from "@/api/queries";

type LoaderContext = {
  context: { queryClient: QueryClient };
  abortController: AbortController;
};

function withAbort<T extends { queryFn?: (context: never) => unknown }>(
  options: T,
  signal: AbortSignal,
): T {
  const queryFn = options.queryFn;
  if (!queryFn) return options;
  return {
    ...options,
    queryFn: (ctx: { signal: AbortSignal }) =>
      queryFn({ ...ctx, signal: AbortSignal.any([ctx.signal, signal]) } as never),
  };
}

// Loaders and useQuery observers share a request. StrictMode/Suspense can
// temporarily remove the last observer and cancel that request while this route
// still needs it. Rejoin/restart it instead of treating cancellation as failure.
async function whileRouteActive<T>(signal: AbortSignal, load: () => Promise<T>): Promise<T> {
  for (;;) {
    signal.throwIfAborted();
    try {
      const data = await load();
      signal.throwIfAborted();
      return data;
    } catch (error) {
      const cancelled =
        isCancelledError(error) || (error instanceof DOMException && error.name === "AbortError");
      if (signal.aborted || !cancelled) throw error;
    }
  }
}

export function loadAccount({ context, abortController }: LoaderContext) {
  return whileRouteActive(abortController.signal, () =>
    context.queryClient.ensureQueryData(withAbort(meQuery(), abortController.signal)),
  );
}

export function loadProjects({ context, abortController }: LoaderContext) {
  return whileRouteActive(abortController.signal, () =>
    context.queryClient.ensureQueryData(withAbort(projectsQuery(), abortController.signal)),
  );
}

export function loadHome({
  context,
  abortController,
  deps,
}: LoaderContext & { deps: { archived: boolean } }) {
  return whileRouteActive(abortController.signal, () =>
    Promise.all([
      context.queryClient.ensureQueryData(withAbort(projectsQuery(), abortController.signal)),
      context.queryClient.ensureQueryData(
        withAbort(workspacesQuery(deps.archived), abortController.signal),
      ),
    ]),
  );
}

export function loadWorkspace({
  context,
  abortController,
  params,
}: LoaderContext & { params: { workspaceId: string } }) {
  return whileRouteActive(abortController.signal, () =>
    context.queryClient.ensureQueryData(
      withAbort(workspaceQuery(params.workspaceId), abortController.signal),
    ),
  );
}

export function loadWorkspaceSessions({
  context,
  abortController,
  params,
  deps,
}: LoaderContext & { params: { workspaceId: string }; deps: { archived: boolean } }) {
  return whileRouteActive(abortController.signal, () =>
    context.queryClient.ensureQueryData(
      withAbort(sessionsQuery(params.workspaceId, deps.archived), abortController.signal),
    ),
  );
}

export function loadSession({
  context,
  abortController,
  params,
}: LoaderContext & { params: { sessionId: string } }) {
  return whileRouteActive(abortController.signal, () =>
    Promise.all([
      context.queryClient.ensureQueryData(
        withAbort(sessionQuery(params.sessionId), abortController.signal),
      ),
      context.queryClient.ensureQueryData(
        withAbort(sessionStatusQuery(params.sessionId), abortController.signal),
      ),
      context.queryClient.ensureQueryData(
        withAbort(messagesQuery(params.sessionId), abortController.signal),
      ),
    ]),
  );
}
