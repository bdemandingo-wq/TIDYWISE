# Lovable prompt — blank owner name on signup notifications (a dated regression)

**Status:** not yet run.
**Found:** 2026-07-30 backlog investigation.
**Severity:** LOW technically, HIGH visibility — it is the first thing the business sees from us.
**Regressed:** 2026-02-01. Roughly six months of signups affected.

---

## Root cause: `handle_new_user` stopped copying the name

`notify-new-organization-signup/index.ts:52` reads
`profile.full_name?.trim() || "—"`. It is not the bug — `profiles.full_name` is
genuinely NULL.

The profile row is created by the `on_auth_user_created` trigger on `auth.users`.
Its function has been rewritten three times and lost the name on the second:

**2025-12-18 (`20251218165414…sql:182-183`) — correct:**
```sql
INSERT INTO public.profiles (id, email, full_name)
VALUES (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
```

**2026-02-01 (`20260201062008…sql:5-22`) — the regression:**
```sql
INSERT INTO public.profiles (id, email, created_at, updated_at)
VALUES (NEW.id, NEW.email, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
```
`full_name` dropped from the column list while adding timestamps. Nothing else
changed about how it is called.

**2026-06-25 (`20260625042915…sql`) — inherited the omission**, adding
`subscription_status` and `trial_ends_at` but still no `full_name`.

`phone` has never been copied at all, so `Phone: N/A` on those same
notifications has the same cause.

## Why the client's own insert doesn't save it

`SignupPage.tsx:181-193` does insert the name:

```ts
await supabaseNoSession.from('profiles').insert({
  id: data.user.id, email, full_name: formData.fullName, phone,
});
if (profileError && !profileError.message.includes('duplicate key')) { … }
```

But the `auth.users` trigger fires **during `signUp()`**, so by the time this runs
the row already exists. The insert always fails with a duplicate key — and that is
exactly the error the code is written to ignore. The name the user typed is
discarded on every single signup, silently, by design-looking code.

`ON CONFLICT (id) DO NOTHING` (added in the same 2026-02-01 migration) is what
makes the trigger win the race permanently.

## Why this must be fixed in the trigger, not the client

Google and Apple OAuth signup (`useAuthNoSession.tsx:158`,
`nativeOAuth.signInWithOAuthNative`) never runs `SignupPage`'s insert at all. For
those users the trigger is the *only* thing that could ever populate the name.

Fixing `handle_new_user` fixes every path at once, runs as `SECURITY DEFINER` so
no RLS or session-timing question arises, and repairs the thing that actually
broke. A client-side patch would fix one path and depend on whether `signUp()`
returns a session immediately — which varies with the email-confirmation setting
and cannot be observed from here. Given the bug being fixed is *a write that
silently does nothing*, adding a second write that might silently do nothing is
the wrong move.

---

## The prompt

```
Please run a migration on the main project (slwfkaqczvwvvvavkgpr).

CONTEXT: new organisation signup notifications show a blank owner name and
"N/A" for phone. The cause is public.handle_new_user(), the AFTER INSERT
trigger on auth.users that creates the profiles row.

The original version (2025-12-18) copied the name:
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data ->> 'full_name');

A rewrite on 2026-02-01 added created_at/updated_at and ON CONFLICT DO NOTHING
but dropped full_name from the column list. A further rewrite on 2026-06-25
added subscription_status and trial_ends_at, still without full_name. phone has
never been copied.

The frontend does pass the name — supabase.auth.signUp is called with
{ full_name, phone } metadata, so it IS present in NEW.raw_user_meta_data. The
signup page also tries its own profiles insert afterwards, but the trigger has
already created the row, so that insert always fails with a duplicate key and is
deliberately ignored. Nothing else writes the name.

FIX: restore full_name and add phone to handle_new_user, keeping everything the
current version does. Please preserve subscription_status, trial_ends_at, the
timestamps and ON CONFLICT (id) DO NOTHING exactly as they are:

  INSERT INTO public.profiles (
    id, email, full_name, phone,
    created_at, updated_at, subscription_status, trial_ends_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(TRIM(COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'phone', '')), ''),
    NOW(),
    NOW(),
    'trial',
    NOW() + interval '7 days'
  )
  ON CONFLICT (id) DO NOTHING;

The 'name' fallback is for Google/Apple OAuth, which put the display name under
'name' rather than 'full_name' — those users never run the signup page's insert,
so the trigger is their only source. NULLIF/TRIM keeps a whitespace-only value
from reading as a present name.

SECOND: backfill the six months already affected. The names were never lost —
they are still in auth.users.raw_user_meta_data, only never copied across:

  UPDATE public.profiles p
  SET full_name  = NULLIF(TRIM(COALESCE(
                     au.raw_user_meta_data ->> 'full_name',
                     au.raw_user_meta_data ->> 'name', '')), ''),
      updated_at = NOW()
  FROM auth.users au
  WHERE au.id = p.id
    AND (p.full_name IS NULL OR TRIM(p.full_name) = '')
    AND NULLIF(TRIM(COALESCE(
          au.raw_user_meta_data ->> 'full_name',
          au.raw_user_meta_data ->> 'name', '')), '') IS NOT NULL;

  UPDATE public.profiles p
  SET phone      = NULLIF(TRIM(au.raw_user_meta_data ->> 'phone'), ''),
      updated_at = NOW()
  FROM auth.users au
  WHERE au.id = p.id
    AND (p.phone IS NULL OR TRIM(p.phone) = '')
    AND NULLIF(TRIM(au.raw_user_meta_data ->> 'phone'), '') IS NOT NULL;

Please report the before/after counts:

  select count(*) filter (where full_name is null or trim(full_name) = '')
           as profiles_missing_name,
         count(*) filter (where phone is null or trim(phone) = '')
           as profiles_missing_phone,
         count(*) as total
  from public.profiles;

Run that BEFORE and AFTER the backfill and paste both.

  select pg_get_functiondef('public.handle_new_user()'::regprocedure);

Confirm the migration RAN, not just that a file was created.
```

---

## Follow-up once this is deployed (not before)

`SignupPage.tsx:181-193`'s profiles insert is now provably dead code — the trigger
always wins, so it always duplicate-keys. It is harmless and its failure is
already ignored, so removing it is cosmetic churn on a critical path and not worth
doing blind. Worth tidying only when that file is next touched for another reason,
and only after confirming the trigger fix is live.

The `if (profileError && !profileError.message.includes('duplicate key'))` swallow
technically violates CLAUDE.md rule 5, but making it loud today would fire on every
signup, since duplicate-key is now the *expected* outcome. Fix the trigger first;
the swallow becomes removable at the same time as the insert.
