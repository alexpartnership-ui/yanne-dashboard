# Sales Manager Role-Scoped Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a login that scopes a sales manager hire to Sales Intelligence only, while closing the pre-existing API auth gap (65 of ~80 endpoints currently unauthenticated).

**Architecture:** Replace custom JWT + `users.json` with Supabase Auth. Add `user_profiles` table carrying `role` (admin|manager|member) and `pillar_access` (text[]). Apply `verifySupabaseJWT` to `/api/*`, then layer `requirePillar(...)` middleware by URL prefix. Frontend guards routes with `AuthGuard allowedPillars=[...]` and filters the sidebar by the user's pillar list.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind v4 (frontend), Express + Node 20 (backend), Supabase (Auth + Postgres), `@supabase/supabase-js`, deployed to Coolify.

**Spec:** `docs/superpowers/specs/2026-04-19-sales-manager-role-access-design.md`

---

## File Structure

### New files

| Path | Purpose |
|---|---|
| `supabase/migrations/20260419000000_user_profiles.sql` | Schema migration |
| `scripts/migrate-to-supabase-auth.mjs` | One-time: invite admin, drop `users.json` |
| `tests/auth-middleware.test.mjs` | Unit tests via `node:test` |
| `tests/smoke-endpoints.sh` | Curl matrix verifying pillar gating |
| `src/lib/supabaseClient.ts` | Browser Supabase singleton |
| `src/pages/ResetPasswordPage.tsx` | Completes `resetPasswordForEmail` flow |

### Modified files

| Path | Change |
|---|---|
| `server.mjs` | Remove custom JWT auth; add Supabase middleware; lock down all endpoints; scope `/chat` |
| `package.json` | `+@supabase/supabase-js`, `-bcryptjs`, `-jsonwebtoken` |
| `.env.example` | Drop `JWT_SECRET`, `ADMIN_INITIAL_PASSWORD` |
| `src/hooks/useAuth.ts` | Rewrite around Supabase Auth |
| `src/components/AuthGuard.tsx` | Add `allowedPillars` |
| `src/components/Sidebar.tsx` | Filter sections by `user.pillar_access` |
| `src/App.tsx` | Wrap route groups per pillar |
| `src/pages/LoginPage.tsx` | Supabase signin + forgot-password link |
| `src/pages/SettingsPage.tsx` | Role dropdown + pillar multi-select |

### Deleted at runtime

- `users.json` (removed by migration script)

---
## Phase 1 — Database schema

### Task 1: Create `user_profiles` migration

**Files:**
- Create: `supabase/migrations/20260419000000_user_profiles.sql`

- [ ] **Step 1: Write migration SQL**

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

