import { useState } from 'react';

/**
 * Screen 5a — Sign in.
 *
 * Preview route only, static. Additive. Nothing here authenticates; the real
 * screen is src/pages/LoginPage.tsx.
 *
 * ── Measured from the comp ────────────────────────────────────────────────
 *
 *   surface     full-bleed inverse (#101733 → --pv-inverse), both modes
 *   content     vertically centred, 24px side padding
 *   logo        52×52, radius 14, brand, 17px/800, 20px below
 *   title       26px/800, letter-spacing -.02em
 *   subtitle    13px, on-inverse-muted, 4px below the title
 *   form card   radius 18, padding 18, 24px above, 14px gap between fields
 *   field label 11.5px/700
 *   field box   radius 10, padding 13px 14px, 13px text, 6px below its label
 *   forgot      right-aligned, 11.5px/600, brand
 *   submit      14px/800, radius 12, padding 15px 0
 *   divider     22px margins, 1px rules, 10.5px/700 label, .06em tracking
 *   portal btns 13px/700, 1.5px border, radius 12, padding 14px 0, 10px gap
 *   legal       11px, centred, 24px above, line-height 1.5
 *
 * The comp puts the form card on white in light mode and #171C29 in dark —
 * that is --pv-surface in both, since the card token already inverts.
 *
 * ── The comp has no error state, so this fills one it does not cover ──────
 *
 * Not an override — the comp simply does not draw failure, and sign-in fails
 * more often than any other screen in the app.
 *
 * 1. The live screen reports failures with a toast (LoginPage.tsx:100). A
 *    toast is the wrong instrument here. It disappears on a timer, and this is
 *    the one screen where the user is actively retyping while re-reading the
 *    reason they were rejected. The message belongs inline, above the button,
 *    and it stays until something changes.
 *
 * 2. Offline is not a credentials failure. Live collapses it into "Could not
 *    sign you in. Please try again.", which both blames the password and gives
 *    advice that cannot work — trying again with no network fails identically.
 *    Offline says so and drops the retry advice.
 *
 * What does NOT change: a rejected sign-in never reveals whether the email
 * exists. LoginPage.tsx:96-99 deliberately collapses "Invalid login
 * credentials" and "Email not confirmed" into one message, and that is an
 * account-enumeration defence, not vagueness to be tidied up. The wording here
 * is equally uninformative on purpose.
 */

type Phase = 'ready' | 'invalid' | 'offline' | 'loading';

