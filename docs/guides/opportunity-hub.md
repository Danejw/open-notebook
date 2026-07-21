# Opportunity Hub — Manual Guide

Use this guide to open, sync, filter, review, and act on Hawaii construction opportunities in Construction OS.

**Route:** `/opportunities`  
**Nav:** Sidebar → **Opportunity Hub**

---

## What it is

The Opportunity Hub is a single inbox for IFBs, RFPs, RFQs, and related public construction notices. Today the live sync path pulls **federal SAM.gov opportunities with Hawaii place of performance**. Each notice can be watched, ignored, archived, or turned into a **bid workspace** (a Construction OS project with an intake summary).

---

## Prerequisites

Before testing:

1. **SurrealDB** is running (default port `8000`).
2. **API** is healthy:

   ```powershell
   Invoke-WebRequest "http://127.0.0.1:5055/health" -TimeoutSec 5 -UseBasicParsing
   ```

   Expect HTTP 200. If not, from the repo root:

   ```powershell
   $env:API_RELOAD = 'false'
   .\.venv\Scripts\python.exe run_api.py
   ```

3. **Frontend** is running (default `http://localhost:3000`).
4. You are **logged in** to the app (same password auth as the rest of Construction OS).
5. Optional but recommended for real sync/scoring:
   - `SAM_GOV_API_KEY` in `.env` (public SAM.gov Opportunities API key)
   - Company fit profile via **Manage → Company Profile** (preferred), or `OPPORTUNITY_SCORING_PROFILE_JSON` in `.env` as bootstrap until you save in the UI

   Restart the API after changing `.env`.

---

## 1. Open the hub

1. In the left sidebar, click **Opportunity Hub** (or go to `/opportunities`).
2. Confirm the page header shows **Opportunity Hub** and a meta line like `N visible opportunities · M sources`.
3. On first visit with an empty source registry, the app **auto-seeds** Hawaii source definitions (no manual step). The source count in the header should become greater than zero shortly after load.

**Pass:** Page loads without errors; header shows opportunity and source counts.

---

## 2. Sync federal opportunities (SAM.gov)

1. Click **Sync SAM.gov** in the page header (or use the same button in the empty-inbox state).
2. Wait until the button stops showing **Syncing SAM.gov…** (spinner stops).
3. Expect a toast: **Federal opportunities synchronized** with counts like `X new · Y refreshed · Z failed`.
4. Confirm the inbox populates (or grows) and the header match count updates.
5. Click the page refresh control and confirm the list still loads.

**If sync fails:**

- Toast: **SAM.gov synchronization failed** with an error message.
- Common cause: missing or invalid `SAM_GOV_API_KEY` → API returns configuration error (HTTP 422).
- Fix the key in `.env`, restart the API, retry Sync.

**Pass:** Sync completes; toast shows created/updated/failed counts; inbox reflects new or updated notices.

**Deadline filter:** Bulk sync skips notices whose response deadline is already past or missing, unless that notice is already **watching**, **pursuing**, or **submitted** (so monitored bids still refresh). The default inbox uses the same rule: only future deadlines appear, plus actively watched/pursued/submitted items. Explicit URL import (section 2b) can still add a past-due notice on purpose.

---

## 2b. Add one opportunity by SAM.gov URL

Use this when a notice is on SAM.gov but not yet in the inbox (for example outside the sync window or filtered out by collection).

1. Click **Add SAM.gov link** in the page header (also available in the empty-inbox state).
2. Paste a public opportunity URL such as `https://sam.gov/workspace/contract/opp/{noticeId}/view` (shorter `/opp/{noticeId}/view` and API `noticeid=` links also work).
3. Click **Add opportunity** and wait for the dialog to close.
4. Expect a toast: **SAM.gov opportunity added** (new) or **SAM.gov opportunity refreshed** (already in the inbox).
5. Confirm the detail pane opens on that notice so you can Watch, Ignore, or Pursue as usual.

**If import fails:**

