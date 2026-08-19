# TidyWise Mobile — Full Design Spec

Implementation spec for the TidyWise "modernized" design direction. Covers all seven comped screens:

| Ref | Screen | Persona |
|---|---|---|
| 1a | Admin dashboard (polish variant — reference only, not the locked direction) | Owner |
| 1b | Admin dashboard, modernized | Owner |
| 1c | New booking, stepped single screen | Owner |
| 2a | Cleaner Portal home | Cleaner |
| 2b | Client Portal home | Client |
| 3a | Cleaner job detail | Cleaner |
| 3b | Client booking request | Client |

Target: React + existing token pipeline (no raw hex in components). Phone-first at 390pt; admin screens also used on phone.

---

## 1. Design tokens

### 1.1 Color

| Token | Value | Status | Use |
|---|---|---|---|
| `color.brand.primary` | `#3150ED` | **new** | one action per zone, active nav, selected tiles |
| `color.brand.primaryHover` | `#1E46B8` | new | pressed/hover on primary |
| `color.brand.primaryTint` | `#EAF0FD` | new | selected chips, status badges, pay well bg |
| `color.brand.primaryBorder` | `#CFDDFA` | new | border on primaryTint wells |
| `color.accent.ai` | `#6C5CE7` | existing (AI indigo) | AI insight surfaces only |
| `color.accent.aiTint` / `aiBorder` | `#F4F1FF` / `#E4DEFB` | new | AI insight card bg/border |
| `color.surface.page` | `#F5F6FA` | maps existing | app background |
| `color.surface.card` | `#FFFFFF` | existing | cards |
| `color.surface.inverse` | `#101733` | new | hero/summary surface, 1 per screen max |
| `color.surface.inverseWell` | `rgba(255,255,255,0.10)` | new | stat wells on inverse |
| `color.surface.inset` | `#F5F6FA` | = page | wells inside cards |
| `color.surface.disabledBtn` | `#E5E7ED` | new | disabled primary button bg |
| `color.text.primary` | `#16181D` | maps existing | titles, stats |
| `color.text.body` | `#3C4250` | new | long-form body (AI insight copy) |
| `color.text.secondary` | `#5F6774` | new | row secondary text |
| `color.text.tertiary` | `#6B7280` | maps gray-500 | captions, eyebrows |
| `color.text.disabled` | `#687080` | **new** | locked actions, inactive nav — **on light surfaces only** |
| `color.text.disabledOnInverse` | `#9AA1AD` | **new** | the same role on `surface.inverse` |
| `color.text.onInverse` | `#FFFFFF` | existing | |
| `color.text.onInverseMuted` | `rgba(255,255,255,0.65)` | new | |
| `color.text.linkOnInverse` | `#8FB0FF` | new | links on navy |
| `color.border.default` | `#ECEEF4` | new | card hairline |
| `color.border.strong` | `#D9DEE9` | new | secondary button outline, empty checkboxes |
| `color.border.subtle` | `#EEF0F5` | new | in-card column dividers |
| `color.chart.axis` | `#9AA1AD` | = `text.disabledOnInverse` | axis labels |
| `color.status.success` / `successBg` | `#129E6A` / `#E9F7F1` | existing green | paid, complete, claim |
| `color.status.successAlt` / bg | `#059669` / `#D1FAE5` | existing | checklist done ticks |
| `color.status.warnText` / `warnBg` / `warnBorder` | `#9A5B13` / `#FFF7ED` / `#F5E0C3` | new | instruction wells |
| `color.status.warnChipText` / `warnChipBg` | `#B45309` / `#FEF3C7` | existing amber | progress chips |
| `color.status.danger` | `#DC2626` | existing | churn stat, notification badge |
| `color.status.dangerChipText` / bg | `#B42318` / `#FEE4E2` | new | Urgent chip |
| `color.status.orangeAlert` | `#F8A44C` | new | negative trend on inverse |
| `color.loyalty.gold` | `#D69E2E` | new | loyalty progress fill |
| `color.loyalty.goldTint` / border / text | `#FFF9EC` / `#F3E3B9` / `#8A6D1F` | new | loyalty card family |
| `color.avatar.pinkBg` / text | `#FCE7F3` / `#BE185D` | new | cleaner avatar (deterministic per-person hue set: pink, blue, green, purple) |
| `color.event.blue` / `green` / `purple` | `#2B5CE6` / `#129E6A` / `#6C5CE7` | existing | calendar/service accent rails |

