# Lock invited teammates to their workspace

## Goal
An account created or recovered through a team invitation must be able to sign out and later sign back in with the invited email and the password it created. It must return to the invited workspace and must not be offered or auto-provisioned a separate business.

## Changes

1. **Remove business creation from invited accounts**
   - Show “Add New Business” only to the authenticated user who actually created/owns the active organization (`organization.owner_id === user.id`).
   - Keep it hidden for invited Owners and Managers, even though their membership role permits workspace administration.
   - Guard `/onboarding?new=true` with the same creator check so manually entering the URL cannot bypass the UI.

2. **Block accidental backend provisioning after an invite**
   - Harden `provision-trial-org` so an account with a pending or previously accepted team invitation is never given a new trial organization.
   - Continue returning the existing invited organization when membership already exists.
   - Preserve normal trial provisioning only for genuine standalone signups with no invitation history.

3. **Make invite password completion durable**
   - Keep the one-time email code flow for existing emails and the create-password form for brand-new emails.
   - After password creation, complete the invitation, verify the membership row, and persist the invited organization as the active workspace.
   - Ensure the invite flow does not report success until membership exists and the created password can be used by normal email/password sign-in.

4. **Make later sign-ins deterministic**
   - On sign-in, wait for organization membership resolution and select the completed invited workspace.
   - Never interpret an in-flight or failed membership lookup as permission to create a business.
   - Redirect confirmed invited users to their workspace dashboard, not onboarding.

5. **Verify the complete flow**
   - Test a fresh invited email: create password → accept invite → workspace dashboard → sign out → sign in with the same email/password → same workspace dashboard.
   - Test an email that previously existed as a client/staff/profile record through the emailed-code password path.
   - Confirm both invited Owner and Manager accounts lack “Add New Business” and cannot open the new-business onboarding URL.
   - Confirm the original organization creator can still use “Add New Business.”
   - Verify no extra organization or owner membership is created during either invite flow.

## Technical details
- Frontend enforcement: `AdminSidebar`, `OnboardingPage`, invite/reset/login routing, and organization resolution.
- Backend enforcement: `provision-trial-org` validates both membership and invitation history before creating anything.
- Maintain strict organization isolation and fail closed on lookup errors.