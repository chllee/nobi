# Nobi — Prompt Log
**Project:** Multi-Tenant Dynamic Data App (42 School DAI Submission)
**Started:** 2026-05-10

---

## Entry 1 — 2026-05-10
**Prompt:** "can you see the basic writeup txt file?"
**Action:** Located and read `multi_tenant_dynamic_data_app.txt`. Confirmed understanding of the full spec: multi-tenant CSV upload app with NL prompt interface, LLM-driven visualisation generation, React + Supabase + MongoDB Atlas + Claude API stack.

---

## Entry 2 — 2026-05-10
**Prompt:** "yes, this is meant to be a prototype for a DAI submission for 42 school's AI taskforce project. i want to keep a log for all the prompts and edits to read through and include in the submission writeup along with the app repo"
**Action:** Saved project context to Claude memory. Proposed logging approach.

---

## Entry 3 — 2026-05-10
**Prompt:** "set up the prompt_log.md but not within the repo. instead keep it as a file outside the repo so that i can pick and choose key points to include later on"
**Action:** Created this file at `/home/chloe/nobi/prompt_log.md`. Will remain outside the repo once the repo is cloned into a subdirectory here.

---

## Entry 4 — 2026-05-10
**Prompt:** "ok let's go with phase 1 first"
**Action:** Scaffolded monorepo at `repo/`:
- `backend/` — Express server with CORS and `/api/health` endpoint (ESM, Node --watch for dev)
- `frontend/` — React + Vite 5 (Node 18 compatible), proxy configured to forward `/api` → `http://localhost:3001`
- Root `package.json` with npm workspaces and `concurrently` for running both with `npm run dev`
- `.env.example` with slots for PORT, Supabase, MongoDB, and Anthropic API keys
- `.gitignore` covering `node_modules/`, `dist/`, `.env`
**Verified:** Backend `/api/health` returns `{"status":"ok"}`

---

## Entry 5 — 2026-05-10
**Prompt:** "i have created the supabase project, how do i link it to the source code" / key setup questions
**Action:** 
- Updated `.env.example` to separate backend (service role) and frontend (anon) Supabase keys with `VITE_` prefix
- Fixed user's `.env` — URLs had `/rest/v1/` appended, trimmed to base URL
- Installed `@supabase/supabase-js` in both workspaces, plus `ws` for Node 18 WebSocket compatibility
- Created `backend/src/lib/supabase.js` (service role client, realtime transport via `ws`)
- Created `frontend/src/lib/supabase.js` (anon key client via `import.meta.env`)
**Verified:** Backend Supabase client connects successfully

---

## Entry 6 — 2026-05-10
**Prompt:** Schema and architecture discussion
**Decisions made:**
- Roles: admin (full), editor (upload + visualise), viewer (visualise only)
- 1:1 user-to-org; solo users auto-get a personal org on signup
- Invited users (no existing org) join the inviting org instead of creating one
- Users table stays in Supabase Postgres, not MongoDB
- Polyglot: Supabase for identity/tenancy, MongoDB for dataset storage
**Action:** Created `feature_decisions.md` at `/home/chloe/nobi/`. Created `repo/supabase/schema.sql` with:
- Enums: `member_role`, `invite_status`
- Tables: `profiles`, `organisations`, `memberships`, `invitations`
- Signup trigger: auto-creates org + admin membership, or joins pending invited org
- RLS policies on all tables with a `user_org_role()` helper to avoid recursive policy checks

---

## Session 2 — 2026-05-12

## Entry 7 — 2026-05-12
**Prompt:** "where did we leave off the last session"
**Action:** Reviewed memory. Phases 1–2 complete. Identified Phase 3 pre-build questions (MongoDB URI, full rows vs metadata, upload size cap).

---

## Entry 8 — 2026-05-12
**Prompt:** Phase 3 answers — MongoDB URI provided, full rows confirmed, 4MB cap decided
**Key decisions:**
- MongoDB URI: `mongodb+srv://chloelee:...@data-1.7dxpv4b.mongodb.net/`
- Store full rows in MongoDB (not just metadata)
- Upload cap set to 4MB — CSV→JSON expansion (2–5×) can approach MongoDB's 16MB document limit; 4MB input with 14MB post-parse guard keeps storage safe
- No ORM — rejected mongoose in favour of native `mongodb` driver
- Supabase org-lookup per request accepted for prototype; noted as future JWT claims optimisation
**Action:** Installed `multer`, `csv-parse`, `mongodb@6`. Wrote `backend/src/lib/mongo.js`, `backend/src/middleware/auth.js`, `backend/src/routes/datasets.js`. Mounted router in `index.js`.

---

## Entry 9 — 2026-05-12
**Prompt:** "update the node version to the latest LTS and move on to using mongo7"
**Action:**
- Installed nvm, resolved `.npmrc` prefix conflict, installed Node 24.15.0 LTS and set as default
- Swapped `mongodb@6` → `mongodb@7`
- Confirmed MongoDB Atlas connection successful

---

## Entry 10 — 2026-05-12
**Prompt:** Backend EADDRINUSE / dotenv not loading `.env` from wrong cwd
**Root cause:** `dotenv/config` looked for `.env` relative to `process.cwd()` (the `backend/` directory), not repo root.
**Fix:** Switched to Node's built-in `--env-file=../.env` flag in npm scripts; removed `dotenv/config` import.

---