create policy "read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "admins manage all profiles"
  on public.user_profiles for all
  using (exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin'));

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $func$
begin new.updated_at = now(); return new; end;
$func$;

create trigger user_profiles_touch
  before update on public.user_profiles
  for each row execute function public.touch_updated_at();
```

- [ ] **Step 2: Apply in Supabase SQL editor**

Open https://supabase.com/dashboard/project/ewmqiwunzqpyhdjowiyn/sql, paste, run.

- [ ] **Step 3: Verify**

Run `select table_name from information_schema.tables where table_name = 'user_profiles';` and `select policyname from pg_policies where tablename = 'user_profiles';` — expect 1 table and 2 policies.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260419000000_user_profiles.sql
git commit -m "feat(auth): add user_profiles schema + RLS"
```

---

## Phase 2 — Backend auth infrastructure

### Task 2: Install Supabase SDK

**Files:** modify `package.json`

- [ ] **Step 1:** `npm install @supabase/supabase-js`
- [ ] **Step 2:** `git add package.json package-lock.json && git commit -m "feat(auth): add @supabase/supabase-js"`

### Task 3: Add Supabase client + middleware in `server.mjs`

**Files:** modify `server.mjs`

- [ ] **Step 1:** After existing imports (around line 15), add:

```js
import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
  process.exit(1)
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)
```

- [ ] **Step 2:** Replace the old auth block (currently `server.mjs:47-199`, from `// ─── Phase 1.1: JWT Auth` through the `/api/auth/logout` handler) with:

```js
async function verifySupabaseJWT(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Authentication required' })
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired token' })
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('user_profiles')
    .select('name, role, pillar_access')
    .eq('id', data.user.id)
    .single()
  if (profErr || !profile) return res.status(403).json({ error: 'No profile — contact admin' })
  req.user = { id: data.user.id, email: data.user.email, name: profile.name, role: profile.role, pillar_access: profile.pillar_access }
  next()
}

function requirePillar(pillar) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    const ok = req.user.pillar_access.includes(pillar) || req.user.pillar_access.includes('*')
    if (!ok) return res.status(403).json({ error: 'Insufficient pillar access' })
    next()
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient role' })
    next()
  }
}

export { verifySupabaseJWT, requirePillar, requireRole }
```

- [ ] **Step 3:** At the bottom of `server.mjs`, wrap the `app.listen(...)` call so importing the module for tests does not start a listener:

```js
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  app.listen(PORT, () => console.log(`Server on :${PORT}`))
}
```

- [ ] **Step 4:** `git add server.mjs && git commit -m "feat(auth): Supabase verifyJWT + requirePillar middleware"`

### Task 4: Unit tests for middleware

**Files:** create `tests/auth-middleware.test.mjs`

- [ ] **Step 1:** Write:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
import { requirePillar, requireRole } from '../server.mjs'

test('requirePillar passes when user has pillar', () => {
  const req = { user: { pillar_access: ['sales'] } }
  let called = false
  const res = { status: () => res, json: () => res }
  requirePillar('sales')(req, res, () => { called = true })
  assert.equal(called, true)
})

test('requirePillar passes on wildcard', () => {
  const req = { user: { pillar_access: ['*'] } }
  let called = false
  const res = { status: () => res, json: () => res }
  requirePillar('investor-relations')(req, res, () => { called = true })
  assert.equal(called, true)
})

test('requirePillar rejects when pillar missing', () => {
  const req = { user: { pillar_access: ['sales'] } }
  let status = 0
  const res = { status: (s) => { status = s; return res }, json: () => res }
  requirePillar('investor-relations')(req, res, () => { throw new Error('should not call next') })
  assert.equal(status, 403)
})

test('requireRole passes for matching role', () => {
  const req = { user: { role: 'admin' } }
  let called = false
  const res = { status: () => res, json: () => res }
  requireRole('admin')(req, res, () => { called = true })
  assert.equal(called, true)
})

test('requireRole rejects for wrong role', () => {
  const req = { user: { role: 'manager' } }
  let status = 0
  const res = { status: (s) => { status = s; return res }, json: () => res }
  requireRole('admin')(req, res, () => { throw new Error('should not call next') })
  assert.equal(status, 403)
})
```

- [ ] **Step 2:** Run `node --test tests/auth-middleware.test.mjs` — expect 5 pass.
- [ ] **Step 3:** `git add tests/auth-middleware.test.mjs && git commit -m "test(auth): middleware unit tests"`

---

## Phase 3 — Endpoint lockdown

### Task 5: Ensure `/api/health` is registered before blanket middleware

The existing `/api/health` handler at `server.mjs:272` already runs first in Express registration order. After Task 6 adds `app.use('/api', verifySupabaseJWT)` BELOW it, health stays public. Verify by inspection; no code change.

### Task 6: Blanket `verifySupabaseJWT` + pillar-map

**Files:** modify `server.mjs`

- [ ] **Step 1:** Immediately after the `/api/health` and `/api/health/data-sources` handlers (around line 273), insert:

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
  { prefix: ['/api/airtable/inbox', '/api/digest'], pillar: 'operations' },
  { prefix: ['/api/investors'], pillar: 'investor-relations' },
  { prefix: ['/api/ceo-stats', '/api/slack/email-reports',
             '/api/slack/meetings-booked'], pillar: 'goals' },
]

app.use('/api', verifySupabaseJWT)
for (const { prefix, pillar } of pillarMap) {
  for (const p of prefix) app.use(p, requirePillar(pillar))
}
```

- [ ] **Step 2:** `npm run dev` → curl `/api/health` returns 200; curl `/api/calls` without Authorization returns 401.
- [ ] **Step 3:** `git add server.mjs && git commit -m "feat(auth): blanket verifyJWT + pillar gating on /api"`

### Task 7: Admin-only gate on destructive endpoints

**Files:** modify `server.mjs`

- [ ] **Step 1:** Add `requireRole('admin')` as an additional middleware on these existing routes. Find each by `grep -n` and insert the middleware:

```js
app.post('/api/heyreach/senders', requireRole('admin'), async (req, res) => { /* existing */ })
app.post('/api/monday/overdue/notify', requireRole('admin'), async (req, res) => { /* existing */ })
app.post('/api/monday/create-onboarding', requireRole('admin'), async (req, res) => { /* existing */ })
app.post('/api/digest/send', requireRole('admin'), async (req, res) => { /* existing */ })
```

(The old `verifyToken` is already deleted in Task 9; these inherit `verifySupabaseJWT` via the blanket middleware.)

- [ ] **Step 2:** `git add server.mjs && git commit -m "feat(auth): requireRole(admin) on destructive endpoints"`

### Task 8: Add `/api/auth/me` + admin `/api/users*`

**Files:** modify `server.mjs`

- [ ] **Step 1:** Add, immediately after the middleware block from Task 3:

```js
app.get('/api/auth/me', verifySupabaseJWT, (req, res) => {
  res.json({ user: req.user })
})

app.get('/api/users', verifySupabaseJWT, requireRole('admin'), async (_req, res) => {
  const { data: profiles, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, name, role, pillar_access, created_at')
  if (error) return res.status(500).json({ error: error.message })
  const { data: { users: authUsers }, error: authErr } = await supabaseAdmin.auth.admin.listUsers()
  if (authErr) return res.status(500).json({ error: authErr.message })
  const byId = Object.fromEntries(authUsers.map(u => [u.id, u.email]))
  res.json(profiles.map(p => ({ ...p, email: byId[p.id] || null })))
})

app.post('/api/users', verifySupabaseJWT, requireRole('admin'), async (req, res) => {
  const { email, name, role, pillar_access } = req.body
  if (!email || !name || !role || !Array.isArray(pillar_access)) return res.status(400).json({ error: 'email, name, role, pillar_access required' })
  if (!['admin', 'manager', 'member'].includes(role)) return res.status(400).json({ error: 'invalid role' })
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { data: { name } })
  if (error) return res.status(400).json({ error: error.message })
  const { error: profErr } = await supabaseAdmin.from('user_profiles').insert({ id: data.user.id, name, role, pillar_access })
  if (profErr) return res.status(500).json({ error: profErr.message })
  res.json({ id: data.user.id, email, name, role, pillar_access })
})

app.patch('/api/users/:id', verifySupabaseJWT, requireRole('admin'), async (req, res) => {
  const { name, role, pillar_access } = req.body
  const patch = {}
  if (name !== undefined) patch.name = name
  if (role !== undefined) {
    if (!['admin', 'manager', 'member'].includes(role)) return res.status(400).json({ error: 'invalid role' })
    patch.role = role
  }
  if (pillar_access !== undefined) {
    if (!Array.isArray(pillar_access)) return res.status(400).json({ error: 'pillar_access must be array' })
    patch.pillar_access = pillar_access
  }
  const { error } = await supabaseAdmin.from('user_profiles').update(patch).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

app.delete('/api/users/:id', verifySupabaseJWT, requireRole('admin'), async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'cannot delete self' })
  const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})
```

- [ ] **Step 2:** `git add server.mjs && git commit -m "feat(auth): /api/auth/me + admin CRUD via Supabase admin API"`

---

## Phase 4 — Remove old auth code

### Task 9: Delete old JWT auth code

**Files:** modify `server.mjs`

- [ ] **Step 1:** Delete each of the following from `server.mjs`:
  - `import jwt from 'jsonwebtoken'` (line 7)
  - `import bcrypt from 'bcryptjs'` (line 8)
  - `JWT_SECRET` + `JWT_EXPIRES` constants (lines 47-53)
  - `USERS_FILE`, `loadUsers`, `saveUsers` (lines 84-106)
  - Old `verifyToken`, old `requireRole`, hand-rolled cookie parser (lines 126-160)
  - Old `POST /api/auth/login` (lines 164-187)
  - Old `POST /api/auth/logout` (lines 189-199)
  - Old `GET /api/auth/me` (lines 201-205)
  - Old `GET /api/users`, `POST /api/users`, `DELETE /api/users/:id` (lines 207-245)
  - Old `POST /api/auth/change-password` (lines 247-263)
  - Keep `auditLog` and `/api/audit-log` — they still work under the new `requireRole`

- [ ] **Step 2:** `npm run dev` — server starts cleanly. `/api/auth/login` returns 404.
- [ ] **Step 3:** `git add server.mjs && git commit -m "refactor(auth): remove custom JWT + users.json"`

### Task 10: Uninstall `bcryptjs` + `jsonwebtoken`

- [ ] **Step 1:** `npm uninstall bcryptjs jsonwebtoken`
- [ ] **Step 2:** `git add package.json package-lock.json && git commit -m "chore(auth): drop bcryptjs + jsonwebtoken"`

### Task 11: Clean `.env.example`

**Files:** modify `.env.example`

- [ ] **Step 1:** Remove `JWT_SECRET=...` and `ADMIN_INITIAL_PASSWORD=...` lines. Final file:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-key
ENCRYPTION_KEY=generate-a-64-char-hex-secret
```

- [ ] **Step 2:** `git add .env.example && git commit -m "chore(env): drop JWT_SECRET, ADMIN_INITIAL_PASSWORD"`

---

## Phase 5 — Scoped `/chat`

### Task 12: Scope `gatherContext` + system prompt by `pillar_access`

**Files:** modify `server.mjs`

- [ ] **Step 1:** Change `async function gatherContext(userMessage)` to `async function gatherContext(userMessage, pillarAccess)`. Inside, guard each data-source branch:

```js
const has = (p) => pillarAccess.includes(p) || pillarAccess.includes('*')

if (has('sales') && /calls?|deals?|reps?|rubric|score/i.test(userMessage)) {
  // existing sales fetch (call_logs, deals, reps, rubrics, trackers)
}
if (has('campaigns') && /campaign|bison|cold[- ]?email|copy/i.test(userMessage)) {
  // existing campaigns fetch
}
if (has('investor-relations') && /investor|mandate|cadence/i.test(userMessage)) {
  // existing investor fetch
}
if (has('fulfillment') && /monday|teaser|onboard/i.test(userMessage)) {
  // existing fulfillment fetch
}
if (has('operations') && /inbox|ibm|compliance|workflow/i.test(userMessage)) {
  // existing ops fetch
}
```

**Audit every data-source reference inside `gatherContext`** — every fetch must sit behind a `has(pillar)` gate. No bare `supabase.from(...)` calls outside a guard.

- [ ] **Step 2:** In the `/api/chat` handler (line 2394), replace `await gatherContext(lastUserMsg.content)` with `await gatherContext(lastUserMsg.content, req.user.pillar_access)`. Prepend to the system prompt:

```js
const pillarLine = `The user has access to the following pillars: ${req.user.pillar_access.join(', ')}. Refuse to answer questions that require data from pillars the user does not have.`
const systemForThisRequest = `${pillarLine}\n\n${SYSTEM_PROMPT}`
```

Pass `system: systemForThisRequest` to `anthropic.messages.stream`.

- [ ] **Step 3:** `git add server.mjs && git commit -m "feat(chat): scope context + system prompt by pillar_access"`

---

## Phase 6 — Migration script

### Task 13: Write migration script

**Files:** create `scripts/migrate-to-supabase-auth.mjs`

- [ ] **Step 1:** Write:

```js
#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const USERS_FILE = join(ROOT, 'users.json')
const ADMIN_EMAIL = 'alex@yannetr.net'
const ADMIN_NAME = 'Alex Ozdemir'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY'); process.exit(1)
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } })

