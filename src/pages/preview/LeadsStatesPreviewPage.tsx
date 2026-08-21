import { useState } from 'react';
import { LeadsListView, type LeadsRow } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * Every state of the SAME LeadsListView that /dashboard/leads-v2 renders live.
 *
 * Shaped from the real table: 83% of live leads carry source
 * `customer_import`, which the live screen prints as "Customer_import" and
 * cannot filter for. estimated_value is null on every live row. Names carry
 * doubled spaces from the import.
 */

const ROWS: LeadsRow[] = [
  { id: '1', name: 'Emmanuel forkuoh', email: 'agencyfootprintllc@gmail.com', phone: '(305) 555-0142', source: 'customer_import', status: 'new', serviceInterest: null, estimatedValue: null, createdLabel: 'Aug 12', hasMessage: false },
  { id: '2', name: 'Joe anino', email: 'joe.anino@gmail.com', phone: '(786) 555-0110', source: 'customer_import', status: 'commercial', serviceInterest: 'Deep Clean', estimatedValue: null, createdLabel: 'Aug 9', hasMessage: true },
  { id: '3', name: 'apple client', email: 'appleclient@tidywise.com', phone: '(305) 555-0190', source: 'website', status: 'new', serviceInterest: null, estimatedValue: null, createdLabel: 'Aug 4', hasMessage: true },
  /* A slug no map knows. Should read as words, not as a column name. */
  { id: '4', name: 'Dana Whitfield', email: 'dana@example.com', phone: null, source: 'zapier_inbound', status: 'quoted', serviceInterest: 'Move-out Clean', estimatedValue: 480, createdLabel: 'Aug 2', hasMessage: false },
  { id: '5', name: null, email: null, phone: null, source: null, status: 'lost', serviceInterest: null, estimatedValue: null, createdLabel: 'Jul 30', hasMessage: false },
];

const STATES: { id: ListState; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Sources are LABELLED — "Imported from customers", not "Customer_import". An unknown slug (zapier_inbound) de-slugs to words rather than printing raw. Only one lead has an estimated value; the rest show no money at all, never $0.00.' },
  { id: 'loading', label: 'Loading', why: 'Skeletons.' },
  { id: 'empty', label: 'Empty', why: 'No leads at all. Distinct from a failed read.' },
  { id: 'error', label: 'Error / offline', why: 'The live screen cannot reach this: LeadsPage:150 does not destructure `error` at all, so a failed read becomes [] and renders "No leads found".' },
];

export default function LeadsStatesPreviewPage() {
  const [state, setState] = useState<ListState>('ready');
  const [search, setSearch] = useState('');
  const rows = state === 'ready' ? ROWS : [];

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">State</span>
        {STATES.map(s => (
          <button key={s.id} type="button" onClick={() => setState(s.id)}
            className={'rounded-full px-3 py-1 text-[11px] font-bold ' + (state === s.id ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]' : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')}>
            {s.label}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">{STATES.find(s => s.id === state)?.why}</p>
      </div>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <LeadsListView phase={state} rows={rows} search={search} onSearch={setSearch} onRetry={() => setState('ready')} />
      </div>
    </div>
  );
}
