import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface ResolvedContact {
  name: string | null;
  source: 'customer' | 'lead' | 'staff' | 'openphone' | 'unknown';
  phone: string;
}

interface ContactCache {
  [phone: string]: ResolvedContact;
}

/**
 * Hook for resolving contact names from phone numbers
 * Priority: Local customers/leads/staff -> OpenPhone API -> Unknown
 * Caches results to minimize API calls
 */
export function useContactNameResolver(organizationId: string | null) {
  const [cache, setCache] = useState<ContactCache>({});
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef<Set<string>>(new Set());

  /**
   * Normalize phone number for comparison
   */
  const normalizePhone = useCallback((phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    // Remove leading 1 if present (US country code)
    return digits.startsWith('1') && digits.length === 11 
      ? digits.substring(1) 
      : digits;
  }, []);

  /**
   * Resolve a single phone number to a contact name
   */
  const resolveContact = useCallback(async (phone: string): Promise<ResolvedContact> => {
    if (!organizationId || !phone) {
      return { name: null, source: 'unknown', phone };
    }

    const normalizedPhone = normalizePhone(phone);
    
    // Check cache first
    if (cache[normalizedPhone]) {
      return cache[normalizedPhone];
    }

    // Check if already being resolved
    if (pendingRef.current.has(normalizedPhone)) {
      return { name: null, source: 'unknown', phone };
    }

    pendingRef.current.add(normalizedPhone);

    try {
      // Try to find in customers
      const { data: customers } = await supabase
        .from('customers')
        .select('first_name, last_name, phone')
        .eq('organization_id', organizationId)
        .not('phone', 'is', null);

      const matchingCustomer = customers?.find(c => 
        c.phone && normalizePhone(c.phone) === normalizedPhone
      );

      if (matchingCustomer) {
        const result: ResolvedContact = {
          name: `${matchingCustomer.first_name} ${matchingCustomer.last_name}`.trim(),
          source: 'customer',
          phone
        };
        setCache(prev => ({ ...prev, [normalizedPhone]: result }));
        return result;
      }

      // Try to find in leads
      const { data: leads } = await supabase
        .from('leads')
        .select('name, phone')
        .eq('organization_id', organizationId)
        .not('phone', 'is', null);

      const matchingLead = leads?.find(l => 
        l.phone && normalizePhone(l.phone) === normalizedPhone
      );

      if (matchingLead) {
        const result: ResolvedContact = {
          name: matchingLead.name,
          source: 'lead',
          phone
        };
        setCache(prev => ({ ...prev, [normalizedPhone]: result }));
        return result;
      }

      // Try to find in staff
      const { data: staff } = await supabase
        .from('staff')
        .select('name, phone')
        .eq('organization_id', organizationId)
        .not('phone', 'is', null);

      const matchingStaff = staff?.find(s => 
        s.phone && normalizePhone(s.phone) === normalizedPhone
      );

      if (matchingStaff) {
        const result: ResolvedContact = {
          name: matchingStaff.name,
          source: 'staff',
          phone
        };
        setCache(prev => ({ ...prev, [normalizedPhone]: result }));
        return result;
      }

      // Try OpenPhone API lookup as fallback
      try {
        const { data: openPhoneResult } = await supabase.functions.invoke('lookup-openphone-contact', {
          body: { phone, organizationId }
        });

        if (openPhoneResult?.name) {
          const result: ResolvedContact = {
            name: openPhoneResult.name,
            source: 'openphone',
            phone
          };
          setCache(prev => ({ ...prev, [normalizedPhone]: result }));
          return result;
        }
      } catch (openPhoneError) {
        // OpenPhone lookup failed - continue with unknown
        console.log('OpenPhone lookup failed:', openPhoneError);
      }

      // No match found
      const result: ResolvedContact = { name: null, source: 'unknown', phone };
      setCache(prev => ({ ...prev, [normalizedPhone]: result }));
      return result;

    } finally {
      pendingRef.current.delete(normalizedPhone);
    }
  }, [organizationId, cache, normalizePhone]);

  /**
   * Batch resolve multiple phone numbers
   */
  const resolveContacts = useCallback(async (phones: string[]): Promise<Map<string, ResolvedContact>> => {
    if (!organizationId || phones.length === 0) {
      return new Map();
    }

    setLoading(true);
    const results = new Map<string, ResolvedContact>();

    try {
      // Filter out already cached phones
      const uncachedPhones = phones.filter(p => !cache[normalizePhone(p)]);
      
      // Return cached results for those we already have
      phones.forEach(phone => {
        const normalized = normalizePhone(phone);
        if (cache[normalized]) {
          results.set(phone, cache[normalized]);
        }
      });

      // Fetch all customers, leads, staff in parallel for uncached
      if (uncachedPhones.length > 0) {
        const [customersRes, leadsRes, staffRes] = await Promise.all([
          supabase
            .from('customers')
            .select('first_name, last_name, phone')
            .eq('organization_id', organizationId)
            .not('phone', 'is', null),
          supabase
            .from('leads')
            .select('name, phone')
            .eq('organization_id', organizationId)
            .not('phone', 'is', null),
          supabase
            .from('staff')
            .select('name, phone')
            .eq('organization_id', organizationId)
            .not('phone', 'is', null),
        ]);

        const newCacheEntries: ContactCache = {};

        for (const phone of uncachedPhones) {
          const normalized = normalizePhone(phone);

          // Check customers
          const customer = customersRes.data?.find(c => 
            c.phone && normalizePhone(c.phone) === normalized
          );
          if (customer) {
            const result: ResolvedContact = {
              name: `${customer.first_name} ${customer.last_name}`.trim(),
              source: 'customer',
              phone
            };
            results.set(phone, result);
            newCacheEntries[normalized] = result;
            continue;
          }

          // Check leads
          const lead = leadsRes.data?.find(l => 
            l.phone && normalizePhone(l.phone) === normalized
          );
          if (lead) {
            const result: ResolvedContact = {
              name: lead.name,
              source: 'lead',
              phone
            };
            results.set(phone, result);
            newCacheEntries[normalized] = result;
            continue;
          }

          // Check staff
          const staffMember = staffRes.data?.find(s => 
            s.phone && normalizePhone(s.phone) === normalized
          );
          if (staffMember) {
            const result: ResolvedContact = {
              name: staffMember.name,
              source: 'staff',
              phone
            };
            results.set(phone, result);
            newCacheEntries[normalized] = result;
            continue;
          }

          // No local match - mark as unknown for now
          const result: ResolvedContact = { name: null, source: 'unknown', phone };
          results.set(phone, result);
          newCacheEntries[normalized] = result;
        }

        // Update cache with new entries
        setCache(prev => ({ ...prev, ...newCacheEntries }));
      }

      return results;
    } finally {
      setLoading(false);
    }
  }, [organizationId, cache, normalizePhone]);

  /**
   * Get display name for a phone number (uses cache, returns phone if no name)
   */
  const getDisplayName = useCallback((phone: string, fallbackName?: string | null): string => {
    const normalized = normalizePhone(phone);
    const cached = cache[normalized];
    
    if (cached?.name) {
      return cached.name;
    }
    
    if (fallbackName) {
      return fallbackName;
    }
    
    // Format phone number for display
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    
    return phone;
  }, [cache, normalizePhone]);

  /**
   * Clear the cache
   */
  const clearCache = useCallback(() => {
    setCache({});
    pendingRef.current.clear();
  }, []);

  // Clear cache when organization changes
  useEffect(() => {
    clearCache();
  }, [organizationId, clearCache]);

  return {
    resolveContact,
    resolveContacts,
    getDisplayName,
    clearCache,
    loading,
    cache,
  };
}
