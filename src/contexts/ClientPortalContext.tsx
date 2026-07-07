/**
 * CLIENT PORTAL AUTH CONTEXT
 * 
 * Manages client portal user authentication (username/password login for customers)
 * This is separate from the admin/staff auth system.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { FunctionInvokeOptions } from '@supabase/functions-js';

interface ClientPortalUser {
  id: string;
  username: string;
  customer_id: string;
  organization_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
}

interface CustomerInfo {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  property_type: string | null;
}

interface LoyaltyInfo {
  points: number;
  lifetime_points: number;
  tier: string;
}

interface PortalInvokeResult<T = any> {
  data: T | null;
  error: any;
  unauthorized: boolean;
}

interface ClientPortalContextType {
  user: ClientPortalUser | null;
  customer: CustomerInfo | null;
  loyalty: LoyaltyInfo | null;
  sessionToken: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => void;
  refreshData: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error: string | null }>;
  invokePortal: <T = any>(name: string, options?: FunctionInvokeOptions) => Promise<PortalInvokeResult<T>>;
}

const ClientPortalContext = createContext<ClientPortalContextType | undefined>(undefined);

const STORAGE_KEY = 'client_portal_session';

export function ClientPortalProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClientPortalUser | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load session from storage on mount
  useEffect(() => {
    const LEGACY_MIGRATED_KEY = 'client_portal_session_migrated_v1';
    const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;
    const dlog = (...args: any[]) => { if (isDev) console.log('[ClientPortal]', ...args); };

    const load = async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) { setLoading(false); return; }

      let parsed: any;
      try {
        parsed = JSON.parse(stored);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setLoading(false);
        return;
      }

      // Enforce session expiry (30-day sessions)
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        dlog('stored session expired, clearing');
        localStorage.removeItem(STORAGE_KEY);
        setLoading(false);
        return;
      }

      const hasToken = typeof parsed.sessionToken === 'string' && parsed.sessionToken.length > 0;
      const hasLegacyIdentity = parsed.user?.id && parsed.user?.customer_id;

      // Legacy session (pre signed-token deploy): has user + customer but no
      // sessionToken. Try to re-mint one from the portal-session-refresh
      // endpoint before falling back to force-logout. Migration marker
      // ensures we only attempt the re-mint once per stored legacy session.
      if (!hasToken && hasLegacyIdentity) {
        const alreadyTried = localStorage.getItem(LEGACY_MIGRATED_KEY) === parsed.user.id;
        if (alreadyTried) {
          dlog('legacy session re-mint already attempted, clearing');
          localStorage.removeItem(STORAGE_KEY);
          setLoading(false);
          return;
        }
        localStorage.setItem(LEGACY_MIGRATED_KEY, parsed.user.id);
        dlog('legacy session detected, attempting one-shot re-mint');

        try {
          const { data, error } = await supabase.functions.invoke('portal-session-refresh', {
            body: {
              portal_user_id: parsed.user.id,
              customer_id: parsed.user.customer_id,
            },
          });
          const result = data as { ok?: boolean; session_token?: string } | null;
          if (error || !result?.ok || !result.session_token) {
            dlog('legacy re-mint failed, clearing session', error);
            localStorage.removeItem(STORAGE_KEY);
            setLoading(false);
            return;
          }
          dlog('legacy re-mint succeeded, upgrading stored session');
          setUser(parsed.user);
          setCustomer(parsed.customer);
          setLoyalty(parsed.loyalty);
          setSessionToken(result.session_token);
          // Rewrite storage with the new sessionToken-bearing shape.
          const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            user: parsed.user,
            customer: parsed.customer,
            loyalty: parsed.loyalty,
            sessionToken: result.session_token,
            expiresAt,
          }));
        } catch (e) {
          dlog('legacy re-mint threw, clearing session', e);
          localStorage.removeItem(STORAGE_KEY);
        }
        setLoading(false);
        return;
      }

      // Modern session (has sessionToken) — restore as-is.
      setUser(parsed.user);
      setCustomer(parsed.customer);
      setLoyalty(parsed.loyalty);
      if (hasToken) setSessionToken(parsed.sessionToken);
      setLoading(false);
    };

    void load();
  }, []);

  const saveSession = (
    userData: ClientPortalUser,
    customerData: CustomerInfo,
    loyaltyData: LoyaltyInfo | null,
    tokenOverride?: string | null,
  ) => {
    // Expire sessions after 30 days to limit PII sitting in localStorage indefinitely
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    // Strip the most sensitive PII (email, phone) from what we persist. These
    // are reloaded on next sign-in or via refreshData(). Keeps localStorage
    // useful for fast-rendering the greeting + sidebar without leaving
    // contact details sitting in plaintext under the user's browser profile.
    const safeCustomer = {
      id: customerData.id,
      first_name: customerData.first_name,
      last_name: customerData.last_name,
      email: '',
      phone: null,
      property_type: customerData.property_type,
    };
    const tokenToStore = tokenOverride !== undefined ? tokenOverride : sessionToken;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      user: userData,
      customer: safeCustomer,
      loyalty: loyaltyData,
      sessionToken: tokenToStore,
      expiresAt,
    }));
  };

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      // Call the rate-limited edge function instead of the RPC directly so
      // brute-force attempts are throttled per-IP and per-email at the edge.
      const { data: validationResult, error: validationError } = await supabase.functions.invoke(
        'client-portal-login',
        { body: { email: email.toLowerCase().trim(), password } },
      );

      if (validationError) {
        console.error('Login validation error:', validationError);
        return { error: 'Invalid email or password' };
      }

      const validation = validationResult as { valid: boolean; error?: string; user_id?: string; session_token?: string } | null;

      if (validation?.error === 'rate_limited') {
        return { error: 'Too many attempts. Please wait a few minutes and try again.' };
      }

      if (!validation || !validation.valid || !validation.session_token) {
        return { error: 'Invalid email or password' };
      }

      const newSessionToken = validation.session_token;


      // Use the security definer function to get all user data by email
      const { data: userData, error: userDataError } = await supabase.rpc('get_client_portal_user_data' as any, {
        p_email: email.toLowerCase().trim(),
      });

      if (userDataError) {
        console.error('Failed to load user data:', userDataError);
        return { error: 'Failed to load user data' };
      }

      if (!userData || userData.length === 0) {
        return { error: 'Failed to load user data' };
      }

      const row = userData[0];

      if (!row.is_active) {
        return { error: 'This account has been deactivated' };
      }

      const portalUser: ClientPortalUser = {
        id: row.user_id,
        username: row.username,
        customer_id: row.customer_id,
        organization_id: row.organization_id,
        is_active: row.is_active,
        must_change_password: row.must_change_password,
      };

      const customerData: CustomerInfo = {
        id: row.customer_id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone,
        property_type: row.property_type || 'residential',
      };

      const loyaltyData: LoyaltyInfo | null = row.loyalty_points !== null ? {
        points: row.loyalty_points,
        lifetime_points: row.loyalty_lifetime_points,
        tier: row.loyalty_tier,
      } : null;

      // Update last login using security definer function
      await supabase.rpc('update_client_portal_last_login' as any, {
        p_user_id: row.user_id,
      });

      setUser(portalUser);
      setCustomer(customerData);
      setLoyalty(loyaltyData);
      setSessionToken(newSessionToken);
      saveSession(portalUser, customerData, loyaltyData, newSessionToken);

      return { error: null };
    } catch (err: any) {
      console.error('Login error:', err);
      return { error: 'An unexpected error occurred' };
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<{ error: string | null }> => {
    if (!user) {
      return { error: 'Not logged in' };
    }

    try {
      const { data, error } = await supabase.rpc('change_client_portal_password' as any, {
        p_user_id: user.id,
        p_current_password: currentPassword,
        p_new_password: newPassword,
      });

      if (error) {
        console.error('Password change error:', error);
        return { error: 'Failed to change password' };
      }

      const result = data as { success: boolean; error?: string } | null;

      if (!result || !result.success) {
        return { error: result?.error || 'Failed to change password' };
      }

      // Update local state
      if (user.must_change_password) {
        const updatedUser = { ...user, must_change_password: false };
        setUser(updatedUser);
        if (customer) {
          saveSession(updatedUser, customer, loyalty);
        }
      }

      return { error: null };
    } catch (err: any) {
      console.error('Password change error:', err);
      return { error: 'An unexpected error occurred' };
    }
  };

  const signOut = useCallback(() => {
    setUser(null);
    setCustomer(null);
    setLoyalty(null);
    setSessionToken(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const handleUnauthorized = useCallback(() => {
    signOut();
    if (typeof window !== 'undefined') {
      const alreadyOnLogin = window.location.pathname.startsWith('/portal/login');
      if (!alreadyOnLogin) {
        toast.error('Your session expired. Please sign in again.');
        window.location.assign('/portal/login?reason=session_expired');
      }
    }
  }, [signOut]);

  const invokePortal = useCallback(
    async <T = any,>(name: string, options: FunctionInvokeOptions = {}): Promise<PortalInvokeResult<T>> => {
      const mergedHeaders = {
        ...(options.headers ?? {}),
        ...(sessionToken ? { 'x-portal-session': sessionToken } : {}),
      };
      const result: any = await supabase.functions.invoke(name, { ...options, headers: mergedHeaders });
      const status =
        result?.error?.context?.response?.status ??
        result?.error?.status ??
        (result?.data && typeof result.data === 'object' && (result.data as any).error === 'unauthorized' ? 401 : undefined);
      if (status === 401) {
        handleUnauthorized();
        return { data: null, error: result.error ?? new Error('unauthorized'), unauthorized: true };
      }
      return { data: result.data as T | null, error: result.error, unauthorized: false };
    },
    [sessionToken, handleUnauthorized],
  );

  const refreshData = async () => {
    if (!user) return;

    // Refresh customer info
    const { data: rawCustomerData } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email, phone')
      .eq('id', user.customer_id)
      .single();

    // Fetch property_type separately to avoid type issues with generated types
    const { data: propData } = await supabase
      .from('customers')
      .select('property_type' as any)
      .eq('id', user.customer_id)
      .single();

    // Refresh loyalty info
    const { data: loyaltyData } = await supabase
      .from('customer_loyalty')
      .select('points, lifetime_points, tier')
      .eq('customer_id', user.customer_id)
      .maybeSingle();

    if (rawCustomerData) {
      const customerData: CustomerInfo = {
        ...rawCustomerData,
        property_type: (propData as any)?.property_type || 'residential',
      };
      setCustomer(customerData);
      saveSession(user, customerData, loyaltyData);
    }
    if (loyaltyData) {
      setLoyalty(loyaltyData);
    }
  };

  return (
    <ClientPortalContext.Provider
      value={{
        user,
        customer,
        loyalty,
        sessionToken,
        loading,
        signIn,
        signOut,
        refreshData,
        changePassword,
        invokePortal,
      }}
    >
      {children}
    </ClientPortalContext.Provider>
  );
}

export function useClientPortal() {
  const context = useContext(ClientPortalContext);
  if (context === undefined) {
    throw new Error('useClientPortal must be used within a ClientPortalProvider');
  }
  return context;
}
