# Nobi — Data Visualization for Teams

## Overview

### Problem

Data analysts and managers in organisations frequently receive CSV exports from internal tools, spreadsheets, and external providers. Turning these into useful visualisations today requires either a technical user who can write code, or a paid BI tool subscription the team may not have access to. There is no lightweight, shared workspace where multiple departments can upload their own datasets and explore them through natural-language prompts without writing a single line of code.

Who is affected: non-technical team members in data-heavy roles — analysts, department managers, operations staff — who need to explore their own data without engineering support, in a shared environment where data from one department should not bleed into another.

### Outcome

Nobi is a working multi-tenant prototype that allows organisations to:

- Onboard into an organisation with department-level access control
- Upload CSV datasets (up to 4 MB) that are parsed and stored per department
- Ask questions in plain English — "show me sales by region as a bar chart", "compare monthly trends for Q1" — and receive a rendered chart instantly
- Manage team membership: invite colleagues, assign roles (admin / editor / viewer), and grant per-user permission overrides without changing their base role
- Operate safely across departments: every query, dataset, and action is scoped to the user's own organisation and department; a platform admin layer provides top-level oversight

All 9 development phases were completed and smoke-tested end-to-end within the submission window.

---

## Demo

### Recorded walkthrough

A full end-to-end screencast of the app is included in this repo at [`demo.webm`](./demo.webm). The live demo on submission day could not connect to Supabase, MongoDB Atlas, or the Gemini API because the corporate network firewall blocked the outbound calls to those services; the recording was made on an unrestricted network and shows the same build running successfully against all three.

### Main user flow from start to finish

1. **Sign up** — create an account with your display name and email. A profile record is created automatically in the database via a Postgres trigger.

2. **Onboarding** — new users land on an onboarding page. If they have pending invitations, these are shown first and can be accepted immediately. Otherwise, the user creates a new organisation, which atomically creates a "HQ" department and assigns the creator as HQ admin.

3. **Departments** — HQ admins navigate to Departments to create additional departments (e.g. Finance, Operations). Each department is an independent access boundary with its own membership list.

4. **Invite team members** — admins invite registered users by searching by name or email. The invited user receives the invite in their Invitations inbox, where they can accept or reject it. Role and optional extra permissions are set at invite time.

5. **Upload datasets** — from the Datasets page, editors and admins select a department, choose a CSV file, and upload. The file is parsed server-side and stored in MongoDB with full row and column metadata.

6. **Visualise** — navigate to the Visualise page. Select a department filter and then a dataset. Type a natural-language prompt such as "show me the top 5 countries by count" or "plot revenue over time as a line chart". The Gemini API analyses the dataset schema and sample rows, then returns a chart configuration. Recharts renders the result instantly. Follow-up prompts refine the chart in a multi-turn conversation.

7. **Admin panel** — platform admins access `/admin` to view platform-wide stats (total orgs, users, datasets), list all organisations, toggle platform admin status for any user, and delete organisations with cascading cleanup in both Postgres and MongoDB.

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3 | Component-based UI framework |
| Vite | 5 | Build tool and dev server |
| react-router-dom | 7 | Client-side routing (SPA) |
| styled-components | 6 | CSS-in-JS component styling |
| recharts | 3 | Chart rendering (Bar, Line, Area, Pie, Scatter) |
| @supabase/supabase-js | 2 | Supabase client for auth and session management |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 24 LTS | JavaScript runtime |
| Express | 4 | HTTP server and API routing |
| Supabase | — | Managed Postgres database, Auth, and Row-Level Security |
| MongoDB Atlas | — | Document store for CSV datasets (flexible, variable-column schema) |
| @google/generative-ai | 0.24 | Google Gemini SDK |
| Gemini (`gemini-2.5-flash`) | — | Natural-language chart configuration generation |
| multer | 2 | Multipart file upload handling (4 MB cap, CSV only) |
| csv-parse | 6 | Server-side CSV parsing into structured row/column objects |
| ws | 8 | WebSocket transport for Supabase client in Node.js |
| cors | 2 | Cross-origin request handling between frontend (5173) and backend (3001) |

