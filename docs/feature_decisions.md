# Nobi — Feature Decisions Log
**Project:** Multi-Tenant Dynamic Data App (42 School DAI Submission)
**Started:** 2026-05-10

---

## Roles & Permissions

| Role | Upload Datasets | Generate Visualisations | Manage Members |
|------|----------------|------------------------|----------------|
| admin | yes | yes | yes |
| editor | yes | yes | no |
| viewer | no | yes | no |

**Decision:** Three-tier role system. Editors can upload and explore. Viewers are read/generate only. Admins manage the org.

---

## User & Organisation Relationship

**Decision:** 1:1 — one user belongs to one organisation (prototype scope).
- On signup, an organisation is auto-created for the user and they are assigned as `admin`
- Solo users are treated as single-person orgs — the data model is identical to a team org
- Invited users who already have an org cannot receive invitations (invitation is restricted to users without an existing membership)
**Deferred:** Multi-org membership per user — not built for this submission.

---

## Invitation Flow

**Decision:** Users must self-register (create a Supabase account) before they can receive an invitation. Admin invites by email; when the user signs up with that email, they are automatically assigned to the org with the invited role.
**Deferred:** Email delivery of invitations — for the prototype, invitations are created in the DB and the link/flow is triggered manually.

---

## Persistence Architecture

**Decision:** Polyglot persistence.
- Supabase Postgres — all identity and tenancy data (users/profiles, organisations, memberships, invitations)
- MongoDB Atlas — all dataset storage (CSV data, column metadata, rows)
- Users table stays in Postgres (RDBMS), not MongoDB

**Reason:** Relational data (users, roles, org membership) belongs in a relational store with RLS. CSV data has flexible/variable schema — document store is a better fit.

---

## Features In Scope (Prototype)

- [x] Organisation creation and onboarding
- [x] User signup / login (Supabase Auth)
- [x] Invitation system (DB-level, no email delivery)
- [x] CSV upload → parse → store in MongoDB
- [x] Dataset listing per org
- [x] Natural language prompt interface
- [x] LLM-driven visualisation generation (Gemini API)
- [x] Chart rendering (Recharts)
- [x] Tenant isolation on all queries
- [x] Platform admin layer (see Phase 9)

---

---

## Milestone — Phases 1–3 Complete (2026-05-12)

### Phase 1 — Monorepo Scaffold
- npm workspaces root with `backend/` and `frontend/` packages
- Express server (Node) with CORS + JSON middleware, `/api/health` endpoint
- React + Vite 5 frontend
- Supabase client wired in both frontend (anon key, `import.meta.env`) and backend (service role, ws transport for Node compatibility)
- `.env` / `.env.example` with all required keys; `.gitignore` configured

### Phase 2 — Auth Flow
- Supabase Postgres schema applied: `profiles`, `organisations`, `memberships`, `invitations` tables
- `member_role` enum: `admin`, `editor`, `viewer`
- Signup trigger (`handle_new_user`): auto-creates personal org on signup; joins inviting org if a pending invite exists for the user's email
- RLS policies on all four tables; `user_org_role()` helper avoids recursive RLS checks
- Frontend: `AuthContext` (session, user, org, role, signOut); `ProtectedRoute`; `AppShell` (nav bar with org name + sign out)
- Login and signup pages with styled-components form system
- Dashboard placeholder showing org name and role

### Phase 3 — MongoDB Atlas + CSV Upload Pipeline
- Node upgraded from 18.19.1 → 24.15.0 LTS via nvm (required by mongodb@7)
- MongoDB native driver (`mongodb@7`) — no ORM; `connectMongo()` singleton on boot
- Auth middleware: validates Supabase JWT, fetches `org_id` + `role` from `memberships` table, attaches to `req`
- `POST /api/datasets`: multer (4MB cap, CSV only, in-memory) → csv-parse → 14MB JSON size guard → insert into MongoDB `datasets` collection
- `GET /api/datasets`: returns all datasets for the authenticated user's org, excluding the raw rows
- MongoDB document shape: `{ org_id, name, uploaded_by, uploaded_at, columns, rows, row_count }`

