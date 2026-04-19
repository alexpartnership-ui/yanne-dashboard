# Sales Manager Role-Scoped Access — Design Spec

**Date:** 2026-04-19
**Author:** Alex Ozdemir (CEO), via Claude Code
**Status:** Approved, ready for implementation plan
**Scope:** CEO Dashboard (`~/yanne-dashboard`)

## 1. Goal

Give an incoming sales manager hire a login to the Yanne Capital dashboard that exposes **only Sales Intelligence** — call scores, rep performance, rubrics, deals, trackers, call library, benchmarks, AI assistant. Everything outside that pillar (Campaigns, Fulfillment, Operations, Investor Relations, CEO Dashboard, Finance, Settings) must be inaccessible from both the UI and the raw API.

This is the first non-admin user the dashboard will have. The access model must scale to future pillar managers (Fulfillment, Ops, IR) and cross-pillar managers (e.g., COO covering Sales + Ops) without a redesign.

## 2. Current state

The repo already contains scaffolded auth infrastructure that is partially wired but not enforced:

- **Frontend:** JWT-based login (`LoginPage`, `useAuth`, `AuthGuard`). `AuthGuard` accepts an `allowedRoles` prop but no route uses it today. Role type is `'admin' | 'manager' | 'rep' | 'finance'`.
- **Backend (`server.mjs`):** `verifyToken` and `requireRole` middleware exist. Users stored in a local `users.json` file with bcrypt hashes. Only ~13 of ~80 API endpoints require authentication. The other ~65 endpoints (including `/api/calls`, `/api/deals`, `/api/investors`, `/api/scorecard/data`) are publicly readable.
- **Sidebar (`Sidebar.tsx`):** Renders all nav sections to every authed user.

The public API exposure is a pre-existing security gap that this work closes as a prerequisite — role-gating the UI is meaningless if the raw endpoints are open.

## 3. Architecture

### 3.1 Auth provider: Supabase Auth

Replace the custom JWT + `users.json` system with Supabase Auth (gotrue). Rationale:

- Managed password reset, email verification, session refresh, optional MFA, optional OAuth — features we would otherwise build or defer forever.
- Audit trail on auth events included.
- The Yanne Supabase project (`ewmqiwunzqpyhdjowiyn.supabase.co`) already backs the dashboard's data layer; adding auth consolidates the stack.

### 3.2 Role model: seniority tier + pillar access list

Two fields on every user:

- **`role`** — `'admin' | 'manager' | 'member'`. Seniority tier, orthogonal to pillar. Admin is the only role permitted to manage users, rotate credentials, or perform destructive operations.
- **`pillar_access`** — `text[]`. Which business pillars the user can read/act on. Values: `'sales'`, `'campaigns'`, `'fulfillment'`, `'operations'`, `'investor-relations'`, `'goals'`, `'finance'`, or the wildcard `'*'`.

Examples:
- Alex (CEO): `role='admin', pillar_access=['*']`
- Sales manager hire: `role='manager', pillar_access=['sales']`
- Future COO: `role='manager', pillar_access=['sales','operations']`
- Future fulfillment manager: `role='manager', pillar_access=['fulfillment']`

This model mirrors the six-pillar structure already codified in `CLAUDE.md` and avoids role-explosion.

### 3.3 Data model

New table in Supabase public schema:

```sql
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('admin','manager','member')),
  pillar_access text[] not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_profiles enable row level security;

-- Every authenticated user can read their own profile.
create policy "read own profile"
  on public.user_profiles
  for select
  using (auth.uid() = id);

-- Admins can read and modify every profile.
create policy "admins manage all profiles"
  on public.user_profiles
  for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Trigger: auto-update updated_at on any change.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $func$
begin new.updated_at = now(); return new; end;
$func$;

create trigger user_profiles_touch
  before update on public.user_profiles
  for each row execute function public.touch_updated_at();
```

## 4. Backend changes (`server.mjs`)

### 4.1 Remove