Closed set. The build guard should pass every comp value through this table.

#### 1.1a Verified mapping — what actually exists today

The `Status` column above was written from the comps, not from the code. It was
checked against the repo on 2026-08-19 and is **wrong wherever it says
"existing"**. Grepping every hex in this table against `src/` and
`tailwind.config.ts`:

| Hex | Spec said | Actually in the codebase |
|---|---|---|
| `#6B7280` | maps gray-500 | **yes** — 6 occurrences, Tailwind gray-500 |
| `#2B5CE6` | existing | absent (and superseded by `#3150ED`) |
| `#6C5CE7` | existing (AI indigo) | absent |
| `#129E6A` | existing green | absent |
| `#059669` | existing | absent |
| `#B45309` / `#FEF3C7` | existing amber | absent |
| `#DC2626` | existing | absent |
| `#D69E2E`, `#101733`, `#F5F6FA`, `#16181D`, `#ECEEF4` | new / maps existing | absent |

**13 of 14 are absent. Treat this palette as new in full.**

The deeper mismatch is format, not value. This spec is written in hex; the
codebase has no hex tokens at all. `src/index.css` defines ~200 CSS custom
properties as **HSL triples**, consumed as `hsl(var(--token))` through
`tailwind.config.ts`. So every value here needs converting before it can enter
the pipeline, and none of them can be dropped in as written.

Where the two palettes overlap in role, they disagree in value:

| Role | Codebase today | This spec | Same? |
|---|---|---|---|
| primary | `--primary: 230 100% 50%` = `#002BFF` | `#3150ED` | no — the current one is fully saturated |
| success | `--success: 140 80% 26%` = `#0D7731` | `#129E6A` | no |
| destructive | `--destructive: 5 90% 45%` = `#DA1D0B` | `#DC2626` | close, not equal |
| warning | `--warning: 32 90% 33%` = `#A05908` | `#B45309` | no |
| foreground | `--foreground: 0 0% 6%` = `#0F0F0F` | `#16181D` | no |
| page bg | `--secondary: 0 0% 96%` = `#F5F5F5` | `#F5F6FA` | near, not equal |

Adopting this spec is therefore a **palette replacement**, not a palette
extension. That is a decision to take deliberately: every existing screen reads
from those variables, so changing `--primary` restyles the whole app, and adding
a parallel set of hex tokens splits the system in two. The conversions, for
whichever route is chosen:

| Token | Hex | HSL for `index.css` |
|---|---|---|
| `brand.primary` | `#3150ED` | `230 84% 56%` |
| `text.primary` | `#16181D` | `223 14% 10%` |
| `text.disabled` | `#687080` | `220 10% 45%` |
| `text.disabledOnInverse` | `#9AA1AD` | `218 10% 64%` |
| `surface.page` | `#F5F6FA` | `228 33% 97%` |
| `surface.inverse` | `#101733` | `228 52% 13%` |
| `border.default` | `#ECEEF4` | `225 27% 94%` |

### 1.2 Spacing (4px base)

`space.1`=4 · `space.2`=8 · `space.2_5`=10 · `space.3`=12 · `space.3_5`=14 · `space.4`=16 · `space.4_5`=18 · `space.5`=20 · `space.6`=24 · `space.7`=28

Usage rules: screen gutter `space.5`; card padding `space.4 space.4_5`; card stack gap `space.3` (admin: `space.3_5`); list-row gap `space.3`; chip gap `space.2`. If your scale is whole-4 only, round: 10→8, 14→16, 18→16 — spacing rhythm matters more than exact values.

### 1.3 Radius

`radius.sm`=10 (wells, tiles, action buttons) · `radius.md`=12 (primary CTAs) · `radius.lg`=14 (banners, small cards) · `radius.xl`=16 (cards) · `radius.hero`=18 (hero cards; admin hero header 0 0 26 26) · `radius.pill`=999 · `radius.circle`=50%

### 1.4 Elevation

