import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

function runtimeEnv(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobals;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}

function configuredEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = runtimeEnv(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

function supabaseProjectUrl(): string {
  const url = configuredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  if (!url) throw new Error("SUPABASE_URL (or VITE_SUPABASE_URL) is required");
  return url;
}

function supabasePublishableKey(): string {
  const direct = configuredEnv([
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  ]);
  if (direct) return direct;
  const keyset = runtimeEnv("SUPABASE_PUBLISHABLE_KEYS");
  if (keyset) {
    try {
      const parsed: unknown = JSON.parse(keyset);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys = parsed as Record<string, unknown>;
        const key = [keys.default, ...Object.values(keys)]
          .find((v): v is string => typeof v === "string" && v.trim().startsWith("sb_publishable_"))
          ?.trim();
        if (key) return key;
      }
    } catch {
      // Malformed dictionary; fall through to the legacy names.
    }
  }
  const legacy = configuredEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"]);
  if (legacy) return legacy;
  throw new Error("SUPABASE_PUBLISHABLE_KEY, SUPABASE_PUBLISHABLE_KEYS, or SUPABASE_ANON_KEY is required");
}

/**
 * Forwards the verified OAuth bearer token so every query runs under RLS as
 * the signed-in TidyWise user. There is deliberately no service-role client
 * here — MCP tools must never bypass multi-tenant isolation.
 */
export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("supabaseForUser requires a verified OAuth token");
  return createClient(supabaseProjectUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolves the organization the tool call should operate on. Callers may pass
 * an explicit id, but it is always validated against the caller's memberships
 * so a client can never reach another tenant's data.
 */
export async function resolveOrganizationId(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  requested?: string | null,
): Promise<{ organizationId: string } | { error: string }> {
  const { data, error } = await supabase
    .from("org_memberships")
    .select("organization_id, role")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) return { error: error.message };
  const rows = (data ?? []) as Array<{ organization_id: string; role: string }>;
  if (rows.length === 0) return { error: "You are not a member of any organization." };

  if (requested) {
    const match = rows.find((r) => r.organization_id === requested);
    if (!match) return { error: "You are not a member of that organization." };
    return { organizationId: match.organization_id };
  }

  const owner = rows.find((r) => r.role === "owner");
  return { organizationId: (owner ?? rows[0]).organization_id };
}
