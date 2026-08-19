import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveOrganizationId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_bookings",
  title: "List bookings",
  description:
    "List cleaning bookings for one of the signed-in user's organizations, optionally filtered by date range and status.",
  inputSchema: {
    organization_id: z
      .string()
      .optional()
      .describe("Organization to read. Defaults to the user's owner organization."),
    from: z.string().optional().describe("Only bookings scheduled on or after this ISO date/time."),
    to: z.string().optional().describe("Only bookings scheduled on or before this ISO date/time."),
    status: z.string().optional().describe("Filter by booking status, e.g. confirmed or completed."),
    limit: z.number().optional().describe("Maximum rows to return (default 25, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organization_id, from, to, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const resolved = await resolveOrganizationId(supabase, organization_id);
    if ("error" in resolved) {
      return { content: [{ type: "text", text: resolved.error }], isError: true };
    }

    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabase
      .from("bookings")
      .select(
        "id, booking_number, scheduled_at, status, service_id, address, city, total_amount, payment_status, frequency, is_arrival_window, arrival_window_start, arrival_window_end, customer_id",
      )
      .eq("organization_id", resolved.organizationId)
      .order("scheduled_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(take);

    if (from) query = query.gte("scheduled_at", from);
    if (to) query = query.lte("scheduled_at", to);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { organization_id: resolved.organizationId, bookings: data ?? [] },
    };
  },
});
