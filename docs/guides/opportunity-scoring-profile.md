# Configuring the company fit scoring profile

Step-by-step guide to set, validate, and verify the company-fit profile used by the Opportunity Hub.

---

## What it does

Every imported opportunity is scored with a deterministic rubric (100 points total). The scorer loads **one** company profile, in this order:

1. **Database** — saved from **Manage → Company Profile** (`/settings/company-profile`)
2. **Environment fallback** — `OPPORTUNITY_SCORING_PROFILE_JSON` if nothing has been saved yet
3. **Built-in defaults** — incomplete profile (scores capped)

Scores appear in the Opportunity Hub as **% fit**, **Why this may fit**, and risk flags.

| Outcome | When |
| --- | --- |
| `pursue` | Score ≥ 75 **and** profile is ready |
| `review` | Score 50–74, or ready-profile gaps, or incomplete profile |
| `no_bid` | Score &lt; 50, deadline passed, or cancellation-like risk text |

If the profile is missing or incomplete, scores are **capped at 74** so the UI never auto-suggests pursue from a blank default.

---

## Prerequisites

1. Opportunity Hub working (see [opportunity-hub.md](./opportunity-hub.md)).
2. API and frontend running; SurrealDB available.
3. Optional: at least a few synced opportunities so you can see scores change after save.

---

## 1. Understand a “ready” profile

The profile is **ready** only when all of these are set:

| Field | Required for ready? | Notes |
| --- | --- | --- |
| `licenses` | Yes | Non-empty list |
| `preferred_trades` | Yes | Non-empty list |
| `supported_islands` | Yes | Non-empty (defaults exist if omitted entirely) |
| `max_project_value` | Yes | Must be a number, not omitted/`null` |

Other fields improve scoring but are not required for readiness:

- `name`, `min_project_value`, `minimum_bid_days`, `max_bond_percent`
- `preferred_keywords`, `excluded_keywords`

**Incomplete profile behavior:** score ≤ 74, recommendation stays `review`, risk flag mentions the 74 cap.

---

## Primary path (UI)

1. Open **Manage → Company Profile**.
2. Click **Fill from file** and upload a capability statement, license list, resume, or similar document (any type content-core can extract).
3. Review the drafted fields; edit as needed.
4. Click **Save and rescore**.
5. Confirm `source` is **Saved in database** and Opportunity Hub fit scores update.

The fill button uses the shared `POST /tools/autofill` endpoint with a caller-supplied JSON Schema (reusable by other forms).

---

## 3. Field reference

| Field | Type | Default (if omitted) | Effect on scoring |
| --- | --- | --- | --- |
| `name` | string | `"Default Hawaii contractor"` | Display / identification only |
| `licenses` | string[] | `[]` | Match against notice `license_requirements` (trade/license category, max 25 with trades) |
| `preferred_trades` | string[] | `[]` | Match against notice `trades` |
| `supported_islands` | string[] | All major HI islands + Statewide | Location category (max 15). Include `"Statewide"` to treat statewide work as in-area |
| `min_project_value` | number | `0` | Below this → lower capacity points (“below preferred minimum”) |
| `max_project_value` | number \| null | `null` | Required for ready. In-range → full capacity points; slightly over (≤ 1.25×) → review; far over → 0 capacity |
| `minimum_bid_days` | int | `14` | Preferred runway before bid due; shorter windows score lower on schedule |
| `max_bond_percent` | number | `10` | If notice bond % exceeds this, risk/addenda category loses points |
| `preferred_keywords` | string[] | construction/renovation-style defaults | Matched in title, scope, description, trades, licenses |
| `excluded_keywords` | string[] | office supplies / software / medical / food defaults | Any match zeros the experience category and adds risk |

Matching is case-insensitive and fuzzy (substring either way after normalizing punctuation).

**Island values the scorer understands on opportunities:** `Oahu`, `Hawaii`, `Maui`, `Kauai`, `Molokai`, `Lanai`, `Statewide`, `Pacific`, `Unknown`.

---

## 4. Score categories (100 points)

| Category key | Label | Max | Driven by profile fields |
| --- | --- | --- | --- |
| `trade_license` | Trade and license match | 25 | `preferred_trades`, `licenses` |
| `project_capacity` | Project size and capacity | 20 | `min_project_value`, `max_project_value` |
| `location` | Location and travel fit | 15 | `supported_islands` |
| `schedule` | Schedule and bid runway | 15 | `minimum_bid_days` (+ notice deadline) |
| `experience` | Relevant scope and experience | 15 | `preferred_keywords`, `excluded_keywords` |
| `risk_addenda` | Risk and addendum impact | 10 | `max_bond_percent` (+ notice bond/site visit/docs/addenda) |

