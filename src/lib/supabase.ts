/**
 * UNIFIED SUPABASE CLIENT - NO SESSION PERSISTENCE
 * 
 * This module exports a Supabase client configured for mandatory login every visit.
 * Use this client instead of @/integrations/supabase/client for all authenticated operations.
 * 
 * IMPORTANT: This client does NOT persist sessions across browser restarts or new tabs.
 * Users must re-authenticate every time they visit the site.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Supabase client with NO session persistence
 * - persistSession: false - Sessions are NOT stored in localStorage
 * - autoRefreshToken: false - Tokens are NOT auto-refreshed
 * - storage: undefined - No storage mechanism for sessions
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,  // DO NOT persist sessions
    autoRefreshToken: false, // DO NOT auto-refresh tokens
    storage: undefined,      // NO storage
    detectSessionInUrl: true, // Still detect OAuth callbacks
  }
});
