import { describe, it, expect } from 'vitest';
import { resolveActiveStaffOrg } from './staffOrgResolution';

const TIDYWISE = { staffId: 's1', organizationId: 'org-tw', name: 'TIDYWISE' };
const CLEAN_COLLECTIVE = { staffId: 's2', organizationId: 'org-cc', name: 'Clean Collective' };
// Oldest-first, matching the order useMyStaffOrgs requests and the order
// get_my_staff_profile(NULL) resolves with.
const BOTH = [TIDYWISE, CLEAN_COLLECTIVE];

describe('resolveActiveStaffOrg', () => {
  it('honours the active org when the cleaner is staffed there', () => {
    const r = resolveActiveStaffOrg(BOTH, 'org-cc');
    expect(r.activeStaffOrg).toBe(CLEAN_COLLECTIVE);
    expect(r.usingFallbackOrg).toBe(false);
  });

  it('honours the other one too — the pick is the context, not the order', () => {
    // Guards the regression this whole change exists to fix: the old RPC took
    // no org and returned whichever row Postgres handed back first, so a
    // dual-org cleaner was pinned to one business forever.
    expect(resolveActiveStaffOrg(BOTH, 'org-tw').activeStaffOrg).toBe(TIDYWISE);
  });

  it('falls back to the oldest staff row when they staff none in the active org', () => {
    // The live case: an owner of one business who is a cleaner at another.
    const r = resolveActiveStaffOrg([TIDYWISE], 'org-cc');
    expect(r.activeStaffOrg).toBe(TIDYWISE);
    expect(r.usingFallbackOrg).toBe(true);
  });

  it('does not call the first load a fallback', () => {
    // OrganizationContext is still null here. Flagging this as a fallback would
    // show "you have no profile at ..." on every cold start.
    const r = resolveActiveStaffOrg(BOTH, null);
    expect(r.activeStaffOrg).toBe(TIDYWISE);
    expect(r.usingFallbackOrg).toBe(false);
  });

  it('returns null rather than inventing an org when they staff nowhere', () => {
    // ~45 accounts hold a global staff/admin role with no staff row. They must
    // reach the explicit empty state, not a fallback to nothing.
    const r = resolveActiveStaffOrg([], 'org-tw');
    expect(r.activeStaffOrg).toBeNull();
    expect(r.usingFallbackOrg).toBe(false);
  });

  it('is not a fallback when the active org is unset and they staff nowhere', () => {
    expect(resolveActiveStaffOrg([], null).usingFallbackOrg).toBe(false);
  });
});