- `USERS_FILE`, `loadUsers`, `saveUsers`
- `bcryptjs` import and all `bcrypt.*` calls
- `jsonwebtoken` hand-signed token usage (prefer `supabase.auth.getUser` instead)
- `verifyToken` middleware (replaced by `verifySupabaseJWT`)
- `requireRole` middleware (repurposed to check the new tier values)
- `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/change-password` handlers (Supabase Auth handles these client-side)
- Hand-rolled cookie parser (Supabase's cookie integration handles session cookies)

Estimated deletion: ~250–300 lines.

### 4.2 Add

**`verifySupabaseJWT(req, res, next)`**
1. Read access token from the Supabase session cookie (or `Authorization: Bearer`).
2. Call `supabase.auth.getUser(token)` using the service role client to validate.
3. On success, fetch `user_profiles` row for `user.id`.
4. Attach `req.user = { id, email, name, role, pillar_access }`.
5. On failure, return 401.

**`requirePillar(pillar)`**
- Returns 403 unless `req.user.pillar_access.includes(pillar)` or `req.user.pillar_access.includes('*')`.

**`requireRole(...roles)`** (repurposed)
- Checks `req.user.role` against the new tier values (`admin | manager | member`).

**`/api/users*` handlers (rewritten)**
- Use `supabase.auth.admin.createUser`, `supabase.auth.admin.deleteUser`, `supabase.auth.admin.updateUserById`.
- Paired with upsert into `user_profiles` for role/pillar fields.
- Guarded by `requireRole('admin')`.

### 4.3 Lock down all endpoints

Every endpoint gets `verifySupabaseJWT`. Pillar gating is layered on via route-prefix registration, not 80 manual edits. Implementation sketch:

```js
const pillarMap = [
  { prefix: ['/api/calls', '/api/reps', '/api/deals', '/api/trackers',
             '/api/call-search', '/api/benchmarks', '/api/scorecard',
             '/api/coaching-adherence', '/api/dashboard-stats',
             '/api/forecast', '/api/rep-call-history', '/api/rep-checkins',
             '/api/setter-checkins', '/api/export',
             '/api/deal-staleness'], pillar: 'sales' },
  { prefix: ['/api/bison', '/api/copy-library', '/api/airtable/senders',
             '/api/heyreach'], pillar: 'campaigns' },
  { prefix: ['/api/monday', '/api/clients', '/api/airtable/meetings'],
    pillar: 'fulfillment' },
  { prefix: ['/api/airtable/inbox', '/api/health/data-sources',
             '/api/digest'], pillar: 'operations' },
  { prefix: ['/api/investors'], pillar: 'investor-relations' },
  { prefix: ['/api/ceo-stats', '/api/slack/email-reports',
             '/api/slack/meetings-booked'], pillar: 'goals' },
]

// Order matters: register public health route BEFORE the blanket auth middleware.
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.use('/api', verifySupabaseJWT)
for (const { prefix, pillar } of pillarMap) {
  for (const p of prefix) app.use(p, requirePillar(pillar))
}
```

**Exceptions:**
- `/api/health` (unauthenticated — used for liveness checks). Registered before the blanket `verifySupabaseJWT` so it's exempt.
- `/api/auth/*` — removed entirely; auth happens client-side against Supabase. One exception: keep `GET /api/auth/me` as a server-side endpoint (auth-required, not pillar-gated) that returns the current user's enriched profile (id, email, name, role, pillar_access) for the frontend to use.
- `/api/chat` — auth-required but NOT pillar-gated. Scoping happens inside `gatherContext` via `req.user.pillar_access` so the endpoint works for any future manager role, not just sales.
- Admin-only endpoints (`/api/users`, `/api/audit-log`, `POST /api/heyreach/senders`, `POST /api/monday/overdue/notify`, `POST /api/monday/create-onboarding`, `POST /api/digest/send`) get an additional `requireRole('admin')`.

### 4.4 Scoped `/chat` context

`gatherContext()` currently fans out to any data source the keyword matches. Change it to accept the caller's `pillar_access` and skip any data-source block whose pillar isn't in the list. Sales-pillar sources: `call_logs`, `deals`, `reps`, rubric tables, trackers. Every other source (campaigns, investors, Monday, Airtable inbox) is gated.

The system prompt gains a line: *"The user has access to the following pillars: {pillar_access}. Refuse to answer questions that require data outside those pillars."*

## 5. Frontend changes

### 5.1 Auth integration

- Install `@supabase/supabase-js` as a frontend dep (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` already in `.env.example`).
- New `src/lib/supabaseClient.ts` wrapping the browser client.
- Rewrite `useAuth.ts`:
  - `login(email, password)` → `supabase.auth.signInWithPassword`
  - `logout` → `supabase.auth.signOut`
  - On mount, subscribe to `supabase.auth.onAuthStateChange` and fetch `user_profiles` row via `/api/auth/me` (returns the enriched profile with pillar_access).
  - Replace `sessionStorage` cache with Supabase's built-in session persistence.
- `User` type gains `pillar_access: string[]`.

### 5.2 `AuthGuard` + routing

- Add `allowedPillars?: string[]` prop.
- If user has no overlap with `allowedPillars` and lacks `'*'`, redirect to their first accessible page (compute from their `pillar_access`; sales manager lands on `/dashboard`).
- `App.tsx` wraps route groups:

```tsx
<Route element={<AuthGuard allowedPillars={['sales']} />}>
  {/* 9 sales pages */}
</Route>
<Route element={<AuthGuard allowedPillars={['campaigns']} />}>
  {/* outbound/GTM pages */}
</Route>
```

- Admin-only routes (`/settings`, `/settings/audit`, `/ceo`) wrap with `<AuthGuard allowedRoles={['admin']} />`.

### 5.3 Sidebar filtering

- `Sidebar.tsx` assigns each section a pillar tag (`Client Acquisition → 'sales'`, `Clients → 'fulfillment'`, etc.).
- Filter sections: `sections.filter(s => user.pillar_access.includes(s.pillar) || user.pillar_access.includes('*'))`.
- Settings section shown only if `role === 'admin'`.

### 5.4 Login + password reset

- `LoginPage` calls `useAuth.login`. Add "Forgot password?" link → `supabase.auth.resetPasswordForEmail(email)`. New `/reset-password` page that completes the flow.

### 5.5 SettingsPage user management

- Existing User Management UI gains:
  - Role dropdown: `admin | manager | member`
  - Pillar multi-select: `sales, campaigns, fulfillment, operations, investor-relations, goals, finance` (+ `*` as "All")
- Create flow triggers a Supabase invite email rather than setting an initial password inline.

## 6. Migration

One-time script (`scripts/migrate-to-supabase-auth.mjs`):

1. Create Supabase Auth user for `alex@yannetr.net` via `supabase.auth.admin.createUser`.
2. Insert `user_profiles` row: `role='admin', pillar_access=['*']`.
3. Print new admin-invite URL to console (for first sign-in).
4. Delete `users.json` from disk.
5. Leave `audit_log.json` untouched (out of scope — stays on disk).

The sales manager's account is created afterward through the Settings UI once the migration lands.

## 7. Environment + secrets

New required env vars on the server (already defined in `.env.example` for Supabase):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` — server-only, used for `supabase.auth.getUser`, `admin.*` calls, and reading `user_profiles`.

New frontend env vars (already defined):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`JWT_SECRET` becomes unused — remove from `.env.example`.

## 8. Testing

Before marking complete, verify manually:

1. **Admin login** — log in as Alex, every page loads, every API endpoint returns 200.
2. **Sales manager login** — log in as sales manager; sidebar shows only Client Acquisition section.
3. **UI gating** — navigating to `/relationships/investors` as sales manager redirects to `/dashboard`.
4. **API gating** — `curl` with sales manager's cookie against `/api/investors` returns 403. Against `/api/calls` returns 200.
5. **Unauthenticated request** — `curl` without cookie against any non-`/api/health` endpoint returns 401.
6. **Chat scoping** — sales manager asks the AI "how's our investor pipeline?" and receives a refusal; asks "how's Jake doing this week?" and gets a real answer.
7. **Password reset** — request reset email as sales manager, complete flow, log in with new password.
8. **Admin-only actions** — sales manager hitting `POST /api/users` returns 403.

## 9. Out of scope

Explicitly deferred, to be revisited later:

- **MFA enforcement.** Supabase supports TOTP; enabling is a dashboard toggle. Not required on day one.
- **Per-rep visibility.** Sales manager sees all reps, not one. Per-rep scoping is a separate feature.
- **SSO / Google OAuth.** Supabase supports it; enabled later if desired.
- **Audit log migration.** `audit_log.json` stays on disk. Moving to Supabase is separate.
- **Session refresh rotation beyond Supabase defaults.**
- **Rate limiting per user** (existing rate limiters are per-IP; acceptable for now).

## 10. Risks

- **Breaking existing Alex session.** The migration deletes `users.json`; Alex must sign in fresh. Mitigated by running the migration script during a known maintenance window.
- **Missed endpoint.** A new endpoint added after this ships without pillar gating silently becomes public. Mitigated by the `// Order matters: register public health route BEFORE the blanket auth middleware.
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.use('/api', verifySupabaseJWT)` catch-all; anything not pillar-mapped still requires auth, just isn't pillar-restricted.
- **Chat context leakage.** If `gatherContext` has any data source not covered by the pillar filter, sales manager could see other pillars' data. Mitigated by auditing every branch of `gatherContext` during implementation.
- **Supabase outage.** Dashboard becomes unloggable-into during an outage. Acceptable; existing Supabase dependency in the data layer means the dashboard is already down anyway.
