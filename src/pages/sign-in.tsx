import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ApiError } from "@/api/errors";
import { fetchMe } from "@/api/fetch";
import { meQuery } from "@/api/queries";
import { clearCredential, readRememberedCredential, writeCredential } from "@/auth/credential";
import { Button } from "@/ui/button";
import { AppBrand } from "@/ui/app-brand";
import { startMessagePersistence, stopMessagePersistence } from "@/storage/query-persistence";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

const signInSchema = z.object({
  apiKey: z.string().trim().min(1, "Enter your API key"),
});

type SignInValues = z.infer<typeof signInSchema>;

export function SignInPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState(readRememberedCredential);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { apiKey: savedKey ?? "" },
  });

  async function forgetKey() {
    clearCredential();
    setSavedKey(null);
    form.reset({ apiKey: "" });
    setFormError(null);
    await stopMessagePersistence(queryClient);
    toast.success("Saved API key forgotten");
  }

  async function onSubmit(values: SignInValues) {
    setFormError(null);
    try {
      const me = await fetchMe(values.apiKey);
      await startMessagePersistence(values.apiKey, queryClient);
      writeCredential(values.apiKey);
      queryClient.setQueryData(meQuery().queryKey, me);
      await navigate({ to: "/workspaces", search: { archived: false, q: "" } });
    } catch (error) {
      const message = error instanceof ApiError ? error.userMessage : "Could not reach Conductor.";
      setFormError(message);
      toast.error(message);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <AppBrand />
      <h1 className="mt-2 text-3xl font-semibold">Sign in</h1>
      <p className="mt-3 text-muted-foreground">
        Use an API key from Conductor. It stays on this device, so a home-screen install can reopen
        without asking again.
        <a
          href="https://app.conductor.build/home/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 text-sm text-primary underline"
        >
          Get an API key
        </a>
      </p>
      <form className="mt-8 grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-2">
          <Label htmlFor="api-key">API key</Label>
          <Input
            id="api-key"
            type="password"
            autoComplete="current-password"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="sk_..."
            spellCheck={false}
            className="min-h-11"
            {...form.register("apiKey")}
          />
          {form.formState.errors.apiKey ? (
            <p className="text-sm text-destructive">{form.formState.errors.apiKey.message}</p>
          ) : null}
        </div>
        {savedKey ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">API key saved on this device.</span>
            <Button
              type="button"
              variant="ghost"
              disabled={form.formState.isSubmitting}
              onClick={() => {
                void forgetKey();
              }}
            >
              Forget saved key
            </Button>
          </div>
        ) : null}
        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        <Button type="submit" className="min-h-11" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
