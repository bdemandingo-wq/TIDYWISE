/**
 * Session-scoped Supabase client for anonymous abandoned-booking writes.
 *
 * The anon UPDATE policy on `abandoned_bookings` compares the row's
 * `session_token` to the `x-abandoned-session` request header, so an anonymous
 * visitor can only touch the row for the session token they actually hold.
 * Requests made through the shared client (no header) match zero rows.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://slwfkaqczvwvvvavkgpr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2ZrYXFjenZ3dnZ2YXZrZ3ByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjk4OTQsImV4cCI6MjA4MTY0NTg5NH0.M0OhzHsrqA0oYh6Ykx_4gVK_SrdSi1V_CiFxU-n4Lec";

const cache = new Map<string, ReturnType<typeof createClient<Database>>>();

export function getAbandonedBookingClient(sessionToken: string) {
  const existing = cache.get(sessionToken);
  if (existing) return existing;

  const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-abandoned-session': sessionToken } },
  });
  cache.set(sessionToken, client);
  return client;
}
