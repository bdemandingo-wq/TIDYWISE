import { useCallback, useEffect, useRef, useState } from 'react';
import Joyride, {
  ACTIONS,
  CallBackProps,
  EVENTS,
  STATUS,
  Step,
} from 'react-joyride';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useOrgId } from '@/hooks/useOrgId';

// 6-step interactive product tour for new TidyWise signups. Auto-launches on
// the first /dashboard visit if the org has never seen it. Coexists with the
// Tidy bubble — both stay visible. The tour navigates between routes itself,
// so steps go to dashboard/help → settings tabs → services → back to
// dashboard for the final bubble spotlight.
//
// Eligibility (computed against onboarding_progress):
//   activated_at IS NULL AND tour_completed_at IS NULL AND tour_skipped_at IS NULL
// All existing orgs at migration time were backfilled with tour_skipped_at,
// so only post-migration signups are eligible.

interface TourStep extends Step {
  route: string;
}

const STEPS: TourStep[] = [
  {
    route: '/dashboard/help',
    target: '[data-tour-id="help-videos"]',
    title: 'Watch quick tutorials',
    content:
      "Two-minute videos walking you through every feature. Bookmark this page — it'll save you time later.",
    disableBeacon: true,
    placement: 'auto',
  },
  {
    route: '/dashboard/settings?tab=integrations',
    target: '[data-tour-id="stripe-connect"]',
    title: 'Get paid by your customers',
    content:
      'TidyWise uses Stripe to charge customers, accept tips, and pay your team. Connect now or do it later from Settings.',
    disableBeacon: true,
    placement: 'auto',
  },
  {
    route: '/dashboard/settings?tab=sms',
    target: '[data-tour-id="openphone-connect"]',
    title: 'Send SMS from your business number',
    content:
      "Connect OpenPhone to send booking reminders, payment links, and custom messages from your TidyWise account. Skip this if you'd rather use email only.",
    disableBeacon: true,
    placement: 'auto',
  },
  {
    route: '/dashboard/services',
    target: '[data-tour-id="services-list"]',
    title: 'Define what you offer',
    content:
      'Add your cleaning packages, set base prices, and define add-ons. This is what your customers see when they book.',
    disableBeacon: true,
    placement: 'auto',
  },
  {
    route: '/dashboard/settings?tab=emails',
    target: '[data-tour-id="gmail-connect"]',
    title: 'Send emails from your business',
    content:
      'Connect Gmail to send booking confirmations, invoices, and reminders from your own email address.',
    disableBeacon: true,
    placement: 'auto',
  },
  {
    route: '/dashboard',
    target: '[data-tour-id="tidy-bubble"]',
    title: 'Need help? Just ask Tidy',
    content:
      "Click this bubble anytime to chat with Tidy, your AI co-pilot. Tidy can answer questions, walk you through features, or help debug. You're all set.",
    disableBeacon: true,
    placement: 'left',
    spotlightClicks: true,
  },
];

const TOUR_ENTRY_ROUTE = '/dashboard';
const TARGET_WAIT_MS = 100;
const TARGET_WAIT_MAX_ATTEMPTS = 50; // 5 seconds total