### Decisions made during Phase 3
- **Upload cap set to 4MB** (not higher): CSV→JSON expansion (2–5×) means a larger file can exceed MongoDB's 16MB document limit. 4MB CSV + post-parse 14MB JSON guard keeps storage safe. Revisit with chunked/GridFS storage if larger files are needed.
- **No ORM**: mongoose rejected in favour of the mongodb native driver — no schema layer needed for arbitrary CSV row storage.
- **Supabase org-lookup per request**: auth middleware queries Supabase on every API call. Acceptable for prototype. Future fix: embed `org_id` + `role` as custom JWT claims at sign-in to eliminate the round-trip.

### Bug fixed
- `backend/src/middleware/auth.js` was importing `supabase` as a named export (`{ supabase }`) but `lib/supabase.js` uses a default export. Fixed to `import supabase from '../lib/supabase.js'`.

---

## Milestone — Phases 5 & 6 Stabilisation (2026-05-12)

### Chart renderer hardening
- All 5 chart types (Bar, Line, Area, Pie, Scatter) now handle missing yKey column via universal count mode detection — if Gemini returns a yKey that doesn't exist in the data, occurrences are counted automatically
- **Pie/Bar**: aggregate by category, sort Pie by value descending, sort Bar by xKey ascending if numeric (preserves natural order e.g. 1,2,3,4,5) or by value descending if categorical
- **Line/Area (count mode)**: aggregate by xKey, sort by xKey ascending to preserve distribution shape, then even-sample to MAX_SAMPLE if needed
- **Scatter**: validates both xKey and yKey exist in data AND are numeric before rendering; shows inline error if not
- All chart types show inline error message for missing xKey; "No data" message if result is empty after processing
- Fixed latent React hooks violation — `useMemo` was called after a conditional `return null`; restructured so all hooks run unconditionally

### Performance fixes
- `ChartRenderer` wrapped in `React.memo` — no longer re-renders on parent keystrokes
- `prepareData` wrapped in `useMemo` — row processing only reruns when config or rows change
- Backend `GET /api/datasets/:id` caps rows at 1000 for chart rendering
- Even sampling capped at 300 points for continuous charts

### Model fallback chain
- `MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest']`
- Silently tries next model on 429, 503, or 404 (e.g. a retired model); only surfaces error to user if all models fail
- Rate limit error also reverts the user's message and restores prompt text so retry is one click

### Known limitation
- Line chart averaging/smoothing is dataset-dependent — works best on data with few unique x values; datasets with many unique numeric values (e.g. continuous measurements) produce noisy lines. Flagged for future improvement (binning/smoothing).

---

## AI Provider Change — Gemini replaces Claude (2026-05-12)

**Decision:** Replaced Anthropic Claude API with Google Gemini API (`gemini-2.5-flash`, prepaid tier).

**Why:** The original spec listed Claude as the AI layer, but the developer's Anthropic account is tied to a professional workplace org and cannot be used for this personal project. Originally attempted Gemini free tier but the API key's project had zero free tier quota configured (Google Cloud Console key vs AI Studio key). Switched to Gemini prepaid tier — `gemini-2.5-flash` confirmed working. `gemini-2.0-flash` unavailable on this key (404).

**Changes made:**
- Uninstalled `@anthropic-ai/sdk`, installed `@google/generative-ai`
- Rewrote `backend/src/routes/visualise.js` to use the Gemini SDK (`GoogleGenerativeAI`, `startChat`, `sendMessage`)
- Role mapping: our `assistant` → Gemini's `model`; conversation history split into `history` (all but last message) + `sendMessage` (last message), as required by the Gemini chat API
- `ANTHROPIC_API_KEY` → `GEMINI_API_KEY` in `.env` and `.env.example`
- Prompt caching removed (not supported in the same way on Gemini free tier)

**Note:** The system instruction, chart config format, and all frontend code are unchanged. This is a pure backend provider swap.

---

## Milestone — Phases 5 & 6 Complete (2026-05-12)

### Phase 5 — Claude API Integration
- Installed `@anthropic-ai/sdk` (backend)
- `POST /api/visualise`: validates JWT + org membership, fetches dataset from MongoDB, sends system prompt with column names + up to 20 sample rows to Claude, passes full conversation history for multi-turn refinement, returns `{ explanation, config }`
- Prompt caching (`cache_control: ephemeral`) applied to the system prompt so repeated turns on the same dataset avoid redundant token cost
- Chart config format Claude returns: `{ chartType, title, xKey, yKeys: [{ dataKey, name, color }] }`
- Returns `503` if `ANTHROPIC_API_KEY` is not set; `502` on Claude API errors
- `GET /api/datasets/:id` added to return full dataset including rows (used by frontend to render charts)

