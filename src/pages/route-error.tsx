import type { ErrorComponentProps } from "@tanstack/react-router";
import { ApiError } from "@/api/errors";
import { Button } from "@/ui/button";

export function RouteError({ error, reset }: ErrorComponentProps) {
  const message =
    error instanceof ApiError ? error.userMessage : "Something went wrong. Try again.";
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-8">
      <h1 className="text-xl font-semibold">Could not load this page</h1>
      <p className="text-muted-foreground">{message}</p>
      <Button type="button" className="w-fit" onClick={() => reset()}>
        Retry
      </Button>
    </div>
  );
}