async function upsertProfile(id) {
  const { error } = await supabase.from('user_profiles').upsert({
    id, name: ADMIN_NAME, role: 'admin', pillar_access: ['*'],
  })
  if (error) throw error
  console.log('Upserted admin user_profiles row')
}

async function main() {
  console.log(`Inviting ${ADMIN_EMAIL}...`)
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(ADMIN_EMAIL, { data: { name: ADMIN_NAME } })
  if (error) {
    if (/already registered|already been registered/i.test(error.message)) {
      console.log('Admin auth user already exists — finding profile...')
      const { data: list, error: listErr } = await supabase.auth.admin.listUsers()
      if (listErr) throw listErr
      const existing = list.users.find(u => u.email === ADMIN_EMAIL)
      if (!existing) throw new Error(`Could not find ${ADMIN_EMAIL}`)
      await upsertProfile(existing.id)
    } else { throw error }
  } else {
    console.log(`Invite sent — user id: ${data.user.id}`)
    await upsertProfile(data.user.id)
  }

  if (existsSync(USERS_FILE)) { unlinkSync(USERS_FILE); console.log('Deleted users.json') }
  else { console.log('users.json already absent') }

  console.log(`\nMigration complete. Check ${ADMIN_EMAIL} for invite email and set your password.`)
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2:** Commit (do NOT run yet — script runs in Task 23):

```bash
git add scripts/migrate-to-supabase-auth.mjs
git commit -m "feat(auth): migration script"
```

---

## Phase 7 — Frontend

### Task 14: Ensure `@supabase/supabase-js` is installed

- [ ] **Step 1:** `npm ls @supabase/supabase-js` — confirm present (added in Task 2).

### Task 15: Browser Supabase client

**Files:** create `src/lib/supabaseClient.ts`

- [ ] **Step 1:** Write:

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anon) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
```

- [ ] **Step 2:** `git add src/lib/supabaseClient.ts && git commit -m "feat(auth): browser Supabase client"`

### Task 16: Rewrite `useAuth.ts`

**Files:** modify `src/hooks/useAuth.ts`

- [ ] **Step 1:** Replace entire file:

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'manager' | 'member'
  pillar_access: string[]
}

interface AuthState { user: User | null; loading: boolean }

async function apiFetch(url: string, opts: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> || {}),
  }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  const res = await fetch(url, { ...opts, headers })
  if (res.status === 401) { await supabase.auth.signOut(); throw new Error('Session expired') }
  return res
}

export { apiFetch }

async function fetchProfile(): Promise<User | null> {
  try {
    const res = await apiFetch('/api/auth/me')
    if (!res.ok) return null
    const { user } = await res.json()
    return user
  } catch { return null }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      setState({ user: session ? await fetchProfile() : null, loading: false })
    })()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!mounted) return
      setState({ user: session ? await fetchProfile() : null, loading: false })
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }, [])

  const logout = useCallback(async () => { await supabase.auth.signOut() }, [])

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw new Error(error.message)
  }, [])

  return { authed: !!state.user, user: state.user, loading: state.loading, login, logout, resetPassword }
}
```

