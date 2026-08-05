import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listOrganizationsTool from "./tools/list-organizations";
import listBookingsTool from "./tools/list-bookings";
import listCustomersTool from "./tools/list-customers";
import listInvoicesTool from "./tools/list-invoices";
import createCustomerTool from "./tools/create-customer";

// Must be the direct Supabase host, built from the project ref that Vite
// inlines at build time (never from SUPABASE_URL, which is the proxy host).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "jointidywise",
  title: "Jointidywise",
  version: "0.1.0",
  instructions:
    "Tools for TidyWise, a multi-tenant cleaning business CRM. Callers act as their signed-in TidyWise user and can only reach organizations they are a member of. Use `list_organizations` first to find an organization id, then `list_bookings`, `list_customers`, or `list_invoices`. Use `create_customer` to add a new customer.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listOrganizationsTool,
    listBookingsTool,
    listCustomersTool,
    listInvoicesTool,
    createCustomerTool,
  ],
});
