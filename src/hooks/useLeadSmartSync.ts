import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';

interface Lead {
  id: string;
  name: string;
  email: string | null;
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
      const emails = convertedLeads.map(l => l.email?.toLowerCase()).filter((e): e is string => !!e);
      const phones = convertedLeads
        .map(l => l.phone?.replace(/\D/g, ''))
        .filter((p): p is string => !!p && p.length >= 7);

      // Fetch all customers in this org. Paged: PostgREST caps at 1000 rows,
      // and a partial map here makes every lead whose customer fell outside
      // the window look unbooked. Same pattern as useBookings.
      //
      // A read failure ABORTS rather than continuing with an empty list —
      // `customers = null` would otherwise produce an empty map and flag every
      // converted lead as having no booking, silently on the auto-run. Throwing
      // also leaves the previous flaggedLeadIds in place, since
      // setFlaggedLeadIds below never runs.
      const customers: { id: string; email: string | null; phone: string | null }[] = [];
      {
        let from = 0;
        const PAGE_SIZE = 1000;
        while (true) {
          const { data, error } = await supabase
            .from('customers')
            .select('id, email, phone')
            .eq('organization_id', organizationId)
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);

          if (error) {
            console.error('Smart sync: customers fetch failed', error);
            throw error;
          }
          customers.push(...(data || []));
          if (!data || data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }
      }

      // email/phone -> ALL matching customer_ids (handle duplicate customer records)
      const customerMap = new Map<string, string[]>();
      const addToMap = (key: string, id: string) => {
        const existing = customerMap.get(key);
        if (existing) {
          if (!existing.includes(id)) existing.push(id);
        } else {
          customerMap.set(key, [id]);
        }
      };
      customers.forEach(c => {
        if (c.email) addToMap(c.email.toLowerCase(), c.id);
        if (c.phone) {
          const cleanPhone = c.phone.replace(/\D/g, '');
          if (cleanPhone.length >= 7) addToMap(cleanPhone, c.id);
        }
      });

      // Find ALL matching customer IDs for each converted lead
      const leadCustomerMap = new Map<string, string[]>(); // lead.id -> customer_ids[]
      for (const lead of convertedLeads) {
        const ids = new Set<string>();
        const byEmail = lead.email ? customerMap.get(lead.email.toLowerCase()) : undefined;
        byEmail?.forEach(id => ids.add(id));
        if (lead.phone) {
          const byPhone = customerMap.get(lead.phone.replace(/\D/g, ''));
          byPhone?.forEach(id => ids.add(id));
        }
        leadCustomerMap.set(lead.id, [...ids]);
      }

      // Get all customer IDs that we found
      const customerIds = [...new Set(
        [...leadCustomerMap.values()].flat()
      )];

      // Fetch bookings for these customers
      let bookingsByCustomer = new Map<string, { id: string; booking_number: number; status: string; scheduled_at: string }[]>();

      if (customerIds.length > 0) {
        // Paged for the same reason as customers, but the stakes are higher:
        // this read drives a WRITE. A truncated page can drop the one live
        // booking a lead has, making every remaining booking look cancelled —
        // which reverts the lead to follow_up and appends an audit note
        // asserting something untrue.
        //
        // Aborting on error matters here too: an empty result is
        // indistinguishable from "this customer has no bookings", which is
        // precisely the revert condition. A failed read must never drive a write.
        let from = 0;
        const PAGE_SIZE = 1000;
        while (true) {
          const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('id, booking_number, status, scheduled_at, customer_id')
            .eq('organization_id', organizationId)
            .in('customer_id', customerIds)
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);

          if (bookingsError) {
            console.error('Smart sync: bookings fetch failed', bookingsError);
            throw bookingsError;
          }

          (bookings || []).forEach(b => {
            if (!b.customer_id) return; // unattributable booking — forEach, so return
            const existing = bookingsByCustomer.get(b.customer_id) || [];
            existing.push(b);
            bookingsByCustomer.set(b.customer_id, existing);
          });

          if (!bookings || bookings.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }
      }

      const now = format(new Date(), 'MMM d, yyyy h:mm a');

      for (const lead of convertedLeads) {
        const customerIdsForLead = leadCustomerMap.get(lead.id) || [];

        if (customerIdsForLead.length === 0) {
          // No customer found at all — flag it
          newFlagged.add(lead.id);
          result.flagged.push(lead.id);
          continue;
        }

        // Aggregate bookings across ALL matching (possibly duplicate) customer records
        const bookings = customerIdsForLead.flatMap(
          (cid) => bookingsByCustomer.get(cid) || []
        );

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

          const autoNote = `[Auto-Sync ${now}] Booking #${latestCancelled.booking_number} was ${latestCancelled.status === 'no_show' ? 'a no-show' : 'cancelled'} on ${format(new Date(latestCancelled.scheduled_at), 'MMM d, yyyy')}. Needs follow up.`;
          const updatedNotes = lead.notes
            ? `${lead.notes}\n${autoNote}`
            : autoNote;

          // supabase.update() resolves with { error } rather than throwing, so
          // this was previously counted as reverted whether or not it landed —
          // the toast reported reverts that never happened.
          // organization_id filter matches every other write in the codebase;
          // RLS already covers it, this is defence in depth.
          const { error: updateError } = await supabase
            .from('leads')
            .update({ status: 'follow_up', notes: updatedNotes })
            .eq('id', lead.id)
            .eq('organization_id', organizationId);

          if (updateError) {
            console.error(`Smart sync: failed to revert lead ${lead.id}`, updateError);
            continue;
          }

          result.reverted++;
        }
      }

      setFlaggedLeadIds(newFlagged);

      if (!silent && (result.reverted > 0 || result.flagged.length > 0)) {
        const parts = [];
        if (result.reverted > 0) parts.push(`${result.reverted} lead(s) reverted to Follow Up`);
        if (result.flagged.length > 0) parts.push(`${result.flagged.length} lead(s) flagged: no booking found`);
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