- [ ] **Step 2:** `git add src/hooks/useAuth.ts && git commit -m "feat(auth): useAuth rewritten for Supabase"`

### Task 17: Extend `AuthGuard` with `allowedPillars`

**Files:** modify `src/components/AuthGuard.tsx`

- [ ] **Step 1:** Replace entire file:

```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface AuthGuardProps {
  allowedRoles?: Array<'admin' | 'manager' | 'member'>
  allowedPillars?: string[]
}

function firstAccessiblePath(pillarAccess: string[]): string {
  if (pillarAccess.includes('*') || pillarAccess.includes('sales')) return '/dashboard'
  if (pillarAccess.includes('campaigns')) return '/outbound/email'
  if (pillarAccess.includes('fulfillment')) return '/clients/overview'
  if (pillarAccess.includes('investor-relations')) return '/relationships/investors'
  if (pillarAccess.includes('goals')) return '/ceo'
  return '/login'
}

export function AuthGuard({ allowedRoles, allowedPillars }: AuthGuardProps) {
  const { authed, user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!authed || !user) return <Navigate to="/login" state={{ from: location }} replace />

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={firstAccessiblePath(user.pillar_access)} replace />
  }
  if (allowedPillars && allowedPillars.length > 0) {
    const hasAccess = user.pillar_access.includes('*') ||
      allowedPillars.some(p => user.pillar_access.includes(p))
    if (!hasAccess) return <Navigate to={firstAccessiblePath(user.pillar_access)} replace />
  }
  return <Outlet />
}
```

