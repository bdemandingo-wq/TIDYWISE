// The ratchet: no NEW query may render a failure as an empty list.
//
//   node --experimental-strip-types --test src/hooks/useOrgQuery.contract.test.ts
//
// WHAT IT CATCHES
//
//     const { data: rows = [] } = useQuery({ ... });
//     {rows.length === 0 && <p>Nothing here</p>}
//
// Loading, failed and genuinely empty all collapse into `rows.length === 0`, so
// a failure is presented as a confident statement that there is no data. That
// shape cost three separate debugging rounds in two days — the team list, the
// lead initials, the message initials — and in every one the backend was fine.
//
// WHY THERE IS A BASELINE
//
// This pattern is in 96 places. A rule that fails 96 times on its first run
// gets switched off, and a switched-off rule protects nothing. So the existing
// sites are listed and tolerated; only new ones fail.
//
// THE LIST MAY SHRINK, NEVER GROW. Both directions are enforced:
//
//   - a violation NOT in the list fails, because it is new
//   - an entry in the list that no longer violates ALSO fails, because a
//     baseline nobody prunes is just a graveyard. Fixing a site means deleting
//     its line here, which is how 96 becomes 0.
//
// TO FIX A SITE rather than baseline it, migrate it to useOrgQuery: it gates on
// the session, surfaces `error`, and gives you `isEmpty` — true only when a
// request completed, succeeded and returned nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../', import.meta.url).pathname;

/**
 * Known offenders, as `path:variableName`. Keyed on the variable rather than a
 * line number so the entry survives unrelated edits to the file.
 *
 * DO NOT ADD TO THIS LIST. Migrate the call site instead.
 */