### Phase 6 — NL Prompt Interface + Recharts Rendering
- Installed `recharts` (frontend)
- `ChartRenderer` component handles BarChart, LineChart, AreaChart, PieChart, ScatterChart from a unified config; converts CSV string values to numbers for numeric axes
- `VisualisePage` (`/visualise`): dataset selector, chat panel (conversation history with user/assistant bubbles, Enter to send), chart panel (updates on each Claude response); two-column layout on desktop, stacked on mobile
- `DashboardPage` updated: shows total datasets count + last upload date fetched from `GET /api/datasets`
- Visualise nav link added to AppShell

### Decisions
- **Single dataset per visualisation** for prototype. Multi-dataset joins/pivots flagged as future work.
- **20 sample rows** sent to Claude (not the full dataset) to keep token usage low. Full rows are sent to the frontend separately for chart rendering.
- **Claude picks the initial chart type**; user refines via follow-up natural language prompts (conversation history maintained in frontend state)
- **Chunk size warning** on build is expected — Recharts is a large library. Code splitting is a future optimisation, not a blocker.

---

## Phase 4 Addendum — Delete + Search (2026-05-12)

### Dataset delete
- Backend: `DELETE /api/datasets/:id` — validates dataset belongs to the org, permits deletion only for the uploader or an org admin; returns 204
- Frontend: per-row Delete button with inline "Delete? Yes / Cancel" confirm step before calling the API; list auto-refreshes on success
- `apiFetch` updated to handle 204 (no body) without attempting `res.json()`

### Client-side search
- Search input above the datasets table; filters by name as the user types (case-insensitive)
- "No datasets match your search" empty state when the filter returns nothing
- Search bar only appears once at least one dataset exists

### Decision: pagination deferred
- Client-side search chosen over server-side pagination for prototype scope
- **Flag for future:** at org scale (hundreds/thousands of datasets) client-side filtering will not scale — replace with server-side pagination (cursor-based) and a debounced search endpoint

---

## Milestone — Phase 4 Complete (2026-05-12)

### Phase 4 — CSV Upload UI
- `frontend/src/lib/api.js`: authenticated fetch wrapper — reads Supabase session token and attaches `Authorization: Bearer` header to all backend requests
- `frontend/src/pages/DatasetsPage.jsx`: upload card (file picker, CSV only, filename + size display, 4MB note, upload button with loading state, success/error feedback, auto-refreshes list on success) + datasets table (name, columns summarised, row count, upload date)
- `/datasets` added as a protected route inside AppShell
- `AppShell` updated with nav links (Dashboard, Datasets) using `NavLink` for active state styling

### Bugs fixed during Phase 4
- `backend/src/middleware/auth.js` queried table `org_members` — correct table name is `memberships` (caused 403 on all authenticated routes)
- Backend `dotenv/config` looked for `.env` relative to `process.cwd()` (i.e. `backend/`), not the repo root. Fixed by switching to Node's built-in `--env-file=../.env` flag in the npm scripts and removing the `dotenv/config` import.

---

## Milestone — Phase 7 Complete (2026-05-12)

### Tenant isolation
All backend queries were already scoped by `org_id` via the auth middleware — no data leakage between orgs was possible. Phase 7 confirmed this is airtight across all endpoints (`GET /api/datasets`, `POST /api/datasets`, `GET /api/datasets/:id`, `DELETE /api/datasets/:id`, `POST /api/visualise`).

### Role-based access — soft blocks (UI only)
**Decision:** Soft blocks implemented first. Hard backend guards flagged as future work.

`canUpload = role === 'admin' || role === 'editor'` derived from `useAuth()` in `DatasetsPage`.

| Element | admin | editor | viewer |
|---|---|---|---|
| Upload section | visible | visible | hidden |
| Delete button | visible | visible | hidden |
| Datasets list | visible | visible | visible |
| Visualise page | accessible | accessible | accessible |
| Dashboard | accessible | accessible | accessible |

**Future:** Add backend role guards (`req.role` is already attached by auth middleware) — `POST /api/datasets` and `DELETE /api/datasets/:id` should return 403 for viewers. Deferred as viewer hard-blocking was not in prototype scope.

---

## Milestone — Phase 8: Departments + Permissions (2026-05-13)

### Why
Phase 1–7 left every user a single org-wide role. Real orgs have departments
(Finance, HR, etc.) that need to be access boundaries, plus an executive
"HQ" that has full reach over every department.

