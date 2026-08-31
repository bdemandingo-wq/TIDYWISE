# Stop invited teammates from seeing business signup

## Verified cause
- `amdgsolutionsllc@gmail.com` already has an owner membership in **Clean Collective**.
- Clean Collective has `needs_onboarding = false`, and this user is not the organization creator.
- The `/onboarding` page is currently a public route and initially renders the business-creation form while organization membership is still loading or when that lookup temporarily resolves to `null`.
- Shared route guards also interpret `organization === null` as “new user” and redirect to `/onboarding`, even though null can also mean the membership lookup failed or has not synchronized yet.

## Implementation
1. **Make onboarding fail closed**
   - Add a dedicated guard before the onboarding form can render.
   - Query the signed-in user’s live organization memberships and organizations.
   - If any valid membership exists, activate the intended/existing workspace and redirect to its dashboard.
   - Show the business setup wizard only after the database explicitly confirms the user has zero memberships, or when the signed-in user owns the active organization and that organization still requires onboarding.
   - On lookup failure, show a retryable workspace-loading error instead of business signup.

2. **Remove the null-state redirect race**
   - Track organization resolution as loading, resolved-empty, or failed rather than collapsing errors and empty results into the same `null` state.
   - Update admin and organization route guards so only a confirmed zero-membership result can route a genuine new owner to onboarding.
   - Keep invited owners/managers pointed at their existing workspace during initial load, refresh, and later sign-ins.

3. **Keep invite workspace selection durable**
   - Preserve Clean Collective as the active organization after invite acceptance and on subsequent logins.
   - Ensure an old/stale local organization ID cannot override a valid invited workspace.
   - Do not create or provision another business when a membership exists or membership status is uncertain.

4. **Regression verification**
   - Test the existing invited account flow: accept invite → dashboard → sign out → sign in with the newly created password → Clean Collective dashboard.
   - Verify direct navigation to `/onboarding` redirects that teammate away without briefly exposing the signup form.
   - Verify a truly new user with no memberships can still complete business onboarding.
   - Run the targeted auth/invite tests, TypeScript check, and inspect the production build status before reporting completion.

## Technical scope
- Frontend auth, organization context, onboarding guard, and route-guard logic only unless testing exposes a backend authorization defect.
- No changes to Clean Collective data, memberships, or onboarding settings are needed; the live records are already correct.
