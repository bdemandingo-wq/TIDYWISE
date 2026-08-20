import { useState } from 'react';
import {
  BottomNav,
  CLEANER_NAV,
  Card,
  CardTitle,
  DetailHeader,
  ListSectionLabel,
  PersonRow,
  PersonRowMenu,
} from '@/components/portal-v2';

/**
 * PersonRow, in the shapes the real screens need.
 *
 * Preview route only; static data, replaces nothing live. See §12 of
 * docs/mobile-design-spec.md — the fields here are taken from
 * src/pages/admin/StaffPage.tsx rather than from a guess at what a person row
 * contains.
 */

type Load = 'ready' | 'error';

export default function PersonRowPreviewPage() {
  const [state, setState] = useState<Load>('ready');
  const err = state === 'error';

  return (
    <main className="portal-v2 flex min-h-dvh flex-col bg-[hsl(var(--pv-bg))]">
      <div className="flex items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          Row state
        </span>
        {(['ready', 'error'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            aria-pressed={state === s}
            className={
              state === s
                ? 'rounded-full bg-[hsl(var(--pv-brand))] px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-brand-ink))]'
                : 'rounded-full px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-ink-3))]'
            }
          >
            {s}
          </button>
        ))}
      </div>

      <DetailHeader title="People" sub="Fields taken from StaffPage, not from a guess" />

      <div className="flex flex-1 flex-col gap-3 px-5 pb-6">
        <Card>
          <CardTitle>Staff</CardTitle>
          <div className="mt-2 flex flex-col divide-y divide-[hsl(var(--pv-border))]">
            <ListSectionLabel>Rate visible — has financial access</ListSectionLabel>
            <PersonRow
              name="Maria Gonzalez"
              facts={['$28/hr']}
              badges={[{ tone: 'info', label: 'W-2' }]}
              state={state}
              onClick={() => {}}
              onRetry={() => setState('ready')}
              actions={!err && <PersonRowMenu />}
            />

            <ListSectionLabel>Rate redacted — test mode passes "$XX/hr"</ListSectionLabel>
            <PersonRow
              name="Dee Whitfield"
              facts={['$XX/hr']}
              badges={[{ tone: 'warn', label: '1099' }]}
              state={state}
              onClick={() => {}}
              onRetry={() => setState('ready')}
              actions={!err && <PersonRowMenu />}
            />

            <ListSectionLabel>Rate hidden entirely — no financial access</ListSectionLabel>
            <PersonRow
              name="Andre Boateng"
              badges={[{ tone: 'info', label: 'W-2' }]}
              state={state}
              onClick={() => {}}
              onRetry={() => setState('ready')}
              actions={!err && <PersonRowMenu />}
            />

            <ListSectionLabel>Inactive — a deliberate state, not a failure</ListSectionLabel>
            <PersonRow
              name="Priya Raman"
              facts={['$26/hr']}
              badges={[{ tone: 'warn', label: '1099' }]}
              inactive
              state={state}
              onClick={() => {}}
              onRetry={() => setState('ready')}
              actions={!err && <PersonRowMenu />}
            />
          </div>
        </Card>

        <Card>
          <CardTitle>Team — a different list, different facts</CardTitle>
          <p className="mt-0.5 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
            Org members carry a role. StaffPage shows no role at all, which is
            why facts and badges are slots.
          </p>
          <div className="mt-2 flex flex-col divide-y divide-[hsl(var(--pv-border))]">
            <PersonRow
              name="Emmanuel Forkuoh"
              facts={['emmanuel@…']}
              badges={[{ tone: 'success', label: 'Owner' }]}
              state={state}
              onRetry={() => setState('ready')}
            />
            <PersonRow
              name="Bianca Schrank"
              facts={['bianca@…']}
              badges={[{ tone: 'info', label: 'Manager' }]}
              state={state}
              onRetry={() => setState('ready')}
              actions={!err && <PersonRowMenu />}
            />
          </div>
        </Card>

        <Card>
          <CardTitle>Assignee picker — name only</CardTitle>
          <div className="mt-2 flex flex-col divide-y divide-[hsl(var(--pv-border))]">
            <PersonRow name="Maria Gonzalez" facts={['Suggested']} state={state} onClick={() => {}} onRetry={() => setState('ready')} />
            <PersonRow name="Dee Whitfield" state={state} onClick={() => {}} onRetry={() => setState('ready')} />
          </div>
        </Card>
      </div>

      <BottomNav items={CLEANER_NAV} active="profile" />
    </main>
  );
}
