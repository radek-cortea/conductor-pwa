import { z } from "zod";
import { clearCredential, readCredential } from "@/auth/credential";
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

export function toApiError(status: number, body: unknown): ApiError {
  const parsed = errorBodySchema.safeParse(body);
  const userMessage = parsed.success ? parsed.data.userMessage : fallbackMessage(status);
  if (status === 401 && readCredential()) {
    clearCredential();
    notifyUnauthorized();
  }
  return new ApiError(status, userMessage);
}
