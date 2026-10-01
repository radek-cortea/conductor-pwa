import createClient from "openapi-fetch";
import type { paths } from "@/api/generated/schema";
import { ApiError, toApiError } from "@/api/errors";
import { readCredential } from "@/auth/credential";
import { notifyUnauthorized } from "@/auth/unauthorized";

export const API_ORIGIN = "https://api.conductor.build";
const responseCredentials = new WeakMap<Response, string>();

export function createConductorClient(apiKey: string) {
  return createClient<paths>({
    baseUrl: API_ORIGIN,
    fetch: async (request) => {
      if (new URL(request.url).origin !== API_ORIGIN) throw new Error("Unexpected API origin");
      // Do not follow API redirects, send cookies/referrers, or cache private responses.
      const response = await fetch(
        new Request(request, {
          redirect: "error",
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        }),
      );
      responseCredentials.set(response, apiKey);
      return response;
    },
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
}

export function clientForStoredKey() {
  const apiKey = readCredential();
  if (!apiKey) {
    notifyUnauthorized();
    throw new ApiError(401, "Sign in to continue.");
  }
  return createConductorClient(apiKey);
}

type CallResult<T> = {
  data?: T;
  error?: unknown;
  response: Response;
};

export async function callApi<T>(run: () => Promise<CallResult<T>>): Promise<T> {
  try {
    const result = await run();
    if (!result.response.ok || result.data === undefined) {
      throw toApiError(
        result.response.status,
        result.error,
        responseCredentials.get(result.response),
      );
    }
    return result.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isAbort(error)) throw error;
    throw new ApiError(0, "Could not reach Conductor.");
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