**Database**

Supabase Postgres with 5 tables:
- `profiles` — user identity, display name, platform admin flag
- `organisations` — org records
- `departments` — one or more per org, including the auto-created HQ
- `memberships` — per-user, per-department role and extra permissions overrides
- `invitations` — pending / accepted / rejected / revoked invite records

MongoDB Atlas with 1 collection:
- `datasets` — one document per uploaded CSV: `{ org_id, department_id, name, uploaded_by, uploaded_at, columns, rows, row_count }`

Row-level security on all Postgres tables. Three Postgres functions: `role_default_permissions()`, `user_can()` (permission check with HQ-grants-everything semantics), and `create_org()` (atomic org + HQ department + admin membership creation).

---

## Development Approach with AI

### AI Tools and Services

| Tool | Role |
|---|---|
| **Claude Code** (Anthropic) | Primary co-developer throughout the entire build — schema design, component scaffolding, routing, debugging, and architecture decisions |
| **Gemini** (`gemini-2.5-flash`) | Receives column names and up to 20 sample rows from a selected dataset; returns a structured JSON chart config `{ chartType, title, xKey, yKeys }` from a natural-language prompt; supports multi-turn refinement via conversation history |

### AI Agents

| Agent | Role and Skills |
|---|---|
| Claude Code | Sole AI agent. Responsibilities covered the full stack: Postgres schema and RLS policy design, MongoDB data model, Express route authoring, React component building, and production bug diagnosis (Supabase session mutex deadlock, cross-schema FK join failures in PostgREST, Gemini model deprecation, chart count-mode edge cases). Proposed and logged architecture decisions when the developer was unfamiliar with an area; outlined full feature scope before writing any code for large phases |

### Co-Developing with AI Approach

| Phase | User Approach | AI Dev | Next Step |
|---|---|---|---|
| **Planning** | Shared a written brief describing the app; set up `prompt_log.md` and `feature_decisions.md` logging conventions before any code was written; <br><br> Discussed persistence architecture and role model as explicit decisions rather than assumptions | Asked clarifying questions on user-org relationships, invite flow, and data model scope; <br><br> Proposed polyglot persistence (Postgres for identity, MongoDB for datasets) with rationale; <br><br> Logged all decisions explicitly | Schema design |
| **Schema & Auth** (Phases 1–2) | Provided Supabase credentials; answered questions on role enum, invite flow, and org auto-creation behaviour; <br><br> Confirmed schema before any application code was written | Scaffolded npm workspaces monorepo with Express and Vite; <br><br> Designed 4-table Postgres schema with enums, RLS policies, indexes, and signup trigger; <br><br> Caught and fixed an env variable prefix mismatch | MongoDB + upload pipeline |
| **Data Pipeline** (Phase 3) | Provided MongoDB URI and confirmed upload cap and full-row storage; <br><br> Requested Node LTS upgrade; <br><br> Reported errors as they came up without prescribing fixes | Implemented multer, csv-parse, and MongoDB native driver; <br><br> Fixed dotenv path issue (wrong cwd for `--env-file`); <br><br> Fixed incorrect table name in auth middleware that blocked all authenticated routes | Upload UI |
| **Upload UI & Dataset Management** (Phase 4) | Confirmed upload flow working end-to-end via manual testing; <br><br> Raised dataset sharing, delete, and search as follow-on requirements after verifying the core flow | Built `DatasetsPage` with upload card, file validation, and dataset table; <br><br> Added authenticated fetch wrapper; <br><br> Added delete endpoint (uploader or admin only) and client-side search | AI visualisation |
| **AI Visualisation** (Phases 5–6) | Answered scope questions (single dataset per session, 20 sample rows); <br><br> Raised provider constraint mid-build and confirmed Gemini as replacement; <br><br> Reported typing lag during manual testing without diagnosing root cause | Built `/api/visualise` with Gemini SDK, conversation history, and model fallback chain; <br><br> Built `ChartRenderer` (5 chart types, count-mode fallback, even-sampling); <br><br> Identified and fixed 3 independent performance root causes in one pass | Tenant isolation |
| **Tenant Isolation & Access Control** (Phase 7) | Confirmed soft UI-only blocks were acceptable for prototype scope; <br><br> Agreed hard backend guards would be addressed in a later phase | Confirmed all endpoints were already scoped by `org_id` via auth middleware — no data leakage possible; <br><br> Implemented UI-only role blocks (`canUpload` derived from `useAuth()`); <br><br> Flagged hard guards as explicit future work | Departments + permissions |
| **Departments & Permissions** (Phase 8) | Raised a single high-level requirement ("add departments so different parts of the org can have their own data"); <br><br> Confirmed full proposed scope before any code was written; <br><br> Ran smoke tests and reported bugs without diagnosing them | Proposed and implemented full Org → Department → Membership model with HQ semantics and `extra_permissions` overrides; <br><br> Rewrote schema and all backend routes; <br><br> Diagnosed Supabase session mutex deadlock and cross-schema PostgREST FK join failure | Platform admin |
| **Platform Admin & Onboarding** (Phase 9) | Applied SQL migration for `is_platform_admin` flag; <br><br> Raised onboarding UX issues (immediate redirect, invite-first flow); <br><br> Described the "waiting for an invitation" state | Built all `/api/admin/` routes and `AdminPage`; <br><br> Redesigned `OnboardingPage` with invite-first layout, collapsible org creation form, and `localStorage`-backed waiting-room mode | Frontend styling |
| **Frontend Styling & Polish** | Specified visual requirements iteratively at the component and property level; <br><br> Directed changes with concrete expected outcomes (e.g. exact hex values, active vs hover distinction) rather than general aesthetic direction | Implemented yellow/amber theme across all pages and components; <br><br> Built mobile hamburger menu with full nav and sign-out footer; <br><br> Ensured colour and interaction patterns were consistent across all pages | Documentation & wrap-up |