const BASELINE = new Set([
  'components/admin/AIAnalysisCenter.tsx:churnCustomers',
  'components/admin/AIAnalysisCenter.tsx:hotLeads',
  'components/admin/AdditionalChargesDialog.tsx:charges',
  'components/admin/AdminSignableDocManager.tsx:docs',
  'components/admin/BulkEditCleanerWages.tsx:bookings',
  'components/admin/ClientBookingRequestsManager.tsx:requests',
  'components/admin/ClientPortalUsersManager.tsx:customersWithoutAccess',
  'components/admin/ClientPortalUsersManager.tsx:portalUsers',
  'components/admin/CustomFrequenciesManager.tsx:frequencies',
  'components/admin/CustomServicesManager.tsx:services',
  'components/admin/DemoCalendarTab.tsx:blockedDates',
  'components/admin/DemoCalendarTab.tsx:bookings',
  'components/admin/DemoRequestsTab.tsx:demos',
  'components/admin/EditCustomerDialog.tsx:customerBookings',
  'components/admin/EditCustomerDialog.tsx:linkTracking',
  'components/admin/EditCustomerDialog.tsx:savedAddresses',
  'components/admin/EmailChangeRequestsPanel.tsx:requests',
  'components/admin/InvoiceFormDialog.tsx:reminders',
  'components/admin/LoyaltyProgramSettings.tsx:loyaltyMembers',
  'components/admin/LoyaltyProgramSettings.tsx:recentTransactions',
  'components/admin/LoyaltyTierEditor.tsx:tiers',
  'components/admin/PendingDocumentsReview.tsx:pendingDocuments',
  'components/admin/PnLCalendar.tsx:bookings',
  'components/admin/PnLCalendar.tsx:expenses',
  'components/admin/QuotesTabContent.tsx:quotes',
  'components/admin/ReferralDashboard.tsx:referrals',
  'components/admin/SchedulerCalendar.tsx:allTeamAssignments',
  'components/admin/SchedulerCalendar.tsx:staffList',
  'components/admin/SchedulerCalendar.tsx:teamMembers',
  'components/admin/ServiceDurationAccuracy.tsx:rows',
  'components/admin/StaffComplianceDashboard.tsx:complianceData',
  'components/admin/StaffDocumentManager.tsx:documents',
  'components/admin/StaffEventNotifications.tsx:eventRows',
  'components/admin/StaffEventNotifications.tsx:timeOffRows',
  'components/admin/StripeConnectHealthPanel.tsx:allStaff',
  'components/admin/StripeConnectHealthPanel.tsx:payoutAccounts',
  'components/admin/StripeRequirementsWidget.tsx:notifications',
  'components/admin/StripeResetHistoryPanel.tsx:resetHistory',
  'components/admin/TeamMembersCard.tsx:invites',
  'components/admin/TimeOffRequestsPanel.tsx:rows',
  'components/admin/automation/AutomationLogTable.tsx:logs',
  'components/admin/automation/AutomationsTab.tsx:historyLog',
  'components/admin/automation/CRMSuggestionsPanel.tsx:disabledAutomations',
  'components/admin/automation/SuggestionsTab.tsx:disabledAutomations',
  'components/admin/booking-form/BookingFormContext.tsx:customerLocations',
  'components/admin/booking-form/steps/ChecklistStep.tsx:templates',
  'components/admin/booking-form/steps/ServiceStep.tsx:checklistTemplates',
  'components/admin/booking-form/steps/ServiceStep.tsx:customFrequencies',
  'components/admin/invoice/PaymentRemindersSheet.tsx:existingReminders',
  'components/staff/CleanerCalendar.tsx:bookings',
  'components/staff/CleanerEarnings.tsx:primaryBookings',
  'components/staff/CleanerEarnings.tsx:teamAssignments',
  'components/staff/CleanerEarnings.tsx:upcomingBookings',
  'components/staff/CleanerEarnings.tsx:upcomingTeamAssignments',
  'components/staff/CleanerReviews.tsx:reviews',
  'components/staff/OnboardingProgress.tsx:documents',
  'components/staff/OnboardingProgress.tsx:signatures',
  'components/staff/StaffDocumentUpload.tsx:documents',
  'components/staff/StaffPayoutSetup.tsx:payoutHistory',
  'components/staff/StaffPhotosTab.tsx:bookings',
  'components/staff/StaffPhotosTab.tsx:photos',
  'components/staff/StaffSignatureManager.tsx:signableDocs',
  'components/staff/StaffSignatureManager.tsx:signatures',
  'components/staff/TimeOffRequests.tsx:rows',
  'hooks/orgQueryState.ts:rows',
  'pages/admin/ChecklistsPage.tsx:services',
  'pages/admin/ChecklistsPage.tsx:templates',
  'pages/admin/ClientFeedbackPage.tsx:entries',
  'pages/admin/CustomersDuplicatesPage.tsx:customers',
  'pages/admin/CustomersDuplicatesPage.tsx:ignoredPairs',
  'pages/admin/CustomersPage.tsx:availableCampaigns',
  'pages/admin/CustomersPage.tsx:bookingStats',
  'pages/admin/EstimatesPage.tsx:estimates',
  'pages/admin/ExpensesPage.tsx:expenses',
  'pages/admin/FinancePage.tsx:bookings',
  'pages/admin/FinancePage.tsx:expenses',
  'pages/admin/FinancePage.tsx:paidTips',
  'pages/admin/InventoryPage.tsx:customCategories',
  'pages/admin/InventoryPage.tsx:items',
  'pages/admin/InvoicesPage.tsx:customers',
  'pages/admin/InvoicesPage.tsx:invoices',
  'pages/admin/InvoicesPage.tsx:leads',
  'pages/admin/InvoicesPage.tsx:services',
  'pages/admin/LeadsPage.tsx:abandonedLinks',
  'pages/admin/LeadsPage.tsx:leads',
  'pages/admin/OperationsTrackerPage.tsx:entries',
  'pages/admin/RecurringBookingsPage.tsx:allOrgBookings',
  'pages/admin/RecurringBookingsPage.tsx:customFrequencies',
  'pages/admin/RecurringBookingsPage.tsx:recurringBookings',
  'pages/admin/TasksPage.tsx:tasks',
  'pages/admin/blog/BlogAdminListPage.tsx:posts',
  'pages/admin/blog/BlogKeywordsPage.tsx:rows',
  'pages/blog/BlogIndex.tsx:dynamicPosts',
  'pages/staff/StaffPortal.tsx:assignedBookings',
  'pages/staff/StaffPortal.tsx:jobHistory',
  'pages/staff/StaffPortal.tsx:unassignedBookings',
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

function findViolations(): string[] {
  const found: string[] = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*useQuery\(\{/g)) {
      const destructure = m[1];
      // Reading `error` means the call site can tell failure from emptiness.
      // That is the whole bar — it does not have to use useOrgQuery.
      if (/\berror\b|\bisError\b/.test(destructure)) continue;
      const defaulted = destructure.match(/data\s*:\s*(\w+)\s*=\s*(\[\]|\{\})/);
      if (!defaulted) continue;
      found.push(`${file.replace(SRC, '')}:${defaulted[1]}`);
    }
  }
  return found.sort();
}

test('no NEW useQuery renders a failure as an empty list', () => {
  const added = findViolations().filter((v) => !BASELINE.has(v));
  assert.deepEqual(
    added, [],
    'New site(s) defaulting data to [] without reading `error`:\n' +
      added.map((a) => `  ${a}`).join('\n') +
      '\n\nUse useOrgQuery — it surfaces `error` and gives you `isEmpty`, which is\n' +
      'true only when a request completed, succeeded and returned nothing.\n' +
      'Do not add these to BASELINE.',
  );
});

test('the baseline has no stale entries — it shrinks, never lingers', () => {
  // Without this the list is a graveyard: sites get fixed, nobody prunes, and
  // the number never moves. A fixed site must be deleted from BASELINE.
  const current = new Set(findViolations());
  const stale = [...BASELINE].filter((b) => !current.has(b)).sort();
  assert.deepEqual(
    stale, [],
    'These baseline entries no longer violate — delete them:\n' +
      stale.map((s) => `  ${s}`).join('\n'),
  );
});

test('CONTROL: the detector matches the shape it claims to', () => {
  // Guards against a regex that silently matches nothing, which would make both
  // tests above pass forever while enforcing nothing.
  const violating = 'const { data: rows = [] } = useQuery({';
  const safe1 = 'const { data: rows = [], error } = useQuery({';
  const safe2 = 'const { data: rows } = useQuery({';
  const re = /const\s*\{([^}]*)\}\s*=\s*useQuery\(\{/;
  const bad = violating.match(re)![1];
  assert.ok(/data\s*:\s*\w+\s*=\s*\[\]/.test(bad), 'must flag a defaulted data with no error');
  assert.ok(/\berror\b/.test(safe1.match(re)![1]), 'must clear a call site that reads error');
  assert.ok(!/data\s*:\s*\w+\s*=\s*(\[\]|\{\})/.test(safe2.match(re)![1]), 'must clear an undefaulted data');
});

test('the baseline is the size it claims, and PayrollPage is out of it', () => {
  assert.equal(BASELINE.size, 96, 'baseline size changed — was a line added rather than removed?');
  assert.equal(
    [...BASELINE].filter((b) => b.includes('PayrollPage')).length, 0,
    'PayrollPage was migrated in full; nothing from it belongs in the baseline',
  );
});
