# TidyWise QA Checklist — Post-Audit Fixes

Run these in staging after applying migrations. Each item maps to a specific bug that was fixed.

---

## 1. SettingsPage — Password Change
**Fix:** Re-authenticates before updating. Previously any string worked as "current password."

- [ ] Go to Settings → Account → Change Password
- [ ] Enter a **wrong** current password → should show "Current password is incorrect" and not update
- [ ] Enter the **correct** current password with a new password → should succeed and sign you out / prompt re-login

---

## 2. SurgePricingSettings — New Org Save
**Fix:** Replaced `.update()` with `.upsert()`. Silent no-op for orgs with no existing row.

- [ ] On a **brand-new org** (no surge pricing row yet), open Settings → Surge Pricing
- [ ] Set a multiplier and save → should save without error
- [ ] Reload → values should persist

---

## 3. BookingPhotosPage — Photo Delete
**Fix:** Deletes DB row first, then storage object. Previously storage-first caused orphaned DB rows on storage failure.

- [ ] Open a booking with photos
- [ ] Delete a photo → should disappear immediately from the UI
- [ ] Verify in Supabase dashboard that both the `booking_photos` row and the storage file are gone

---

## 4. CustomersPage — Customer Delete
**Fix:** Cleans up `quotes`, `property_notes`, `referrals`, `customer_loyalty` rows before deleting the customer. Previously failed with FK constraint errors.

- [ ] Find a customer with bookings, loyalty points, and/or referrals
- [ ] Delete them → should succeed, no FK constraint error
- [ ] Verify the customer no longer appears and no orphaned rows remain in related tables

---

## 5. BookingsPage — Delete Confirmation (iOS safe)
**Fix:** `window.confirm()` (blocked on Capacitor iOS) replaced with `AlertDialog`.

- [ ] Open Bookings list
- [ ] Click the delete icon on a single booking → AlertDialog should appear with Cancel / Delete
- [ ] Cancel → booking remains
- [ ] Delete → booking is removed, success toast shown
- [ ] Select multiple bookings → "Delete Selected" button → AlertDialog shows correct count
- [ ] Confirm → all selected bookings deleted

---

## 6. ChecklistsPage — Drag-and-Drop Reorder
**Fix:** DnD IDs were `item-0`, `item-1`, etc. After a reorder these became stale, moving the wrong item. Now uses stable UUIDs per item.

- [ ] Create a checklist template with 4+ items
- [ ] Open edit dialog → drag item 1 to position 3
- [ ] Save → reopen → items should be in the new order
- [ ] Drag again from the new order → should still move the correct item

---

## 7. ChecklistsPage — Delete Template (iOS safe)
**Fix:** `confirm()` → `AlertDialog`.

- [ ] Click trash icon on a template → AlertDialog appears
- [ ] Cancel → template remains
- [ ] Delete → template is removed

---

## 8. FinancePage — Processing Fee (Stripe only)
**Fix:** Previously applied 2.9% + $0.30 Stripe fee to every booking. Now only bookings with a `payment_intent_id` (actual Stripe charge) get the fee.

- [ ] View Finance → Transactions for a period that includes both Stripe-paid and cash/manual bookings
- [ ] Cash/manual bookings (no payment_intent_id) → Processing Fee column should show $0.00
- [ ] Stripe-paid bookings → should show the calculated fee

---

## 9. FinancePage — Sales Tax Disclaimer
**Fix:** Added "Estimate only" banner so users don't treat the 7% as authoritative.

- [ ] Finance → Sales Tax by Zip tab → yellow disclaimer banner should be visible at the top

---

## 10. ReportsPage — Working Hours Org Isolation
**Fix (code + migration):** `working_hours` now has `organization_id` column; query filters directly on it.

- [ ] Apply migration `20260413140000_working_hours_org_id.sql`
- [ ] Open Reports → Cleaner Availability tab
- [ ] Verify only your org's staff schedules appear
- [ ] If you have a second test org, confirm its staff don't show up here

---

