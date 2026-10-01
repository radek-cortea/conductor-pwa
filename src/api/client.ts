import createClient from "openapi-fetch";
import type { paths } from "@/api/generated/schema";
import { ApiError, toApiError } from "@/api/errors";
import { readCredential } from "@/auth/credential";
import { notifyUnauthorized } from "@/auth/unauthorized";

export const API_ORIGIN = "https://api.conductor.build";

export function createConductorClient(apiKey: string) {
  return createClient<paths>({
    baseUrl: API_ORIGIN,
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
      throw toApiError(result.response.status, result.error);
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
