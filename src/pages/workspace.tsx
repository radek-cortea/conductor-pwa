import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, getRouteApi, useParams } from "@tanstack/react-router";
import { Copy, ExternalLink, GitPullRequest, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/api/errors";
import {
  archiveWorkspace,
  createSession,
  renameWorkspace,
  restoreWorkspace,
  sleepWorkspace,
} from "@/api/fetch";
import {
  previewQuery,
  messagesQuery,
  sessionStatusQuery,
  sessionsQuery,
  workspaceQuery,
  workspaceStatusQuery,
} from "@/api/queries";
import type { PickerAgent, Session } from "@/api/types";
import { rememberChat } from "@/lib/chats";
import { copyText } from "@/lib/copy";
import { findPullRequestLink } from "@/lib/pull-request";
import { safeWebUrl, safeMacUrl } from "@/lib/safe-url";
import { agentModels } from "@/lib/agent-models";
import { sessionStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { applyAgentChange } from "@/lib/agent-picker";
import { AgentFields } from "@/pages/agent-fields";
import { TranscriptSkeleton } from "@/pages/skeletons";
import { WorkspaceHeader } from "@/pages/workspace-header";
import { MergedPr } from "@/pages/merged-pr";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Textarea } from "@/ui/textarea";

const workspaceRoute = getRouteApi("/_authenticated/workspaces/$workspaceId");

export function WorkspacePage() {
  const { workspaceId } = workspaceRoute.useParams();
  const search = workspaceRoute.useSearch();
  const navigate = workspaceRoute.useNavigate();
  const { sessionId } = useParams({ strict: false });
  useEffect(() => {
    if (sessionId) rememberChat(workspaceId, sessionId);
  }, [workspaceId, sessionId]);
  const queryClient = useQueryClient();
  const workspace = useQuery(workspaceQuery(workspaceId));
  const status = useQuery(workspaceStatusQuery(workspaceId));
  const sessions = useQuery(sessionsQuery(workspaceId, search.archived));
  const preview = useQuery(previewQuery(workspaceId));
  const transcript = useQuery({ ...messagesQuery(sessionId ?? ""), enabled: Boolean(sessionId) });
  const prLink = useMemo(
    () =>
      findPullRequestLink(
        workspace.data?.repoUrl ?? "",
        Object.values(transcript.data?.byOffset ?? {}),
      ),
    [workspace.data?.repoUrl, transcript.data?.byOffset],
  );
  const copyLink = async (link: string, label: string) => {
    const copied = await copyText(link);
    toast[copied ? "success" : "error"](
      copied ? `${label} copied` : `Could not copy ${label.toLowerCase()}`,
    );
  };
  const [renameOpen, setRenameOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [name, setName] = useState("");

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  };

  const rename = useMutation({
    mutationFn: (nextName: string) => renameWorkspace(workspaceId, nextName),
    onSuccess: async () => {
      setRenameOpen(false);
      toast.success("Workspace renamed");
      await invalidate();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.userMessage : "Could not rename the workspace.",
      );
    },
  });

  const archive = useMutation({
    mutationFn: () => archiveWorkspace(workspaceId),
    onSuccess: async () => {
      toast.success("Workspace archived");
      await invalidate();
      await navigate({ to: "/workspaces", search: { archived: false, q: "" } });
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.userMessage : "Could not archive the workspace.",
      );
    },
  });

  const restore = useMutation({
    mutationFn: () => restoreWorkspace(workspaceId),
    onSuccess: async () => {
      toast.success("Workspace restored");
      await invalidate();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.userMessage : "Could not restore the workspace.",
      );
    },
  });

  const sleep = useMutation({
    mutationFn: () => sleepWorkspace(workspaceId),
    onSuccess: async () => {
      toast.success("Workspace sleeping");
      await invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.userMessage : "Could not sleep the workspace.");
    },
  });

  const { workspacePreview } = workspaceRoute.useRouteContext();
  if (workspace.isPending || sessions.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <WorkspaceHeader name={workspace.data?.name ?? workspacePreview?.name} />
        <TranscriptSkeleton />
      </div>
    );
  }
  if (!workspace.data) return null;

  const phase = status.data?.status ?? workspace.data.state;
  const visibleSessions = (sessions.data ?? []).filter(
    (session) => search.archived || !session.archivedAt,
  );
  const previewUrl = safeWebUrl(preview.data?.preview?.url);
  const macUrl = safeMacUrl(workspace.data.deepLink);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceHeader name={workspace.data.name}>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label="Workspace actions"
                title="Workspace actions"
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {previewUrl ? (
                <DropdownMenuItem asChild>
                  <a href={previewUrl} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden="true" />
                    Open preview
                  </a>
                </DropdownMenuItem>
              ) : null}
              {macUrl ? (
                <DropdownMenuItem
                  onSelect={() => {
                    void copyLink(macUrl, "Mac app link");
                  }}
                >
                  <Copy aria-hidden="true" />
                  Copy Mac app link
                </DropdownMenuItem>
              ) : null}
              {macUrl ? (
                <DropdownMenuItem asChild>
                  <a href={macUrl}>
                    <ExternalLink aria-hidden="true" />
                    Open in Mac app
                  </a>
                </DropdownMenuItem>
              ) : null}
              {prLink ? (
                <DropdownMenuItem
                  onSelect={() => {
                    void copyLink(prLink, "GitHub PR link");
                  }}
                >
                  <GitPullRequest aria-hidden="true" />
                  Copy GitHub PR link
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() => {
                  setName(workspace.data?.name ?? "");
                  setRenameOpen(true);
                }}
              >
                Rename
              </DropdownMenuItem>
              {phase !== "archived" && phase !== "sleeping" ? (
                <DropdownMenuItem onSelect={() => sleep.mutate()}>Sleep</DropdownMenuItem>
              ) : null}
              {phase === "archived" ? (
                <DropdownMenuItem onSelect={() => restore.mutate()}>Restore</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => archive.mutate()}>Archive</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </WorkspaceHeader>
      <MergedPr
        key={workspaceId}
        link={prLink}
        archived={phase === "archived"}
        pending={archive.isPending}
        onArchive={() => archive.mutate()}
      />
      <div className="flex shrink-0 items-center border-b px-4">
        <div role="tablist" aria-label="Chats" className="flex min-w-0 gap-1 overflow-x-auto">
          {visibleSessions.map((session) => (
            <SessionTab
              key={session.id}
              session={session}
              workspaceId={workspaceId}
              selected={session.id === sessionId}
              archived={search.archived}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label="New chat"
          title="New chat"
          onClick={() => setChatOpen(true)}
        >
          <Plus aria-hidden="true" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Chat tab menu"
              title="Chat tab menu"
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem
              checked={search.archived}
              className="min-h-11"
              onCheckedChange={(archived) => {
                void navigate({
                  to: "/workspaces/$workspaceId",
                  params: { workspaceId },
                  search: { archived },
                });
              }}
            >
              Show archived chats
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {visibleSessions.length === 0 ? (
        <p className="px-4 py-4 text-muted-foreground">
          No chats in this workspace yet. Start a new chat.
        </p>
      ) : null}
      <div
        id="chat-panel"
        role="tabpanel"
        aria-label="Chat"
        className="flex min-h-0 flex-1 flex-col"
      >
        <Outlet />
      </div>
      <RenameDialog
        open={renameOpen}
        name={name}
        onNameChange={setName}
        onOpenChange={setRenameOpen}
        pending={rename.isPending}
        onSubmit={() => {
          const trimmed = name.trim();
          if (trimmed) rename.mutate(trimmed);
        }}
      />
      <NewChatDialog
        open={chatOpen}
        workspaceId={workspaceId}
        onOpenChange={setChatOpen}
        onCreated={(sessionId) => {
          void navigate({
            to: "/workspaces/$workspaceId/sessions/$sessionId",
            params: { workspaceId, sessionId },
            search: { archived: search.archived },
          });
        }}
      />
    </div>
  );
}

function SessionTab({
  session,
  workspaceId,
  selected,
  archived,
}: {
  session: Session;
  workspaceId: string;
  selected: boolean;
  archived: boolean;
}) {
  const tab = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (selected) tab.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
  const status = useQuery(sessionStatusQuery(session.id));
  const phase = status.data?.status;
  const errorText = status.data?.errorMessage || status.data?.lastError;
  return (
    <Link
      to="/workspaces/$workspaceId/sessions/$sessionId"
      params={{ workspaceId, sessionId: session.id }}
      search={{ archived }}
      ref={tab}
      role="tab"
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      aria-controls="chat-panel"
      className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm ${selected ? "border-foreground font-semibold" : "border-transparent text-muted-foreground"}`}
      title={phase === "error" ? errorText || sessionStatusLabel(phase) : session.model}
      onKeyDown={(event) => {
        const tabs = Array.from(
          event.currentTarget.parentElement?.querySelectorAll<HTMLAnchorElement>('[role="tab"]') ??
            [],
        );
        const index = tabs.indexOf(event.currentTarget);
        const next =
          event.key === "ArrowRight"
            ? tabs[(index + 1) % tabs.length]
            : event.key === "ArrowLeft"
              ? tabs[(index - 1 + tabs.length) % tabs.length]
              : event.key === "Home"
                ? tabs[0]
                : event.key === "End"
                  ? tabs.at(-1)
                  : undefined;
        if (next) {
          event.preventDefault();
          next.focus();
          next.click();
        }
      }}
    >
      <span
        role="img"
        aria-label={sessionStatusLabel(phase)}
        title={
          phase === "error" ? errorText || sessionStatusLabel(phase) : sessionStatusLabel(phase)
        }
        className={cn(
          "size-2 shrink-0 rounded-full",
          phase === "working"
            ? "animate-pulse bg-amber-500"
            : phase === "error"
              ? "bg-destructive"
              : phase === "idle"
                ? "bg-emerald-500"
                : "bg-muted-foreground",
        )}
      />
      <span>{session.name || "Untitled chat"}</span>
    </Link>
  );
}

function RenameDialog({
  open,
  name,
  pending,
  onNameChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  name: string;
  pending: boolean;
  onNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename workspace</DialogTitle>
          <DialogDescription>This name is also used for the git branch.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="rename-workspace">Name</Label>
            <Input
              id="rename-workspace"
              value={name}
              className="min-h-11"
              onChange={(event) => onNameChange(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="min-h-11"
              disabled={pending || name.trim().length === 0}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewChatDialog({
  open,
  workspaceId,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  workspaceId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (sessionId: string) => void;
}) {
  const defaults = agentModels.claude;
  const [agent, setAgent] = useState<PickerAgent>("claude");
  const [model, setModel] = useState<string>(defaults.defaultModel);
  const [effort, setEffort] = useState<string>(defaults.defaultEffort);
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => {
      const chosenModel = agentModels[agent].models.find((item) => item === model);
      const chosenEffort = agentModels[agent].efforts.find((item) => item === effort);
      if (!chosenModel || !chosenEffort) {
        throw new ApiError(400, "Choose a model for this agent.");
      }
      return createSession({
        workspaceId,
        agent,
        model: chosenModel,
        effort: chosenEffort,
        ...(message.trim() ? { message: message.trim() } : {}),
      });
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceId, "sessions"] });
      onOpenChange(false);
      onCreated(created.id);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.userMessage : "Could not start the chat.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
          <DialogDescription>Start another agent in this workspace.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <AgentFields
            idPrefix="chat"
            agent={agent}
            model={model}
            effort={effort}
            onAgentChange={(next) => {
              const adjusted = applyAgentChange(next, model, effort);
              setAgent(next);
              setModel(adjusted.model);
              setEffort(adjusted.effort);
            }}
            onModelChange={setModel}
            onEffortChange={setEffort}
          />
          <div className="grid gap-2">
            <Label htmlFor="chat-message">Opening message</Label>
            <Textarea
              id="chat-message"
              value={message}
              className="min-h-24"
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" className="min-h-11" disabled={create.isPending}>
              Start chat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
