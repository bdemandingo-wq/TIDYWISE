import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveOrganizationId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_customer",
  title: "Create customer",
  description:
    "Create a new customer record in one of the signed-in user's organizations. Use list_customers first to avoid duplicates.",
  inputSchema: {
    first_name: z.string().trim().min(1).describe("Customer first name."),
    last_name: z.string().trim().min(1).describe("Customer last name."),
    email: z.string().trim().min(1).describe("Customer email address."),
    phone: z.string().trim().optional().describe("Customer phone number."),
    address: z.string().trim().optional().describe("Street address."),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    zip_code: z.string().trim().optional(),
    notes: z.string().trim().optional().describe("Internal notes about this customer."),
    organization_id: z
      .string()
      .optional()
      .describe("Organization to write to. Defaults to the user's owner organization."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const resolved = await resolveOrganizationId(supabase, input.organization_id);
    if ("error" in resolved) throw new ToolError(resolved.error);

    const { organization_id: _ignored, ...fields } = input;
    const { data, error } = await supabase
      .from("customers")
      .insert({ ...fields, organization_id: resolved.organizationId })
      .select("id, first_name, last_name, email, phone, city, state, created_at")
      .single();

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { customer: data },
    };
  },
});
