import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type SchedulingMode = 'specific' | 'arrival_window';

export interface ArrivalWindow {
  id: string;
  label?: string;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  sort_order: number;
  enabled: boolean;
}

export interface SchedulingModeConfig {
  mode: SchedulingMode;
  windows: ArrivalWindow[];
}

const DEFAULT: SchedulingModeConfig = { mode: 'specific', windows: [] };

/**
 * Reads the org's scheduling mode + arrival windows from business_settings.
 * Shared source of truth used by admin booking form, public booking page,
 * scheduler cards, and reminder templates.
 */
export function useSchedulingMode(organizationId: string | null | undefined) {
  return useQuery<SchedulingModeConfig>({
    queryKey: ['scheduling-mode', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return DEFAULT;
      const { data, error } = await supabase
        .from('business_settings')
        .select('scheduling_mode, arrival_windows')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT;

      const rawMode = (data as { scheduling_mode?: string }).scheduling_mode;
      const mode: SchedulingMode = rawMode === 'arrival_window' ? 'arrival_window' : 'specific';
      const rawWindows = (data as { arrival_windows?: unknown }).arrival_windows;
      const windows = Array.isArray(rawWindows)
        ? (rawWindows as ArrivalWindow[])
            .filter((w) => w && typeof w.start_time === 'string' && typeof w.end_time === 'string')
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        : [];

      // Fallback: mode says arrival_window but no windows configured — fall back to specific.
      if (mode === 'arrival_window' && windows.filter((w) => w.enabled).length === 0) {
        return { mode: 'specific', windows };
      }
      return { mode, windows };
    },
    staleTime: 60_000,
  });
}

/** "08:00" → "8:00 AM" */
export function formatWindowTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatWindowRange(w: Pick<ArrivalWindow, 'start_time' | 'end_time'>): string {
  return `${formatWindowTime(w.start_time)} - ${formatWindowTime(w.end_time)}`;
}

export function windowDurationMinutes(w: Pick<ArrivalWindow, 'start_time' | 'end_time'>): number {
  const [sh, sm] = w.start_time.split(':').map(Number);
  const [eh, em] = w.end_time.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}
