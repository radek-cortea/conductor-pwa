import { z } from "zod";
import { signOutCredential, readCredential, readRememberedCredential } from "@/auth/credential";
import { notifyUnauthorized } from "@/auth/unauthorized";

const errorBodySchema = z.object({
  userMessage: z.string().min(1),
});

export class ApiError extends Error {
  readonly status: number;
  readonly userMessage: string;

  constructor(status: number, userMessage: string) {
    super(userMessage);
    this.name = "ApiError";
    this.status = status;
    this.userMessage = userMessage;
  }
}

function fallbackMessage(status: number): string {
  if (status === 401) return "That API key was not accepted.";
  if (status === 404) return "That could not be found.";
  if (status === 0) return "Could not reach Conductor.";
  return "The request failed.";
}

export function toApiError(status: number, body: unknown, requestKey?: string): ApiError {
  const parsed = errorBodySchema.safeParse(body);
  let userMessage = parsed.success ? parsed.data.userMessage : fallbackMessage(status);
  for (const key of [requestKey, readRememberedCredential()]) {
    if (key)
      userMessage = userMessage
        .replaceAll(key, "[redacted]")
        .replaceAll(encodeURIComponent(key), "[redacted]");
  }
  userMessage = userMessage.replace(/\bBearer\s+[^\s"'<>]+/gi, "Bearer [redacted]");
  // A response for a logged-out/replaced key cannot invalidate a newer account.
  if (status === 401 && requestKey && readCredential() === requestKey) {
    signOutCredential();
    notifyUnauthorized();
  }
  return new ApiError(status, userMessage.slice(0, 1000));
}