- `shadow.none` — all flat cards (border does the work)
- `shadow.fab` — `0 6px 14px rgba(49,80,237,.35)` (FAB only; navy FAB uses black 25%)
- `shadow.footer` — sticky footers separate with `border-top: border.default`, no shadow

### 1.5 Typography

Family: Plus Jakarta Sans (or SF/system stack). Weights 400/500/600/700/800.

| Token | Size/weight/notes | Use |
|---|---|---|
| `type.stat.xl` | 32/800, ls -0.02em | admin hero revenue |
| `type.stat.lg` | 26/800 | job pay, report totals |
| `type.stat.md` | 24/800 | weekly summary stats |
| `type.stat.sm` | 22/800 | hero titles, small stats |
| `type.stat.xs` | 20/800 | stat-strip numbers, sticky totals |
| `type.title` | 19/800 | screen titles |
| `type.titleSm` | 17/800 | detail-header titles |
| `type.cardTitle` | 14/800 | card headers |
| `type.rowTitle` | 13/700 | list-row primary |
| `type.body` | 12.5/600, lh 1.5–1.55 | wells, descriptions |
| `type.bodySub` | 11.5/400–500 | row secondary |
| `type.caption` | 10.5/500 | unlock hints, timestamps |
| `type.label` | 10–11/700–800, uppercase, ls .04–.1em | eyebrows |
| `type.chip` | 10.5/700 | badges |
| `type.button` | 12–13/700–800 | buttons |
| `type.navLabel` | 10/600 (700 active) | bottom nav |

Numbers always `font-variant-numeric: tabular-nums` in lists/tables.

---

## 2. Component hierarchy per screen

### 1b — Admin dashboard (modernized)
- `Screen`
  - `InverseHeader` (navy, radius.hero bottom corners) — menu `IconButton` + greeting stack (eyebrow + business name) + bell
    - revenue block: `type.label` eyebrow → `stat.xl` amount + trend chip (`orangeAlert` when negative)
    - `StatWellRow` — 3× `StatWell` (inverseWell bg, radius 12): bookings today, owed, leads
  - `AIInsightCard` (aiTint gradient bg, aiBorder) — icon square (accent.ai) + title + `Urgent` chip → body (`text.body`) → action link (accent.ai)
  - `StatPairGrid` — 2× `StatCard`: label, stat (danger red when churn), caption
  - `TodayScheduleCard` — header (title + Calendar link) → 3× `TimelineRow`: time gutter (52px) + event well (service-color tint bg, 3px left rail, radius.sm) with title + meta
  - `BottomNav` — Home, Calendar, FAB(+, navy), Bookings, AI

### 1c — New booking (stepped single screen)
- `Screen`
  - `DetailHeader` (title + circular ✕)
  - `StepProgressBar` — 4 equal 4px segments, filled = primary
  - `StepCard` ×4, three states:
    - *complete*: check icon square (primaryTint), title, Edit link, one-line summary
    - *active*: 2px primary border; contains `DayPicker` (5 `DateTile`), `TimeChipRow`, `AssigneeSuggestRow` (avatar + name + "suggested" + Change link)
    - *upcoming*: collapsed, disabled colors
  - `StickyFooterBar` — TOTAL eyebrow + `stat.xs` amount · outlined Draft · primary "Save booking"

### 2a — Cleaner home
- `Screen`
  - `PortalHeader` — eyebrow "CLEANER PORTAL" + "Hi, Bruce"; bell `IconButton` with count badge; `Avatar`
  - `SetupChecklistCard` — title + amber progress chip → `ProgressBar` → 4× `ChecklistRow` (done: green tick + struck label; todo: empty circle + label + inline hint + chevron; blocked hint in warnChipText)
  - `WeekSummaryCard` (inverse) — "This week · Aug 17–23" + Earnings link → 3× inline `StatBlock` (stat.md + caption)
  - `SegmentedTabs` — pill row, active solid primary, counts inline
  - `JobCard` — id+service title + `StatusBadge` → meta lines → `PayWell` (primaryTint inset: label + amount right) → `NoteWell` (warn, merged note) → `ButtonRow` (primary "On the way", outlined Directions, disabled Start job) → unlock caption
  - `BottomNav` — Home, Calendar, Earnings, Docs, Profile