export default function SignInPreviewPage() {
  const [phase, setPhase] = useState<Phase>('ready');
  const [reveal, setReveal] = useState(false);

  const failure =
    phase === 'invalid'
      ? 'Invalid email or password.'
      : phase === 'offline'
        ? 'You’re offline. Sign-in needs a connection.'
        : null;

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {(['ready', 'invalid', 'offline', 'loading'] as Phase[]).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold capitalize ' +
              (phase === p
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {p}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {phase === 'offline'
            ? 'Offline is NOT a credentials failure. Live says "Please try again", which blames the password and advises something that cannot work.'
            : phase === 'invalid'
              ? 'Inline and persistent, not a toast — you are retyping while re-reading it. Wording stays uninformative on purpose: it must not reveal whether the account exists.'
              : 'The comp draws no failure state. These fill one it does not cover rather than overriding it.'}
        </p>
      </div>

      {/* Full-bleed inverse, both modes — matches the comp, which is #101733
          in its LIGHT and DARK renders alike.

          The surface is painted on an INNER div, not on the .portal-v2
          element. index.css:1286 declares `.portal-v2 { background-color:
          hsl(var(--pv-bg)) }`, which is a class selector at the same
          specificity as a Tailwind utility and is emitted after them — so a
          `bg-*` utility on the same element loses on source order and silently
          resolves to the page background. Measured: this main computed to
          rgb(250,251,252) while --pv-inverse was correctly defined on it. */}
      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
        <div className="flex flex-1 flex-col justify-center bg-[hsl(var(--pv-inverse))] px-6">
          <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-[hsl(var(--pv-brand))] text-[17px] font-extrabold text-[hsl(var(--pv-brand-ink))]">
            TW
          </div>

          <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-[hsl(var(--pv-on-inverse))]">
            Sign in to TidyWise
          </h1>
          <p className="mt-1 text-[13px] text-[hsl(var(--pv-on-inverse-muted))]">
            Manage your cleaning business.
          </p>

          <div className="mt-6 flex flex-col gap-3.5 rounded-[18px] bg-[hsl(var(--pv-surface))] p-[18px]">
            <div>
              <label
                htmlFor="pv-email"
                className="block text-[11.5px] font-bold text-[hsl(var(--pv-ink-2))]"
              >
                Email
              </label>
              <input
                id="pv-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="mt-1.5 w-full rounded-[10px] bg-[hsl(var(--pv-sunken))] px-3.5 py-[13px] text-[13px] text-[hsl(var(--pv-ink))] outline-none placeholder:text-[hsl(var(--pv-ink-3))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
              />
            </div>

            <div>
              <label
                htmlFor="pv-password"
                className="block text-[11.5px] font-bold text-[hsl(var(--pv-ink-2))]"
              >
                Password
              </label>
              <div className="mt-1.5 flex items-center rounded-[10px] bg-[hsl(var(--pv-sunken))] px-3.5 py-[13px] focus-within:ring-2 focus-within:ring-[hsl(var(--pv-brand))]">
                <input
                  id="pv-password"
                  type={reveal ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-[hsl(var(--pv-ink))] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setReveal(v => !v)}
                  aria-pressed={reveal}
                  className="ml-2 shrink-0 text-[11.5px] font-bold text-[hsl(var(--pv-ink-3))]"
                >
                  {reveal ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="button"
              className="self-end text-[11.5px] font-semibold text-[hsl(var(--pv-brand))]"
            >
              Forgot password?
            </button>

            {/* Inline, above the button, and it stays put. Sign-in is the one
                screen where the reason for rejection is being re-read while
                the user retypes. */}
            {failure && (
              <p
                role="alert"
                className="rounded-[10px] bg-[hsl(var(--pv-danger-soft))] px-3.5 py-2.5 text-[12px] font-semibold leading-[1.45] text-[hsl(var(--pv-danger))]"
              >
                {failure}
              </p>
            )}

            <button
              type="button"
              disabled={phase === 'loading'}
              className="rounded-[12px] bg-[hsl(var(--pv-brand))] py-[15px] text-center text-[14px] font-extrabold text-[hsl(var(--pv-brand-ink))] disabled:opacity-70"
            >
              {phase === 'loading' ? 'Signing in…' : 'Sign in'}
            </button>
          </div>

          <div className="my-[22px] flex items-center gap-2.5">
            <div className="h-px flex-1 bg-[hsl(var(--pv-on-inverse)/0.15)]" />
            <span className="text-[10.5px] font-bold tracking-[0.06em] text-[hsl(var(--pv-on-inverse)/0.45)]">
              OTHER LOGINS
            </span>
            <div className="h-px flex-1 bg-[hsl(var(--pv-on-inverse)/0.15)]" />
          </div>

          <div className="flex flex-col gap-2.5">
            {['Staff Portal Login', 'Client Portal Login'].map(l => (
              <button
                key={l}
                type="button"
                className="rounded-[12px] border-[1.5px] border-[hsl(var(--pv-on-inverse)/0.22)] py-3.5 text-center text-[13px] font-bold text-[hsl(var(--pv-on-inverse))]"
              >
                {l}
              </button>
            ))}
          </div>

          <p className="mt-6 text-center text-[11px] leading-[1.5] text-[hsl(var(--pv-on-inverse)/0.4)]">
            By continuing you agree to our{' '}
            <span className="text-[hsl(var(--pv-on-inverse-muted))] underline">Terms</span> and{' '}
            <span className="text-[hsl(var(--pv-on-inverse-muted))] underline">Privacy Policy</span>.
          </p>
        </div>
        <div className="h-[26px] bg-[hsl(var(--pv-inverse))]" />
      </main>
    </div>
  );
}
