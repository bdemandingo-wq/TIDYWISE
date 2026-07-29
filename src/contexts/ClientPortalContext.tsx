/**
 * CLIENT PORTAL AUTH CONTEXT
 * 
 * Manages client portal user authentication (username/password login for customers)
 * This is separate from the admin/staff auth system.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { readEdgeFunctionError } from '@/lib/edgeFunctionError';
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

interface PortalInvokeOpts {
  /**
   * Detect a 401 and report it via `unauthorized`, but do NOT sign the user out
   * or redirect. For background/telemetry calls only.
   *
   * Session tracking pings every 30 seconds. Routing that through the same
   * handler that force-redirects on 401 means one transient auth blip ends a
   * customer's session mid-visit — a heartbeat must never be able to do that.
   * Foreground calls that actually render data still redirect, because there a
   * 401 means the page genuinely cannot be shown.
   */
  silentUnauthorized?: boolean;
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
  invokePortal: <T = any>(
    name: string,
    options?: FunctionInvokeOptions,
    portalOpts?: PortalInvokeOpts,
  ) => Promise<PortalInvokeResult<T>>;
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

    // A session stored by an older build can be missing customer_id. That
    // strands the portal silently: every client-portal-api call site is gated
    // on that field, so the dashboard renders empty states and never asks the
    // server for anything. The server still has the value — the signed token
    // carries it and verifies fine — so re-fetch the identity with the token
    // we already hold instead of telling the customer to sign out and back in.
    // Three named outcomes rather than ok/reachable booleans: this project
    // compiles with strict: false, and non-strict TypeScript won't narrow a
    // union by a boolean discriminant — only by a string-literal one.
    type RepairResult =
      | { outcome: 'repaired'; user: ClientPortalUser; customer: CustomerInfo; loyalty: LoyaltyInfo | null }
      | { outcome: 'denied' }
      | { outcome: 'unreachable' };

    const repairIdentity = async (token: string): Promise<RepairResult> => {
      try {
        const { data, error } = await supabase.functions.invoke('client-portal-api', {
          body: { action: 'get_user_data' },
          headers: { 'x-portal-session': token },
        });
        if (error) {
          // A transport failure (offline, relay error) carries no HTTP status.
          // Distinguish it from a real denial so we never sign someone out
          // just because their connection dropped.
          const reachable = typeof (error as any)?.context?.response?.status === 'number';
          return { outcome: reachable ? 'denied' : 'unreachable' };
        }
        const row = (Array.isArray(data) ? data[0] : null) as any;
        if (!row?.customer_id || !row.is_active) return { outcome: 'denied' };
        return {
          outcome: 'repaired',
          user: {
            id: row.user_id,
            username: row.username,
            customer_id: row.customer_id,
            organization_id: row.organization_id,
            is_active: row.is_active,
            must_change_password: row.must_change_password,
          },
          customer: {
            id: row.customer_id,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            phone: row.phone,
            property_type: row.property_type || 'residential',
          },
          loyalty: row.loyalty_points !== null
            ? {
              points: row.loyalty_points,
              lifetime_points: row.loyalty_lifetime_points,
              tier: row.loyalty_tier,
            }
            : null,
        };
      } catch {
        return { outcome: 'unreachable' };
      }
    };

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

      // Modern session (has sessionToken) — restore as-is, unless the stored
      // identity is incomplete, in which case heal it from the server first.
      if (hasToken && !parsed.user?.customer_id) {
        dlog('stored session missing customer_id, re-fetching identity');
        const repaired = await repairIdentity(parsed.sessionToken);

        if (repaired.outcome === 'repaired') {
          dlog('identity repaired from server');
          const healedLoyalty = repaired.loyalty ?? parsed.loyalty ?? null;
          setUser(repaired.user);
          setCustomer(repaired.customer);
          setLoyalty(healedLoyalty);
          setSessionToken(parsed.sessionToken);
          // Persist via saveSession so the repaired blob goes through the same
          // PII-stripping rules as a fresh login. The token is passed
          // explicitly, so this doesn't depend on sessionToken state yet.
          saveSession(repaired.user, repaired.customer, healedLoyalty, parsed.sessionToken);
          setLoading(false);
          return;
        }

        if (repaired.outcome === 'denied') {
          // The server answered and could not confirm the customer link. A
          // half-usable session would render empty tabs forever, so end it and
          // send them through a clean sign-in rather than leaving them stuck.
          dlog('identity repair denied by server, forcing re-login');
          localStorage.removeItem(STORAGE_KEY);
          toast.error('Please sign in again to finish restoring your account.');
          setLoading(false);
          return;
        }

        // Server unreachable — restore what we have rather than logging someone
        // out on a flaky connection. The next load retries the repair.
        dlog('identity repair unreachable, restoring stored session unchanged');
      }

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
      phone: null as string | null,
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


      // Session-validated proxy — identity comes from newSessionToken (just
      // minted above), never from the typed-in email. invokePortal() can't
      // be used yet since sessionToken state hasn't been set at this point.
      const { data: userData, error: userDataError } = await supabase.functions.invoke(
        'client-portal-api',
        { body: { action: 'get_user_data' }, headers: { 'x-portal-session': newSessionToken } },
      );

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

      // Update last login via the session-validated proxy — identity comes
      // from newSessionToken server-side, not a client-supplied p_user_id.
      await supabase.functions.invoke('client-portal-api', {
        body: { action: 'update_last_login' },
        headers: { 'x-portal-session': newSessionToken },
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
      // Identity comes from the verified session inside client-portal-api —
      // p_user_id is no longer sent from here.
      //
      // invokePortal is declared further down this file, so the session header
      // is attached directly rather than reordering the provider.
      const { data, error } = await supabase.functions.invoke('client-portal-api', {
        body: { action: 'change_password', currentPassword, newPassword },
        headers: sessionToken ? { 'x-portal-session': sessionToken } : undefined,
      });

      if (error) {
        // The proxy returns real messages — a collapsed "Current password is
        // incorrect" and a 429 "Too many attempts" — and they are the whole
        // point of the caller seeing something specific.
        return { error: await readEdgeFunctionError(error, 'Failed to change password') };
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
    async <T = any,>(
      name: string,
      options: FunctionInvokeOptions = {},
      portalOpts: PortalInvokeOpts = {},
    ): Promise<PortalInvokeResult<T>> => {
      const mergedHeaders = {
        ...(options.headers ?? {}),
        ...(sessionToken ? { 'x-portal-session': sessionToken } : {}),
      };
      const result: any = await supabase.functions.invoke(name, { ...options, headers: mergedHeaders });

      // supabase-js wraps non-2xx responses in FunctionsHttpError, where the raw
      // Response lives at error.context (NOT error.context.response). Read every
      // known shape, then fall back to inspecting the returned error payload.
      const ctx = result?.error?.context;
      let status: number | undefined =
        ctx?.status ?? ctx?.response?.status ?? result?.error?.status;

      let payload: any = result?.data;
      if (!payload && ctx && typeof ctx.json === 'function') {
        try {
          payload = await ctx.clone().json();
        } catch {
          /* body already consumed or not JSON */
        }
      }

      const payloadError =
        payload && typeof payload === 'object' ? String((payload as any).error ?? '') : '';
      if (
        status === undefined &&
        /unauthorized|inactive|invalid session|session expired|not authenticated/i.test(payloadError)
      ) {
        status = 401;
      }

      if (status === 401) {
        // Still reported as unauthorized so the caller can stand down — only
        // the sign-out/redirect is suppressed.
        if (!portalOpts.silentUnauthorized) handleUnauthorized();
        return { data: null, error: result.error ?? new Error(payloadError || 'unauthorized'), unauthorized: true };
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