### Model
- **Org → Departments → Memberships.** A user no longer has one membership per
  org — they have one membership per department, each with its own role and
  optional `extra_permissions` overrides.
- **HQ department**, auto-created with the org. Membership in HQ applies the
  caller's role across **every** dept in that org (HQ admin = full CRUD
  everywhere; HQ viewer = read-only everywhere; etc.). HQ cannot be renamed
  or deleted.
- **1 user : 1 org invariant kept.** A user is in at most one org. Invitations
  are blocked at both create and accept time if they would cross orgs.
- **Permission model** = role default ∪ `extra_permissions[]`. Roles still
  the same enum (`admin | editor | viewer`); admins may additively grant a
  single user extra actions (e.g. grant a viewer `upload` without promoting).
  Canonical actions: `view`, `upload`, `edit`, `delete`, `manage_members`,
  `manage_departments`.

### Schema changes (full reset, no migration)
- Drops the auto-personal-org signup trigger. Signup now creates only a profile.
- New `departments` table with a partial unique index for one HQ per org.
- `memberships.org_id` → `memberships.department_id`; adds
  `extra_permissions text[]`.
- `invitations.email` → `invitations.invitee_user_id`; new statuses
  `rejected`, `revoked`; partial unique index for one pending invite per
  (user, dept).
- New helpers: `role_default_permissions(role)`, `user_can(user, dept, action)`,
  `create_org(name, user)` (atomic org + HQ + admin membership).

### Backend routes
- `POST /api/organisations`, `GET /api/organisations/me`
- `GET/POST/PATCH/DELETE /api/departments`, `GET /api/departments/:id/members`
- `PATCH/DELETE /api/memberships/:id`
- `POST /api/invitations`, `GET /api/invitations/incoming`,
  `GET /api/invitations/department/:id`,
  `POST /api/invitations/:id/accept|reject`, `DELETE /api/invitations/:id`
- `GET /api/users/search`
- Datasets routes now require `department_id` on upload, scope listings to
  viewable depts (HQ membership grants every dept in the org), and check
  per-action permissions on the dataset's dept rather than the org.

### Frontend
- `AuthContext` now exposes `memberships[]`, `organisations[]`,
  `canInDept(action, deptId)` and `canInOrg(action, orgId)` helpers; the old
  single-org/role fields are gone.
- New pages: `OnboardingPage` (create org or accept invites — shown when the
  user has zero memberships), `DepartmentsPage` (HQ admin manages depts),
  `MembersPage` (per-dept members + invitations), `InvitationsPage` (inbox).
- `DatasetsPage`/`VisualisePage` gain a department selector; upload/delete
  buttons gate on per-dept permission, not a global role.
- New `MembershipGuard` route component redirects users with no memberships
  to `/onboarding`.

### Decisions
- **No backend-managed role guards beyond the action permission model.**
  Phase 7's "soft block" pattern is gone — every protected endpoint checks
  `req.can(action, dept)` explicitly. Viewers without `upload` can no longer
  POST to `/api/datasets` even if they craft the request manually.
- **Dept deletion blocked when datasets remain in it** (409). Keeps Mongo
  from accumulating orphans; an HQ admin must move or soft-delete the
  datasets first.
- **User search powers invites.** No email delivery, no email-based invite
  matching — invitees must already exist as a signed-in user; admins find
  them via `/api/users/search?q=`.

### Deferred / future work
- Inviting across orgs (currently impossible by design)
- Bulk invite to multiple depts in one action
- Audit log of permission changes
- Notification UI when an invite arrives (currently only badge count + page)

---

## Milestone — Phase 8 Complete (2026-05-13)

### Departments + Permissions — fully implemented and verified

All backend routes and frontend pages for Phase 8 are built, integrated, and smoke-tested end-to-end.

**API smoke test results (all passing):**
- Auth guard returns 401 without token ✓
- `GET /api/organisations/me` returns empty array for new user ✓
- `POST /api/organisations` creates org with HQ department + admin membership atomically ✓
- `GET /api/organisations/me` reflects new org with 1 HQ membership ✓
- `GET /api/departments` lists departments including HQ ✓
- `POST /api/departments` creates non-HQ department ✓
- `GET /api/departments/:id/members` returns members ✓
- `GET /api/datasets` scoped to viewable departments ✓
- `POST /api/datasets` (CSV upload) stores to MongoDB with `department_id` ✓
- `GET /api/datasets/:id` returns full rows and columns ✓
- `GET /api/invitations/incoming` returns empty array for new user ✓
- `GET /api/users/search` returns matching profiles ✓

