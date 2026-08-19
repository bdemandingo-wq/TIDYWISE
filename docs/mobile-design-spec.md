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
| `color.surface.inverse` | light `#101733` · **dark `#2A3C84`** | **new, scoped** | hero/summary surface, 1 per screen max — see §6.1 |
| `color.surface.inverseWell` | `rgba(255,255,255,0.10)` | new | stat wells on inverse |
| `color.border.inverseHero` | **dark only** `rgba(255,255,255,0.26)` | **new, scoped** | 1px edge on the dark hero — see §6.1a |
| `color.surface.inset` | `#F5F6FA` | = page | wells inside cards |
| `color.surface.disabledBtn` | `#E5E7ED` | new | disabled primary button bg |
| `color.text.primary` | `#16181D` | maps existing | titles, stats |
| `color.text.body` | `#3C4250` | new | long-form body (AI insight copy) |
| `color.text.secondary` | `#5F6774` | new | row secondary text |
| `color.text.tertiary` | `#6B7280` | maps gray-500 | captions, eyebrows |
| `color.text.disabled` | `#687080` | **new** | locked actions, inactive nav — **on light surfaces only** |
| `color.text.disabledOnInverse` | light `#9AA1AD` · **dark `#ABB0BA`** | **new, scoped** | the same role on `surface.inverse` |
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

#### 1.1a Verified mapping — against `--pv-*`, the scope that actually applies

**Corrected 2026-08-19.** An earlier version of this section reported "13 of 14
hexes absent". That was measured against `:root`, which is the wrong selector,
and it is withdrawn.

`src/index.css:1195` binds `--primary: var(--pv-brand)` inside `.portal-v2`, and
**73 files apply that scope — 69 of them pages**: admin, landing, pricing, login,
signup, staff portal, client portal. So `--pv-*` is the palette these screens
actually read. `:root`'s `--primary` governs only what escapes the wrapper —
Radix portals to `document.body` (dialogs, toasts, dropdowns, popovers).

Mapped by RGB distance to the nearest existing token:

| Spec token | Hex | Nearest `--pv-*` | Its hex | Δ | Verdict |
|---|---|---|---|---|---|
| `brand.primary` | `#3150ED` | `--pv-brand` | `#3150ED` | **0** | **already exists — use it** |
| `surface.card` | `#FFFFFF` | `--pv-surface` | `#FFFFFF` | **0** | **already exists** |
| `brand.primaryTint` | `#EAF0FD` | `--pv-brand-soft` | `#ECEFFE` | 2.4 | same token, retune |
| `status.successBg` | `#E9F7F1` | `--pv-success-soft` | `#E7F8F0` | 2.4 | same token, retune |
| `surface.page` / `inset` | `#F5F6FA` | `--pv-sunken` | `#F3F4F6` | 4.9 | same token, retune |
| `text.primary` | `#16181D` | `--pv-ink` | `#161A22` | 5.4 | same token, retune |
| `border.subtle` | `#EEF0F5` | `--pv-sunken` | `#F3F4F6` | 6.5 | same token, retune |
| `text.disabled` | `#687080` | `--pv-ink-3` | `#666D7A` | 7.0 | same token, retune |
| `avatar.pinkBg` | `#FCE7F3` | `--pv-danger-soft` | `#FDECEE` | 7.1 | same token, retune |
| `text.tertiary` | `#6B7280` | `--pv-ink-3` | `#666D7A` | 9.3 | same token, retune |
| `border.default` | `#ECEEF4` | `--pv-sunken` | `#F3F4F6` | 9.4 | same token, retune |
| `text.disabledOnInverse` | `#9AA1AD` | `--pv-ink-4` | `#949BA8` | 9.8 | same token, retune |
| `border.strong` | `#D9DEE9` | `--pv-border` | `#E1E4EA` | 10.0 | same token, retune |
| `text.secondary` | `#5F6774` | `--pv-ink-3` | `#666D7A` | 11.0 | same token, retune |
| `status.warnBg` | `#FFF7ED` | `--pv-warn-soft` | `#FFF3E0` | 11.2 | same token, retune |
| `text.body` | `#3C4250` | `--pv-ink-2` | `#434956` | 11.6 | same token, retune |
| `status.dangerChipBg` | `#FEE4E2` | `--pv-danger-soft` | `#FDECEE` | 14.5 | near — decide |
| `surface.inverse` | `#101733` | `--pv-ink` | `#161A22` | 18.3 | near — but see §6.1 |
| `status.warnChipText` | `#B45309` | `--pv-warn` | `#A05908` | 20.9 | near — decide |
| `status.danger` | `#DC2626` | `--pv-danger` | `#DB243C` | 22.1 | near — decide |
| `brand.primaryBorder` | `#CFDDFA` | `--pv-border` | `#E1E4EA` | 25.1 | near — decide |
| `status.success` | `#129E6A` | `--pv-success` | `#22774F` | 50.1 | **genuinely new** |
| `accent.ai` / `event.purple` | `#6C5CE7` | — | — | 60.5 | **genuinely new** |
| `loyalty.gold` | `#D69E2E` | — | — | 95.5 | **genuinely new** |