### Key Prompts

The following prompts represent the most significant decision points in the build.

**1. Persistence architecture decision**
> *"i am thinking of using supabase for users and postgres, and mongodb for the actual datasets, is this good or should everything be in one place"*

Rather than accepting a default tech stack, this prompt opened a trade-off discussion before committing to a direction. The split was confirmed — relational data (identity, roles, permissions) in Postgres with RLS, flexible CSV data (variable columns, arbitrary rows) in MongoDB — and the rationale was logged into `feature_decisions.md` immediately for reference. Raising the question before implementation prevented a costly data model rewrite later.

**2. Visualisation layer scoping decisions**

Before any code for the AI layer was written, a set of deliberate scope decisions was locked in: send 20 sample rows to the model (not the full dataset) to keep token usage and cost low; let the AI pick the initial chart type while the user refines via follow-up prompts with conversation history maintained; restrict to a single dataset per session. These tradeoffs — accuracy vs cost, simplicity vs power — were agreed explicitly upfront rather than discovered at runtime when they would have been more expensive to revisit.

**3. Access control model stated in business terms**
> *"an organisation should have a HQ department that has access to everything, and multiple other departments who have users that can only access their own data. however users can also have cross department responsibilities who may need access to data from other departments"*

The prompt described the desired access model entirely in business and user terms — no implementation detail, no schema direction. Each clause mapped directly to a technical decision: HQ with full-reach → a `is_hq` flag on departments with a `user_can()` function that checks HQ membership first; department isolation → `org_id` + `department_id` scoping on all dataset queries; cross-department individual access → an `extra_permissions text[]` column on memberships that grants additive access without changing the user's base role. Claude Code proposed the full schema and architecture from this description before writing any code, and the scope was confirmed before implementation started.

### Key Review Points and Decisions