## 11. Portal — Session Expiry
**Fix:** Added 30-day expiry to localStorage session. Previously sessions never expired.

- [ ] Sign into the client portal
- [ ] Manually edit localStorage (`client_portal_session`) and set `expiresAt` to a past timestamp
- [ ] Reload → should be signed out (session cleared)
- [ ] Normal sign-in should create a new session with a fresh `expiresAt` 30 days out

---

## 12. Portal — Inspection Photo URLs
**Fix:** Signed URLs expire after 1 hour. Photos now auto-refresh the URL on expiry (`onError` triggers `fetchUrl`).

- [ ] Open portal → Inspection Reports tab
- [ ] Photos should load normally
- [ ] Simulate an expired URL (edit the `src` to a broken URL or wait 1h) → photo should show a "Reload" button
- [ ] Click Reload → photo should reappear

---

## 13. Portal — Loyalty Redemption
**Fix:** Was using `customer?.organization_id` (doesn't exist on CustomerInfo); now uses `user?.organization_id`.

- [ ] Sign into portal as a customer with loyalty points
- [ ] Go to Rewards → attempt to redeem → should work without console errors

---

## 14. Portal — Referral Code
**Fix (code + migration):** `referral_code` added to `customers` table. Portal reads it directly, so every customer sees their code from the first login.

- [ ] Apply migration `20260413150000_customers_referral_code.sql`
- [ ] Sign into portal as a customer who has **never made a referral**
- [ ] Referrals tab → their personal code should now appear (not "check back shortly")
- [ ] Code should be a stable 8-character string derived from their customer ID

---

## 15. CampaignsPage — Placeholder Hints
**Fix:** Removed `{booking_date}` and `{service_type}` from the placeholder hint — the campaign function doesn't substitute them.

- [ ] Campaigns → Create Campaign → SMS Body field
- [ ] Hint text should show only: `{first_name}`, `{last_name}`, `{company_name}`, `{booking_link}`
- [ ] Same for the Email Body field

---

## 16. Portal — Referral Invite Form
**Fix:** Added "Send an email invite" form in the portal referrals tab. Calls `create_client_portal_referral` RPC then `send-referral-invite` edge function.

- [ ] Apply migration `20260413160000_create_client_portal_referral.sql`
- [ ] Sign into portal → Referrals tab → fill in friend's email → Send Invite
- [ ] Check the friend's inbox for the referral email
- [ ] The new referral row should appear in the "Your referrals" list
- [ ] Try sending the same email again → should show "You have already sent an invite to this email address"
- [ ] Try entering your own email → should show "You cannot refer yourself"

---

## 17. CampaignsPage — Email Campaigns Now Fire
**Fix:** `sendCampaignNow` now invokes `send-followup-campaign` for email/both channels; `run-inactive-campaign` for SMS/both. Fixed hardcoded `.lovable.app` URL and added `{single_braces}` substitution support.

- [ ] Create an email campaign (channel = Email) with body using `{first_name}` and `{company_name}`
- [ ] Click Send Campaign → should send emails to matching audience
- [ ] Verify emails contain the customer's first name and the company name substituted
- [ ] Verify Book Now link points to `APP_URL/book/[slug]`, not `tidywise.lovable.app/book`
- [ ] Create a "both" campaign → should send SMS (via run-inactive-campaign) AND email (via send-followup-campaign)

---

## Migrations to Apply (in order)

```bash
supabase db push
# or apply manually in order:
# 20260413140000_working_hours_org_id.sql
# 20260413150000_customers_referral_code.sql
# 20260413160000_create_client_portal_referral.sql
```

Verify backfill worked:
```sql
-- All working_hours rows should have an org
SELECT count(*) FROM working_hours WHERE organization_id IS NULL;  -- expect 0

-- All customers should have a referral_code
SELECT count(*) FROM customers WHERE referral_code IS NULL;  -- expect 0

-- No duplicate codes
SELECT referral_code, count(*) FROM customers GROUP BY referral_code HAVING count(*) > 1;  -- expect 0 rows
```