**This is an extension, not a replacement.** The brand primary is already exactly
right; two tokens are byte-identical, fourteen are the same role at a slightly
different value, and only three families are genuinely absent: the AI indigo, the
loyalty gold, and this particular success green.

The remaining real constraint is format: the spec is hex, `--pv-*` is HSL
triples. Every adopted value still needs converting before it enters the
pipeline.

Not in `--pv-*` at all, and needed: `surface.inverse` and its family
(`inverseWell`, `onInverseMuted`, `linkOnInverse`, `disabledOnInverse`),
`accent.ai` + tints, the loyalty gold family, the avatar hue set,
`status.orangeAlert`.

Two of those are **scoped**, with a distinct dark value rather than one hex —
`surface.inverse` and `disabledOnInverse`. They belong in `.portal-v2` and
`.dark .portal-v2` alongside the existing `--pv-*` tokens, not as constants:

```css
.portal-v2      { --pv-inverse: 228 52% 13%; --pv-on-inverse-disabled: 218 10% 64%; }
.dark .portal-v2{ --pv-inverse: 228 52% 34%; --pv-on-inverse-disabled: 218 10% 70%;
                  --pv-inverse-border: 0 0% 100% / 0.26; }   /* dark only */
```

See §6.1 for why, and for the full derivation.

#### 1.1b Colour family decisions — settled 2026-08-19

§1.1a identified three families as genuinely absent from `--pv-*`. **Two are
adopted, one is rejected.** This section records why, so it is not relitigated.

##### Adopted — AI indigo `#6C5CE7`, loyalty gold `#D69E2E`

Both are real gaps. Nearest-token distance is 60.5 and 95.5 (§1.1a); the closest
existing token in each case is a different hue family, not the same role at a
different value. Nothing in `--pv-*` means "AI surface" or "loyalty", so these
add vocabulary rather than forking it. Adopt both as new families.

**Both are new in dark as well.** There is no `--pv-*` counterpart to inherit a
dark value from, so each needs its own entry in `.dark .portal-v2`. A single hex
cannot serve both themes — that is the `--warning` lesson (one gold value, both
themes, 1.65:1 on the white page) and it applies here for the same reason.

Measured against the surfaces this spec actually places them on. Text tier is
4.5:1, icon/rail/fill tier is 3:1.

**AI indigo `#6C5CE7`** — `accent.ai`, `event.purple`

| Surface | Ratio | As text (4.5) | As icon/rail (3.0) |
|---|---|---|---|
| `surface.card` `#FFFFFF` | 4.86:1 | PASS | PASS |
| `surface.page` `#F5F6FA` | 4.50:1 | **FAIL** (marginal) | PASS |
| `accent.aiTint` `#F4F1FF` | 4.37:1 | **FAIL** | PASS |
| `surface.inverse` light `#101733` | 3.62:1 | **FAIL** | PASS |
| dark `--pv-bg` `#111318` | 3.82:1 | **FAIL** | PASS |
| dark `--pv-surface` `#181A21` | 3.58:1 | **FAIL** | PASS |
| dark `--pv-sunken` `#1D212A` | 3.32:1 | **FAIL** | PASS |
| `surface.inverse` dark `#2A3C84` | 2.08:1 | **FAIL** | **FAIL** |