- Toast: **Could not import SAM.gov link** with the API message.
- Common causes: missing `SAM_GOV_API_KEY`, invalid/non-SAM URL, or SAM returning no match (archived / outside the searchable posting window).

**Pass:** Notice appears or refreshes in the inbox; detail pane selects it; Watch / Pursue still work.

---

## 3. Read the Overview metrics

1. Confirm the **Overview** strip is a single dense row under the page header (no cards, no expand/collapse).
2. Confirm these six metrics appear on one line on a wide viewport (horizontal scroll on narrow):

   | Label | Meaning |
   | --- | --- |
   | New | Notices in source stage `early_research` |
   | High-fit | Strong company-fit scores |
   | Due 7d | Bid deadlines within a week (highlighted when &gt; 0) |
   | In progress | Workflow status `pursuing` |
   | Submitted | Workflow status `submitted` |
   | Pipeline | Compact currency for pipeline high estimate |

3. Confirm Overview stays pinned while you scroll the inbox list.

**Pass:** Metrics load and match the current pipeline after sync/status changes.

---

## 4. Filter and search the inbox

1. In the **Opportunity list** column, use the **two-line minified header**:

   - Line 1: title · count + **Search…**
   - Line 2: status · island · source · sort · clear (X when filters active)

   On **tablet and desktop** (horizontal inbox | details layout), when you drag the list pane narrower (before it collapses to the 48px icon rail), filters **progressively minimize** based on list-panel width—not viewport width. Short trigger labels appear first; lower-priority controls hide in this order: **Island → Source**. **Status**, **Sort**, and **Search** stay visible longest. Hidden filters stay applied until you clear them. At the narrowest widths, **Clear (X)** moves beside the search field. Collapsing the pane fully hides all filter chrome (icon rail only). **Mobile** (<768px) stacked layout keeps the full filter row (horizontal scroll if needed).

   | Control | What to try | Expected |
   | --- | --- | --- |
   | Search | Agency name, trade, license, solicitation #, or scope keyword | List narrows; count updates |
   | Status | Source stages (Early Research, Pre-Solicitation, Active Solicitation) or workflow (Watching, Pursuing, Submitted, Awarded, Lost, Closed) | Only that stage or workflow status (or “All active”) |
   | Island | Oahu, Maui, Statewide, etc. | Island/location filter applied |
   | Source | A seeded source name vs All sources | Only that `source_key` |
   | Sort | Due date (default), Match % ↓ (highest fit first), Match % ↑ (lowest fit first) | Reorders inbox by bid due date or company fit score |

2. When any filter or non-default sort is active, an **X** (Clear filters) icon appears on the filter line.
3. Click **Clear** (or **Clear filters** in the empty state) and confirm search, dropdowns, and sort reset to defaults and the full active list returns.
4. Force a no-match query and confirm empty copy: **No opportunities match these filters**.

**Pass:** Filters change the list; Clear restores the unfiltered inbox; header stays two compact lines.

---

## 5. Browse inbox rows

1. In the list pane, click several compact rows. Confirm each row shows only:

   - **Title** (single-line truncate)
   - **Location** · **due date** (muted meta; overdue/urgent styling when relevant)
   - **Source stage** (Early Research, Pre-Solicitation, Active Solicitation, or Amendment when addenda exist)
   - Optional **workflow** badge when not open (Watching, Pursuing, Submitted, Awarded, Lost, Ignored/Closed)
   - **Match %** (or — when unscored)

2. Confirm rows do **not** show procurement-type badges, agency, solicitation #, or addenda chips (those live in Details).
3. Confirm selecting a row highlights it and updates the Details pane (right on tablet/desktop, below list on mobile).
4. On **tablet** (768px–1023px), confirm the horizontal inbox | details layout: inbox starts as a collapsed 48px icon rail; drag the handle right to expand the full list. On **desktop** (≥1024px), drag the vertical handle between inbox and Details to resize the columns; confirm list/detail text truncates or reflows to fit, and reload to confirm the widths persist.
5. On tablet or desktop, drag the list pane fully left until it collapses to a narrow icon rail (fit % or status dot per opportunity). Hover for title tooltips; click an icon to select and update Details. Drag the handle right to restore the full list.
6. On **mobile** (<768px), confirm selecting a row scrolls the Details pane into view.