Score version string: `opportunity-fit-v1`.

---

## 5. Optional env bootstrap / fallback

Use the env var only when you have not saved a profile in the UI yet (fresh deploy, automation).

1. Open `.env` in the Construction OS repo root.
2. Set a one-line JSON object (see `.env.example`).
3. Restart the API.
4. `GET /opportunities/scoring-profile` should report `source: "env"` until you save from the UI.
5. After the first UI/API save, `source` becomes `"database"` and the env value is ignored.

```env
OPPORTUNITY_SCORING_PROFILE_JSON={"name":"Example Contractor","licenses":["C-5","C-6"],"preferred_trades":["Carpentry","General Building"],"supported_islands":["Oahu","Hawaii"],"min_project_value":100000,"max_project_value":5000000,"minimum_bid_days":14,"max_bond_percent":10,"preferred_keywords":["renovation","construction","tenant improvement","carpentry"],"excluded_keywords":["janitorial","office supplies","software subscription"]}
```

Malformed JSON does **not** crash the API: the scorer falls back to the default incomplete profile.

---

## 6. Verify via API

```powershell
Invoke-WebRequest "http://127.0.0.1:5055/opportunities/scoring-profile" -UseBasicParsing
```

**Pass criteria:**

- `profile_ready` is `true` when licenses, preferred_trades, supported_islands, and max_project_value are set.
- `source` is `database` after a UI/API save.
- `score_version` is `opportunity-fit-v1`.
- `weights` shows the six category maxes (25 / 20 / 15 / 15 / 15 / 10).

Manual bulk rescore (if needed without changing the profile):

```powershell
Invoke-WebRequest -Method POST "http://127.0.0.1:5055/opportunities/rescore" -UseBasicParsing
```

---

## 7. Manual test matrix

| Scenario | How to configure | Expected |
| --- | --- | --- |
| Fresh install, no save, no env | Leave env unset | `source: default`; `profile_ready` false; scores ≤ 74 |
| Env only | Set `OPPORTUNITY_SCORING_PROFILE_JSON`, no UI save | `source: env`; scores follow env profile |
| UI save | Fill ready fields; Save and rescore | `source: database`; toast with rescored count; Hub updates |
| Incomplete save | Save without max value or licenses | Cap at 74; readiness banner lists missing fields |
| Strong match | Ready profile + matching notice | Score often ≥ 75; recommendation `pursue` |
| Excluded keyword | Notice contains excluded term | Experience near 0; risk about excluded work |
| Outside service area | Island not in supported list | Low location points |
| Over capacity | Value ≫ max | Capacity 0 |
| Overdue deadline | Past `bid_due_at` | `no_bid` even if otherwise strong |

---

## 8. Tuning tips

1. Start with **ready** fields only, save/rescore, then tighten keywords.
2. Prefer real Hawaii license codes and trade names as they appear on notices.
3. Add `"Statewide"` to supported islands if you bid statewide work.
4. Keep excluded keywords short and specific.
5. After env-only edits (before first DB save): restart API → check `/opportunities/scoring-profile` → rescore if needed.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `profile_ready: false` after save | Missing licenses, trades, islands, or max value | Fill all four; save again |
| Scores never change after UI save | Save failed, or looking at archived notices | Check toast/errors; archived are skipped on auto-rescore |
| Always capped at 74 | Incomplete profile or invalid env JSON | Fix ready fields in UI; check `source` |
| Never see `pursue` | Profile not ready, or score &lt; 75 | Ready profile + strong matches |
| Env changes ignored | Database profile already saved | Edit Company Profile in UI, or clear the DB singleton |

---

## Quick checklist

- [ ] Company Profile page filled with ready fields
- [ ] Saved successfully; `source` is `database`
- [ ] `GET /opportunities/scoring-profile` shows `profile_ready: true`
- [ ] Opportunity Hub shows updated % fit for sample matches and mismatches

---

## Related

- [Opportunity Hub manual guide](./opportunity-hub.md)
- `.env.example` — optional bootstrap only
- Implementation: `construction_os/domain/opportunity_scoring_profile.py`, `construction_os/services/opportunity_scoring.py`
- API: `GET`/`PUT /opportunities/scoring-profile`, `POST /opportunities/rescore`
- UI: `/settings/company-profile`