- [ ] **Step 2:** `git add src/components/AuthGuard.tsx && git commit -m "feat(auth): AuthGuard supports allowedPillars"`

---

### Task 18: Wrap routes in `App.tsx` per pillar

**Files:** modify `src/App.tsx`

- [ ] **Step 1:** Add lazy import near the top:

```tsx
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))
```

- [ ] **Step 2:** Replace the single `<Route element={<AuthGuard />}>` block with pillar-grouped guards. Inside `<Suspense>`, use:

```tsx
<Route path="/login" element={<LoginPage />} />
<Route path="/reset-password" element={<ResetPasswordPage />} />

<Route element={<AuthGuard allowedPillars={['sales']} />}>
  <Route element={<Layout />}>
    <Route path="/dashboard" element={<AcquisitionDashboard />} />
    <Route path="/calls" element={<CallsPage />} />
    <Route path="/calls/:id" element={<CallDetailPage />} />
    <Route path="/reps" element={<RepsPage />} />
    <Route path="/deals" element={<DealsPage />} />
    <Route path="/deals/ai" element={<DealsAIPage />} />
    <Route path="/trackers" element={<TrackersPage />} />
    <Route path="/call-search" element={<CallSearchPage />} />
    <Route path="/benchmarks" element={<BenchmarksPage />} />
    <Route path="/chat" element={<ChatPage />} />
  </Route>
</Route>

<Route element={<AuthGuard allowedPillars={['campaigns']} />}>
  <Route element={<Layout />}>
    <Route path="/outbound/email" element={<EmailIntelligencePage />} />
    <Route path="/outbound/campaigns" element={<ActiveCampaignsPage />} />
    <Route path="/outbound/copy" element={<CopyLibraryPage />} />
    <Route path="/outbound/setters" element={<SetterPerformancePage />} />
    <Route path="/outbound/leads" element={<LeadQualityPage />} />
    <Route path="/outbound/linkedin" element={<LinkedInOutboundPage />} />
  </Route>
</Route>

<Route element={<AuthGuard allowedPillars={['fulfillment']} />}>
  <Route element={<Layout />}>
    <Route path="/clients/overview" element={<ClientOverviewPage />} />
    <Route path="/clients/campaigns" element={<CampaignDashboardsPage />} />
    <Route path="/clients/onboarding" element={<OnboardingTrackerPage />} />
    <Route path="/clients/deals" element={<PlaceholderPage title="Client Deal Pipeline" source="Airtable" previews={['Deal stages', 'Expected close dates', 'Deal values']} />} />
    <Route path="/clients/reporting" element={<ReportingPage />} />
  </Route>
</Route>

<Route element={<AuthGuard allowedPillars={['investor-relations']} />}>
  <Route element={<Layout />}>
    <Route path="/relationships/investors" element={<InvestorDatabasePage />} />
    <Route path="/relationships/cadence" element={<InvestorCadencePage />} />
  </Route>
</Route>

<Route element={<AuthGuard allowedRoles={['admin']} />}>
  <Route element={<Layout />}>
    <Route path="/ceo" element={<CEODashboard />} />
    <Route path="/finance" element={<PlaceholderPage title="Finance" source="accounting system" previews={['Revenue tracking', 'Expense breakdown', 'Cash flow projections']} />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/settings/audit" element={<AuditLogPage />} />
  </Route>
</Route>

<Route path="*" element={<Navigate to="/dashboard" replace />} />
```