**Pass:** Dense list shows essentials only; Details carries the rest; desktop column widths are adjustable.

---

## 6. Review opportunity details

With a notice selected, in the **Details** pane verify:

1. **Header:** type, source stage, optional workflow badge, fit badge, full title, agency, location.
2. **Schedule block:** bid deadline, time remaining, questions due, pre-bid / site visit.
3. **Plain-English scope:** SAM noticedesc HTML is converted to Markdown and rendered with the shared `MarkdownRenderer` (headings, lists, links, emphasis). Selecting a notice also lazy-backfills older URL-only records.
4. **Primary point of contact:** name, title, email, phone (SAM prefers `type=primary`).
5. **Contracting office:** formatted SAM `officeAddress` when present.
6. **Trades** and **license requirements** (badges or “Not identified”).
7. **Why this may fit** (green) when `fit_reasons` exist.
8. **Risks and requirements to verify** (amber) when `risk_flags` exist.
9. **Commercial fields:** estimated value, bid bond, prevailing wage, mandatory site visit.
10. **Documents:** clickable attachment links (ingest status after Pursue); addenda count; solicitation / source key.
11. Click **Original notice** — opens `source_url` in a new tab.

**Pass:** Detail fields match the selected row; external link opens the portal notice.

---

## 7. Watch an opportunity

1. Select a notice that has **no** linked project.
2. Click **Watch** — the button becomes active (**Watching**).
3. Confirm a **Watching** workflow badge appears; the source-stage badge (Early Research / Pre-Solicitation / Active Solicitation) stays unchanged.
4. Filter to **Watching** and confirm the notice appears.
5. Click **Watching** again to turn watch off — workflow returns to open (`none`); source stage is unchanged.

**Pass:** Watch toggles workflow status only; list/dashboard refresh; source stage does not change.

---

## 8. Ignore an opportunity

1. Select a notice without a linked project that is not already Ignored.
2. Click **Ignore**.
3. Confirm status becomes **Ignored**.
4. Default **All active** filter should typically hide ignored items from the main active inbox (switch status filter if needed to find it again via API/docs if testing ignored visibility).

**Pass:** Ignore succeeds; badge updates; actions remain disabled while the request is pending.

---

## 9. Pursue and create a bid workspace

1. Select a notice with **no** existing project (`project_id` empty) — button label **Pursue and create workspace**.
2. Before pursuing, confirm the **Documents** list shows clickable attachment names (not just a count).
3. Click **Pursue and create workspace**.
4. Expect toast: **Bid workspace created** (or **Bid workspace opened** if one already existed).
5. App should navigate to `/projects/{project_id}`.
6. On the project, confirm:
   - Project name matches the opportunity title (or is clearly tied to it).
   - An artifact titled **Opportunity Intake Summary** exists with solicitation, agency, and notice context.
   - Each discovered solicitation file appears as a **Source** and begins extract/embed processing (worker must be running).
7. Return to Opportunity Hub, select the same notice:
   - Status should reflect pursuit (`pursuing`).
   - Primary action becomes **Open bid workspace** (link) instead of Pursue.
   - Documents list shows ingest status badges (`Queued` / `Failed`) and workspace links where sources were created.
8. Click **Open bid workspace** and confirm you land on the same project.
9. Click Pursue again on an already-linked notice: it must **not** re-download or duplicate sources.

**Pass:** Pursue creates (or reuses) a project, downloads attachments best-effort into project sources, links the opportunity, and navigation works both ways.

See also: [opportunity-pursue-documents.md](opportunity-pursue-documents.md) for a focused manual checklist.

---

## 10. Archive an opportunity