export function ProductTour() {
  const { user } = useAuth();
  const { organizationId } = useOrgId();
  const navigate = useNavigate();
  const location = useLocation();

  const [eligible, setEligible] = useState(false);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // Refs prevent infinite useEffect loops when we're inside the joyride callback.
  const eligibilityCheckedFor = useRef<string | null>(null);
  const tourStartedLogged = useRef(false);
  // Once we've routed the user onto a step, we must never auto-navigate them
  // back to it — otherwise any nav click bounces them and traps them.
  const positionedForStep = useRef<number | null>(null);

  // ── Eligibility check ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !organizationId) return;
    const key = `${user.id}:${organizationId}`;
    if (eligibilityCheckedFor.current === key) return;
    eligibilityCheckedFor.current = key;

    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any;
        const { data, error } = await db
          .from('onboarding_progress')
          .select('activated_at, tour_completed_at, tour_skipped_at, tour_current_step')
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.warn('[ProductTour] Eligibility check failed:', error);
          return;
        }
        const blocked =
          !!data?.activated_at ||
          !!data?.tour_completed_at ||
          !!data?.tour_skipped_at;
        if (blocked) return;

        const startStep = Number(data?.tour_current_step ?? 0);
        setStepIndex(Math.max(0, Math.min(startStep, STEPS.length - 1)));
        setEligible(true);
      } catch (err) {
        console.warn('[ProductTour] Eligibility check threw:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, organizationId]);

  // ── Step navigator ─────────────────────────────────────────────────────
  // When eligible: ensure we're on the right route + the target element is
  // mounted, THEN start joyride. Polls for the target up to 5s; if it never
  // appears, runs anyway (joyride falls back to center placement so the user
  // doesn't get stuck on a hidden section).
  useEffect(() => {
    if (!eligible) return;
    const step = STEPS[stepIndex];
    if (!step) return;

    const currentPath = `${location.pathname}${location.search}`;
    if (currentPath !== step.route) {
      // Only auto-route the user onto the tour step when they're already
      // somewhere inside the admin shell. Otherwise we'd fight other
      // redirects (paywall → /pricing, no-org → /onboarding, /login,
      // Stripe return URLs, etc.) and produce an infinite navigation
      // loop that Chrome throttles into a black screen.
      if (!location.pathname.startsWith('/dashboard')) {
        setRun(false);
        return;
      }
      // Auto-route onto this step's page exactly ONCE. After that, never
      // re-navigate — otherwise every nav click bounces the user back to
      // the step route and traps them. Once positioned, if they click away
      // or hit Skip, let them leave.
      if (positionedForStep.current === stepIndex) {
        setRun(false);
        return;
      }
      positionedForStep.current = stepIndex;
      setRun(false);
      navigate(step.route);
      return;
    }

    // We're on the right page — mark this step positioned so a later
    // navigation away is treated as the user leaving, not a cue to bounce
    // them back.
    positionedForStep.current = stepIndex;

    // Wait for the target element, then start joyride.
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const el = typeof step.target === 'string'
        ? document.querySelector(step.target)
        : step.target;
      if (el) {
        clearInterval(interval);
        setRun(true);
        if (!tourStartedLogged.current) {
          tourStartedLogged.current = true;
          void logEvent('tour_started', stepIndex);
        }
      } else if (attempts >= TARGET_WAIT_MAX_ATTEMPTS) {
        // Hard escape: the target never mounted (e.g. a step pointing at an
        // element that isn't on the page). Rather than leave the user stuck,
        // mark the tour skipped and stop — never trap them on a step that
        // can't display.
        clearInterval(interval);
        setRun(false);
        setEligible(false);
        void markSkipped();
        void logEvent('tour_skipped', stepIndex, { reason: 'target_not_found' });
      }
    }, TARGET_WAIT_MS);

    return () => clearInterval(interval);
    // location.pathname + location.search are reactive; stepIndex changes
    // when the user clicks Next/Back; eligible flips false once on
    // skip/complete and stops the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, stepIndex, location.pathname, location.search]);

  // ── Persistence helpers ────────────────────────────────────────────────
  const saveStep = useCallback(
    async (next: number) => {
      if (!organizationId) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      await db
        .from('onboarding_progress')
        .upsert(
          { organization_id: organizationId, tour_current_step: next },
          { onConflict: 'organization_id' },
        );
    },
    [organizationId],
  );

  const markCompleted = useCallback(async () => {
    if (!organizationId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    await db
      .from('onboarding_progress')
      .upsert(
        {
          organization_id: organizationId,
          tour_completed_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' },
      );
  }, [organizationId]);

  const markSkipped = useCallback(async () => {
    if (!organizationId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    await db
      .from('onboarding_progress')
      .upsert(
        {
          organization_id: organizationId,
          tour_skipped_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' },
      );
  }, [organizationId]);

  const logEvent = useCallback(
    async (
      eventType: 'tour_started' | 'step_viewed' | 'tour_completed' | 'tour_skipped',
      step: number | null,
      metadata: Record<string, unknown> = {},
    ) => {
      if (!user?.id || !organizationId) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      try {
        await db.from('product_tour_events').insert({
          organization_id: organizationId,
          user_id: user.id,
          event_type: eventType,
          step_number: step,
          metadata,
        });
      } catch (err) {
        // Analytics failures are non-fatal.
        console.warn('[ProductTour] logEvent failed:', err);
      }
    },
    [user?.id, organizationId],
  );

  // ── Joyride callback ───────────────────────────────────────────────────
  const handleCallback = useCallback(
    async (data: CallBackProps) => {
      const { action, index, status, type } = data;

      // Step transitions — happen on STEP_AFTER for prev/next/skip.
      if (type === EVENTS.STEP_AFTER) {
        if (action === ACTIONS.NEXT) {
          const next = index + 1;
          if (next >= STEPS.length) {
            setRun(false);
            setEligible(false);
            await Promise.all([
              markCompleted(),
              logEvent('tour_completed', index),
            ]);
            return;
          }
          setStepIndex(next);
          void saveStep(next);
          void logEvent('step_viewed', next);
          return;
        }
        if (action === ACTIONS.PREV) {
          const prev = Math.max(0, index - 1);
          setStepIndex(prev);
          void saveStep(prev);
          return;
        }
      }

      // Skip button. ACTIONS.CLOSE on the X button is also treated as skip
      // so users don't accidentally lose progress.
      if (action === ACTIONS.SKIP || action === ACTIONS.CLOSE || status === STATUS.SKIPPED) {
        setRun(false);
        setEligible(false);
        await Promise.all([
          markSkipped(),
          logEvent('tour_skipped', index, { skipped_on_step: index }),
        ]);
        return;
      }

      // Joyride finished (tour reached its last step naturally — usually
      // covered by the NEXT-overflow branch above, but kept as a safety net).
      if (status === STATUS.FINISHED) {
        setRun(false);
        setEligible(false);
        await Promise.all([
          markCompleted(),
          logEvent('tour_completed', index),
        ]);
        return;
      }

      // Target missing — log and let joyride fall back to center placement.
      if (type === EVENTS.TARGET_NOT_FOUND) {
        console.warn(`[ProductTour] Target not found for step ${index}: ${STEPS[index]?.target}`);
      }
    },
    [logEvent, markCompleted, markSkipped, saveStep],
  );

  if (!eligible) return null;

  return (
    <Joyride
      steps={STEPS}
      run={run}
      stepIndex={stepIndex}
      continuous
      showSkipButton
      showProgress
      disableScrollParentFix
      disableScrolling={false}
      spotlightPadding={8}
      callback={handleCallback}
      floaterProps={{
        styles: {
          floater: {
            transition: 'opacity 200ms ease, transform 200ms ease',
          },
        },
      }}
      // z-index 1000 keeps the overlay BELOW the Tidy bubble (z-9999) so the
      // bubble stays visible & clickable mid-tour. Step 6 spotlights the
      // bubble — joyride's spotlight is a hole in the overlay rather than a
      // layer above it, so the bubble at z-9999 still shows correctly.
      styles={{
        options: {
          primaryColor: '#4f46e5',
          textColor: '#111827',
          backgroundColor: '#ffffff',
          arrowColor: '#ffffff',
          overlayColor: 'rgba(15, 15, 20, 0.55)',
          zIndex: 1000,
        },
        spotlight: {
          borderRadius: 12,
          boxShadow: '0 0 0 4px rgba(79, 70, 229, 0.25), 0 8px 32px rgba(0, 0, 0, 0.4)',
        },
        tooltip: {
          borderRadius: 12,
          borderTop: '3px solid #4f46e5',
          padding: 20,
        },
        tooltipTitle: {
          fontSize: 16,
          fontWeight: 600,
          color: '#111827',
        },
        tooltipContent: {
          fontSize: 14,
          color: '#4b5563',
          padding: '8px 0 0',
        },
        buttonNext: {
          backgroundColor: '#4f46e5',
          fontSize: 14,
          padding: '8px 16px',
          borderRadius: 8,
        },
        buttonBack: {
          color: '#4f46e5',
          fontSize: 14,
        },
        buttonSkip: {
          color: '#6b7280',
          fontSize: 13,
          textDecoration: 'underline',
        },
      }}
      locale={{
        back: '← Back',
        close: 'Close',
        last: 'Finish ✓',
        next: 'Next →',
        open: 'Open',
        skip: "Skip — I'll explore on my own",
      }}
    />
  );
}
