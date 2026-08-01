import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Sparkles, Calendar, ArrowRight, Loader2, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, differenceInDays, startOfMonth, endOfMonth } from 'date-fns';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { orgStartOfMonth, orgEndOfMonth, orgDayOfWeek, orgDateKey, orgAddDays, orgYMD, calendarDayKey } from '@/lib/orgDateRange';

interface DiscountSuggestion {
  icon: string;
  label: string;
  description: string;
  recommendedCode: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  eligibleCount: number;
  validFrom: string;
  validUntil: string;
  reason: string;
}

interface Holiday {
  name: string;
  date: Date;
  icon: string;
}

/*
  US holidays are CALENDAR DATES. "Thanksgiving 2026 is 26 November" is true in
  every timezone, and the weekday walks below ("last Monday of May") operate on
  those calendar dates rather than on instants — so reading local fields is
  correct here, and converting them would move the holiday.

  The one thing that is an instant is which YEAR we are in, so that comes from
  the org's clock.
*/
function getUpcomingHolidays(timeZone: string, daysAhead: number = 60): Holiday[] {
  const now = new Date();
  const year = orgYMD(now, timeZone).y;

  // Easter calculation (Anonymous Gregorian algorithm)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easterDate = new Date(year, month, day);

  /* eslint-disable local/no-device-local-dates -- calendar-date construction, see above */
  // Memorial Day: last Monday of May
  const memorialDay = new Date(year, 4, 31);
  while (memorialDay.getDay() !== 1) memorialDay.setDate(memorialDay.getDate() - 1);

  // Mother's Day: 2nd Sunday of May
  const mothersDay = new Date(year, 4, 1);
  while (mothersDay.getDay() !== 0) mothersDay.setDate(mothersDay.getDate() + 1);
  mothersDay.setDate(mothersDay.getDate() + 7);

  // Father's Day: 3rd Sunday of June
  const fathersDay = new Date(year, 5, 1);
  while (fathersDay.getDay() !== 0) fathersDay.setDate(fathersDay.getDate() + 1);
  fathersDay.setDate(fathersDay.getDate() + 14);

  // Labor Day: 1st Monday of September
  const laborDay = new Date(year, 8, 1);
  while (laborDay.getDay() !== 1) laborDay.setDate(laborDay.getDate() + 1);

  // Thanksgiving: 4th Thursday of November
  const thanksgiving = new Date(year, 10, 1);
  while (thanksgiving.getDay() !== 4) thanksgiving.setDate(thanksgiving.getDate() + 1);
  thanksgiving.setDate(thanksgiving.getDate() + 21);
  /* eslint-enable local/no-device-local-dates */

  const allHolidays: Holiday[] = [
    { name: "New Year's Day", date: new Date(year, 0, 1), icon: '🎆' },
    { name: "Valentine's Day", date: new Date(year, 1, 14), icon: '💕' },
    { name: "St. Patrick's Day", date: new Date(year, 2, 17), icon: '🍀' },
    { name: 'Easter', date: easterDate, icon: '🐣' },
    { name: "Mother's Day", date: mothersDay, icon: '👩‍👧' },
    { name: 'Memorial Day', date: memorialDay, icon: '🇺🇸' },
    { name: "Father's Day", date: fathersDay, icon: '👨‍👧' },
    { name: '4th of July', date: new Date(year, 6, 4), icon: '🎆' },
    { name: 'Labor Day', date: laborDay, icon: '💼' },
    { name: 'Halloween', date: new Date(year, 9, 31), icon: '🎃' },
    { name: 'Thanksgiving', date: thanksgiving, icon: '🦃' },
    { name: 'Christmas', date: new Date(year, 11, 25), icon: '🎄' },
    // Next year holidays if within range
    { name: "New Year's Day", date: new Date(year + 1, 0, 1), icon: '🎆' },
    { name: "Valentine's Day", date: new Date(year + 1, 1, 14), icon: '💕' },
  ];

  const end = addDays(now, daysAhead);
  return allHolidays
    .filter(h => h.date >= now && h.date <= end)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function getSeason(timeZone: string): { name: string; icon: string } {
  // Which season the BUSINESS is in — at a month boundary an admin abroad
  // would otherwise flip the seasonal promo a day early or late.
  const month = orgYMD(new Date(), timeZone).m - 1;
  if (month >= 2 && month <= 4) return { name: 'Spring', icon: '🌸' };
  if (month >= 5 && month <= 7) return { name: 'Summer', icon: '☀️' };
  if (month >= 8 && month <= 10) return { name: 'Fall', icon: '🍂' };
  return { name: 'Winter', icon: '❄️' };
}

interface AIDiscountSuggestionsProps {
  onCreateDiscount: (prefill: {
    code: string;
    description: string;
    discount_type: 'percentage' | 'flat';
    discount_value: string;
    valid_from: string;
    valid_until: string;
  }) => void;
}

export function AIDiscountSuggestions({ onCreateDiscount }: AIDiscountSuggestionsProps) {
  const { organization } = useOrganization();
  // Every window and validity date below belongs to the business's calendar,
  // not to whichever device is looking at the suggestions.
  const orgTimezone = useOrgTimezone();
  const now = new Date();
  const holidays = useMemo(() => getUpcomingHolidays(orgTimezone, 60), [orgTimezone]);
  const season = useMemo(() => getSeason(orgTimezone), [orgTimezone]);

  // Fetch business data for suggestions
  const { data: businessData, isLoading } = useQuery({
    queryKey: ['discount-suggestions-data', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;

      const sixtyDaysAgo = addDays(now, -60).toISOString();
      // "This month" is the business's month. This is the same fault that made
      // the dashboard read $888 in Miami and $616 in Manila on the same day.
      const monthStart = orgStartOfMonth(now, orgTimezone).toISOString();
      const monthEnd = orgEndOfMonth(now, orgTimezone).toISOString();

      const [recentBookingsRes, bookingsRes, newClientsRes] = await Promise.all([
        // Customers with a booking in the last 60 days — used to derive inactive count
        supabase
          .from('bookings')
          .select('customer_id')
          .eq('organization_id', organization.id)
          .neq('status', 'cancelled')
          .gte('scheduled_at', sixtyDaysAgo),
        // This month's bookings for day-of-week analysis
        supabase
          .from('bookings')
          .select('scheduled_at')
          .eq('organization_id', organization.id)
          .neq('status', 'cancelled')
          .gte('scheduled_at', monthStart)
          .lte('scheduled_at', monthEnd),
        // New clients (created last 30 days) with no repeat booking
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organization.id)
          .eq('is_recurring', false)
          .gte('created_at', addDays(now, -30).toISOString()),
      ]);

      // Derive inactive customer count: total customers minus those with a recent booking
      const activeCustomerIds = new Set(
        (recentBookingsRes.data ?? []).map((b: any) => b.customer_id).filter(Boolean)
      );
      const { count: totalCustomers } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization.id);
      const inactiveRes = { count: Math.max(0, (totalCustomers ?? 0) - activeCustomerIds.size) };


      // Day of week analysis
      const dayCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
      (bookingsRes.data || []).forEach((b: any) => {
        // scheduled_at is an instant; the weekday it counts toward is the
        // business's. Read from the device, the histogram shifts by a day and
        // the suggested slow-day discount targets the wrong weekday.
        const day = orgDayOfWeek(new Date(b.scheduled_at), orgTimezone);
        dayCounts[day]++;
      });
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const maxDay = Object.entries(dayCounts).reduce((a, b) => Number(a[1]) > Number(b[1]) ? a : b);
      const minDay = Object.entries(dayCounts).reduce((a, b) => Number(a[1]) < Number(b[1]) ? a : b);
      const maxCount = Number(maxDay[1]);
      const minCount = Number(minDay[1]);
      const slowDayPct = maxCount > 0 ? Math.round(((maxCount - minCount) / maxCount) * 100) : 0;

      return {
        inactiveCount: inactiveRes.count || 0,
        newClientCount: newClientsRes.count || 0,
        slowDay: dayNames[Number(minDay[0])],
        busiestDay: dayNames[Number(maxDay[0])],
        slowDayPct,
      };
    },
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000,
  });

  // #20: expandable list of the actual eligible clients per suggestion
  const [viewingReason, setViewingReason] = useState<string | null>(null);
  const { data: eligibleClients, isLoading: eligibleLoading, error: eligibleError } = useQuery({
    queryKey: ['discount-eligible-clients', organization?.id, viewingReason],
    enabled: !!organization?.id && (viewingReason === 'rebook' || viewingReason === 'win_back'),
    queryFn: async () => {
      if (!organization?.id) return [];
      // customers has NO last_booking_date column — selecting it 400'd and
      // the error was masked as "no matching clients". Rebook uses real
      // columns; win_back is derived from bookings activity.
      if (viewingReason === 'rebook') {
        const { data, error } = await supabase
          .from('customers')
          .select('id, first_name, last_name, email, phone, created_at')
          .eq('organization_id', organization.id)
          .eq('is_recurring', false)
          .gte('created_at', addDays(new Date(), -30).toISOString())
          .limit(100);
        if (error) throw error;
        return data || [];
      }
      // win_back: customers with no non-cancelled booking in the last 60 days
      const { data: recent, error: recentErr } = await supabase
        .from('bookings')
        .select('customer_id')
        .eq('organization_id', organization.id)
        .neq('status', 'cancelled')
        .gte('scheduled_at', addDays(new Date(), -60).toISOString());
      if (recentErr) throw recentErr;
      const activeIds = [...new Set((recent || []).map((b: { customer_id: string | null }) => b.customer_id).filter(Boolean))];
      let q = supabase
        .from('customers')
        .select('id, first_name, last_name, email, phone, created_at')
        .eq('organization_id', organization.id)
        .limit(100);
      if (activeIds.length > 0) {
        q = q.not('id', 'in', `(${activeIds.join(',')})`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const suggestions = useMemo(() => {
    if (!businessData) return [];
    const result: DiscountSuggestion[] = [];

    // Holiday-based suggestions
    holidays.slice(0, 3).forEach((holiday) => {
      const daysUntil = differenceInDays(holiday.date, now);
      const validFrom = orgDateKey(now, orgTimezone);
      // holiday.date is a calendar-date token — +1 day is a calendar step.
      const validUntil = calendarDayKey(addDays(holiday.date, 1));
      const code = holiday.name.replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 8) + (daysUntil <= 7 ? 'FLASH' : Math.round(Math.random() * 10 + 10));

      result.push({
        icon: holiday.icon,
        label: `${holiday.name} Promo`,
        description: `${holiday.name} is in ${daysUntil} days — offer 15% off to boost bookings before the holiday`,
        recommendedCode: code,
        discountType: 'percentage',
        discountValue: 15,
        eligibleCount: businessData.inactiveCount + businessData.newClientCount,
        validFrom,
        validUntil,
        reason: 'holiday',
      });
    });

    // Inactive clients win-back
    if (businessData.inactiveCount > 0) {
      result.push({
        icon: '👋',
        label: 'Win-Back Campaign',
        description: `${businessData.inactiveCount} clients haven't booked in 60+ days — a "We miss you" 20% off code could recover them`,
        recommendedCode: 'WELCOMEBACK20',
        discountType: 'percentage',
        discountValue: 20,
        eligibleCount: businessData.inactiveCount,
        validFrom: orgDateKey(now, orgTimezone),
        validUntil: orgDateKey(orgAddDays(now, 30, orgTimezone), orgTimezone),
        reason: 'win_back',
      });
    }

    // Slow day
    if (businessData.slowDayPct >= 25) {
      result.push({
        icon: '📅',
        label: `${businessData.slowDay}-Only Discount`,
        description: `Your ${businessData.slowDay}s are ${businessData.slowDayPct}% less booked than ${businessData.busiestDay}s — a ${businessData.slowDay}-only discount could fill those slots`,
        recommendedCode: `${businessData.slowDay.toUpperCase().slice(0, 3)}DEAL`,
        discountType: 'percentage',
        discountValue: 10,
        eligibleCount: 0,
        validFrom: orgDateKey(now, orgTimezone),
        validUntil: orgDateKey(orgAddDays(now, 60, orgTimezone), orgTimezone),
        reason: 'slow_day',
      });
    }

    // New clients not rebooking
    if (businessData.newClientCount > 0) {
      result.push({
        icon: '🔄',
        label: 'Rebook Incentive',
        description: `${businessData.newClientCount} new clients from the last 30 days haven't rebooked — offer $15 off their next booking`,
        recommendedCode: 'REBOOK15',
        discountType: 'flat',
        discountValue: 15,
        eligibleCount: businessData.newClientCount,
        validFrom: orgDateKey(now, orgTimezone),
        validUntil: orgDateKey(orgAddDays(now, 21, orgTimezone), orgTimezone),
        reason: 'rebook',
      });
    }

    // Seasonal suggestion
    result.push({
      icon: season.icon,
      label: `${season.name} Special`,
      description: `Create a seasonal ${season.name.toLowerCase()} cleaning promo to drive bookings during the season`,
      recommendedCode: `${season.name.toUpperCase()}CLEAN`,
      discountType: 'percentage',
      discountValue: 10,
      eligibleCount: 0,
      validFrom: orgDateKey(now, orgTimezone),
      validUntil: orgDateKey(orgAddDays(now, 45, orgTimezone), orgTimezone),
      reason: 'seasonal',
    });

    return result;
  }, [businessData, holidays, season, now, orgTimezone]);

  const handleCreateFromSuggestion = (s: DiscountSuggestion) => {
    onCreateDiscount({
      code: s.recommendedCode,
      description: s.description,
      discount_type: s.discountType,
      discount_value: s.discountValue.toString(),
      valid_from: s.validFrom,
      valid_until: s.validUntil,
    });
  };

  return (
    <div className="space-y-4">
      {/* AI Suggestions */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">💡 AI Discount Suggestions</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Smart recommendations based on your booking data, season & upcoming holidays
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No suggestions available right now</p>
          ) : (
            suggestions.map((s, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl shrink-0">
                  {s.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm">{s.label}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {s.discountType === 'percentage' ? `${s.discountValue}% off` : `$${s.discountValue} off`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                  {s.eligibleCount > 0 && (
                    <>
                      {(s.reason === 'rebook' || s.reason === 'win_back') ? (
                        <button
                          type="button"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary underline underline-offset-2"
                          onClick={() => setViewingReason(viewingReason === s.reason ? null : s.reason)}
                        >
                          <Users className="w-3 h-3" />
                          ~{s.eligibleCount} eligible clients
                          {viewingReason === s.reason ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      ) : (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          ~{s.eligibleCount} eligible clients
                        </p>
                      )}
                      {viewingReason === s.reason && (
                        <div className="mt-2 rounded-md border bg-background/60 max-h-56 overflow-y-auto divide-y">
                          {eligibleLoading ? (
                            <div className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="w-3 h-3 animate-spin" /> Loading clients…
                            </div>
                          ) : eligibleError ? (
                            <div className="p-3 text-xs text-destructive">Couldn't load clients: {(eligibleError as Error).message}</div>
                          ) : (eligibleClients || []).length === 0 ? (
                            <div className="p-3 text-xs text-muted-foreground">No matching clients found</div>
                          ) : (
                            (eligibleClients || []).map((c: any) => (
                              <div key={c.id} className="p-2 text-xs flex items-center justify-between gap-2">
                                <span className="font-medium truncate">{c.first_name} {c.last_name}</span>
                                <span className="text-muted-foreground truncate">{c.phone || c.email || ''}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1 text-xs h-7"
                  onClick={() => handleCreateFromSuggestion(s)}
                >
                  Create
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Holiday Calendar Strip */}
      {holidays.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm">Upcoming Holidays</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-2">
                {holidays.map((h, idx) => {
                  const daysUntil = differenceInDays(h.date, now);
                  return (
                    <div
                      key={idx}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors min-w-[120px]"
                    >
                      <span className="text-2xl">{h.icon}</span>
                      <span className="text-xs font-medium text-center whitespace-nowrap">{h.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(h.date, 'MMM d')} · {daysUntil}d
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-[10px] h-6 px-2"
                        onClick={() => {
                          const code = h.name.replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 8) + '15';
                          onCreateDiscount({
                            code,
                            description: `${h.name} special discount`,
                            discount_type: 'percentage',
                            discount_value: '15',
                            valid_from: orgDateKey(now, orgTimezone),
                            valid_until: calendarDayKey(addDays(h.date, 1)),
                          });
                        }}
                      >
                        Create promo
                      </Button>
                    </div>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
