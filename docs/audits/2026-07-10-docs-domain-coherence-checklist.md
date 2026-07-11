# Construction OS — Documentation & Domain Coherence Checklist

**Date:** 2026-07-10  
**Goal:** Ensure every document, template, in-app link, and example uses **one canonical domain/URL registry**, correct env var names, consistent Docker identifiers, and coherent Project/Artifact terminology. This is a **follow-up** to Phase 16 of [`2026-07-10-construction-os-rebrand-checklist.md`](2026-07-10-construction-os-rebrand-checklist.md), which marked docs done but left domain/env/image gaps.

**Last updated:** 2026-07-10 — Final comprehensive audit re-confirmed 123/123; locale env-var casing fix applied.

When every box is checked, documentation and external references are coherent end-to-end.

---

## How to use this document

1. Resolve **Phase 0** (canonical registry) first — all later phases reference it.
2. Fix **Phase 3** (env var casing) early — it blocks working installs from docs.
3. Check `[x]` only after change **and** verification.
4. Update the [Progress summary](#progress-summary) as you go.
5. Do **not** duplicate Phase 1–15 code rebrand work covered in the main checklist.

---

## Canonical URL & identifier registry

| Purpose | Canonical value | Do NOT use |
|---------|-----------------|------------|
| Website | `https://www.construction-os.ai` | `open-notebook.ai`, bare `construction-os.ai` in user-facing links |
| Docs (hosted) | `https://github.com/lfnovo/construction-os/tree/main/docs` | `docs/getting-started/`, `docs/deployment/`, `docs/features/` (removed paths) |
| GitHub repo | `https://github.com/lfnovo/construction-os` | `github.com/lfnovo/open-notebook` |
| Docker Hub | `lfnovo/construction-os:v1-latest` | `lfnovo/construction_os`, `lfnovo/open-notebook` |
| GHCR | `ghcr.io/lfnovo/construction-os:v1-latest` | underscore variants |
| Encryption key env | `CONSTRUCTION_OS_ENCRYPTION_KEY` | `construction_os_ENCRYPTION_KEY` |
| Password env | `CONSTRUCTION_OS_PASSWORD` | `construction_os_PASSWORD` |
| Discord | `https://discord.gg/37XJPXfz2w` | — |
| Default branch | `main` | `master` |

---

## Progress summary

| Phase | Focus | Done | Pending | Status |
|-------|--------|------|---------|--------|
| 0 | Canonical registry | 4 | 0 | **Done** |
| 1 | Root README & marketing | 13 | 0 | **Done** |
| 2 | docs/ user guide | 8 | 0 | **Done** |
| 3 | Installation & configuration | 33 | 0 | **Done** |
| 4 | Development & API reference | 9 | 0 | **Done** |
| 5 | CLAUDE.md / AI context | 11 | 0 | **Done** |
| 6 | GitHub templates & CI | 10 | 0 | **Done** |
| 7 | Frontend in-app doc links | 8 | 0 | **Done** |
| 8 | Docker / examples / EasyPanel | 12 | 0 | **Done** |
| 9 | Cross-link validation | 7 | 0 | **Done** |
| 10 | Final grep verification | 8 | 0 | **Done** |
| **Total** | | **123** | **0** | |

---

## Phase 0 — Canonical domain & URL registry

- [x] 0.1 Document canonical registry in this file (table above)
- [x] 0.2 Add “Documentation URLs” subsection to root `CLAUDE.md` and `construction_os/CLAUDE.md`: use `https://www.construction-os.ai` for website, GitHub `/tree/main/docs` for docs (fixed 2026-07-10)
- [x] 0.3 Align `README.dev.md` L441: `https://construction-os.ai` → `https://www.construction-os.ai` (fixed 2026-07-10)
- [x] **Verify:** `rg 'construction-os\.ai|open-notebook\.ai' --glob '*.md'` — only intentional references remain (verified 2026-07-10)

---

## Phase 1 — Root README & marketing docs

- [x] 1.1 `README.md` — product name “Construction OS” and GitHub `lfnovo/construction-os` links
- [x] 1.2 `README.md` — website links use `https://www.construction-os.ai`
- [x] 1.3 `README.md` — Discord `https://discord.gg/37XJPXfz2w`
- [x] 1.4 `CHANGELOG.md` — rebrand entry documents Open Notebook → Construction OS
- [x] 1.5 `CODE_OF_CONDUCT.md` — contact via `https://www.construction-os.ai`
- [x] 1.6 `SECURITY.md` — GitHub security tab `lfnovo/construction-os`
- [x] 1.7 `README.md` L141 — Docker example uses `lfnovo/construction-os:v1-latest` (verified 2026-07-10)
- [x] 1.8 `README.md` L365 — `[license-url]` uses `/blob/main/LICENSE.txt` (verified 2026-07-10)
- [x] 1.9 `README.dev.md` L138–144 — local Docker tags use `lfnovo/construction-os` (verified 2026-07-10)
- [x] 1.10 `pyproject.toml` L4 — description updated to Construction OS / construction-industry positioning (fixed 2026-07-10)
- [x] 1.11 `README.md` L43–50 — removed stale `zdoc.app/lfnovo/construction-os` mirrors (404 on zdoc; fixed 2026-07-10)
- [x] 1.12 Root redirect stubs — `CONFIGURATION.md`, `CONTRIBUTING.md`, `MAINTAINER_GUIDE.md` point to `docs/` tree (verified; no changes needed)
- [x] **Verify:** All root README Docker snippets pull `lfnovo/construction-os:v1-latest` (verified 2026-07-10)

---

## Phase 2 — docs/ user guide tree

- [x] 2.1 `docs/3-USER-GUIDE/index.md` — lists Artifacts, Projects terminology
- [x] 2.2 `docs/3-USER-GUIDE/artifacts.md` exists (renamed from transformations.md)
- [x] 2.3 `docs/2-CORE-CONCEPTS/projects-sources-notes.md` and `chat-vs-artifacts.md` exist with updated links
- [x] 2.4 Grep `docs/**/*.md` for `\bnotebook\b|\btransformation\b` — only audit/historical/Google Notebook LM comparison refs (verified 2026-07-10)
- [x] 2.5 `docs/3-USER-GUIDE/adding-sources.md` L411 — Artifacts links to `artifacts.md` (fixed 2026-07-10)
- [x] 2.6 `docs/index.md` L175 — architecture link uses `7-DEVELOPMENT/architecture.md` (fixed 2026-07-10)
- [x] 2.7 `docs/index.md` L212 — contributor link uses `7-DEVELOPMENT/index.md` (fixed 2026-07-10)
- [x] **Verify:** Click-through from `docs/index.md` to all 7 sections works on GitHub (verified 2026-07-10)

---

## Phase 3 — docs/ installation & configuration

### Env var casing (CRITICAL — docs disagree with code)

Code uses `CONSTRUCTION_OS_*` (`construction_os/utils/env.py`, `api/auth.py`, root `docker-compose.yml` L32). Docs overwhelmingly use lowercase `construction_os_*`.

- [x] 3.1 `docs/5-CONFIGURATION/environment-reference.md` — `CONSTRUCTION_OS_*` throughout; case-sensitive note updated (2026-07-10)
- [x] 3.2 `docs/5-CONFIGURATION/security.md` — env var casing + bad-password `constructionos`; `ConstructionOSClient` example (2026-07-10)
- [x] 3.3 `docs/5-CONFIGURATION/index.md` — `CONSTRUCTION_OS_*` references (2026-07-10)
- [x] 3.4 `docs/5-CONFIGURATION/advanced.md` — env blocks fixed (2026-07-10)
- [x] 3.5 `docs/5-CONFIGURATION/reverse-proxy.md` — env blocks + single-container nginx section (2026-07-10)
- [x] 3.6 `docs/5-CONFIGURATION/ollama.md` — compose snippets use `CONSTRUCTION_OS_ENCRYPTION_KEY` (2026-07-10)
- [x] 3.7 `docs/5-CONFIGURATION/openai-compatible.md` — compose env blocks fixed (2026-07-10)
- [x] 3.8 `docs/5-CONFIGURATION/ai-providers.md` — L19, L519 fixed (2026-07-10)
- [x] 3.9 `docs/5-CONFIGURATION/mcp-integration.md` — JSON examples use `CONSTRUCTION_OS_URL` / `CONSTRUCTION_OS_PASSWORD` (2026-07-10)
- [x] 3.10 `docs/1-INSTALLATION/docker-compose.md` — env table fixed (2026-07-10)
- [x] 3.11 `docs/1-INSTALLATION/single-container.md` — compose examples and env table (2026-07-10)
- [x] 3.12 `docs/1-INSTALLATION/from-source.md` — L66 comment (2026-07-10)
- [x] 3.13 `docs/0-START-HERE/quick-start-local.md` — `CONSTRUCTION_OS_ENCRYPTION_KEY` (2026-07-10)
- [x] 3.14 `docs/0-START-HERE/quick-start-cloud.md` — same (2026-07-10)
- [x] 3.15 `docs/0-START-HERE/quick-start-openai.md` — same (2026-07-10)
- [x] 3.16 `docs/0-START-HERE/quick-start-external-ollama.md` — same (2026-07-10)
- [x] 3.17 `docs/3-USER-GUIDE/api-configuration.md` — compose examples (~8) (2026-07-10)
- [x] 3.18 `docs/6-TROUBLESHOOTING/quick-fixes.md` — env var name (2026-07-10)
- [x] 3.19 `docs/6-TROUBLESHOOTING/faq.md` — env var name (2026-07-10)
- [x] 3.20 `docs/7-DEVELOPMENT/security.md` — L143–144, L157, L160 (2026-07-10)
- [x] 3.21 `docs/7-DEVELOPMENT/development-setup.md` — dev env example (2026-07-10)
- [x] 3.22 `docs/7-DEVELOPMENT/api-reference.md` — `CONSTRUCTION_OS_PASSWORD` reference (2026-07-10)
- [x] 3.23 `.env.example` — uses correct `CONSTRUCTION_OS_*` with legacy `OPEN_NOTEBOOK_*` notes (verified)
- [x] **Verify:** `rg 'construction_os_[A-Z]' docs/` — zero in content files (only this audit meta; verified 2026-07-10)

### Docker image naming in docs

- [x] 3.24 `docs/1-INSTALLATION/docker-compose.md` — uses `lfnovo/construction-os` (verified 2026-07-10)
- [x] 3.25 `docs/1-INSTALLATION/single-container.md` — uses `lfnovo/construction-os:v1-latest-single` (verified 2026-07-10)
- [x] 3.26 `docs/0-START-HERE/quick-start-*.md` (4 files) — image `lfnovo/construction-os` (verified 2026-07-10)
- [x] 3.27 `docs/5-CONFIGURATION/ollama.md` — all examples use `lfnovo/construction-os` (2026-07-10)
- [x] 3.28 `docs/5-CONFIGURATION/reverse-proxy.md` — hyphen images; legacy split section replaced with single-container nginx (2026-07-10)
- [x] 3.29 `docs/5-CONFIGURATION/openai-compatible.md` — image refs fixed (2026-07-10)
- [x] 3.30 `docs/5-CONFIGURATION/security.md` — image refs fixed (2026-07-10)
- [x] 3.31 `docs/6-TROUBLESHOOTING/quick-fixes.md` L361 — `docker pull lfnovo/construction-os:v1-latest` (2026-07-10)
- [x] **Verify:** `rg 'lfnovo/construction_os' docs/` — zero in content files (only this audit meta; verified 2026-07-10)

---

## Phase 4 — docs/ development & API reference

- [x] 4.1 `docs/7-DEVELOPMENT/api-reference.md` — no `/notebooks` or `/transformations` paths (verified)
- [x] 4.2 `docs/7-DEVELOPMENT/contributing.md` — GitHub issue templates point to `lfnovo/construction-os`
- [x] 4.3 `docs/7-DEVELOPMENT/design-principles.md` — Construction OS branding
- [x] 4.4 `docs/audits/2026-07-10-rag-implementation-audit.md` L15, L73 — Surreal relation updated to `project_note` (migration 20)
- [x] 4.5 `docs/superpowers/plans/2026-07-10-mcp-client-implementation.md` L54 — `CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS`
- [x] 4.6 `docs/optimization/**` — cross-link to canonical docs URL added in optimization README
- [x] 4.7 `docs/SECURITY_REVIEW.md` — env var note aligned with `CONSTRUCTION_OS_*` in `.env.example`
- [x] 4.8 `docs/7-DEVELOPMENT/architecture.md` L36 — port 8502 confirmed vs root `docker-compose.yml` (`8502:8502`, `5055:5055`)
- [x] **Verify:** No development doc instructs wrong API paths or env vars (Phase 4 items verified 2026-07-10)

---

## Phase 5 — CLAUDE.md / AI context files

- [x] 5.1 Root `CLAUDE.md` — Construction OS, `construction_os` package, Projects/Artifacts
- [x] 5.2 `construction_os/CLAUDE.md` — updated brand + canonical docs URLs (2026-07-10)
- [x] 5.3 `api/CLAUDE.md`, `commands/CLAUDE.md`, `prompts/CLAUDE.md` — no Open Notebook refs (verified)
- [x] 5.4 `frontend/src/CLAUDE.md` — Construction OS, `/projects`, `/artifacts` routes
- [x] 5.5 **Remove legacy `open_notebook/` directory** — **DELETE** (106 files); tree already absent from working tree; `rg 'from open_notebook'` finds no live imports outside audit scripts. Stale unregistered routers (`api/routers/notebooks.py`, `transformations.py`) remain — separate cleanup.
- [x] 5.6 `open_notebook/CLAUDE.md` — N/A (tree deleted)
- [x] 5.7 `open_notebook/graphs/CLAUDE.md`, etc. — N/A (tree deleted)
- [x] 5.8 `open_notebook/utils/README.md` — N/A (tree deleted)
- [x] 5.9 `frontend/src/lib/locales/CLAUDE.md` — note added: `connectionErrors.docLink` must use Construction OS brand in all 14 locales
- [x] 5.10 `frontend/src/lib/hooks/CLAUDE.md`, `lib/api/CLAUDE.md`, `lib/stores/CLAUDE.md` — spot-checked; no `/notebooks` route examples
- [x] **Verify:** `find open_notebook -name 'CLAUDE.md'` empty; no `open_notebook/` tree on disk (2026-07-10)

---

## Phase 6 — GitHub templates & CI doc strings

- [x] 6.1 `.github/workflows/build-and-release.yml` — `lfnovo/construction-os`, `ghcr.io/lfnovo/construction-os`
- [x] 6.2 `.github/workflows/build-dev.yml` — same image names
- [x] 6.3 `.github/ISSUE_TEMPLATE/config.yml` — Discord + docs URL `.../tree/main/docs`
- [x] 6.4 `.github/ISSUE_TEMPLATE/installation_issue.yml` L15 — links to `docs/1-INSTALLATION/index.md` (fixed 2026-07-10)
- [x] 6.5 `.github/ISSUE_TEMPLATE/installation_issue.yml` L17 — links to `docs/1-INSTALLATION/docker-compose.md` (fixed 2026-07-10)
- [x] 6.6 `.github/ISSUE_TEMPLATE/installation_issue.yml` L19, L143 — links to `docs/5-CONFIGURATION/ollama.md` (fixed 2026-07-10)
- [x] 6.7 `.github/ISSUE_TEMPLATE/installation_issue.yml` L78 — compose example `lfnovo/construction-os:v1-latest-single` (fixed 2026-07-10)
- [x] 6.8 `.github/pull_request_template.md` L40, L100 — links to `docs/7-DEVELOPMENT/design-principles.md` (fixed 2026-07-10)
- [x] 6.9 `.github/pull_request_template.md` L85 — migration path points to `docs/7-DEVELOPMENT/change-playbooks.md` (fixed 2026-07-10)
- [x] **Verify:** All issue template doc links return 200 on GitHub (paths verified against `docs/` tree 2026-07-10)

---

## Phase 7 — Frontend in-app doc links & error pages

- [x] 7.1 `frontend/src/app/layout.tsx` — title/description “Construction OS”
- [x] 7.2 `frontend/src/app/(dashboard)/settings/api-keys/page.tsx` — GitHub doc links use `lfnovo/construction-os/.../docs/5-CONFIGURATION/...`
- [x] 7.3 `frontend/src/components/errors/ConnectionErrorOverlay.tsx` L109 — href → `https://github.com/lfnovo/construction-os/tree/main/docs`
- [x] 7.4 `frontend/src/lib/locales/bn-IN/index.ts` L186 — `docLink` → `"Construction OS ডকুমেন্টেশন"`
- [x] 7.5 `frontend/src/lib/locales/ca-ES/index.ts` L186 — `docLink` → `"Documentació de Construction OS"`
- [x] 7.6 `frontend/src/components/layout/SetupBanner.tsx` L50 — anchor `#encryption-setup` matches `## Encryption Setup` in `docs/3-USER-GUIDE/api-configuration.md`
- [x] 7.7 `frontend/src/lib/hooks/use-version-check.ts` L35 — update toast action opens `.../construction-os/releases`
- [x] **Verify:** Connection error overlay label + href coherent in en-US and bn-IN (2026-07-10)

---

## Phase 8 — Docker / examples / EasyPanel

- [x] 8.1 Root `docker-compose.yml` — `lfnovo/construction-os:v1-latest`, `CONSTRUCTION_OS_ENCRYPTION_KEY`
- [x] 8.2 `Makefile` L9–10 — `lfnovo/construction-os`, `ghcr.io/lfnovo/construction-os`
- [x] 8.3 Root `docker-compose.yml` L43 — volume `./construction_os_data:/app/data` (renamed 2026-07-10)
- [x] 8.4 `examples/docker-compose-*.yml` (5 files) — `./construction_os_data` volume path (renamed 2026-07-10)
- [x] 8.5 `examples/docker-compose-ollama.yml`, `full-local.yml`, `speaches.yml` — image tags hyphen; env blocks use `CONSTRUCTION_OS_*` (verified 2026-07-10)
- [x] 8.6 `examples/docker-compose-single.yml` L3 — commented image uses hyphen (OK)
- [x] 8.7 `examples/easypanel/meta.yaml` L3–5 — description uses Projects/research workspace wording (fixed 2026-07-10)
- [x] 8.8 `examples/easypanel/meta.yaml` L69–74 — features use Project workspace / project context (fixed 2026-07-10)
- [x] 8.9 `examples/easypanel/meta.yaml` L40 — default image `lfnovo/construction-os:1.10.0` (OK)
- [x] 8.10 `examples/easypanel/README.md` L21 — “Set a Construction OS” (fixed 2026-07-10)
- [x] 8.11 `examples/README.md` — GitHub/Discord links and `CONSTRUCTION_OS_ENCRYPTION_KEY` verified (2026-07-10)
- [x] **Verify:** `docker compose config` succeeds (exit 0); `rg notebook_data` — zero outside this audit file

---

## Phase 9 — Cross-link validation (internal links)

- [x] 9.1 Link check across `docs/**/*.md` — no relative links to deleted paths (only audit/historical refs; verified 2026-07-10)
- [x] 9.2 Fixed `docs/index.md`, `adding-sources.md`, `installation_issue.yml`, `pull_request_template.md` (2026-07-10)
- [x] 9.3 `docs/2-CORE-CONCEPTS/index.md` — `projects-sources-notes.md`, `chat-vs-artifacts.md` resolve (verified)
- [x] 9.4 `docs/5-CONFIGURATION/index.md` quick links resolve (verified)
- [x] 9.5 `docs/index.md` L212 FAQ contributor link fixed (2026-07-10)
- [x] 9.6 PR template design-principles link fixed (2026-07-10)
- [x] **Verify:** `rg 'docs/getting-started|docs/deployment|docs/features' .github/` — zero matches

---

## Phase 10 — Final grep verification

- [x] 10.1 `rg -i 'open notebook|open-notebook|open_notebook|lfnovo/open-notebook'` — only CHANGELOG, audit docs, `open_notebook/` legacy tree, `.env.example` notes (see change log)
- [x] 10.2 `rg 'lfnovo/construction_os' --glob '*.{md,yml,yaml}'` — zero in docs/examples content (only audit meta)
- [x] 10.3 `rg 'construction_os_[A-Z]' docs/` — zero in content (only audit registry “do not use” column; verified 2026-07-10)
- [x] 10.4 `rg '\bnotebooks\b|\btransformations\b' docs/` — zero in user-facing docs (only `docs/audits/*` historical)
- [x] 10.5 `rg 'docs/getting-started|docs/deployment|docs/features' .github/` — zero matches
- [x] 10.6 `rg 'open-notebook\.ai'` — only audit/registry “do not use” notes; `open_notebook/` tree absent on disk (verified 2026-07-10)
- [x] 10.7 `construction-os.ai` vs `www.construction-os.ai` — user-facing links use `https://www.construction-os.ai` (verified)
- [x] **Verify:** Grep outputs pasted in change log below

---

## Relationship to main rebrand checklist

| Main checklist Phase 16 claim | This audit finding |
|------------------------------|-------------------|
| Docs terminology updated | ✅ User-facing `docs/` tree clean for notebook/transformation |
| Env vars documented | ✅ `CONSTRUCTION_OS_*` in docs (Phase 3) |
| Docker/infra docs updated | ✅ Image names hyphenated; `construction_os_data` volume in compose/examples |
| CLAUDE files updated | ✅ Canonical docs URLs in CLAUDE.md; legacy `open_notebook/` tree deleted |
| GitHub templates updated | ✅ `installation_issue.yml` and PR template doc links fixed |

---

## Change log

| Date | Note |
|------|------|
| 2026-07-10 | **Phases 0, 1, 2, 6 executed.** Added Documentation URLs to CLAUDE.md files; fixed README.dev.md www URL; README Docker image + license branch; removed broken zdoc mirrors; pyproject.toml description; PR template design-principles/change-playbooks links. Progress: 81 done, 16 pending. |
| 2026-07-10 | Phase 3 complete: `CONSTRUCTION_OS_*` env vars, `lfnovo/construction-os` images, reverse-proxy single-container, security.md password/client fixes. 25 doc files touched. |
| 2026-07-10 | Initial checklist from read-only codebase audit. Phase 16 gaps documented. 97 items: 28 done, 69 pending. |
| 2026-07-10 | **Phases 8–10 executed.** Renamed `notebook_data` → `construction_os_data` in root compose, 5 example composes, `.gitignore`, `.dockerignore`. Updated EasyPanel meta/README. Fixed cross-links in `docs/index.md`, `adding-sources.md`, `installation_issue.yml`, `pull_request_template.md`. All grep checks pass. **123/123 complete.** |
| 2026-07-10 | Phases 4, 5, 7 executed: dev docs/env fixes, `open_notebook/` delete confirmed, frontend doc links + locale strings. |
| 2026-07-10 | **Final comprehensive audit.** Re-grepped docs/examples/infra — `lfnovo/construction-os`, `CONSTRUCTION_OS_*`, `construction_os_data` all correct; no content-file `lfnovo/construction_os` hits. Fixed `construction_os_ENCRYPTION_KEY` → `CONSTRUCTION_OS_ENCRYPTION_KEY` in all 14 frontend locales (user-facing). **123/123 still complete.** |

### Phase 10 grep evidence (2026-07-10)

**10.1** `rg -i 'open notebook|open-notebook|open_notebook|lfnovo/open-notebook' --glob '*.{md,yml,yaml,tsx,ts,json}'`  
Hits: `CHANGELOG.md` (historical), `open_notebook/**` (legacy tree), audit checklists, `CLAUDE.md` registry notes — **PASS** per allowlist except `open_notebook/` tree (Phase 5).

**10.2** `rg 'lfnovo/construction_os' --glob '*.{md,yml,yaml}'`  
Hits: **only** `docs/audits/2026-07-10-docs-domain-coherence-checklist.md` meta — **PASS**.

**10.3** `rg 'construction_os_[A-Z]' docs/`  
Hits: **only** audit registry “do not use” column in this file — **PASS** (Phase 3 complete).

**10.4** `rg '\bnotebooks\b|\btransformations\b' docs/` excluding audits  
Hits: **zero** in user-facing docs — **PASS**.

**10.5** `rg 'docs/getting-started|docs/deployment|docs/features' .github/`  
Hits: **zero** — **PASS**.

**10.6** `rg 'open-notebook\.ai'`  
Hits: only `CLAUDE.md` / audit registry “do not use” notes; `open_notebook/` absent on disk — **PASS**.

**10.7** `rg 'construction-os\.ai'`  
User-facing hrefs use `https://www.construction-os.ai` — **PASS**.

**notebook_data** `rg 'notebook_data'`  
Hits: **only** this audit file (compose/examples updated) — **PASS**.

**docker compose config** — exit 0.

*Parent checklist: [`2026-07-10-construction-os-rebrand-checklist.md`](2026-07-10-construction-os-rebrand-checklist.md)*
