import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  notes: string | null;
}

interface SyncResult {
  reverted: number;
  flagged: string[]; // lead IDs with no booking found
}

export function useLeadSmartSync(organizationId: string | undefined) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [flaggedLeadIds, setFlaggedLeadIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const runSync = useCallback(async (leads: Lead[], silent = false): Promise<SyncResult> => {
    if (!organizationId) return { reverted: 0, flagged: [] };

    setIsSyncing(true);
    const result: SyncResult = { reverted: 0, flagged: [] };
    const newFlagged = new Set<string>();

    try {
      const convertedLeads = leads.filter(l => l.status === 'converted');
      if (convertedLeads.length === 0) {
        setFlaggedLeadIds(new Set());
        return result;
      }

      // Collect all emails and phones from converted leads
      const emails = convertedLeads.map(l => l.email.toLowerCase()).filter(Boolean);
      const phones = convertedLeads
        .map(l => l.phone?.replace(/\D/g, ''))
        .filter((p): p is string => !!p && p.length >= 7);

      // Fetch all customers matching these emails/phones in this org
      const { data: customers } = await supabase
        .from('customers')
        .select('id, email, phone')
        .eq('organization_id', organizationId);

      const customerMap = new Map<string, string>(); // email/phone -> customer_id
      (customers || []).forEach(c => {
        if (c.email) customerMap.set(c.email.toLowerCase(), c.id);
        if (c.phone) {
          const cleanPhone = c.phone.replace(/\D/g, '');
          if (cleanPhone.length >= 7) customerMap.set(cleanPhone, c.id);
        }
      });

      // Find customer IDs for converted leads
      const leadCustomerMap = new Map<string, string | null>(); // lead.id -> customer_id
      for (const lead of convertedLeads) {
        const byEmail = customerMap.get(lead.email.toLowerCase());
        const byPhone = lead.phone ? customerMap.get(lead.phone.replace(/\D/g, '')) : undefined;
        leadCustomerMap.set(lead.id, byEmail || byPhone || null);
      }

      // Get all customer IDs that we found
      const customerIds = [...new Set(
        [...leadCustomerMap.values()].filter((id): id is string => !!id)
      )];

      // Fetch bookings for these customers
      let bookingsByCustomer = new Map<string, { id: string; booking_number: number; status: string; scheduled_at: string }[]>();

      if (customerIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, booking_number, status, scheduled_at, customer_id')
          .eq('organization_id', organizationId)
          .in('customer_id', customerIds);

        (bookings || []).forEach(b => {
          const existing = bookingsByCustomer.get(b.customer_id) || [];
          existing.push(b);
          bookingsByCustomer.set(b.customer_id, existing);
        });
      }

      const now = format(new Date(), 'MMM d, yyyy h:mm a');

      for (const lead of convertedLeads) {
        const customerId = leadCustomerMap.get(lead.id);

        if (!customerId) {
          // No customer found at all — flag it
          newFlagged.add(lead.id);
          result.flagged.push(lead.id);
          continue;
        }

        const bookings = bookingsByCustomer.get(customerId) || [];

        if (bookings.length === 0) {
          // Customer exists but no bookings — flag
          newFlagged.add(lead.id);
          result.flagged.push(lead.id);
          continue;
        }

        // Check if ALL bookings are cancelled or no_show
        const hasValidBooking = bookings.some(
          b => !['cancelled', 'no_show'].includes(b.status)
        );

        if (!hasValidBooking) {
          // All bookings cancelled/no_show — revert to follow_up
          const latestCancelled = bookings
            .filter(b => ['cancelled', 'no_show'].includes(b.status))
            .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0];

          const autoNote = `[Auto-Sync ${now}] Booking #${latestCancelled.booking_number} was ${latestCancelled.status === 'no_show' ? 'a no-show' : 'cancelled'} on ${format(new Date(latestCancelled.scheduled_at), 'MMM d, yyyy')} — needs follow up`;
          const updatedNotes = lead.notes
            ? `${lead.notes}\n${autoNote}`
            : autoNote;

          await supabase
            .from('leads')
            .update({ status: 'follow_up', notes: updatedNotes })
            .eq('id', lead.id);

          result.reverted++;
        }
      }

      setFlaggedLeadIds(newFlagged);

      if (!silent && (result.reverted > 0 || result.flagged.length > 0)) {
        const parts = [];
        if (result.reverted > 0) parts.push(`${result.reverted} lead(s) reverted to Follow Up`);
        if (result.flagged.length > 0) parts.push(`${result.flagged.length} lead(s) flagged — no booking found`);
        toast.info(`Smart Sync: ${parts.join(', ')}`);
      } else if (!silent) {
        toast.success('Smart Sync: All lead statuses are accurate');
      }

      if (result.reverted > 0) {
        queryClient.invalidateQueries({ queryKey: ['leads'] });
      }

      return result;
    } catch (error) {
      console.error('Smart sync error:', error);
      if (!silent) toast.error('Smart sync failed');
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [organizationId, queryClient]);

  return { runSync, isSyncing, flaggedLeadIds };
}