The constraint that matters: indigo **fails as text on `aiTint`** — its own card
background, and the placement the spec names first. It clears the bar only as
text on white. Treat `#6C5CE7` as an icon, rail and border colour; use
`text.body` `#3C4250` for AI insight copy, which is what §1.1 already specifies.
It is unusable on the dark inverse in any role.

**Loyalty gold `#D69E2E`** — `loyalty.gold`, plus `loyalty.text` `#8A6D1F`

| Surface | `#D69E2E` | Verdict | `#8A6D1F` | Verdict |
|---|---|---|---|---|
| `surface.card` `#FFFFFF` | 2.39:1 | **FAIL** both tiers | 4.90:1 | PASS text |
| `surface.inset` `#F5F6FA` (progress track) | 2.21:1 | **FAIL** fill 3:1 | — | — |
| `loyalty.goldTint` `#FFF9EC` | 2.28:1 | **FAIL** both tiers | 4.67:1 | PASS text |
| dark `--pv-bg` `#111318` | 7.78:1 | PASS both | 3.79:1 | **FAIL** |
| dark `--pv-surface` `#181A21` | 7.27:1 | PASS both | 3.55:1 | **FAIL** |
| dark `--pv-sunken` `#1D212A` | 6.74:1 | PASS both | 3.29:1 | **FAIL** |
| `surface.inverse` dark `#2A3C84` | 4.23:1 | PASS fill, FAIL text | 2.06:1 | **FAIL** |

**The gold family fails in opposite directions in the two themes.** `#D69E2E`
is too light for light mode — at 2.21:1 on its own progress track it misses the
3:1 object bar, and the progress fill is its stated primary use, so the family
does not currently work for the thing it was added to do. In dark it is
comfortable everywhere. `#8A6D1F` is the mirror image: fine in light, fails
every dark surface.

So the gold family needs **two values per role**, not one. Darkening `#D69E2E`
for light mode and lightening `#8A6D1F` for dark is the shape of the fix; the
exact values are an implementation decision, but a single hex per role is
already ruled out by the table above.

##### Rejected — success green `#129E6A`. Use `--pv-success`.

**Two tokens meaning "success" is a duplicate, not an extension.** Unlike indigo
and gold, this family already exists: `--pv-success` occupies the role, in both
themes. Adding a second one forks the vocabulary — every new component picks one
of the two, the choice is arbitrary, and they drift apart. That cost is
permanent and it buys nothing.

It is also the weaker value. Measured:

| Pair | Ratio | |
|---|---|---|
| spec `#129E6A` on `surface.card` `#FFFFFF` | 3.43:1 | **FAIL** |
| spec `#129E6A` on its own `successBg` `#E9F7F1` | 3.11:1 | **FAIL** |
| `--pv-success` `#22774F` on `#FFFFFF` | 5.50:1 | PASS |
| `--pv-success` on `--pv-success-soft` `#E7F8F0` | 5.00:1 | PASS |
| `--pv-success` dark `#64D8A2` on dark `--pv-surface` | 9.83:1 | PASS |

The spec's green **fails AA in both of the placements the spec itself gives it**,
including against its own tint. The existing token passes both, and already
carries a measured dark value (`152 60% 62%`) that `#129E6A` does not have.

Adopting `#129E6A` would mean adding a second token for an occupied role, in a
worse value, that then needs a dark variant invented for it. Use `--pv-success`
(`152 55% 30%` light, `152 60% 62%` dark) and drop `status.success` /
`successBg` from the closed set in §1.1.

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

All figures computed 2026-08-19 (WCAG 2.1 relative luminance), **in both scopes**:
`.portal-v2` light and `.dark .portal-v2`. An earlier version measured light only.

