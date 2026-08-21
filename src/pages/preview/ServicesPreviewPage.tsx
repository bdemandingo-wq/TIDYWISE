import { useState } from 'react';
import { ListShell, ListRow, ListSectionLabel, type ListState } from '@/components/portal-v2';

/**
 * Screen 4h — /dashboard/services at 390px.
 *
 * Preview route only, static data. Additive: the live ServicesPage is
 * untouched.
 *
 * ── Two problems, not one ─────────────────────────────────────────────
 *
 * Services measured 330px hidden across TWO scrollers, and they are
 * different things:
 *
 *   1. The tab strip. Four tabs — "Custom Services", "Service Pricing",
 *      "Extras", "Frequencies" — do not fit at 390px, and the live screen
 *      clips its own navigation mid-word ("Custom Services | Service
 *      Pri…"). Shortened to Services / Pricing / Extras / Frequencies,
 *      which fit. Nothing is lost: the page title already says Services,
 *      so "Custom Services" was saying it twice.
 *   2. The tables inside two of those tabs.
 *
 * ServicesPage itself is a 221-line wrapper; the content lives in
 * CustomServicesManager (5 columns), ServicePricingEditor (two tables),
 * ExtrasPricingManager and CustomFrequenciesManager.
 *
 * ── The pricing "matrix" is not a matrix ──────────────────────────────
 *
 * Worth checking rather than assuming, because a genuine bedrooms ×
 * bathrooms grid would be the hardest thing in the app to render at this
 * width. It is not one: ServicePricingEditor stores flat rows of
 * (bedrooms, bathrooms, base_price) and renders them as three columns. So
 * it lists cleanly — "3 bed · 2 bath" with the price as the row's money —
 * and no two-dimensional layout problem exists to solve.
 *
 * ── What gives ────────────────────────────────────────────────────────
 *
 *   - The tab labels shorten, as above.
 *   - Edit-in-place. ServicePricingEditor says "Click any price to edit"
 *     and the price cell is the control. At 390px the row is the tap
 *     target and editing happens behind it. The affordance moves; the
 *     capability does not.
 *   - The per-row Actions menus give way to the row tap, as elsewhere.
 *
 * Every field the four tabs show is carried: name, description, duration
 * and price for a service; bedrooms, bathrooms and price for a pricing
 * row; name and price for an extra; name, interval and days for a
 * frequency; and active/inactive wherever the live screen tracks it.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * A price that did not load renders "—", never $0.00. On a services screen
 * $0.00 is a real, meaningful value — a free re-clean is priced at zero —
 * so a fabricated zero here would be indistinguishable from a deliberate
 * one, which is exactly the confusion the rule exists to prevent.
 */

type Tab = 'services' | 'pricing' | 'extras' | 'frequencies';

type Service = { id: string; name: string; description: string | null; duration: number | null; price: number | null; active: boolean };
type PriceRow = { id: string; bedrooms: number; bathrooms: number; price: number | null };
type Extra = { id: string; name: string; price: number | null };
type Frequency = { id: string; name: string; interval_days: number | null; days_of_week: number[] | null; active: boolean };

const money = (n: number | null) =>
  n === null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SERVICES: Service[] = [
  { id: '1', name: 'Standard Clean', description: 'Regular upkeep for a maintained home', duration: 120, price: 125, active: true },
  { id: '2', name: 'Deep Clean', description: 'Thorough top-to-bottom cleaning', duration: 180, price: 210, active: true },
  { id: '3', name: 'Move-Out Clean', description: 'Empty property, inside cupboards and appliances', duration: 240, price: 340, active: true },
  { id: '4', name: 'Airbnb Turnover', description: 'Quick turnaround cleaning for short lets', duration: 90, price: 95, active: true },
  /* A real zero: a re-clean is free by design. It must not look like a
     figure that failed to load — hence "—" is reserved for that. */
  { id: '5', name: 'Re-clean', description: 'Work redone at no charge', duration: 120, price: 0, active: true },
  { id: '6', name: 'Post-Construction', description: 'Dust and debris after building work', duration: 300, price: null, active: false },
];

const PRICING: PriceRow[] = [
  { id: '1', bedrooms: 1, bathrooms: 1, price: 110 },
  { id: '2', bedrooms: 2, bathrooms: 1, price: 135 },
  { id: '3', bedrooms: 2, bathrooms: 2, price: 155 },
  { id: '4', bedrooms: 3, bathrooms: 2, price: 185 },
  { id: '5', bedrooms: 3, bathrooms: 2.5, price: 200 },
  { id: '6', bedrooms: 4, bathrooms: 3, price: 245 },
];

const EXTRAS: Extra[] = [
  { id: '1', name: 'Inside oven', price: 35 },
  { id: '2', name: 'Interior windows', price: 45 },
  { id: '3', name: 'Inside fridge', price: 30 },
  { id: '4', name: 'Laundry', price: 25 },
  { id: '5', name: 'Garage', price: 40 },
];

