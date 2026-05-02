-- Lock down storage.objects SELECT/INSERT/UPDATE policies that allow
-- cross-org listing or cross-org writes. Addresses Supabase database
-- linter 0025_public_bucket_allows_listing.
--
-- Findings from a static audit of supabase/migrations/*.sql:
--
--   booking-photos. Newer org-scoped policies (mig 20260404031004) are
--     correctly tight. But the original anon-public SELECT and the
--     authenticated-but-unscoped INSERT from mig 20251224065946 were
--     never DROPped. Storage RLS evaluates policies as OR, so the older
--     policies still grant listing to anon and uploads to any
--     authenticated user. Drop them.
--
--   staff-avatars. Bucket is public:true and a policy named "Anyone can
--     view staff avatars" lets anon SELECT (== list) the bucket. Avatars
--     are intentionally fetchable by direct URL (rendered in many UIs);
--     dropping the SELECT policy keeps direct URL fetches working
--     (public buckets bypass RLS for GET) but disables listing.
--
--   business-assets. Bucket is public:true (logos shown on public booking
--     pages). Three BROAD policies for SELECT/INSERT/UPDATE allow any
--     authenticated user to read or write any org's logo. Replace with
--     org-admin-scoped policies that read the org id from path[1].
--
--   supply-pictures, work-photos. Buckets exist (mig 20260428082513) but
--     no upload code references them and no policies on storage.objects
--     target them. Default deny applies; left untouched.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. booking-photos: drop the legacy broad policies
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload booking photos" ON storage.objects;

-- The org-scoped policies created in 20260404031004 remain in place:
--   "Staff and admins can view booking photos"   (SELECT)
--   "Staff and admins can upload booking photos" (INSERT)
--   "Staff and admins can update booking photos" (UPDATE)
--   "Admins can delete booking photos"           (DELETE)

-- ──────────────────────────────────────────────────────────────────────────
-- 2. staff-avatars: drop the anon SELECT (Pattern C — public bucket,
--    direct URL fetches still work, listing disabled)
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view staff avatars" ON storage.objects;

-- Write policies (each scoped to the user's own folder) remain in place:
--   "Staff can upload their own avatar"
--   "Staff can update their own avatar"
--   "Staff can delete their own avatar"

-- ──────────────────────────────────────────────────────────────────────────
-- 3. business-assets: replace BROAD policies with org-admin-scoped ones
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public read access to business assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload business assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update business assets" ON storage.objects;

-- SELECT: not added back. Bucket is public:true so direct URL fetches via
-- getPublicUrl() continue to work for the public booking page. Listing is
-- not possible without a SELECT policy.

CREATE POLICY "Org admins can upload business assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'business-assets'
    AND public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Org admins can update business assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'business-assets'
    AND public.is_org_admin(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'business-assets'
    AND public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Org admins can delete business assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'business-assets'
    AND public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

-- ──────────────────────────────────────────────────────────────────────────
-- supply-pictures, work-photos: unchanged. Buckets exist but no policies
-- target them; default deny is the desired state until upload code lands.
-- ──────────────────────────────────────────────────────────────────────────