### 2b — Client home
- `Screen`
  - `PortalHeader` — "CLIENT PORTAL" + "Hello, Bill"; bell + settings
  - `NextAppointmentHero` (inverse) — NEXT APPOINTMENT eyebrow → `stat.sm` title → meta line → white Reschedule + ghost Cancel + Confirmed badge right
  - `LoyaltyBanner` (gold family) — trophy icon + "Gold · 1,820 pts" + gold `ProgressBar` + "$3,310 more to reach Platinum" + Benefits link
  - `UpcomingList` (Card) — header + See all → 3× `BookingRow` (`DateTile` static, title + meta, Reschedule link)
  - `ShortcutGrid` — 2 `ShortcutCard` (Refer a friend / Photo journal)
  - `BottomNav` — Home, Bookings, FAB(+), Alerts, Profile

### 3a — Cleaner job detail
- `Screen`
  - `DetailHeader` — circular back + "#1885 · Deep Clean" + date/time sub + Confirmed badge
  - `PayHeroCard` (inverse) — YOUR PAY eyebrow + `stat.lg` $100.00; right-aligned rate breakdown, muted
  - `ContactCard` — 3× `InfoRow` (icon col 28px; text; trailing Call/Map link)
  - `NoteWell` warn — SPECIAL INSTRUCTIONS
  - `NoteWell` primaryTint — PROPERTY NOTES
  - `ActionsCard` — title + "Unlock Sun, Aug 16" caption → `ActionGrid` 2×2 (primary On the way; outlined Directions; disabled GPS check-in, Checklist) → full-width disabled "Start job" → centered chip row (Before photos: 0 · After: 0)

### 3b — Client booking request
- `Screen`
  - `DetailHeader` — back + "Request a booking" + "We'll confirm within 24 hours"
  - `ScheduleCard` — "Pick a date" label → `DayPicker` (4 dates + More tile) → `TimeChipRow` (incl. "Flexible")
  - `AddressCard` — house icon + Primary Address + full address + Change link
  - `BenefitCard` (gold family) — trophy + "Redeem a Gold benefit" + Optional chip → 3 `ChoiceRow` options (outlined gold; selected = solid `text.primary` bg, white text)
  - `NotesCard` — label + placeholder `TextWell` (inset, min-height 44)
  - `StickyFooterBar` — REQUESTING eyebrow + chosen slot · primary "Submit request"

---

## 3. Rules behind the decisions

1. **One number owns each screen.** The reason the user opened the screen gets the largest stat on a hero surface: pay on job detail, revenue on admin, next appointment on client home. Everything else is ≥2 size steps down. Never two hero stats.
2. **Inverse navy = the headline, max once per screen.** It's a spotlight; screens without a headline number (booking request) have no navy at all.
3. **One solid-primary action per zone** (card, footer, or grid). Peers are outlined; tertiary actions are text links. This is why 3a's grid has exactly one blue button.
4. **Day-of-job actions are 2×2** because the four are unranked peers used one-handed in the field — equal large targets, no implied sequence. "Start job" is ranked (the commitment), so it drops below, full-width.
5. **Disabled ≠ hidden.** Locked actions render at `text.disabled` with an unlock caption. Cleaners plan around what unlocks later.
6. **Alerts/setup live under the header, once.** One condensed card with progress, replacing the current app's repeated full-width red banner. Severity shows as a chip, not a red slab.
7. **Tinted wells encode source**: amber = human-written, must-read (instructions); primaryTint = structured data (property notes, pay); gold = loyalty. Same family = same meaning everywhere.
8. **Status is a pill, top-right of its card.** Confirmed/Scheduled = primaryTint; caution = amber chip; urgent = dangerChip; success = green. One vocabulary.
9. **Uppercase tracked eyebrows mark machine data** (YOUR PAY, TOTAL, NEXT APPOINTMENT); sentence-case 800 marks section titles. Hierarchy from type, not dividers.
10. **Cards are flat** — 1px `border.default`, no shadow. Depth = inset wells (page-colored rectangles inside white). Shadows only on the FAB.
11. **Sticky footers are transaction summaries**: eyebrow + figure left, primary action right, always visible in commit flows (1c, 3b).
12. **Stepped forms collapse, never paginate** (1c): completed steps compress to a one-line summary with Edit; only one step is expanded. Total stays pinned.
13. **Time-based lists use a fixed time gutter** (52–76px, tabular numerals) so scan lines align.
14. **Tap targets ≥44px** on cleaner-facing screens; primary CTAs 46–48px tall.