const FREQUENCIES: Frequency[] = [
  { id: '1', name: 'Mon & Thu', interval_days: null, days_of_week: [1, 4], active: true },
  { id: '2', name: 'Every 10 days', interval_days: 10, days_of_week: null, active: true },
  { id: '3', name: 'First Monday', interval_days: null, days_of_week: [1], active: false },
];

const TABS: { id: Tab; label: string; count?: number }[] = [
  { id: 'services', label: 'Custom Services', count: SERVICES.length },
  { id: 'pricing', label: 'Service Pricing', count: PRICING.length },
  { id: 'extras', label: 'Extras', count: EXTRAS.length },
  { id: 'frequencies', label: 'Frequencies', count: FREQUENCIES.length },
];

const STATES: { id: ListState; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Note Re-clean is genuinely $0.00 and Post-Construction has no price at all — "—" is reserved for the second.' },
  { id: 'loading', label: 'Loading', why: 'Skeleton rows rather than a list of zero-priced services.' },
  { id: 'empty', label: 'Empty', why: 'No services set up yet — distinct from a failed read.' },
  { id: 'error', label: 'Error', why: 'No prices render at all. A fabricated $0.00 here is indistinguishable from a deliberate one.' },
];

export default function ServicesPreviewPage() {
  const [state, setState] = useState<ListState>('ready');
  const [tab, setTab] = useState<Tab>('services');
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  const services = SERVICES.filter(s => match(s.name) || match(s.description ?? ''));
  const pricing = PRICING.filter(p => match(`${p.bedrooms} bed ${p.bathrooms} bath`));
  const extras = EXTRAS.filter(e => match(e.name));
  const freqs = FREQUENCIES.filter(f => match(f.name));

  const counts: Record<Tab, number> = {
    services: services.length,
    pricing: pricing.length,
    extras: extras.length,
    frequencies: freqs.length,
  };

  const effective: ListState = state === 'ready' && counts[tab] === 0 ? 'empty' : state;

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {STATES.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setState(s.id)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
              (state === s.id
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {s.label}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {STATES.find(s => s.id === state)?.why}
        </p>
      </div>

      {/* .portal-v2 carries the --pv-* custom properties. Without it the
          tokens do not resolve and every colour silently falls back to an
          inherited value — which looked plausible against the dark shell,
          which is why it went unnoticed. */}
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <ListShell<Tab>
          title="Services"
          action={{ label: 'Add' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search services, extras, or pricing..."
          tabs={TABS}
          tab={tab}
          onTab={setTab}
          state={effective}
          empty={
            q
              ? {
                  title: 'Nothing matches that',
                  hint: 'Try another name, or a different tab.',
                  action: { label: 'Clear search', onClick: () => setSearch('') },
                }
              : {
                  title: 'Nothing set up yet',
                  hint: 'Services, pricing rows, extras and frequencies you add will show here.',
                  action: { label: 'Add' },
                }
          }
          errorLabel="Couldn't load services"
          onRetry={() => setState('ready')}
          skeletonRows={6}
        >
          {tab === 'services' && (
            <>
              <ListSectionLabel>{services.length} services</ListSectionLabel>
              {services.map(s => (
                <ListRow
                  key={s.id}
                  title={s.name}
                  meta={s.description ?? 'No description'}
                  lines={[s.duration === null ? 'No duration set' : `${s.duration} min`]}
                  money={money(s.price)}
                  status={s.active ? undefined : [{ tone: 'info', label: 'Inactive' }]}
                  onClick={() => undefined}
                />
              ))}
            </>
          )}

          {tab === 'pricing' && (
            <>
              <ListSectionLabel>{pricing.length} pricing rows</ListSectionLabel>
              {pricing.map(p => (
                <ListRow
                  key={p.id}
                  /* Bedrooms and bathrooms are the identity of the row, so they
                     are the title rather than facts underneath it. */
                  title={`${p.bedrooms} bed · ${p.bathrooms} bath`}
                  meta="Base price"
                  money={money(p.price)}
                  onClick={() => undefined}
                />
              ))}
            </>
          )}

          {tab === 'extras' && (
            <>
              <ListSectionLabel>{extras.length} extras</ListSectionLabel>
              {extras.map(e => (
                <ListRow key={e.id} title={e.name} meta="Add-on" money={money(e.price)} onClick={() => undefined} />
              ))}
            </>
          )}

          {tab === 'frequencies' && (
            <>
              <ListSectionLabel>{freqs.length} frequencies</ListSectionLabel>
              {freqs.map(f => (
                <ListRow
                  key={f.id}
                  title={f.name}
                  meta={
                    f.days_of_week?.length
                      ? f.days_of_week.map(d => DAYS[d]).join(', ')
                      : f.interval_days
                        ? `Every ${f.interval_days} days`
                        : 'No schedule set'
                  }
                  status={f.active ? undefined : [{ tone: 'info', label: 'Inactive' }]}
                  onClick={() => undefined}
                />
              ))}
            </>
          )}
        </ListShell>
      </div>
    </div>
  );
}