| Review Point | Decision Made |
|---|---|
| Polyglot persistence | Supabase Postgres for identity and tenancy data; MongoDB Atlas for CSV datasets. Relational store for structured, RLS-guarded data; document store for flexible, variable-column CSV rows |
| User-to-org relationship | 1:1 for prototype scope. A user belongs to at most one organisation. Cross-org invites are blocked at create and accept time |
| AI provider | Switched from Anthropic Claude API to Google Gemini (`gemini-2.5-flash`, prepaid) mid-build. Developer's Anthropic account tied to workplace org and unavailable for personal project use |
| Gemini model fallback chain | `['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-flash-latest']` — silent retry on 429 / 503; user message reverted on full failure so retry is one click |
| Invitation flow | Database-level only; no email delivery. Invitees must already be registered. Admins find them via `/api/users/search` |
| CSV upload cap | 4 MB input + 14 MB post-parse JSON guard. CSV-to-JSON expansion is typically 2–5×; MongoDB's document limit is 16 MB |
| Role model | Three tiers: admin (full), editor (upload + edit), viewer (read + visualise). `extra_permissions` text array allows per-user additive grants without changing the base role |
| HQ department | Auto-created atomically with every organisation. HQ membership grants the member's role across every department in the org. HQ cannot be renamed or deleted |
| Backend permission enforcement | Hard backend guards via `user_can()` on every protected endpoint. Earlier phases used soft UI-only blocks; all replaced with explicit per-action checks in Phase 8 |
| Signup trigger | Creates only a profile (no auto-org). Users choose to create an org or accept an invite during onboarding — removes confusion for invited users who should join an existing org |
| Platform admin layer | `is_platform_admin` flag on profiles, independent of org membership. `/api/admin/` routes gated by `requirePlatformAdmin` middleware |

---

## Installation

### Prerequisites

