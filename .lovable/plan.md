# Keep invited teammates inside their workspace

## Verified state
- The invited account `amdgsolutionsllc@gmail.com` has exactly one live workspace membership: **Clean Collective**, with `needs_onboarding = false`.
- The account is an invited Owner, not the creator of Clean Collective.
- Current source selects a workspace in place and only allows the actual organization creator to open new-business onboarding.
- The production site is still serving an older onboarding path and does not contain the current fail-closed onboarding guard, which matches the screenshots from `jointidywise.com`.

## Implementation
1. **Release the existing invite/workspace protections**
   - Publish the current frontend so production uses the corrected organization resolution, onboarding guard, and creator-only “Add New Business” behavior.
   - Keep the valid Clean Collective membership unchanged and do not create, delete, or rename any workspace.

2. **Harden the workspace selection transition if still reproducible in preview**
   - Ensure selecting Clean Collective immediately persists it as the active workspace and keeps the user on the dashboard.
   - Prevent query/cache reset states during switching from being interpreted as a membership-free account.
   - If a saved workspace no longer exists, discard that stale selection and resolve the user’s valid membership instead of opening onboarding.

3. **Verify the real teammate flow**
   - Sign in with the invited email and its created password.
   - Confirm the dashboard opens in Clean Collective and the switcher does not show a deleted/stale business.
   - Click Clean Collective in the bottom-left switcher and confirm it remains on the dashboard.
   - Open `/onboarding` and `/onboarding?new=true` directly and confirm both redirect the invited teammate back to Clean Collective.
   - Sign out and sign back in again to confirm the same behavior survives a fresh session.

## Technical details
- Scope: organization context, sidebar workspace switcher, onboarding route guard, production publication, and authenticated browser verification.
- Preserve strict membership validation and fail closed on lookup errors; never treat a loading or failed lookup as permission to create a business.
- Run the app typecheck and check the production build signal before completion.
