// /me documents an organization ID but no display name. Prefer a display name
// if the server supplies one; otherwise use the common GitHub repository owner.
// Never mistake the caller's personal name for their organization.
export function organizationName(me: unknown, remotes: readonly string[]): string | undefined {
  if (me && typeof me === "object") {
    const data = me as Record<string, unknown>;
    if (typeof data.organizationName === "string" && data.organizationName.trim())
      return data.organizationName.trim();
    if (data.organization && typeof data.organization === "object") {
      const name = (data.organization as Record<string, unknown>).name;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
  }
  const owners = new Map<string, string>();
  for (const remote of remotes) {
    const owner = remote.match(
      /^(?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/[^/]+/i,
    )?.[1];
    if (owner) owners.set(owner.toLowerCase(), owner);
  }
  return owners.size === 1 ? owners.values().next().value : undefined;
}