**UI smoke test results (all passing, Playwright headless):**
- Login → redirect to `/onboarding` for user with no org ✓
- AuthContext refresh resolves → redirect to `/` ✓
- Dashboard, Datasets, Departments, Invitations, Visualise pages all render ✓
- No browser console errors ✓

### Bug fixed during Phase 8 stabilisation

**Supabase session lock deadlock** — calling `supabase.auth.getSession()` inside `onAuthStateChange` deadlocks the Supabase session mutex, causing `loading` to stay `true` forever and all authenticated pages to render blank.

Fix: added a module-level token cache (`_token`, `setAuthToken`) in `frontend/src/lib/api.js`. `AuthContext` now calls `setAuthToken(token)` before `refresh()` in both the `getSession()` init block and the `onAuthStateChange` callback. The `getSession()` fallback in `authHeaders()` is retained only for callers outside React (e.g. direct API scripts).

Also fixed a related race condition: `MembershipGuard` was redirecting to `/onboarding` before `refresh()` resolved because `organisations` initial state was `[]` (indistinguishable from "fetched, no orgs"). Changed initial state to `null`; `MembershipGuard` now treats `organisations === null` as still-loading and holds.

### Cross-schema FK join bug fixed (PostgREST)

`memberships.user_id` and `invitations.invited_by` are FKs to `auth.users(id)`, which lives in a different Postgres schema. PostgREST cannot traverse cross-schema FKs automatically — queries using `profile:profiles(...)` or `inviter:profiles(...)` joins on those columns returned 500. Fixed in three routes (`departments.js`, `invitations.js`) by fetching profiles in a separate query and merging in application code.

---

## Milestone — Phase 9: Platform Admin Layer (2026-05-15)

### Why
Phases 1–8 had no visibility above the org level. In a real multi-tenant app a platform operator needs to see all orgs, manage users, and be able to clean up or delete orgs without going into the database directly.

### Model
- `is_platform_admin boolean NOT NULL DEFAULT false` added to `profiles` table.
- Platform admins are set via SQL or via the admin UI itself (toggle).
- Platform admin access is completely independent of org membership — a platform admin with no org can still access `/admin`.
- `requirePlatformAdmin` middleware enforces this at the backend; `PlatformAdminGuard` route component enforces it on the frontend.

### Backend routes (`GET|PATCH|DELETE /api/admin/*`)
- `GET /api/admin/overview` — platform-wide stats: total orgs, users, datasets.
- `GET /api/admin/organisations` — all orgs with `member_count` and `department_count`.
- `DELETE /api/admin/organisations/:id` — hard delete org + cascade in Postgres; also deletes org's MongoDB datasets.
- `GET /api/admin/users` — all users with profile info and org affiliations.
- `PATCH /api/admin/users/:id/admin` — toggle `is_platform_admin` flag.

### Frontend
- `AdminPage.jsx` at `/admin` — stats cards, org table with delete (two-step confirm), user table with Make/Remove admin toggle.
- `PlatformAdminGuard` route component — redirects non-admins to `/`.
- **Admin** nav link in `AppShell` — visible only when `isPlatformAdmin` is true.
- `AuthContext` exposes `isPlatformAdmin` (sourced from `GET /api/organisations/me` response).

### `requireAuth` middleware update
Now runs two Supabase queries in parallel: memberships join (existing) + `profiles.is_platform_admin` lookup. Attaches `req.isPlatformAdmin` to all authenticated requests.

### Onboarding UX redesign (same session)
- `OnboardingPage` now shows "Welcome to Nobi" header with explanatory copy.
- **Invitations section shown first** — if the user has pending invites, they are listed prominently.
- Org creation **auto-expands** if no invites exist; otherwise collapses behind a `+ Create a new organisation` toggle.
- **"I'm waiting for an invitation"** link at the bottom — sets a `localStorage` flag (`nobi_waiting_for_invite`) and switches the page to a waiting room view: invitations list + manual Refresh button + "Create an organisation instead" escape hatch.
- Flag is cleared when the user creates an org or accepts an invite.
- Users who close without choosing return to the default view (no flag = no state = correct).
- **Deferred:** persist waiting preference in DB (`onboarding_state` on profiles) so it survives across devices. Acceptable as localStorage for prototype scope.