1. Select a notice you are willing to hide from the default inbox.
2. Click **Archive**.
3. Confirm it disappears from the default list (archived notices are excluded unless requested via API with `include_archived`).
4. Refresh the page; it should stay gone from the default UI.

**Pass:** Archived notice leaves the hub list; no crash or stuck loading state.

---

## 11. Empty and loading states

| State | How to see it | Expected UI |
| --- | --- | --- |
| Loading | Hard refresh with network throttling | Skeleton rows in the inbox |
| Empty (no data) | Fresh DB before any sync | “The inbox is ready” + Sync SAM.gov CTA |
| Empty (filters) | Impossible search string | “No opportunities match these filters” + Clear |
| No selection | Empty list | Details empty: “Select an opportunity” |

**Pass:** Empty/loading copy is clear; Sync/Clear CTAs work from those states.

---

## 12. Company fit scoring (optional)

Configure the company profile under **Manage → Company Profile** (or env bootstrap — see [opportunity-scoring-profile.md](./opportunity-scoring-profile.md)). With licenses, preferred trades, and max project value set:

1. Sync or refresh opportunities (saving the profile also auto-rescores).
2. High-fit notices should show **% fit** badges (≥ 75 often styled as stronger “fit”).
3. Detail panel should list **Why this may fit** and/or risk flags aligned with the profile.

If the profile is incomplete, scores are capped (false “pursue” signals are suppressed). Incomplete profile still allows the hub to work; fit badges may stay lower.

**Pass:** Fit badges and reason lists appear when scoring data exists; incomplete profile does not break the UI.

---

## Quick verification checklist

- [ ] `/opportunities` opens from nav
- [ ] Sources auto-seed (header source count &gt; 0)
- [ ] Sync SAM.gov succeeds with valid API key
- [ ] Sync fails clearly without a key
- [ ] Overview metrics update after sync/status changes
- [ ] Search, status, island, source filters work; Clear resets them
- [ ] Selecting a row fills Details
- [ ] Original notice opens externally
- [ ] Watch / Ignore update status
- [ ] Pursue creates project + intake artifact and navigates
- [ ] Open bid workspace returns to that project
- [ ] Archive removes from default inbox
- [ ] Empty and loading states behave as above

---

## API smoke checks (optional)

With the API up and auth header if required:

| Action | Endpoint |
| --- | --- |
| Health | `GET /health` |
| Dashboard | `GET /opportunities/dashboard` |
| List | `GET /opportunities` |
| Sources | `GET /opportunity-sources?enabled=true` |
| Seed sources | `POST /opportunity-sources/seed` |
| Sync SAM.gov | `POST /opportunity-sources/sam_gov_hawaii/sync?days_back=14` |
| Import SAM.gov URL | `POST /opportunity-sources/sam_gov_hawaii/import-url` body `{ "url": "https://sam.gov/opp/.../view" }` |
| Set status | `POST /opportunities/{id}/status` body `{"status":"watching"}` (workflow only; does not change `source_stage`) |
| Pursue | `POST /opportunities/{id}/pursue` |
| Archive | `DELETE /opportunities/{id}` |

Interactive docs: `http://127.0.0.1:5055/docs`

---

## Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Page errors / ConnectionGuard | API down | Start API; confirm `/health` |
| Sync toast failure / 422 | Missing `SAM_GOV_API_KEY` | Set key in `.env`, restart API |
| Sync toast failure / 502 | SAM.gov outage or network | Retry later; check API logs |
| No fit scores / low caps | Incomplete scoring profile | Set ready fields under Company Profile |
| Pursue fails | API/DB error | Check API logs; retry; confirm SurrealDB |
| Archived item still visible | Stale cache | Use page refresh; confirm list refetch |

---

## Related config

See `.env.example` section **OPTIONAL: Opportunity Hub** for `SAM_GOV_API_KEY` and optional scoring-profile bootstrap.

For field-by-field setup, readiness rules, rescoring, and verification steps, see [opportunity-scoring-profile.md](./opportunity-scoring-profile.md).
