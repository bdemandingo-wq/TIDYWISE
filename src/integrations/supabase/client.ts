// ⚠️ DO NOT regenerate this file with its own createClient call.
// There must be exactly ONE Supabase client instance. On native iOS the
// generated client used localStorage while the unified client uses
// Capacitor Preferences — so this client had NO auth session on device,
// and every RLS-protected query silently returned empty rows
// (onboarding card, notification bell, etc. — 2026-07-20).
// This file now re-exports the unified client from '@/lib/supabase'.
export { supabase } from '@/lib/supabase';
