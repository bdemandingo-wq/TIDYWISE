/**
 * UNIFIED SUPABASE CLIENT
 * 
 * Session persistence is ENABLED for better mobile app experience.
 * On native (Capacitor), uses @capacitor/preferences for storage.
 * On web, uses localStorage.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { Capacitor } from '@capacitor/core';
import { getStorageAdapter } from '@/lib/capacitorStorage';

// Supabase anon key is intentionally public — security enforced via RLS policies.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://slwfkaqczvwvvvavkgpr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2ZrYXFjenZ3dnZ2YXZrZ3ByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjk4OTQsImV4cCI6MjA4MTY0NTg5NH0.M0OhzHsrqA0oYh6Ykx_4gVK_SrdSi1V_CiFxU-n4Lec";

const isNative = Capacitor.isNativePlatform();

/**
 * Supabase client with session persistence enabled
 * - Native: uses Capacitor Preferences for reliable persistence
 * - Web: uses localStorage
 * - detectSessionInUrl: false on native (deep links handled manually)
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: getStorageAdapter(),
    detectSessionInUrl: !isNative,
  }
});