## 4. Reusable components

One component, many screens: `PortalHeader` (2a,2b) · `DetailHeader` (1c,3a,3b) · `Card` + `InverseCard` (all) · `StatusBadge` (1b,2a,2b,3a) · `StatBlock`/`StatWell` (1b,2a) · `DateTile` (1c,2b,3b) · `DayPicker` (1c,3b) · `TimeChipRow` (1c,3b) · `NoteWell` (2a,3a) · `PayWell` (2a,3a) · `Button` primary/secondary/ghost/disabled (all) · `ProgressBar` primary/gold (1c,2a,2b) · `ChecklistRow` (2a) · `BookingRow` (2b; dense sibling of `JobCard`) · `InfoRow` (3a, profile screens) · `ShortcutCard` (2b) · `StickyFooterBar` (1c,3b) · `BottomNav` + `FAB` (1b,2a,2b) · `Avatar` (deterministic hue from name) · `SegmentedTabs` (2a) · `TimelineRow` (1b, scheduler) · `AIInsightCard` (1b, AI tab).

Prop sketch for the two most-shared:

```
Button: { variant: 'primary'|'secondary'|'ghost'|'disabled-visible', size: 'md'(40)|'lg'(48), fullWidth?, icon? }
StatusBadge: { tone: 'info'|'success'|'warn'|'danger', label }
```

## 5. States not shown in comps

- **Loading**: skeletons matching final geometry (stat rects, row rects; shimmer on `border.default`). Inverse cards keep navy bg with lighter skeletons. No layout shift on load.
- **Empty**: in-card centered icon + one-line title + sub ("No jobs today" / "No upcoming bookings") + one text-link next step. Card keeps its padding; never a bare void.
- **Error (scoped)**: failing card renders a warn well: "Couldn't load earnings" + Retry link. Screen stays alive; never a full-screen error for one widget.

### 5.1 Error is not empty — per screen

A general "show an error state" note is not enough, and this codebase has the
scars to prove it. Three separate bugs in one week rendered a *failure* as an
*empty result*: the Team tab said "No members yet" for an organisation with
five, lead cards showed no initials, and message attribution showed none — all
with correct backends. In each case the query failed, the data defaulted to
empty, and the UI stated as fact that there was nothing there.

So each surface below names both states explicitly. They are never the same
component and never the same words.

The hooks already distinguish them, and the wording should follow the hook:

- `useOrgQuery` → `isEmpty` is true **only** when a request completed,
  succeeded and returned no rows. Loading and failure are separate states.
- `useOrgRecord` → `isMissing` is true **only** when a row genuinely does not
  exist. A failed read never justifies falling back to a default.

Never drive an empty message from `rows.length === 0` or `row === null`. Both
are true while loading and while failed.

