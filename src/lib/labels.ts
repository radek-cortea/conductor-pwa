import type { SessionPhase, WorkspacePhase } from "@/api/types";

const workspaceLabels: Record<WorkspacePhase, string> = {
  ready: "Ready",
  initializing: "Initialising",
  sleeping: "Sleeping",
  archived: "Archived",
  updating: "Updating",
  unstarted: "Unstarted",
  deleted: "Deleted",
};

const lifecycleLabels = {
  building_snapshot: "Building snapshot",
  preparing: "Preparing",
  setting_up: "Setting up",
  updating: "Updating",
} as const;

const sessionLabels: Record<SessionPhase, string> = {
  idle: "Idle",
  working: "Working",
  error: "Error",
};

export function workspaceStatusLabel(status: string | undefined): string {
  if (status && status in workspaceLabels) {
    return workspaceLabels[status as WorkspacePhase];
  }
  return status ?? "Unknown";
}

export function lifecycleLabel(step: string | undefined): string | null {
  if (!step) return null;
  if (step in lifecycleLabels) return lifecycleLabels[step as keyof typeof lifecycleLabels];
  return step;
}

export function sessionStatusLabel(status: string | undefined): string {
  if (status && status in sessionLabels) return sessionLabels[status as SessionPhase];
  return status ?? "Idle";
}

export function formatActivity(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "No activity";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "No activity";
  const seconds = Math.round((then - now) / 1000);
  const absolute = Math.abs(seconds);
  if (absolute < 45) return "Just now";
  const format = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  if (absolute < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (absolute < 86_400) return format.format(Math.round(seconds / 3600), "hour");
  if (absolute < 86_400 * 30) return format.format(Math.round(seconds / 86_400), "day");
  return format.format(Math.round(seconds / (86_400 * 30)), "month");
}