---

## Milestone — Visualiser Reorg: Tool Registry for Gemini Function-Calling (2026-07-07)

### Why
Chart-visualisation backend code (`visualise.js`, `visualisations.js`) lived alongside unrelated routes (org/dept/auth/datasets) in `backend/src/routes/`. Separately, Gemini function-calling had been added as a single `compute_aggregation` tool inline in `visualise.js`, with a hardcoded `operation` enum (`sum`/`avg`/`count`/`min`/`max`) — workable for one tool, but not a base to add further tool categories on top of.

### New layout
```
backend/src/visualiser/
├── routes/
│   ├── visualise.js
│   └── visualisations.js
└── toolRegistry/
    ├── registry.js       # auto-discovers tool files, dispatch()
    └── basic_math.js     # sum, average, median, count, min, max
```

### Tool split
`compute_aggregation`'s `operation` enum replaced by six separately named Gemini tools in `basic_math.js` (`sum`, `average`, `median`, `count`, `min`, `max`), each sharing a common `agg_column` + optional `group_by_column` parameter shape via a `makeTool()` factory. `median` is a new capability — did not exist under the old single-tool design.

### Registry auto-discovery
`toolRegistry/registry.js` scans its own directory at startup, dynamically imports every tool file it finds, and collects each file's `toolList` export (the required, load-bearing export name every tool file must use — silently drops that file's tools if misnamed or missing). Dropping a new tool file into `toolRegistry/` registers it automatically with no edits to `registry.js`. A startup check throws on duplicate tool names across files, so a future collision fails loudly instead of silently shadowing an existing tool.

### Correction to earlier scope note
"Saved / persistent visualisations" was previously listed below under Features Explicitly Out of Scope — this is now implemented (`backend/src/visualiser/routes/visualisations.js`, `POST/GET/PATCH/DELETE /api/visualisations`, soft-delete, ownership-scoped) and has been removed from that list.

---

## Milestone — Multi-turn tool-calling loop + explicit generation config (2026-07-07)

### Multi-turn loop (fixes the previous "known limitation")
`callGeminiWithTools` (`backend/src/visualiser/routes/visualise.js`) previously handled exactly two turns: one shot at a function call, one shot at the final answer, with no check for a function call on that second turn. Replaced with a real loop — after each `sendMessage`, checks `response.functionCalls()` again and keeps executing + sending results back until Gemini returns a turn with no further function calls, capped at `MAX_TOOL_TURNS = 4` to guard against a runaway loop. If the cap is hit with calls still pending, it logs a warning and returns best-effort text rather than crashing. This resolves compound prompts (e.g. two different aggregations in one question) that could previously trigger a second tool-call round and come back with a silently empty explanation and no chart.

### Explicit generationConfig
`getGenerativeModel(...)` previously omitted `generationConfig` entirely, so all three fallback models ran on Gemini's server-side defaults implicitly. Added an explicit `GENERATION_CONFIG` constant (`temperature: 1.0, topP: 0.95, topK: 64`, matching Gemini 2.5 Flash's actual defaults) so these are now a visible, adjustable knob rather than implicit behaviour. `maxOutputTokens` intentionally left unset — it has no fixed default (capped at 65536, otherwise the model stops naturally), and setting it would change current behaviour rather than just make it explicit.

---

## Milestone — Chat follow-up "tweak" bug fix + extensible chart-tweak schema (2026-07-08)

