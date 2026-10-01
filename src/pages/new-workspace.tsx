import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ApiError } from "@/api/errors";
import { createWorkspace } from "@/api/fetch";
import { projectsQuery } from "@/api/queries";
import { agentModels } from "@/lib/agent-models";
import { applyAgentChange } from "@/lib/agent-picker";
import { AgentFields } from "@/pages/agent-fields";
import { ListSkeleton } from "@/pages/skeletons";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Textarea } from "@/ui/textarea";

const newWorkspaceRoute = getRouteApi("/_authenticated/workspaces/new");

const formSchema = z.object({
  projectId: z.string().min(1, "Choose a project"),
  branch: z.string(),
  name: z.string(),
  agent: z.enum(["claude", "codex", "cursor"]),
  model: z.string().min(1, "Choose a model"),
  effort: z.string().min(1),
  message: z.string().trim().min(1, "Write an opening message"),
});

type FormValues = z.infer<typeof formSchema>;

export function NewWorkspacePage() {
  const navigate = newWorkspaceRoute.useNavigate();
  const queryClient = useQueryClient();
  const projects = useQuery(projectsQuery());
  const [formError, setFormError] = useState<string | null>(null);
  const defaults = agentModels.claude;
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectId: "",
      branch: "",
      name: "",
      agent: "claude",
      model: defaults.defaultModel,
      effort: defaults.defaultEffort,
      message: "",
    },
  });
  const agent = form.watch("agent");
  const model = form.watch("model");
  const effort = form.watch("effort");

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const chosenModel = agentModels[values.agent].models.find((item) => item === values.model);
    const chosenEffort = agentModels[values.agent].efforts.find((item) => item === values.effort);
    if (!chosenModel || !chosenEffort) {
      setFormError("Choose a model for this agent.");
      return;
    }
    try {
      const created = await createWorkspace({
        projectId: values.projectId,
        agent: values.agent,
        model: chosenModel,
        effort: chosenEffort,
        message: values.message,
        ...(values.branch.trim() ? { branch: values.branch.trim() } : {}),
        ...(values.name.trim() ? { name: values.name.trim() } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      await navigate({
        to: "/workspaces/$workspaceId/sessions/$sessionId",
        params: { workspaceId: created.workspaceId, sessionId: created.sessionId },
        search: { archived: false },
      });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.userMessage : "Could not start the workspace.";
      setFormError(message);
      toast.error(message);
    }
  }

  if (projects.isPending) return <ListSkeleton />;

  return (
    <main className="flex flex-1 flex-col px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <h1 className="text-2xl font-semibold">Start a workspace</h1>
      <p className="mt-2 text-muted-foreground">
        Pick a repository and an opening prompt. The new chat opens as soon as Conductor accepts it.
      </p>
      <form className="mt-6 grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-2">
          <Label htmlFor="project">Project</Label>
          <Select
            value={form.watch("projectId")}
            onValueChange={(value) => {
              form.setValue("projectId", value, { shouldValidate: true });
            }}
          >
            <SelectTrigger id="project" className="w-full">
              <SelectValue placeholder="Choose a repository" />
            </SelectTrigger>
            <SelectContent>
              {(projects.data ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.projectId ? (
            <p className="text-sm text-destructive">{form.formState.errors.projectId.message}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="branch">Branch</Label>
          <Input
            id="branch"
            placeholder="Project default"
            className="min-h-11"
            {...form.register("branch")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="workspace-name">Name</Label>
          <Input
            id="workspace-name"
            placeholder="Leave blank for a generated name"
            className="min-h-11"
            {...form.register("name")}
          />
        </div>
        <AgentFields
          idPrefix="new"
          agent={agent}
          model={model}
          effort={effort}
          onAgentChange={(next) => {
            const adjusted = applyAgentChange(next, model, effort);
            form.setValue("agent", next);
            form.setValue("model", adjusted.model);
            form.setValue("effort", adjusted.effort);
          }}
          onModelChange={(value) => form.setValue("model", value)}
          onEffortChange={(value) => form.setValue("effort", value)}
        />
        <div className="grid gap-2">
          <Label htmlFor="opening-message">Opening message</Label>
          <Textarea id="opening-message" className="min-h-28" {...form.register("message")} />
          {form.formState.errors.message ? (
            <p className="text-sm text-destructive">{form.formState.errors.message.message}</p>
          ) : null}
        </div>
        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        <Button type="submit" className="min-h-11" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Starting…" : "Start a workspace"}
        </Button>
      </form>
    </main>
  );
}