### 6.0 Measured pairs

| Pair | Light | Dark |
|---|---|---|
| brand on brand-soft (text on primaryTint) | 5.24:1 PASS | 5.13:1 PASS |
| ink on surface (body on card) | 17.43:1 PASS | 15.90:1 PASS |
| ink on bg (body on page) | 16.82:1 PASS | 17.00:1 PASS |
| ink-3 on surface (`text.tertiary` / `text.disabled`) | 5.21:1 PASS | 7.08:1 PASS |
| **ink-4 on surface** (icons on quiet surfaces) | **2.80:1 FAIL** | **4.42:1 FAIL** |
| success on success-soft | 5.00:1 PASS | 6.52:1 PASS |
| warn on warn-soft | 4.88:1 PASS | 7.19:1 PASS |
| **danger on danger-soft** | **4.25:1 FAIL** | 4.80:1 PASS |
| brand-ink on brand (button label) | 6.00:1 PASS | 6.79:1 PASS |

Two pre-existing failures, both in `--pv-*` rather than introduced by this spec:

- **`--pv-ink-4` fails in both modes.** It is used for "icons on quiet surfaces".
  Fine for a decorative glyph beside a label; not fine for anything carrying
  meaning alone. Any icon-only control must not use it.
- **`--pv-danger` on `--pv-danger-soft` fails in light** (4.25:1) and passes in
  dark. The danger chip is the one place this spec puts text on that pair
  (`dangerChipText` on `dangerChipBg`), so the spec's own `#B42318` on `#FEE4E2`
  should be used rather than the `--pv-*` pair, or `--pv-danger` darkened.

### 6.1 `surface.inverse` is scoped, and inverts in dark

Text on the navy was never the problem — white is 17.61:1 on it, muted 7.95:1,
link 8.24:1. **The surface was.** As a fixed hex, `#101733` against dark mode's
page (`#111318`) measured **1.06:1** and against its card (`#181A21`) **1.01:1**.
§3 rule 2 calls this surface "the headline, max once per screen" — a spotlight.
At 1.01:1 it was invisible in dark mode *while remaining perfectly readable*,
which is the combination least likely to be caught in review.

So it is a **scoped token, not a hex**, and in dark it goes **lighter than the
page**. "Inverse" means opposite of the surrounding surface: on a light page the
spotlight sinks to navy, on a dark page it must rise.

| | Light | Dark |
|---|---|---|
| `surface.inverse` | `#101733` — `228 52% 13%` | **`#2A3C84` — `228 52% 34%`** |
| vs page | (dark on light) | **1.84:1** |
| vs card | (dark on light) | **1.72:1** — was 1.01:1 |

Same hue and saturation, lightness inverted around the page. It reads as the
same brand navy in both modes rather than as two unrelated colours.

**Re-derived text-on-inverse for the dark surface.** White-on-light-navy does not
transfer, as expected — three of the four hold and one does not:

| Token | Value | On dark `#2A3C84` | |
|---|---|---|---|
| `text.onInverse` | `#FFFFFF` | 10.11:1 | PASS |
| `text.onInverseMuted` | 65% white → `#B4BBD4` | 5.29:1 | PASS |
| `text.linkOnInverse` | `#8FB0FF` | 4.73:1 | PASS |
| `text.disabledOnInverse` | `#9AA1AD` | **3.89:1** | **FAIL — needs a dark value** |
| `text.disabledOnInverse` (dark) | **`#ABB0BA` — `218 10% 70%`** | **4.64:1** | PASS |

`disabledOnInverse` is the only one that had to move, and it is the binding
constraint on how light the surface can go: above `34%` lightness it fails even
after retuning, which is what sets the ceiling.

**The rest of the hero family, checked on both:**

| Pair | Light navy | Dark navy |
|---|---|---|
| `inverseWell` (10% white) vs its surface | 1.32:1 | 1.33:1 |
| white on `inverseWell` | 13.36:1 | 7.60:1 |
| `status.orangeAlert` `#F8A44C` (negative trend) | 8.73:1 | 5.01:1 |
| `--pv-brand` on the hero | 2.94:1 — **do not place brand-blue on light navy** | 3.80:1 |