| Screen | Surface | Empty (`isEmpty` / `isMissing`) | Error (`error != null`) |
|---|---|---|---|
| 1b Admin dash | revenue hero | `$0.00` with the period label — zero is a real answer | inverse card keeps navy; stat replaced by "Couldn't load revenue" + Retry. Never render `$0.00` on failure |
| 1b | `AIInsightCard` | card omitted entirely — no insight is not a state worth a slot | card renders with "Insights unavailable" in `text.body`, no Urgent chip |
| 1b | `StatPairGrid` | `0` with caption | per-stat "—" + one Retry for the pair; the churn stat must never show red `0` on failure |
| 1b | `TodayScheduleCard` | "Nothing scheduled today" + "Add booking" link | "Couldn't load today's schedule" + Retry, header link still works |
| 1c New booking | `AssigneeSuggestRow` | "No suggestion" + Change link | "Couldn't load cleaners" + Retry; the step must stay completable by picking manually |
| 2a Cleaner home | `SetupChecklistCard` | card omitted when nothing outstanding | "Couldn't load your setup" + Retry — never render 0/4, which reads as "you've done nothing" |
| 2a | `WeekSummaryCard` | `$0.00` + "No jobs this week" | navy retained, stats "—", "Couldn't load this week" + Retry. **Never `$0.00` on failure** — a cleaner reading zero earnings believes it |
| 2a | `JobCard` list | "No jobs today" + next-day hint | "Couldn't load jobs" + Retry. Do not show the empty illustration |
| 2b Client home | `NextAppointmentHero` | "No upcoming appointments" + Book link | "Couldn't load your appointment" + Retry. Never the empty copy — a client reading it may rebook a visit that exists |
| 2b | `LoyaltyBanner` | banner omitted when not enrolled | banner renders with "Points unavailable", no progress bar. A zero-width gold bar reads as lost points |
| 2b | `UpcomingList` | "No upcoming bookings" + Book link | "Couldn't load bookings" + Retry |
| 3a Job detail | `PayHeroCard` | not possible — a job always has a pay figure. Treat absence as error | "Couldn't load pay" + Retry, navy retained. **Never `$0.00`** |
| 3a | `ContactCard` | "No contact details on file" | "Couldn't load contact details" + Retry — a cleaner must not be told the customer has no phone when the read simply failed |
| 3a | note wells | well omitted when there is no note | well renders in warn tone: "Couldn't load instructions". Missing safety instructions must never look like no instructions |
| 3b Booking request | `DayPicker` | not possible — dates are computed client-side | n/a |
| 3b | `AddressCard` | "No address on file" + Add link | "Couldn't load your address" + Retry; submission blocked while errored |
| 3b | `BenefitCard` | card omitted when no benefits available | card omitted too — an unavailable optional perk is not worth an error. The only surface here where the two collapse, deliberately |

Two rules fall out of the table:

1. **A money figure never renders `0` on failure.** Pay, earnings, revenue and
   totals show "—" and an error. Zero is a claim, and on these screens it is a
   claim someone acts on.
2. **A safety- or commitment-bearing absence is always an error, never empty.**
   Special instructions, contact details and the next appointment: "we couldn't
   load it" and "there isn't one" lead to different actions, so they must never
   share a rendering.
- **Offline**: page-top slim bar (`text.primary` bg, white 12/600): "Offline — showing last synced data". Writes (check-in, photos, clock events) queue locally with a "will sync" chip on the affected card; Start job works offline.
- **Stale**: "Updated 5m ago" caption under `PortalHeader` when data >2m old; pull-to-refresh on both portal homes.
- **Long content**: notes wells clamp at 4 lines with "More"; addresses truncate middle; names never truncate in pay contexts.
- **Notification badge**: count caps at "9+"; hidden at 0.
- **Press feedback**: buttons darken to `primaryHover` (primary) or `surface.inset` (secondary); 150ms ease-out. No motion beyond opacity/color on state changes; step expansion in 1c animates height 200ms.

## 6. Accessibility

Contrast figures below are computed, not estimated (WCAG 2.1 relative luminance, 2026-08-19).

- Text on primaryTint uses `brand.primary`: `#3150ED` on `#EAF0FD` is **5.25:1**, AA normal. (The spec previously said 4.6:1 for the old `#2B5CE6`, which actually measured 4.87:1 — both pass, but the stated number was wrong.)
- Muted-on-inverse, 65% white composited on `#101733`, is **7.95:1** — comfortably AA at any size, not merely "≥12px/600" as previously claimed.
- **`text.disabled` now PASSES, and the old note is obsolete.** `#687080` on white is **4.98:1** and on `surface.page` **4.61:1** — both AA normal. The previous `#9AA1AD` measured 2.60:1 on white, which is where "intentionally fails contrast" came from. That justification no longer applies on light surfaces.
- `text.disabledOnInverse` `#9AA1AD` on `#101733` is **6.77:1** — which is why the old value is kept for the navy surface rather than replaced.
- Disabled controls still pair with the unlock caption, but now for the reason that matters: a disabled control must say *when* it unlocks. That is information, not a contrast workaround.
- All icon buttons need labels (bell = "Notifications, 9+ unread").
- Status pills: tone is also in the label text, never color-only.
- Focus ring: 2px `brand.primary` offset 2px, all interactive elements.