### Bug fixed: follow-up tweak requests were ignored
`visualise.js` stripped the JSON chart-config block out of the model's response before returning it as `explanation`, and the frontend persisted that stripped text as the assistant's chat message. Replayed into `startChat({ history })` on the next turn, Gemini had no memory of the chart config it had generated — a follow-up like "make it a line chart" had nothing concrete to modify, and Gemini would sometimes respond with a bare JSON block and no explanation at all (repro'd against the real Gemini API with the actual tool registry: turn 2 came back with zero prose and a silently renamed `dataKey`).

**Fix:** `visualise.js` now also returns `raw` (the full unstripped model text). The frontend (`VisualisePage.jsx`) stores `raw` (falling back to `explanation` for old saved chats) as the persisted message content, so it round-trips correctly into history; the JSON block is now stripped only at render time (`displayContent()`), so the chat UI is unaffected. System prompt also gained an explicit instruction to reuse the prior JSON block's `data` on tweak-only requests instead of recomputing.

### Extensible chart-tweak schema (yAxis / legend / series)
Verifying the fix above surfaced a deeper gap: the chart config schema is a hand-enumerated JSON shape and `ChartRenderer.jsx` only renders the exact fields it was coded for — any tweak without a matching field (y-axis range, legend position, line curve, stacking) silently did nothing.

**Decision:** Rather than adding one-off fields reactively, added three optional sub-objects mirroring the Recharts elements they configure — `yAxis: { domain, scale }`, `legend: { position }`, `series: { curveType, stacked }` — documented in the system prompt schema doc.

**Guardrails:** Gemini's chart-config JSON has no native structured-output enforcement (`responseSchema`/`responseMimeType`) — it's a prompt convention parsed with a regex + `JSON.parse`. A bigger schema means more surface for a malformed-but-syntactically-valid value (e.g. `domain: "2.5 to 3.5"`). `ChartRenderer.jsx` now has `sanitizeChartOptions()`, which validates each of the 5 sub-fields independently (bad `domain`, invalid `scale`/`curveType`/`legend.position` enum values, non-boolean `stacked`) and drops only the invalid ones (with a `console.warn`) rather than crashing or discarding the whole config — same defensive pattern as the existing `getValidationError`.

**Verified against the real Gemini API** (not just reasoned about): reproduced the user's exact scenario (2-line chart via the `pivot` tool, then "set the y-axis from 2.5 to 3.5") and confirmed the model now emits `yAxis: { domain: [2.5, 3.5], scale: "linear" }` while preserving the underlying data. Guardrail function independently verified against 13 malformed-input cases (bad domain shapes, invalid enum values, mixed valid/invalid fields) — all degrade gracefully, none throw.

---

## Milestone — MongoDB startup resilience (2026-07-12)

### Why
`backend/src/index.js` gated the *entire* Express server behind a successful Mongo connection — it called `connectMongo()` and only called `app.listen()` in the `.then()`, with `process.exit(1)` on failure. That killed every route, including the Postgres-only ones (auth, orgs, departments, memberships, invitations, users) that have nothing to do with Mongo. This caused two real incidents — a live demo on 2026-05-19 and again on 2026-07-08 — where a firewalled network blocking outbound Atlas traffic took down the whole API instead of just the dataset/visualise features.

### Fix
- `backend/src/lib/mongo.js`: `connectMongo()` no longer throws upward on failure — it logs once and retries on a fixed 10s interval in the background. New `isMongoConnected()` export and a `requireMongo` middleware that returns a clean `503 { error: 'Database temporarily unavailable' }` if Mongo isn't connected yet.
- `backend/src/index.js`: `app.listen()` now runs unconditionally; `connectMongo()` is kicked off in the background instead of gating startup.
- `requireMongo` applied to the 5 route files that actually touch Mongo (`datasets.js`, `visualise.js`, `visualisations.js`, one handler in `departments.js`, two routes in `admin.js`). This also fixed a related latent bug: those routes called `getDb()` with no guard and no try/catch, so a mid-request Mongo failure produced an unhandled promise rejection — the request just hung with no response, rather than erroring cleanly.

### Verified live
Started the backend against an unreachable Mongo host (a TEST-NET-1 address, guaranteed unroutable) — the process stayed up, `/api/health` returned 200, a Mongo-backed route returned a clean `503` instantly instead of hanging, and Postgres-backed routes worked normally. Confirmed the background retry fires every ~10s from log output. Restarted against the real Mongo URI without any code changes and confirmed the same route falls through to normal behaviour with no regression.

---

## Milestone — Cross-dataset analysis (2026-07-12)

### Why
The multi-chart redesign (2026-07-07) stored `dataset_ids` as an array on every persisted chart specifically to support analysing across multiple datasets later (see that milestone's note above) — that capability was deferred until now. Until this change, the "+" button only ever created a chart bound to a single dataset, and `POST /api/visualise` only accepted one `datasetId`.

### UX change
The "+" button now opens a dataset picker (checkboxes over the department-scoped dataset list) instead of immediately creating a chart bound to whatever the preview dropdown had selected. An analysis is still 1:1 with a chart (not a new grouping level above it) but now carries `datasetIds: string[]`. The nav sidebar list is no longer gated by a single "selected" dataset — it shows every analysis whose datasets intersect the current department filter. The dataset preview dropdown is now purely a "peek at one dataset's raw rows" convenience, decoupled from analysis visibility/creation.

### Backend / tool registry
- `POST /api/visualise` takes `datasetIds` (array, replacing the singular `datasetId` — both frontend and backend changed together, no back-compat shim). Fetches all requested datasets in one query, builds a `{ [displayName]: rows }` map (dataset names de-duped via a `uniqueName` helper for datasets sharing a filename), and the system prompt lists each dataset separately with its own sample rows.
- **Dataset-tagged tool reuse (chosen over a join-first approach — see trade-off below)**: every existing tool (`basic_math`, `statistics`, `ranking`, `pivot`) gained an optional `dataset` param, free-text like the existing column-name params rather than an enum. `registry.js`'s `dispatch()` resolves which dataset's rows to pass via a new `resolveDatasetRows()` helper in `aggregationHelpers.js`: with a single dataset in scope it auto-resolves regardless of the arg (fully back-compatible with every existing single-dataset chart), with 2+ datasets the arg is required, and an unknown/missing name is fed back to Gemini as the tool's own error result — not a thrown exception that kills the request — so it can self-correct within the existing multi-turn tool loop.
- **New join tool** (`toolRegistry/join.js`): `join_and_aggregate` — one tool, not a family of join variants. Inner-joins two datasets on a shared key column (`left_dataset`/`left_key_column`/`right_dataset`/`right_key_column`), then aggregates via a `reducer` enum reusing the existing `REDUCERS` map. Rows with no match on either side are dropped; `matched_rows` is returned alongside the aggregate so a bad join (e.g. mismatched key formats) is visible as a suspiciously low match count rather than silently hidden.

### Bugs caught by live verification (not visible from reading the code — see [[feedback_verify_dont_assert]] pattern)
1. The new `multiDataset` flag on the join tool object leaked into the Gemini-facing function schema (`functionDeclarations` only stripped `execute`, not this new field) and got the *entire* tool list rejected by the Gemini API with a 400 the moment `join.js` existed. Fixed by stripping both fields.
2. Gemini occasionally merged two per-dataset tool-call results into one JSON object with duplicate keys instead of two separate array entries (e.g. `{"dataset":"Q1","revenue":3300,"dataset":"Q2","revenue":4500}`) when asked to compare datasets. This is syntactically valid JSON — the second duplicate key silently overwrites the first on parse — so it produced no error anywhere, just a chart missing a bar. This is exactly the "implicit model reasoning to merge results" risk that was flagged as a trade-off when choosing dataset-tagged reuse over a join-first design. Fixed by adding an explicit right/wrong example to the system prompt's multi-dataset section; reran the live comparison prompt 5x afterward with zero further collapses.
3. `ChartRenderer.jsx` had a latent early-return — `if (!config || !rows?.length) return null` — that unconditionally required non-empty raw rows even when `config.data` was already pre-computed by a tool call. Harmless under the old single-dataset design (a chart could never exist without its dataset's rows being loaded), but multi-dataset analyses correctly pass empty raw rows (there's no single dataset to fall back to), which hit this guard and silently rendered nothing — with a fully correct chart config and zero console errors. Fixed by short-circuiting on `config.data` presence, matching how the rest of the component already special-cased it two lines above.

### Verified live
Real headless-browser run (Playwright, throwaway test account explicitly authorized for this) through the actual UI: signup → onboarding → org creation → CSV upload (two files) → Visualise page → "+" opens the picker → multi-select both datasets → Create → cross-dataset comparison chart renders correctly with real computed values → single-dataset analyses confirmed still working unchanged, no console errors. The join tool and dataset-dispatch logic were additionally verified directly against the real Gemini API and real tool-registry code (bypassing the browser) before the UI pass. Test accounts, orgs, and datasets created during verification were cleaned up afterward via a script using the Supabase admin API (cascading delete) and the Mongo driver directly.

### Correction to earlier scope note
"Single dataset per visualisation" and "Multi-dataset joins/pivots flagged as future work" (Phase 5 & 6 decisions, above) are now superseded — multi-dataset analyses and a dedicated join tool are implemented as of this milestone.

---

## Features Explicitly Out of Scope

- Multi-org membership per user
- Email delivery for invitations
- Dataset versioning / update / delete
- Export of charts
- Real-time collaboration
- Signup "check your email" state (deferred post-submission — safe while email confirmation is disabled)

---