- [ ] **Step 3:** `git add src/App.tsx && git commit -m "feat(auth): per-pillar route guards in App.tsx"`

### Task 19: Filter `Sidebar` by `pillar_access`

**Files:** modify `src/components/Sidebar.tsx`

- [ ] **Step 1:** Add `pillar` field to `NavSection`:

```ts
interface NavSection {
  title: string
  pillar: 'sales' | 'campaigns' | 'fulfillment' | 'investor-relations' | 'goals' | 'admin'
  items: NavItem[]
}
```

Tag each existing section:
- `'Client Acquisition'` → `pillar: 'sales'`
- `'Clients'` → `pillar: 'fulfillment'`
- `'Outbound / GTM'` → `pillar: 'campaigns'`
- `'Relationships'` → `pillar: 'investor-relations'`
- Any CEO/Finance section → `pillar: 'goals'`
- `'Settings'` → `pillar: 'admin'`

- [ ] **Step 2:** Inside the component, before the render loop:

```tsx
const { user } = useAuth()
const filtered = sections.filter(s => {
  if (s.pillar === 'admin') return user?.role === 'admin'
  return user?.pillar_access.includes(s.pillar) || user?.pillar_access.includes('*')
})
```

Replace `sections.map(...)` with `filtered.map(...)`. The existing `settingsSection` render is a separate block — gate it with `{user?.role === 'admin' && (...)}`.

- [ ] **Step 3:** `git add src/components/Sidebar.tsx && git commit -m "feat(auth): sidebar filters sections by pillar_access"`

### Task 20: Update `LoginPage`

**Files:** modify `src/pages/LoginPage.tsx`

- [ ] **Step 1:** Replace the `fetch('/api/auth/login', ...)` in `handleSubmit` with a call to `login(email, password)` from `useAuth`.

- [ ] **Step 2:** Below the submit button, add the forgot-password control and `notice` state:

```tsx
const { login, resetPassword } = useAuth()
const [notice, setNotice] = useState('')

// ... in the form JSX:
<button
  type="button"
  className="text-sm text-text-faint hover:text-text-primary mt-2"
  onClick={async () => {
    if (!email) { setError('Enter your email first'); return }
    try { await resetPassword(email); setNotice('Password reset email sent') }
    catch (e: any) { setError(e.message) }
  }}
>
  Forgot password?
</button>
{notice && <div className="text-sm text-green-400">{notice}</div>}
```

- [ ] **Step 3:** `git add src/pages/LoginPage.tsx && git commit -m "feat(auth): LoginPage uses Supabase + password reset link"`

### Task 21: Add `ResetPasswordPage`

**Files:** create `src/pages/ResetPasswordPage.tsx`