## Entry 11 — 2026-05-12
**Prompt:** Phase 3 overview + bug in auth middleware
**Bug found:** `auth.js` queried table `org_members` — correct name is `memberships`. Caused 403 on all authenticated routes.
**Action:** Fixed table name. Confirmed upload and list endpoints working.

---

## Entry 12 — 2026-05-12
**Prompt:** Phase 4 plan — CSV upload UI
**Decision:** `/datasets` as its own route (separate from dashboard) for modularity.
**Action:** Created `frontend/src/lib/api.js` (authenticated fetch wrapper). Created `DatasetsPage.jsx` with upload card + datasets table. Added `/datasets` route, updated `AppShell` with nav links (Dashboard, Datasets).

---

## Entry 13 — 2026-05-12
**Prompt:** "ok the upload has gone through on both the frontend and backend. what is the next step?"
**Note:** Phase 4 complete and verified working end-to-end.

---

## Entry 14 — 2026-05-12
**Prompt:** Dataset sharing + delete + scalability concerns
**Discussion:**
- Confirmed datasets are already org-scoped (shared within org via `org_id` query) — no change needed
- Added `DELETE /api/datasets/:id` (uploader or admin only)
- Added client-side search by name
- Switched to soft delete (`deleted_at` timestamp) after confirming hard delete was initially implemented
- Server-side pagination flagged as future work

---

## Entry 15 — 2026-05-12
**Prompt:** Phase 5 & 6 planning — Claude API + visualise UI
**Key decisions:**
- 20 sample rows sent to AI (not full dataset) for cost/performance
- AI picks initial chart type; user refines via follow-up prompts (conversation history maintained)
- Single dataset per visualisation (multi-dataset joins out of scope, flagged future)
- Dashboard updated to show org stats (dataset count, last upload date)
- `/visualise` as separate route
**Action:** Installed `@anthropic-ai/sdk` (backend) + `recharts` (frontend). Built `POST /api/visualise` with system prompt, Anthropic SDK, conversation history. Built `ChartRenderer` (5 chart types). Built `VisualisePage`. Updated `DashboardPage`.

---

## Entry 16 — 2026-05-12
**Prompt:** AI provider change — replacing Claude with Gemini
**Reason:** Developer's Anthropic account tied to workplace org; cannot use for personal project. Gemini free tier initially attempted but API key had zero free tier quota (Google Cloud Console key, not AI Studio key). Switched to Gemini prepaid tier. Tested `gemini-2.5-flash` and `gemini-2.5-pro` — both confirmed working. `gemini-2.0-flash` returned 404.
**Action:** Uninstalled `@anthropic-ai/sdk`, installed `@google/generative-ai`. Rewrote `visualise.js` to use Gemini SDK with role mapping (`assistant` → `model`). Renamed env key `ANTHROPIC_API_KEY` → `GEMINI_API_KEY`.

---

## Entry 17 — 2026-05-12
**Prompt:** Performance issues — typing lag in chat box + rigid chart rendering on large datasets
**Root causes identified:**
- Every keystroke triggered re-render of `ChartRenderer` (thousands of SVG elements being repainted)
- Recharts plotting every single raw data point
- Full dataset rows sent over network unnecessarily
**Fixes:**
- `React.memo` on `ChartRenderer` + `useMemo` on `prepareData`
- Backend caps dataset rows at 1000 for `GET /api/datasets/:id`
- Even sampling to 300 points for continuous charts
- Aggregation (group + count/sum) for pie/bar charts — top 10 slices, top 25 bars
- Model fallback chain: `['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-flash-latest']` — silently tries next on 429/503
- Rate limit error reverts user message and restores prompt text for one-click retry

---

## Entry 18 — 2026-05-12
**Prompt:** Pie chart shows legends but no chart — system prompt and count mode issues
**Root cause:** Gemini returned `yKeys[0].dataKey: "count"` (non-existent column). `aggregateByKey` summed `undefined` → 0 for all slices → invisible chart, only legends rendered.
**Fix:** Added count mode detection — if yKey column doesn't exist in data, automatically count occurrences per xKey category. Extended to ALL chart types (line/area sort by xKey ascending for distribution shape; scatter shows inline error instead).
**Also fixed:** Bar chart numeric xKey sorting — `addiction_level` now renders 1,2,3,4,5 in ascending order instead of sorted by count.

---

## Entry 19 — 2026-05-12
**Prompt:** Full ChartRenderer hardening — all 5 chart types
**Action:** Full rewrite of `ChartRenderer`. Per chart type:
- Bar: numeric xKey → sort asc; categorical → sort by value desc; count mode for missing yKey
- Pie: sort by value desc; count mode for missing yKey
- Line/Area: count mode → aggregate + sort by xKey asc (distribution shape); real yKey → even sample
- Scatter: validates xKey + yKey exist AND are numeric; inline error if not
- All types: inline error for missing xKey; "No data" message for empty result
- Fixed React hooks violation (useMemo was after conditional return)

---

## Entry 20 — 2026-05-13
**Prompt:** Phase 7 — tenant isolation + role-based access
**Tenant isolation:** Confirmed all endpoints already scoped by `org_id` via auth middleware — airtight.
**Role-based access:** Soft blocks implemented (UI only). `canUpload = role === 'admin' || role === 'editor'` in `DatasetsPage`. Upload section and delete button hidden for viewers. Hard backend guards (403 for viewers on POST/DELETE) flagged as future work.

---