Two rules fall out:

1. **Never put `brand.primary` text on `surface.inverse` in light mode** (2.94:1).
   Actions on a navy hero are white or ghost — which is what 2b already specifies
   ("white Reschedule + ghost Cancel"), so the comps were right and the token
   table simply never justified it.
2. **The dark hero takes a 1px border, and the fill stays subtle on purpose.**
   See §6.1a.

### 6.1a The dark hero border

`inverseHeroBorder` (dark only) — `rgba(255,255,255,0.26)`, composited over the
hero fill to `#616FA4`.

| Against | Ratio | |
|---|---|---|
| dark card `#181A21` | **3.57:1** | PASS — WCAG 1.4.11 component boundary |
| dark page `#111318` | **3.82:1** | PASS |
| hero fill `#2A3C84` | 2.08:1 | edge legibility only, no threshold applies |

White-alpha rather than a solid, matching the existing dark `--pv-border` /
`--pv-border-strong`, which are both `100%` white at low alpha. Note that
`--pv-border-strong` itself is not enough here: at `0.14` it composites to
`#485795` and measures **2.54:1** against the card, so it fails the boundary it
would be asked to draw. Hence a dedicated value rather than reusing the token.

**This is §3 rule 10, not an exception to it.** That rule says cards are flat and
"the border does the work". In light mode the navy hero is already several steps
darker than everything around it, so the fill alone carries the separation and no
border is needed. In dark mode the fill cannot carry it — the surface has to stay
close to the page to read as *raised* rather than as a second card stacked on the
first — so the border does the work instead, exactly as the rule says.

The fill is therefore deliberately subtle: **1.72:1 against the card is a
deliberate ceiling, not a compromise.** Push the fill brighter and the hero stops
looking like an illuminated area of the page and starts looking like another
card with a different background — which is the one thing rule 2's "spotlight,
max once per screen" cannot afford. Separation comes from the edge; elevation
comes from the fill staying quiet.

Light mode keeps no border. Adding one there would be decoration: the fill
already does the work.

### 6.2 Rules

- Text on primaryTint uses `brand.primary`: `#3150ED` on `#EAF0FD` is **5.25:1**.
  (An earlier draft claimed 4.6:1 for the superseded `#2B5CE6`, which actually
  measured 4.87:1 — both pass, but the stated figure was wrong.)
- **`text.disabled` now PASSES and the old note is obsolete.** `#687080` on white
  is **4.98:1**, on `surface.page` **4.61:1**. The previous `#9AA1AD` measured
  2.60:1, which is where "intentionally fails contrast" came from. That
  justification no longer applies on light surfaces.
- `text.disabledOnInverse` `#9AA1AD` on navy is **6.77:1** — which is why the old
  value is kept there rather than replaced.
- Disabled controls still pair with the unlock caption, but now because a
  disabled control should say *when* it unlocks. That is information, not a
  contrast workaround.
- All icon buttons need labels (bell = "Notifications, 9+ unread").
- Status pills: tone is also in the label text, never colour-only.
- Focus ring: 2px `brand.primary` offset 2px, all interactive elements.

---

## 7. Findings filed, not fixed

### 7.1 `:root` and `.portal-v2` render different blues

`:root` sets `--primary: 230 100% 50%` = `#002BFF`, a fully saturated blue.
`.portal-v2` rebinds it to `--pv-brand` = `#3150ED`. The 69 pages inside the
wrapper get `#3150ED`; anything Radix portals to `document.body` — dialogs,
toasts, dropdowns, popovers — gets `#002BFF`.

So a dialog opened from a page renders a different primary from the page that
opened it, and a toast confirming an action is a different blue from the button
that triggered it.

Measured, `#002BFF` on white is 5.90:1 and `#3150ED` is 5.25:1, so both pass —
this is a consistency defect, not an accessibility one. Not in scope for this
spec; recorded so it is not rediscovered as a mystery later.