- Node.js v20 or later (install via [nvm](https://github.com/nvm-sh/nvm): `nvm install 24 && nvm use 24`)
- A [Supabase](https://supabase.com) project (free tier works)
- A [MongoDB Atlas](https://www.mongodb.com/atlas) cluster with a database user and an IP allowlist entry
- A [Google AI Studio](https://aistudio.google.com) API key with access to `gemini-2.5-flash`

### Steps

**1. Clone the repository**
```bash
git clone https://github.com/chllee/nobi.git
cd nobi
```

**2. Install all dependencies**
```bash
npm install
```
This installs both frontend and backend packages via npm workspaces.

**3. Configure environment variables**
```bash
cp .env.example .env
```
Open `.env` and fill in:

| Variable | Required | Where to find it |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project **Settings > API > Project URL** |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase project **Settings > API > anon public** key |
| `SUPABASE_URL` | Yes | Same as above (used by the backend with service role) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase project **Settings > API > service_role** key — keep this secret |
| `MONGODB_URI` | Yes | MongoDB Atlas **Database > Connect > Drivers** connection string |
| `GEMINI_API_KEY` | Yes | [Google AI Studio](https://aistudio.google.com) — Generate API key |
| `PORT` | No | Backend port (defaults to `3001`) |
| `FRONTEND_URL` | No | Frontend origin for CORS (defaults to `http://localhost:5173`) |

**4. Apply the database schema**

Open your Supabase project, navigate to **SQL Editor**, paste the contents of `supabase/schema.sql`, and run. This creates all tables, indexes, RLS policies, Postgres functions, and the signup trigger.

**5. Grant yourself platform admin access (optional)**

In the Supabase SQL Editor, after signing up for an account:
```sql
UPDATE profiles SET is_platform_admin = true WHERE email = 'your@email.com';
```

**6. Start the development servers**
```bash
npm run dev
```
Both the backend (port 3001) and frontend (port 5173) start concurrently. The app is available at `http://localhost:5173`.

---

## Usage

| Action | How |
|---|---|
| **Sign up** | Visit the app, click Sign Up, enter your display name, email, and password |
| **Create an organisation** | On the onboarding page, enter your organisation name and click Create |
| **Create a department** | Navigate to Departments (visible to HQ admins), enter a name, click Create |
| **Invite a team member** | Departments → Members on a department → search by name or email → select a role → click Invite |
| **Accept an invitation** | Navigate to Invitations, click Accept on the pending invite |
| **Upload a dataset** | Navigate to Datasets, select the target department, choose a CSV file (max 4 MB), click Upload |
| **Visualise data** | Navigate to Visualise, select a department and dataset, type a natural-language prompt, press Enter or Send |
| **Refine a chart** | Type a follow-up prompt in the same chat panel — conversation history is maintained across turns |
| **Manage member permissions** | Departments → Members → change role or toggle extra permissions checkboxes |
| **Remove a member / leave a department** | Departments → Members → Remove (for managers) or Leave (for self) |
| **Admin panel** | Navigate to Admin (platform admins only) to view stats, manage organisations and users |

---

## Project Structure

```
repo/
├── .env.example              # Environment variable template
├── .gitignore
├── package.json              # npm workspaces root; concurrently runs both servers
│
├── frontend/                 # React + Vite frontend (port 5173)
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx          # App entry point
│       ├── App.jsx           # Routing, auth gate, MembershipGuard
│       ├── context/
│       │   └── AuthContext.jsx   # Session, organisations, memberships, canInDept/canInOrg helpers
│       ├── lib/
│       │   ├── supabase.js   # Supabase client singleton (anon key)
│       │   └── api.js        # Authenticated fetch wrapper (attaches Bearer token)
│       ├── components/
│       │   ├── AppShell.jsx  # Sticky nav bar, mobile menu, pending invite badge
│       │   └── ChartRenderer.jsx  # Recharts wrapper — 5 chart types, count-mode fallback, sampling
│       ├── styles/
│       │   └── auth.js       # Shared styled-components for auth pages
│       └── pages/
│           ├── LoginPage.jsx
│           ├── SignupPage.jsx
│           ├── OnboardingPage.jsx    # Org creation or invite acceptance; waiting-room mode
│           ├── DashboardPage.jsx     # Dataset count, membership count, last upload date
│           ├── DatasetsPage.jsx      # CSV upload, dataset list, client-side search, delete
│           ├── VisualisePage.jsx     # Department + dataset selector, NL chat panel, chart panel
│           ├── DepartmentsPage.jsx   # Department CRUD (HQ admins only)
│           ├── MembersPage.jsx       # Per-department member list, role editing, invite management
│           ├── InvitationsPage.jsx   # Incoming invitation inbox (accept / reject)
│           └── AdminPage.jsx         # Platform admin: overview stats, org table, user table
│
├── backend/                  # Express API server (port 3001)
│   ├── package.json
│   └── src/
│       ├── index.js          # Server entry point, CORS, route mounting, MongoDB connect
│       ├── lib/
│       │   ├── supabase.js   # Supabase service-role client (bypasses RLS)
│       │   └── mongo.js      # MongoDB connection singleton
│       ├── middleware/
│       │   └── auth.js       # JWT validation, org + role lookup, isPlatformAdmin attach
│       └── routes/
│           ├── organisations.js  # POST /api/organisations, GET /api/organisations/me
│           ├── departments.js    # CRUD /api/departments, GET /api/departments/:id/members
│           ├── memberships.js    # PATCH/DELETE /api/memberships/:id
│           ├── invitations.js    # Invite CRUD, accept/reject actions, department invite list
│           ├── users.js          # GET /api/users/search
│           ├── datasets.js       # Upload, list, get by id, delete (MongoDB-backed)
│           ├── visualise.js      # POST /api/visualise — Gemini chat, model fallback chain
│           └── admin.js          # Platform admin routes (stats, org/user management)
│
├── supabase/
│   └── schema.sql            # Full Postgres schema: tables, RLS, functions, trigger
│
└── docs/
    ├── feature_decisions.md  # Architecture decisions and phase milestones log
    └── prompt_log.md         # Session-by-session record of key prompts and actions
```

---

## Reflection

### What Went Well

**Schema-first development.** The full Postgres schema — 5 tables, 3 Postgres functions, RLS policies, indexes, and the signup trigger — was designed and debated before any frontend code was written. The `user_can()` function consolidated all permission logic in one place; every backend route calls it and trusts the result without duplicating role logic. Catching the cross-schema FK join limitation (PostgREST cannot traverse `auth.users` joins automatically) during Phase 8 stabilisation was straightforward because the rest of the schema was already stable.

**Layered permission model.** The Org → Department → Membership model with HQ-grants-everything semantics and additive `extra_permissions` overrides gave the app real multi-tenant utility without a bloated schema. The HQ department as a concept was proposed during architecture planning and held up through all subsequent feature additions without modification.

**Debugging in conversation.** Several production-style bugs — a Supabase session mutex deadlock, a `MembershipGuard` race condition on initial load, a MongoDB filter that passed a raw SQL subquery string as a UUID — were diagnosed through iterative back-and-forth. Holding all prior context in the conversation meant root causes were identified precisely rather than through generic suggestions.

**Model fallback chain.** Gemini model availability changed during development (`gemini-2.0-flash` returned 404 on this API key). Building a silent fallback chain across three model names meant the visualisation endpoint never surfaced model deprecation errors to users, and the rate-limit handler reverts the user's message for a one-click retry.

### What Could Have Been Better

**Soft blocks before hard guards.** Phases 1–7 implemented role-based access as UI-only soft blocks: viewers couldn't see the upload button, but a manually crafted HTTP request would succeed. Phase 8 replaced all of these with real backend enforcement via `user_can()`. The correct approach was known from the start but deferred for speed — the deferred work compounded and required touching every route simultaneously in a single large phase.

**AI provider selection.** The original spec listed Claude as the AI layer. Switching to Gemini mid-build was unavoidable (developer's Anthropic account tied to a workplace org), but it added a session of rework — the conversation history adapter differs between the two APIs (Gemini requires a `history` array plus a separate `sendMessage` call, rather than a flat messages array). Starting with Gemini as the first choice would have been cleaner.

**Supabase session deadlock.** Calling `supabase.auth.getSession()` inside the `onAuthStateChange` callback deadlocked the session mutex, causing the loading state to stay `true` indefinitely and all authenticated pages to render blank. The fix — a module-level token cache updated before `refresh()` — was straightforward once the cause was found, but diagnosing it required reading Supabase internals. A simpler auth flow that avoids calling `getSession()` inside a state change handler would have prevented this.

**Email delivery not implemented.** The invitation flow is entirely database-level. Invited users must log in and check the Invitations page to see pending invites; there is no email notification. For a prototype this is acceptable, but it significantly reduces real-world usability. Email delivery via Supabase Edge Functions or a transactional email provider (Resend, SendGrid) is the obvious next step.

### Key Changes Made and Rationale

| Change | Rationale |
|---|---|
| AI provider: Anthropic Claude → Google Gemini | Developer's Anthropic account tied to workplace org and unavailable for personal project use |
| Soft UI-only access blocks → hard backend permission guards | UI blocks are trivially bypassed; production multi-tenant apps must enforce permissions at the API layer via explicit checks on every protected route |
| Auto-org creation on signup removed | Users now explicitly create an org or accept an invite during onboarding — removes the confusion for invited users who should join an existing org rather than create a new one |
| `getSession()` inside `onAuthStateChange` → module-level token cache | Avoids session mutex deadlock; `AuthContext` calls `setAuthToken(token)` before `refresh()`, removing the internal `getSession()` call from the callback entirely |
| PostgREST cross-schema FK joins → separate profile query + application merge | PostgREST cannot traverse foreign keys into the `auth` schema; profile data for memberships and invitations is now fetched in a second query and merged in the route handler |
| MongoDB row cap at 1000 + even-sampling at 300 points | Full dataset rows sent to the browser caused chart re-render lag on large CSVs; capping rows at the API layer and sampling in `prepareData` keeps chart performance acceptable without affecting visualisation accuracy for typical datasets |
