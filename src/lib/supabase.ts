/**
 * UNIFIED SUPABASE CLIENT
 * 
 * Session persistence is now ENABLED for better mobile app experience.
 * Users will stay logged in between app restarts.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Supabase anon key is intentionally public — security enforced via RLS policies.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://slwfkaqczvwvvvavkgpr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2ZrYXFjenZ3dnZ2YXZrZ3ByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjk4OTQsImV4cCI6MjA4MTY0NTg5NH0.M0OhzHsrqA0oYh6Ykx_4gVK_SrdSi1V_CiFxU-n4Lec";

/**
 * Supabase client with session persistence enabled
 * - persistSession: true - Sessions ARE stored in localStorage
 * - autoRefreshToken: true - Tokens ARE auto-refreshed
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,   // Persist sessions for mobile app
    autoRefreshToken: true, // Auto-refresh tokens
    storage: localStorage,  // Use localStorage for persistence
    detectSessionInUrl: true,
  }
});
