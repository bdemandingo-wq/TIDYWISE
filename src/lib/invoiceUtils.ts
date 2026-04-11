export interface InvoicePartyLike {
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

export interface InvoiceLineItemLike {
  id?: string;
  description?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total?: number | null;
  sort_order?: number | null;
}

export interface InvoiceLike {
  invoice_number: number;
  customer?: InvoicePartyLike | null;
  lead?: InvoicePartyLike | null;
  invoice_items?: InvoiceLineItemLike[] | null;
  subtotal?: number | null;
  total_amount: number;
  notes?: string | null;
  address?: string | null;
  created_at: string;
  due_date?: string | null;
}

export function formatInvoiceNumber(invoiceNumber: number | string) {
  return `INV-${String(invoiceNumber).padStart(4, "0")}`;
}

export function getInvoiceParty(invoice: InvoiceLike): InvoicePartyLike | null {
  return invoice.customer ?? invoice.lead ?? null;
}

export function getInvoiceContact(invoice: InvoiceLike) {
  const party = getInvoiceParty(invoice);
  const name = party?.name || [party?.first_name, party?.last_name].filter(Boolean).join(" ") || "Unknown Customer";

  return {
    name,
    email: party?.email || "",
    phone: party?.phone || "",
  };
}

export function getInvoiceLineItems(invoice: InvoiceLike) {
  const items = [...(invoice.invoice_items ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((item) => ({
      description: item.description?.trim() || "Service",
      quantity: Number(item.quantity ?? 1),
      unitPrice: Number(item.unit_price ?? item.total ?? 0),
      total: Number(item.total ?? item.unit_price ?? 0),
    }));

  return items.length > 0
    ? items
    : [
        {
          description: "Service",
          quantity: 1,
          unitPrice: Number(invoice.total_amount ?? 0),
          total: Number(invoice.total_amount ?? 0),
        },
      ];
}

export function getInvoiceServiceAddressLines(invoice: InvoiceLike) {
  const party = getInvoiceParty(invoice);
  const street = invoice.address || party?.address || "";
  const cityStateZip = [party?.city, party?.state, party?.zip_code].filter(Boolean).join(", ").replace(", ,", ",");

  return [street, cityStateZip].filter(Boolean);
}

export function getInvoiceServiceAddress(invoice: InvoiceLike) {
  return getInvoiceServiceAddressLines(invoice).join("\n");
}

export function buildInvoiceEmailPayload(invoice: InvoiceLike, organizationId: string) {
  const contact = getInvoiceContact(invoice);

  return {
    organizationId,
    invoiceNumber: invoice.invoice_number,
    customerName: contact.name,
    customerEmail: contact.email,
    customerPhone: contact.phone || undefined,
    invoiceDate: invoice.created_at,
    dueDate: invoice.due_date || undefined,
    subtotal: Number(invoice.subtotal ?? invoice.total_amount ?? 0),
    total: Number(invoice.total_amount ?? 0),
    address: getInvoiceServiceAddress(invoice) || undefined,
    notes: invoice.notes || undefined,
    lineItems: getInvoiceLineItems(invoice),
  };
}
