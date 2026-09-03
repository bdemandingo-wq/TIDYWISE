import { useState } from 'react';
import {
  Card,
  CardTitle,
  Button,
  StatusBadge,
  SettingsRow,
  ListRow,
  DetailHeader,
} from '@/components/portal-v2';

/**
 * Screens 10a / 10b — Discounts & Coupons, and the create form.
 *
 * Preview route only, static data. Additive.
 *
 * ── The AI suggestions are dated, and that is the point ───────────────
 *
 * "Labor Day is in 17 days — offer 15% off to boost bookings before the
 * holiday. ~205 eligible clients." Every suggestion carries its REASON and
 * its REACH. A discount suggestion without an eligible-client count is a
 * guess dressed as advice, and one without a reason cannot be judged. The
 * comp gives both on every card, and they are carried.
 *
 * The Labor Day one also expires: in eighteen days it is wrong. Suggestions
 * that reference a date have a shelf life, so the count and the reason have
 * to be visible enough that a stale one is obvious rather than trusted.
 *
 * ── 10b: a form where the required fields are marked ──────────────────
 *
 * Coupon code and Percentage carry asterisks; minimum order, max uses and
 * the date range do not. That distinction is worth keeping exactly — a
 * discount with no code cannot be redeemed, and one with no percentage
 * discounts nothing.
 *
 * "Max uses: Unlimited" is a default worth noticing. It is the setting most
 * likely to cost money if it is wrong, and the comp leaves it open rather
 * than guessing a cap.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * An eligible-client count that could not be read renders "—" and the
 * Create action on that suggestion is disabled. Offering a discount to an
 * unknown number of people is the same class of mistake as sending a
 * campaign to an unknown list, and this screen sits next to that one.
 */

type View = 'list' | 'create';

const SUGGESTIONS = [
  {
    title: 'Labor Day Promo',
    off: '15% off',
    reason: 'Labor Day is in 17 days — offer 15% off to boost bookings before the holiday.',
    eligible: 205,
  },
  {
    title: 'Win-Back Campaign',
    off: '20% off',
    reason: "181 clients haven't booked in 60+ days — a \u201cWe miss you\u201d 20% off code brings them back.",
    eligible: 181,
  },
  {
    title: 'First-Time Customer',
    off: '10% off',
    reason: 'Converts browsers on the booking form. Applies only to a first booking.',
    eligible: 0,
  },
];

const EXISTING = [
  { code: 'SPRING20', detail: '20% off · 42 used · expires Sep 1', active: true },
  { code: 'WELCOME10', detail: '10% off · 118 used · no expiry', active: true },
  { code: 'HOLIDAY25', detail: '25% off · 0 used · expired Jan 2', active: false },
];

export default function DiscountsPreviewPage() {
  const [view, setView] = useState<View>('list');
  const [errored, setErrored] = useState(false);
  const [code, setCode] = useState('LABORDAY15');
  const [pct, setPct] = useState('15');

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {(['list', 'create'] as View[]).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
              (view === v
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {v === 'list' ? '10a list' : '10b create'}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setErrored(v => !v)}
          className={
            'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
            (errored
              ? 'bg-[hsl(var(--pv-danger))] text-[hsl(var(--pv-brand-ink))]'
              : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
          }
        >
          {errored ? 'Counts unreadable' : 'Counts known'}
        </button>
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {errored
            ? 'Eligible counts render "—" and Create is disabled. Offering a discount to an unknown number is the campaign mistake again.'
            : 'Every suggestion carries its reason AND its reach — without both it is a guess dressed as advice.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        {view === 'list' ? (
          <>
            <DetailHeader title="Discounts & Coupons" onBack={() => undefined} />

            <div className="flex flex-col gap-3.5 px-5 pb-10 pt-1">
              <Card>
                <div className="flex items-center gap-2">
                  <CardTitle>AI discount suggestions</CardTitle>
                  <StatusBadge tone="info" label="5" />
                </div>
                <p className="mt-0.5 text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
                  From booking data, season &amp; holidays
                </p>
              </Card>

              {SUGGESTIONS.map(s => (
                <Card key={s.title}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                      {s.title}
                    </span>
                    <StatusBadge tone="success" label={s.off} />
                  </div>
                  {/* Reason and reach, both. */}
                  <p className="mt-1.5 text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                    {s.reason}
                  </p>
                  <p className="mt-1 text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
                    {errored ? '— eligible clients' : `~${s.eligible} eligible clients`}
                  </p>
                  <div className="mt-2.5">
                    <Button
                      variant={errored ? 'disabled-visible' : 'secondary'}
                      className="rounded-[10px]"
                      onClick={() => setView('create')}
                    >
                      Create
                    </Button>
                  </div>
                </Card>
              ))}

              <Card>
                <CardTitle>Your codes</CardTitle>
              </Card>
              {EXISTING.map(e => (
                <ListRow
                  key={e.code}
                  title={e.code}
                  meta={e.detail}
                  status={[{ tone: e.active ? 'success' : 'info', label: e.active ? 'Active' : 'Expired' }]}
                  onClick={() => undefined}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <DetailHeader title="Create New Discount" onBack={() => setView('list')} />

            <div className="flex flex-col gap-3.5 px-5 pb-28 pt-1">
              <Card>
                <label className="block">
                  {/* Required fields are marked in the comp and stay marked:
                      a code that cannot be typed cannot be redeemed. */}
                  <span className="text-[11px] font-bold text-[hsl(var(--pv-ink-3))]">
                    Coupon code <span className="text-[hsl(var(--pv-danger))]">*</span>
                  </span>
                  <input
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="mt-1 h-11 w-full rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3 text-[12.5px] font-bold tracking-[0.04em] text-[hsl(var(--pv-ink))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
                  />
                </label>

                <label className="mt-3 block">
                  <span className="text-[11px] font-bold text-[hsl(var(--pv-ink-3))]">Description</span>
                  <textarea
                    rows={2}
                    defaultValue="Labor Day is in 17 days — offer 15% off to boost bookings"
                    className="mt-1 w-full resize-none rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3 py-2.5 text-[12.5px] font-medium leading-[1.5] text-[hsl(var(--pv-ink))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
                  />
                </label>
              </Card>

              <Card>
                <div>
                  <SettingsRow kind="value" label="Discount type" value="Percentage (%)" onClick={() => undefined} />
                  <SettingsRow
                    kind="input"
                    label="Percentage *"
                    value={pct}
                    onChange={setPct}
                    inputType="number"
                    suffix="%"
                  />
                  <SettingsRow kind="value" label="Minimum order" value="$0" onClick={() => undefined} />
                  {/* The setting most likely to cost money if wrong. The comp
                      leaves it open rather than guessing a cap. */}
                  <SettingsRow kind="value" label="Max uses" value="Unlimited" onClick={() => undefined} />
                  <SettingsRow kind="value" label="Valid from" value="Aug 20, 2026" onClick={() => undefined} />
                  <SettingsRow kind="value" label="Expires on" value="Sep 8, 2026" onClick={() => undefined} />
                </div>
              </Card>
            </div>

            <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] border-t border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-5 py-3">
              <Button
                variant={code.trim() && pct.trim() ? 'primary' : 'disabled-visible'}
                fullWidth
                className="rounded-[10px]"
              >
                Create discount
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