- [ ] **Step 1:** Write:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export function ResetPasswordPage() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (pw.length < 12) { setError('Minimum 12 characters'); return }
    if (pw !== pw2) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setLoading(false)
    if (error) { setError(error.message); return }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <form onSubmit={submit} className="w-96 p-8 bg-surface-raised rounded-lg border border-border space-y-4">
        <h1 className="text-xl font-semibold">Set new password</h1>
        <input type="password" placeholder="New password" value={pw}
               onChange={e => setPw(e.target.value)}
               className="w-full px-3 py-2 bg-surface border border-border rounded" />
        <input type="password" placeholder="Confirm password" value={pw2}
               onChange={e => setPw2(e.target.value)}
               className="w-full px-3 py-2 bg-surface border border-border rounded" />
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button type="submit" disabled={loading}
                className="w-full py-2 bg-brand text-white rounded disabled:opacity-50">
          {loading ? 'Saving...' : 'Save password'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2:** `git add src/pages/ResetPasswordPage.tsx && git commit -m "feat(auth): ResetPasswordPage"`

### Task 22: Update `SettingsPage` user management

**Files:** modify `src/pages/SettingsPage.tsx`

- [ ] **Step 1:** Locate the create-user form (grep `grep -n "User Management\|createUser\|new user" src/pages/SettingsPage.tsx`).

- [ ] **Step 2:** Add state + UI:

```tsx
const [role, setRole] = useState<'admin'|'manager'|'member'>('member')
const [pillars, setPillars] = useState<string[]>([])
```

Role select:

```tsx
<select value={role} onChange={e => setRole(e.target.value as any)}
        className="px-3 py-2 bg-surface border border-border rounded">
  <option value="member">Member</option>
  <option value="manager">Manager</option>
  <option value="admin">Admin</option>
</select>
```

Pillar multi-select:

```tsx
<div className="space-y-2">
  <label className="text-sm text-text-faint">Pillar access</label>
  <div className="flex flex-wrap gap-2">
    {['sales','campaigns','fulfillment','operations','investor-relations','goals','finance'].map(p => (
      <label key={p} className="flex items-center gap-1 px-2 py-1 bg-surface border border-border rounded cursor-pointer">
        <input type="checkbox"
               checked={pillars.includes(p)}
               onChange={e => setPillars(e.target.checked ? [...pillars, p] : pillars.filter(x => x !== p))} />
        <span className="text-sm">{p}</span>
      </label>
    ))}
    <label className="flex items-center gap-1 px-2 py-1 bg-surface border border-border rounded cursor-pointer">
      <input type="checkbox"
             checked={pillars.includes('*')}
             onChange={e => setPillars(e.target.checked ? ['*'] : [])} />
      <span className="text-sm">All (*)</span>
    </label>
  </div>
</div>
```

On submit, POST `{ email, name, role, pillar_access: pillars }` to `/api/users` via `apiFetch`. Display existing users' `role` + `pillar_access` in the users list.

- [ ] **Step 3:** `git add src/pages/SettingsPage.tsx && git commit -m "feat(auth): SettingsPage role tier + pillar multi-select"`

---

## Phase 8 — Migration + verification

### Task 23: Run migration script

- [ ] **Step 1:** Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are in `.env` locally.
- [ ] **Step 2:** `node scripts/migrate-to-supabase-auth.mjs`

Expected:
- "Inviting alex@yannetr.net..." → "Invite sent — user id: ..."
- "Upserted admin user_profiles row"
- "Deleted users.json"
- "Migration complete."

- [ ] **Step 3:** Open the invite email → set Alex's new password via the link.
- [ ] **Step 4:** Log in at `/login` with the new password. Every sidebar section visible; every page loads.

### Task 24: Create the sales manager user

- [ ] **Step 1:** As admin, navigate to `/settings`.
- [ ] **Step 2:** In User Management, create: email = `<sales_manager_email>`, name = `<Sales Manager Name>`, role = `manager`, pillar_access = `['sales']`.
- [ ] **Step 3:** Sales manager receives invite email, sets password, logs in.

### Task 25: Smoke test script

**Files:** create `tests/smoke-endpoints.sh`

- [ ] **Step 1:** Write:

```bash
#!/usr/bin/env bash
# Usage: ADMIN_TOKEN=... SM_TOKEN=... BASE=http://localhost:3001 ./tests/smoke-endpoints.sh
set -e
BASE="${BASE:-http://localhost:3001}"

req() {
  local token="$1"; local path="$2"; local expected="$3"; local label="$4"
  local hdr=()
  [ -n "$token" ] && hdr=(-H "Authorization: Bearer $token")
  local got
  got=$(curl -s -o /dev/null -w '%{http_code}' "${hdr[@]}" "$BASE$path")
  if [ "$got" = "$expected" ]; then echo "OK   $label ($got)"
  else echo "FAIL $label: expected $expected got $got"; exit 1
  fi
}

req "" /api/health 200 "health public"
req "" /api/calls 401 "calls unauth"
req "" /api/investors 401 "investors unauth"

req "$SM_TOKEN" /api/calls 200 "SM -> calls"
req "$SM_TOKEN" /api/deals 200 "SM -> deals"
req "$SM_TOKEN" /api/reps 200 "SM -> reps"
req "$SM_TOKEN" /api/investors 403 "SM -> investors (denied)"
req "$SM_TOKEN" /api/monday/onboarding 403 "SM -> monday (denied)"
req "$SM_TOKEN" /api/users 403 "SM -> users (admin-only)"

req "$ADMIN_TOKEN" /api/calls 200 "admin -> calls"
req "$ADMIN_TOKEN" /api/investors 200 "admin -> investors"
req "$ADMIN_TOKEN" /api/users 200 "admin -> users"

echo "All smoke checks passed."
```

- [ ] **Step 2:** Grab access tokens from the browser DevTools console for each logged-in user:

```js
(await (await import('/src/lib/supabaseClient.ts')).supabase.auth.getSession()).data.session.access_token
```

- [ ] **Step 3:** `chmod +x tests/smoke-endpoints.sh && ADMIN_TOKEN=... SM_TOKEN=... ./tests/smoke-endpoints.sh` — expect all OK.
- [ ] **Step 4:** `git add tests/smoke-endpoints.sh && git commit -m "test(auth): curl smoke for pillar gating"`

### Task 26: Full manual verification

- [ ] **Step 1 — UI gating (sales manager):** Log in as sales manager. Sidebar shows only Client Acquisition section. Navigating to `/relationships/investors` redirects to `/dashboard`. Navigating to `/settings` redirects to `/dashboard`.

- [ ] **Step 2 — Chat scoping:** As sales manager on `/chat`:
  - Ask "how's Jake doing this week?" → real answer with data.
  - Ask "how's our investor pipeline?" → refusal citing pillar scope.

- [ ] **Step 3 — Password reset:** Log out. At `/login`, enter sales manager's email, click Forgot password?. Open email, follow link to `/reset-password`, set new password. Log in with new password.

- [ ] **Step 4 — Admin visibility:** Log in as Alex. Full sidebar. Every page loads. `/api/users` lists both users.

- [ ] **Step 5 — Production deploy:** `git push origin master`. Coolify auto-deploys. Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to Coolify env if missing. Repeat Steps 1-4 on prod.

---

## Self-Review Notes

- **Spec coverage:** Every section of the design spec maps to at least one task. §1-2 (goal/state) context only. §3.1 Supabase Auth → Tasks 2-3,15-16. §3.2-3 role/schema → Task 1. §4 backend changes → Tasks 3,5-12. §5 frontend → Tasks 14-22. §6 migration → Tasks 13,23. §7 env → Task 11. §8 testing → Tasks 25-26. §9 out-of-scope respected (MFA, per-rep, SSO not implemented). §10 risks mitigated (health-route ordering in Task 5; gatherContext audit mandated in Task 12).
- **Placeholder scan:** No TBD, TODO, "similar to above", or "handle edge cases" without code. File-line anchors (e.g., `server.mjs:2394`) reflect pre-change state; after deletions in Task 9 lines shift — each task's step text includes the surrounding context as a stable grep anchor.
- **Type consistency:** `User` interface in `useAuth.ts` has `pillar_access: string[]`. Same shape consumed in `AuthGuard` and `Sidebar`. Role values `admin|manager|member` match across SQL `check` constraint, server `requireRole`, `useAuth` type, AuthGuard prop, and SettingsPage dropdown.
- **Known sharp edges:** (a) The Coolify env must have `SUPABASE_SERVICE_KEY` before Task 23 runs in production, or the server will fail to boot. Called out in Task 26 Step 5. (b) Alex's browser tokens from the old JWT world become invalid on deploy — he'll need a fresh login after migration. Matches spec §10 "Breaking existing Alex sessions."

---

## Execution notes

- Each task ends in a commit. Work on `master` or a feature branch.
- Only Task 1 (SQL apply) and Task 23 (migration run) have side effects outside git. Both are reversible: Task 1 via `drop table` in Supabase, Task 23 by restoring `users.json` from git (it's still in history pre-Task-9 commit) and rolling back the Supabase Auth user.
- If you want to batch the cutover, work on a branch locally, merge once smoke tests pass.
