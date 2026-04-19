import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'
import rateLimit from 'express-rate-limit'
import crypto from 'crypto'
import { google } from 'googleapis'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()

// ─── Phase 1.2: CORS — lock to dashboard origin ────────
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'https://yanneceodashboard.com'
app.use(cors({
  origin: process.env.NODE_ENV === 'development' ? true : ALLOWED_ORIGIN,
  credentials: true,
}))

// ─── Phase 1.4: Payload size limit ─────────────────────
app.use(express.json({ limit: '100kb' }))

// ─── Phase 1.3: Rate limiting ──────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
})
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many login attempts, try again later' },
})
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Chat rate limit reached, try again later' },
})
app.use('/api/', globalLimiter)

// ─── Supabase admin client ─────────────────────────────
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
  process.exit(1)
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// ─── Phase 1.8: Client API key encryption ──────────────
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
if (!ENCRYPTION_KEY) {
  console.error('FATAL: Missing ENCRYPTION_KEY environment variable')
  process.exit(1)
}

function encrypt(text) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex').subarray(0, 32), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decrypt(text) {
  const [ivHex, encrypted] = text.split(':')
  if (!ivHex || !encrypted) return text // Not encrypted (legacy)
  try {
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex').subarray(0, 32), iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    return text // Not encrypted (legacy)
  }
}

// ─── Phase 5.1: Audit logging ──────────────────────────
const AUDIT_FILE = join(__dirname, 'audit_log.json')

function loadAuditLog() {
  try {
    if (existsSync(AUDIT_FILE)) return JSON.parse(readFileSync(AUDIT_FILE, 'utf-8'))
  } catch { /* empty */ }
  return []
}

function auditLog(userId, action, resource, details = {}, ip = '') {
  const logs = loadAuditLog()
  logs.push({ id: Date.now().toString(), user_id: userId, action, resource, details, ip, created_at: new Date().toISOString() })
  // Keep last 10000 entries
  if (logs.length > 10000) logs.splice(0, logs.length - 10000)
  writeFileSync(AUDIT_FILE, JSON.stringify(logs, null, 2))
}

// ─── Supabase Auth middleware ──────────────────────────
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
  req.user = {
    id: data.user.id,
    email: data.user.email,
    name: profile.name,
    role: profile.role,
    pillar_access: profile.pillar_access,
  }
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
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role' })
    }
    next()
  }
}

export { verifySupabaseJWT, requirePillar, requireRole }

// ─── Current-user + admin user management ──────────────

app.get('/api/auth/me', verifySupabaseJWT, (req, res) => {
  res.json({ user: req.user })
})

app.get('/api/users', verifySupabaseJWT, requireRole('admin'), async (_req, res) => {
  const { data: profiles, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, name, role, pillar_access, created_at')
  if (error) return res.status(500).json({ error: error.message })
  const { data: listData, error: authErr } = await supabaseAdmin.auth.admin.listUsers()
  if (authErr) return res.status(500).json({ error: authErr.message })
  const byId = Object.fromEntries((listData?.users || []).map(u => [u.id, u.email]))
  res.json(profiles.map(p => ({ ...p, email: byId[p.id] || null })))
})

app.post('/api/users', verifySupabaseJWT, requireRole('admin'), async (req, res) => {
  const { email, name, role, pillar_access } = req.body
  if (!email || !name || !role || !Array.isArray(pillar_access)) {
    return res.status(400).json({ error: 'email, name, role, pillar_access required' })
  }
  if (!['admin', 'manager', 'member'].includes(role)) return res.status(400).json({ error: 'invalid role' })

  // Generate a random temporary password — avoids Supabase's 2/hour email rate limit.
  // Admin shares the password out-of-band (Slack/SMS/whatever). User logs in and changes it.
  const tempPassword = `${crypto.randomBytes(9).toString('base64url')}-${Math.floor(Math.random() * 100)}`

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name },
  })
  if (error) return res.status(400).json({ error: error.message })

  const { error: profErr } = await supabaseAdmin
    .from('user_profiles')
    .insert({ id: data.user.id, name, role, pillar_access })
  if (profErr) {
    try { await supabaseAdmin.auth.admin.deleteUser(data.user.id) } catch { /* best effort */ }
    return res.status(500).json({ error: profErr.message })
  }
  auditLog(req.user.id, 'create_user', 'users', { email, role, pillar_access }, req.ip)
  res.json({ id: data.user.id, email, name, role, pillar_access, temp_password: tempPassword })
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
  auditLog(req.user.id, 'update_user', 'users', { id: req.params.id, patch }, req.ip)
  res.json({ ok: true })
})

app.delete('/api/users/:id', verifySupabaseJWT, requireRole('admin'), async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'cannot delete self' })
  const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  auditLog(req.user.id, 'delete_user', 'users', { id: req.params.id }, req.ip)
  res.json({ ok: true })
})

// ─── Phase 5.1: Audit log endpoint ─────────────────────

app.get('/api/audit-log', verifySupabaseJWT, requireRole('admin'), (req, res) => {
  const logs = loadAuditLog()
  const limit = parseInt(req.query.limit) || 100
  res.json(logs.slice(-limit).reverse())
})

// Health + public routes (no auth)
app.get('/api/health', (_, res) => res.json({ ok: true }))
app.get('/api/health/data-sources', async (_req, res) => {
  const results = {}
  try {
    const r = await fetchWeeklySalesForm()
    const now = new Date()
    const thisMonth = now.getMonth() + 1, thisYear = now.getFullYear()
    const monthRows = r.rows.slice(1).filter(row => {
      const parts = (row[2] || '').split('/')
      return parts.length === 3 && parseInt(parts[0]) === thisMonth && parseInt(parts[2]) === thisYear
    }).map(row => ({ rep: row[1], weekEnding: row[2], calendar: row[3], showed: row[4], progressed: row[5], elsSent: row[6], dealsClosed: row[7] }))
    results.weeklySalesForm = { ok: r.rows.length > 0, totalRows: r.rows.length, thisMonthEntries: monthRows.length, tabName: r.tabName, data: monthRows }
  } catch (e) { results.weeklySalesForm = { ok: false, error: e.message } }
  try {
    const r = await fetchRepCheckins(45)
    const now = new Date()
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthCheckins = r.checkins.filter(c => c.date >= firstOfMonth)
    const byRep = {}
    for (const c of monthCheckins) {
      if (!byRep[c.rep]) byRep[c.rep] = { days: 0, scheduled: 0, completed: 0, progressed: 0 }
      byRep[c.rep].days++
      byRep[c.rep].scheduled += c.scheduled
      byRep[c.rep].completed += c.completed
      byRep[c.rep].progressed += c.progressed
    }
    results.repCheckins = { ok: r.checkins.length > 0, total: r.checkins.length, thisMonth: monthCheckins.length, byRep }
  } catch (e) { results.repCheckins = { ok: false, error: e.message } }
  try { const t = await loadTargetsFromSheet(); results.targets = { ok: !!t, keys: t ? Object.keys(t).length : 0 } } catch (e) { results.targets = { ok: false, error: e.message } }
  res.json(results)
})

// ─── Protect all remaining /api/* routes ────────────────
app.use('/api', verifySupabaseJWT)

const pillarMap = [
  { prefix: ['/api/calls', '/api/reps', '/api/deals', '/api/trackers',
             '/api/call-search', '/api/benchmarks', '/api/scorecard',
             '/api/coaching-adherence', '/api/dashboard-stats',
             '/api/forecast', '/api/rep-call-history', '/api/rep-checkins',
             '/api/setter-checkins', '/api/export',
             '/api/deal-staleness', '/api/funnel-health'], pillar: 'sales' },
  { prefix: ['/api/bison', '/api/copy-library', '/api/airtable/senders',
             '/api/heyreach'], pillar: 'campaigns' },
  { prefix: ['/api/monday', '/api/clients', '/api/airtable/meetings'],
    pillar: 'fulfillment' },
  { prefix: ['/api/airtable/inbox', '/api/digest'], pillar: 'operations' },
  { prefix: ['/api/investors'], pillar: 'investor-relations' },
  { prefix: ['/api/ceo-stats', '/api/slack/email-reports',
             '/api/slack/meetings-booked'], pillar: 'goals' },
]
for (const { prefix, pillar } of pillarMap) {
  for (const p of prefix) app.use(p, requirePillar(pillar))
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const EMAILBISON_KEY = process.env.EMAILBISON_API_KEY
const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY
const MONDAY_KEY = process.env.MONDAY_API_KEY
const HUBSPOT_KEY = process.env.HUBSPOT_API_KEY
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN
const HEYREACH_KEY = process.env.HEYREACH_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY')
  process.exit(1)
}
if (!EMAILBISON_KEY) console.warn('Missing EMAILBISON_API_KEY — outbound pages will not work')
if (!AIRTABLE_KEY) console.warn('Missing AIRTABLE_API_KEY — client pages will not work')
if (!MONDAY_KEY) console.warn('Missing MONDAY_API_KEY — client project pages will not work')
if (!HUBSPOT_KEY) console.warn('Missing HUBSPOT_API_KEY — deal pipeline pages will not work')
if (!SLACK_TOKEN) console.warn('Missing SLACK_BOT_TOKEN — Slack reporting data will not work')
if (!HEYREACH_KEY) console.warn('Missing HEYREACH_API_KEY — LinkedIn outbound pages will not work')

// Google Sheets service account (for CEO Scorecard bidirectional sync)
// Private key stored as base64 to avoid Docker build-arg newline issues
const GOOGLE_SHEETS_PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY_B64
  ? Buffer.from(process.env.GOOGLE_SHEETS_PRIVATE_KEY_B64, 'base64').toString('utf-8')
  : process.env.GOOGLE_SHEETS_PRIVATE_KEY
const GOOGLE_SHEETS_CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
const CEO_SCORECARD_SPREADSHEET_ID = process.env.CEO_SCORECARD_SPREADSHEET_ID || '1kS3K2rVXpXbqhrlCeBU8PEu5CnaOtFPGY_XfvE7G0mo'
if (!GOOGLE_SHEETS_PRIVATE_KEY || !GOOGLE_SHEETS_CLIENT_EMAIL) console.warn('Missing GOOGLE_SHEETS_PRIVATE_KEY or GOOGLE_SHEETS_CLIENT_EMAIL — Google Sheets sync will not work')

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

// ─── Phase 3.2: Server-side TTL cache ──────────────────
const cache = new Map()

function cached(key, ttlMs, fetcher) {
  return async (req, res) => {
    const cacheKey = typeof key === 'function' ? key(req) : key
    const entry = cache.get(cacheKey)
    if (entry && Date.now() - entry.time < ttlMs) {
      return res.json(entry.data)
    }
    try {
      const data = await fetcher(req)
      cache.set(cacheKey, { data, time: Date.now() })
      res.json(data)
    } catch (err) {
      serverError(res, err)
    }
  }
}

// ─── Supabase helper ────────────────────────────────────

async function supaQuery(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  })
  if (!res.ok) return { error: await res.text(), data: null }
  return { data: await res.json(), error: null }
}

async function supaRpc(fnName, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) return { error: await res.text(), data: null }
  return { data: await res.json(), error: null }
}

// ─── EmailBison helper ──────────────────────────────────

const BISON_BASE = 'https://send.yannecapital.com/api'

async function bisonFetch(endpoint, params = {}) {
  const url = new URL(`${BISON_BASE}${endpoint}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${EMAILBISON_KEY}` },
  })
  if (!res.ok) return { error: await res.text(), data: null }
  return { data: await res.json(), error: null }
}

// ─── Airtable helper ────────────────────────────────────

const AIRTABLE_BASE = 'https://api.airtable.com/v0'

async function airtableFetch(baseId, tableId, params = {}) {
  const url = new URL(`${AIRTABLE_BASE}/${baseId}/${tableId}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${AIRTABLE_KEY}` },
  })
  if (!res.ok) return { error: await res.text(), data: null }
  return { data: await res.json(), error: null }
}

// ─── Supabase INSERT helper ─────────────────────────────

async function supaInsert(table, rows) {
  const body = Array.isArray(rows) ? rows : [rows]
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) return { error: await res.text(), data: null }
  return { data: await res.json(), error: null }
}

// ─── Google Sheets helpers (CEO Scorecard sync) ─────────

let _sheetsClient = null
async function getGoogleSheetsClient() {
  if (!GOOGLE_SHEETS_PRIVATE_KEY || !GOOGLE_SHEETS_CLIENT_EMAIL) return null
  if (_sheetsClient) return _sheetsClient
  try {
    const auth = new google.auth.JWT({
      email: GOOGLE_SHEETS_CLIENT_EMAIL,
      key: GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    await auth.authorize()
    _sheetsClient = google.sheets({ version: 'v4', auth })
    return _sheetsClient
  } catch (err) {
    console.error('Google Sheets auth error:', err.message)
    return null
  }
}

async function readSheetTab(tabName, range = 'A:M') {
  const sheets = await getGoogleSheetsClient()
  if (!sheets) return null
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: CEO_SCORECARD_SPREADSHEET_ID,
      range: `${tabName}!${range}`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    })
    return res.data.values || []
  } catch (err) {
    console.error(`Google Sheets read error (${tabName}):`, err.message)
    return null
  }
}

async function writeSheetCells(tabName, updates) {
  const sheets = await getGoogleSheetsClient()
  if (!sheets || !updates.length) return false
  try {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: CEO_SCORECARD_SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates.map(u => ({
          range: `${tabName}!${u.cell}`,
          values: [[u.value]],
        })),
      },
    })
    return true
  } catch (err) {
    console.error(`Google Sheets write error (${tabName}):`, err.message)
    return false
  }
}

function getCurrentMonthTab() {
  const now = new Date()
  return now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

// Try current month tab first, then next month, then previous
async function findBestSheetTab() {
  const now = new Date()
  const candidates = []
  // Current month
  candidates.push(now.toLocaleString('en-US', { month: 'long', year: 'numeric' }))
  // Next month
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  candidates.push(next.toLocaleString('en-US', { month: 'long', year: 'numeric' }))
  // Previous month
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  candidates.push(prev.toLocaleString('en-US', { month: 'long', year: 'numeric' }))

  for (const tab of candidates) {
    const data = await readSheetTab(tab, 'A1:A3')
    if (data && data.length > 0) return tab
  }
  return candidates[0] // fallback to current month name even if it fails
}

// ─── Security: input sanitizers ─────────────────────────
// Strip characters that could inject PostgREST operators or SQL
// Generic error response — never leak internal details to client
function serverError(res, err, context = '') {
  console.error(`[${context}]`, err?.message || err)
  return res.status(500).json({ error: 'Internal server error' })
}

function sanitizePostgrest(val) {
  if (typeof val !== 'string') return ''
  return val.replace(/[&|();,\\<>]/g, '').slice(0, 200)
}
function sanitizeId(val) {
  if (typeof val !== 'string') return ''
  return val.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)
}
function sanitizeDate(val) {
  if (typeof val !== 'string') return ''
  return val.replace(/[^0-9T:Z.+-]/g, '').slice(0, 30)
}

// ─── Phase 1.7: Supabase proxy routes ──────────────────

// Call logs with filters
app.get('/api/calls', async (req, res) => {
  try {
    const parts = ['select=*', 'order=scored_at.desc', 'limit=1000']
    if (req.query.rep) parts.push(`rep=eq.${sanitizePostgrest(req.query.rep)}`)
    if (req.query.call_type) parts.push(`call_type=eq.${sanitizePostgrest(req.query.call_type)}`)
    if (req.query.grade) parts.push(`grade=eq.${sanitizePostgrest(req.query.grade)}`)
    if (req.query.scored_after) parts.push(`scored_at=gte.${sanitizeDate(req.query.scored_after)}`)
    const { data, error } = await supaQuery('call_logs', parts.join('&'))
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// Single call detail
app.get('/api/calls/:id', async (req, res) => {
  try {
    const { data, error } = await supaQuery('call_logs', `id=eq.${sanitizeId(req.params.id)}&limit=1`)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    if (!data || data.length === 0) return res.status(404).json({ error: 'Call not found' })
    res.json(data[0])
  } catch (err) {
    serverError(res, err)
  }
})

// Deals
app.get('/api/deals', async (_req, res) => {
  try {
    const { data, error } = await supaQuery('deals_with_calls', 'select=*&order=updated_at.desc')
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// Rep performance
app.get('/api/reps', async (_req, res) => {
  try {
    const { data, error } = await supaQuery('rep_performance', 'select=*&order=rep')
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// Dashboard stats (aggregated — call logs + HubSpot)
app.get('/api/dashboard-stats', async (_req, res) => {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const floor = thirtyDaysAgo.toISOString()

    // Paginate HubSpot deals to get ALL (not just first 100)
    const hubspotDealsPromise = HUBSPOT_KEY ? (async () => {
      const allDeals = []
      let after = ''
      let pages = 0
      while (pages < 10) {
        const pagination = after ? `&after=${after}` : ''
        const { data, error } = await hubspotFetch(`/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,pipeline${pagination}`)
        if (error || !data) break
        const results = data.results || []
        const salesOnly = results.filter(d => !d.properties?.pipeline || d.properties.pipeline === 'default')
        allDeals.push(...salesOnly)
        const nextAfter = data.paging?.next?.after
        if (!nextAfter) break
        after = nextAfter
        pages++
      }
      return allDeals
    })().catch(() => []) : Promise.resolve([])

    const [callsResult, hubspotDeals] = await Promise.all([
      supaQuery('call_logs', `select=rep,date,score_percentage,grade,coaching_priority&scored_at=gte.${floor}&order=scored_at.desc`),
      hubspotDealsPromise,
    ])

    const calls = callsResult.data || []
    const ACTIVE_STAGES = ['appointmentscheduled', 'qualifiedtobuy', 'presentationscheduled', 'decisionmakerboughtin', '1066193534']
    const activeStageDeals = hubspotDeals.filter(d => ACTIVE_STAGES.includes(d.properties?.dealstage || ''))
    const activeDeals = activeStageDeals.length

    // Weighted pipeline value — stage probability based on funnel position
    const STAGE_PROBABILITY = {
      appointmentscheduled: 0.10,
      qualifiedtobuy: 0.25,
      presentationscheduled: 0.45,
      decisionmakerboughtin: 0.65,
      '1066193534': 0.85,
    }
    const pipelineValue = Math.round(activeStageDeals.reduce((sum, d) => {
      const amount = parseFloat(d.properties?.amount || '0')
      const prob = STAGE_PROBABILITY[d.properties?.dealstage] || 0.10
      return sum + (amount * prob)
    }, 0))

    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    for (const c of calls) {
      if (!c.grade) continue
      const letter = c.grade.charAt(0)
      if (letter in gradeDistribution) gradeDistribution[letter]++
    }

    const avgScore = calls.length ? Math.round(calls.reduce((s, c) => s + c.score_percentage, 0) / calls.length) : 0

    // Calls per day (last 30d)
    const recentCalls = calls.filter(c => c.date && new Date(c.date) >= thirtyDaysAgo)
    const dayRepMap = {}
    for (const c of recentCalls) {
      if (!c.date) continue
      const d = c.date.slice(0, 10)
      if (!dayRepMap[d]) dayRepMap[d] = {}
      dayRepMap[d][c.rep] = (dayRepMap[d][c.rep] || 0) + 1
    }
    const callsPerDay = []
    for (const [date, reps] of Object.entries(dayRepMap)) {
      for (const [rep, count] of Object.entries(reps)) {
        callsPerDay.push({ date, rep, count })
      }
    }
    callsPerDay.sort((a, b) => a.date.localeCompare(b.date))

    // Top coaching themes (7d)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const weekCalls = calls.filter(c => c.date && new Date(c.date) >= sevenDaysAgo)
    const themeFreq = {}
    for (const c of weekCalls) {
      if (c.coaching_priority) themeFreq[c.coaching_priority] = (themeFreq[c.coaching_priority] || 0) + 1
    }
    const coachingThemes = Object.entries(themeFreq).map(([theme, count]) => ({ theme, count })).sort((a, b) => b.count - a.count).slice(0, 5)

    // Rep quick stats
    const repMap = {}
    for (const c of calls) {
      if (!repMap[c.rep]) repMap[c.rep] = { calls: 0, totalScore: 0 }
      repMap[c.rep].calls++
      repMap[c.rep].totalScore += c.score_percentage
    }
    const repQuickStats = Object.entries(repMap).map(([rep, s]) => ({ rep, calls: s.calls, avg: Math.round(s.totalScore / s.calls) })).sort((a, b) => b.avg - a.avg)

    res.json({ totalCalls: calls.length, avgScore, activeDeals, pipelineValue, gradeDistribution, callsPerDay, coachingThemes, repQuickStats })
  } catch (err) {
    serverError(res, err)
  }
})

// CEO stats
app.get('/api/ceo-stats', async (_req, res) => {
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const floor = sevenDaysAgo.toISOString()

    const [callsRes, dealsRes, repsRes] = await Promise.all([
      supaQuery('call_logs', `select=rep,score_percentage,pipeline_inflation&scored_at=gte.${floor}`),
      supaQuery('deals_with_calls', 'select=deal_id,deal_status,updated_at,pipeline_inflation,rep_name'),
      supaQuery('rep_performance', 'select=rep,call_1_rolling_avg,call_1_trend,call_2_rolling_avg,call_2_trend,call_3_rolling_avg,call_3_trend'),
    ])

    const calls = callsRes.data || []
    const deals = dealsRes.data || []
    const reps = repsRes.data || []

    const callsThisWeek = calls.length
    const avgScore = calls.length ? Math.round(calls.reduce((s, c) => s + c.score_percentage, 0) / calls.length) : 0

    const repScores = {}
    for (const c of calls) {
      if (!repScores[c.rep]) repScores[c.rep] = { total: 0, count: 0 }
      repScores[c.rep].total += c.score_percentage
      repScores[c.rep].count++
    }
    let bestRep = null
    for (const [name, s] of Object.entries(repScores)) {
      const avg = Math.round(s.total / s.count)
      if (!bestRep || avg > bestRep.avg) bestRep = { name, avg }
    }

    const activeDeals = deals.filter(d => d.deal_status === 'active').length
    const signedDeals = deals.filter(d => d.deal_status === 'signed').length
    const closeRate = deals.length > 0 ? Math.round((signedDeals / deals.length) * 100) : 0

    const alerts = []
    const inflatedDeals = deals.filter(d => d.pipeline_inflation && d.deal_status === 'active')
    if (inflatedDeals.length > 0) alerts.push({ type: 'warning', message: `${inflatedDeals.length} active deal${inflatedDeals.length > 1 ? 's' : ''} flagged for pipeline inflation` })

    const now = Date.now()
    const stalledDeals = deals.filter(d => {
      if (d.deal_status !== 'active' || !d.updated_at) return false
      return Math.floor((now - new Date(d.updated_at).getTime()) / 86400000) >= 14
    })
    if (stalledDeals.length > 0) alerts.push({ type: 'danger', message: `${stalledDeals.length} deal${stalledDeals.length > 1 ? 's' : ''} stalled 14+ days` })

    for (const rep of reps) {
      const declining = [rep.call_1_trend, rep.call_2_trend, rep.call_3_trend].filter(t => t === 'Declining')
      if (declining.length >= 2) alerts.push({ type: 'warning', message: `${rep.rep} declining in ${declining.length} call types` })
    }

    res.json({ callsThisWeek, avgScore, bestRep, activeDeals, closeRate, alerts })
  } catch (err) {
    serverError(res, err)
  }
})

// Rep call history (sparklines)
app.get('/api/rep-call-history', async (_req, res) => {
  try {
    const { data, error } = await supaQuery('call_logs', 'select=rep,date,score_percentage,call_type&order=scored_at.desc&limit=2000')
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    const rows = data || []
    const grouped = {}
    for (const row of rows) {
      if (!grouped[row.rep]) grouped[row.rep] = []
      if (grouped[row.rep].length < 100) {
        grouped[row.rep].push({ date: row.date ?? '', score: row.score_percentage ?? 0, call_type: row.call_type ?? '' })
      }
    }
    for (const rep of Object.keys(grouped)) grouped[rep].reverse()
    res.json(grouped)
  } catch (err) {
    serverError(res, err)
  }
})

// Deal staleness (call dates)
app.post('/api/deal-staleness', async (req, res) => {
  try {
    const { callIds } = req.body
    if (!callIds || !Array.isArray(callIds) || callIds.length === 0) return res.json([])
    const ids = callIds.slice(0, 100).map(id => `"${sanitizeId(String(id))}"`).join(',')
    const { data, error } = await supaQuery('call_logs', `select=id,date&id=in.(${ids})`)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data || [])
  } catch (err) {
    serverError(res, err)
  }
})

// ─── EmailBison API routes ──────────────────────────────

// Campaign analytics — paginate to get ALL campaigns
app.get('/api/bison/campaigns', async (_req, res) => {
  if (!EMAILBISON_KEY) return res.status(503).json({ error: 'EmailBison not configured' })
  try {
    const allCampaigns = []
    let page = 1
    let lastPage = 1
    while (page <= lastPage && page <= 30) {
      const { data, error } = await bisonFetch('/campaigns', { per_page: 50, page })
      if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
      const items = data?.data || (Array.isArray(data) ? data : [])
      if (items.length === 0) break
      allCampaigns.push(...items)
      // Update lastPage from meta
      if (data?.meta?.last_page) lastPage = data.meta.last_page
      page++
    }
    res.json(allCampaigns)
  } catch (err) {
    serverError(res, err)
  }
})

// Campaign sequence steps
app.get('/api/bison/campaigns/:id/sequence', async (req, res) => {
  if (!EMAILBISON_KEY) return res.status(503).json({ error: 'EmailBison not configured' })
  try {
    const { data, error } = await bisonFetch(`/campaigns/v1.1/${req.params.id}/sequence-steps`)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data?.data || data)
  } catch (err) {
    serverError(res, err)
  }
})

// Campaign stats for a specific campaign
app.get('/api/bison/campaigns/:id/stats', async (req, res) => {
  if (!EMAILBISON_KEY) return res.status(503).json({ error: 'EmailBison not configured' })
  try {
    const { data, error } = await bisonFetch(`/campaigns/${req.params.id}/statistics`)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// Lead analytics
app.get('/api/bison/leads', async (req, res) => {
  if (!EMAILBISON_KEY) return res.status(503).json({ error: 'EmailBison not configured' })
  try {
    const { data, error } = await bisonFetch('/leads', {
      per_page: req.query.per_page || 50,
      page: req.query.page || 1,
      lead_campaign_status: req.query.status,
    })
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// Replies
app.get('/api/bison/replies', async (req, res) => {
  if (!EMAILBISON_KEY) return res.status(503).json({ error: 'EmailBison not configured' })
  try {
    const { data, error } = await bisonFetch('/replies', {
      per_page: req.query.per_page || 50,
      page: req.query.page || 1,
      folder: req.query.folder || 'inbox',
      status: req.query.status,
    })
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// Sender accounts (for deliverability)
app.get('/api/bison/senders', async (_req, res) => {
  if (!EMAILBISON_KEY) return res.status(503).json({ error: 'EmailBison not configured' })
  try {
    const { data, error } = await bisonFetch('/sender-emails', { per_page: 100 })
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// ─── HeyReach helper ───────────────────────────────────

const HEYREACH_BASE = 'https://api.heyreach.io/api/public'

async function heyreachFetch(endpoint, { method = 'GET', body = null } = {}) {
  const opts = {
    method,
    headers: {
      'X-API-KEY': HEYREACH_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${HEYREACH_BASE}${endpoint}`, opts)
  if (!res.ok) return { error: `HeyReach ${res.status}: ${await res.text()}`, data: null }
  const text = await res.text()
  if (!text) return { data: null, error: null }
  return { data: JSON.parse(text), error: null }
}

// HeyReach sender account name mapping
// The public API only returns numeric IDs — no sender names endpoint exists.
// This map is loaded from heyreach_senders.json (auto-populated on first campaign fetch).
const HEYREACH_SENDERS_FILE = join(__dirname, 'heyreach_senders.json')

function loadSenderMap() {
  try {
    if (existsSync(HEYREACH_SENDERS_FILE)) return JSON.parse(readFileSync(HEYREACH_SENDERS_FILE, 'utf-8'))
  } catch { /* empty */ }
  return {}
}

function saveSenderMap(map) {
  writeFileSync(HEYREACH_SENDERS_FILE, JSON.stringify(map, null, 2))
}

// ─── HeyReach API routes ───────────────────────────────

// All campaigns with progress stats + sender name map
app.get('/api/heyreach/campaigns', async (_req, res) => {
  if (!HEYREACH_KEY) return res.status(503).json({ error: 'HeyReach not configured' })
  try {
    const { data, error } = await heyreachFetch('/campaign/GetAll', { method: 'POST', body: {} })
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    const senderMap = loadSenderMap()
    res.json({ ...data, senderMap })
  } catch (err) {
    serverError(res, err)
  }
})

// Update sender name mapping (admin only)
app.post('/api/heyreach/senders', requireRole('admin'), async (req, res) => {
  try {
    const existing = loadSenderMap()
    const updates = req.body // { "65067": "Alex Partnership", "118261": "John Smith" }
    const merged = { ...existing, ...updates }
    saveSenderMap(merged)
    res.json({ success: true, count: Object.keys(merged).length, senderMap: merged })
  } catch (err) {
    serverError(res, err)
  }
})

// Get sender name mapping
app.get('/api/heyreach/senders', async (_req, res) => {
  try {
    res.json(loadSenderMap())
  } catch (err) {
    serverError(res, err)
  }
})

// Single campaign detail
app.get('/api/heyreach/campaigns/:id', async (req, res) => {
  if (!HEYREACH_KEY) return res.status(503).json({ error: 'HeyReach not configured' })
  try {
    const { data, error } = await heyreachFetch(`/campaign/GetById?campaignId=${req.params.id}`)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// All lists with lead counts
app.get('/api/heyreach/lists', async (_req, res) => {
  if (!HEYREACH_KEY) return res.status(503).json({ error: 'HeyReach not configured' })
  try {
    const { data, error } = await heyreachFetch('/list/GetAll', { method: 'POST', body: {} })
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// Leads from a specific list (paginated)
app.get('/api/heyreach/lists/:id/leads', async (req, res) => {
  if (!HEYREACH_KEY) return res.status(503).json({ error: 'HeyReach not configured' })
  try {
    const offset = parseInt(req.query.offset) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 100)
    const { data, error } = await heyreachFetch('/list/GetLeadsFromList', {
      method: 'POST',
      body: { listId: parseInt(req.params.id), offset, limit },
    })
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Airtable API routes ────────────────────────────────

// Inbox Manager — lead categories, setter performance
app.get('/api/airtable/inbox', async (req, res) => {
  if (!AIRTABLE_KEY) return res.status(503).json({ error: 'Airtable not configured' })
  try {
    const allowedViews = ['Grid view', 'All', 'Active', 'Inbox']
    const view = allowedViews.includes(req.query.view) ? req.query.view : undefined
    const params = { pageSize: '100', ...(view && { view }) }
    const { data, error } = await airtableFetch('appoCoN4yDrzKNRPe', 'tbl7Opo9spWMGMXKp', params)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// Deliverability — sender inboxes
app.get('/api/airtable/senders', async (req, res) => {
  if (!AIRTABLE_KEY) return res.status(503).json({ error: 'Airtable not configured' })
  try {
    const params = { pageSize: '100' }
    const { data, error } = await airtableFetch('app70IAsUKudzw5UI', 'tblIWs6XXXdBW4OdP', params)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// Meetings
app.get('/api/airtable/meetings', async (req, res) => {
  if (!AIRTABLE_KEY) return res.status(503).json({ error: 'Airtable not configured' })
  try {
    const params = { pageSize: '100' }
    params['sort[0][field]'] = 'Start Time'
    params['sort[0][direction]'] = 'desc'
    const { data, error } = await airtableFetch('appzvZe6ctSCK79zj', 'tblsRnOQbDiAa64nD', params)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Monday.com helper ──────────────────────────────────

async function mondayQuery(query, variables = {}) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      Authorization: MONDAY_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) return { error: await res.text(), data: null }
  const json = await res.json()
  if (json.errors) return { error: JSON.stringify(json.errors), data: null }
  return { data: json.data, error: null }
}

// ─── HubSpot helper ─────────────────────────────────────

const HUBSPOT_BASE = 'https://api.hubapi.com'

async function hubspotFetch(endpoint) {
  const res = await fetch(`${HUBSPOT_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${HUBSPOT_KEY}` },
  })
  if (!res.ok) return { error: await res.text(), data: null }
  return { data: await res.json(), error: null }
}

// ─── Monday.com API routes ──────────────────────────────

// Board IDs
const PROJECT_PORTFOLIO_IDS = [5090688381, 5090690637, 5090697102, 5090697393, 5090697433, 5090697490, 5090697501]
const PROJECT_TASK_IDS = [5090688377, 5090690633, 5090697103, 5090697391, 5090697431, 5090697473, 5090697495]
const ONBOARDING_FORM_ID = 1785190380

// Monday Onboarding Form — all clients ever onboarded
app.get('/api/monday/onboarding-form', async (_req, res) => {
  if (!MONDAY_KEY) return res.status(503).json({ error: 'Monday.com not configured' })
  try {
    const { data, error } = await mondayQuery(`{
      boards(ids: [${ONBOARDING_FORM_ID}]) {
        items_page(limit: 50) {
          items {
            id name
            column_values { id text value }
          }
        }
      }
    }`)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    const items = data?.boards?.[0]?.items_page?.items || []
    const clients = items.map(item => {
      const cols = {}
      for (const cv of item.column_values || []) cols[cv.id] = cv.text || ''
      return {
        id: item.id,
        name: item.name,
        companyName: cols['short_text_mkmctwr8'] || item.name,
        totalRaise: parseFloat(cols['number_mkmcvbfg']) || 0,
        date: cols['date_mkrkpaha'] || '',
        firstName: cols['short_text_mkmcmaxr'] || '',
        lastName: cols['short_text_mkmck8d5'] || '',
        email: cols['email_mkmcrz3t'] || '',
        hq: cols['short_text_mkmcpvqx'] || '',
      }
    })
    res.json({ clients })
  } catch (err) {
    serverError(res, err)
  }
})

// Bison workspaces — active client projects
app.get('/api/bison/workspaces', async (_req, res) => {
  if (!EMAILBISON_KEY) return res.status(503).json({ error: 'EmailBison not configured' })
  try {
    const r = await fetch('https://send.yannecapital.com/api/workspaces', {
      headers: { Authorization: `Bearer ${EMAILBISON_KEY}` },
    })
    if (!r.ok) return res.status(500).json({ error: await r.text() })
    const data = await r.json()
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

app.get('/api/monday/projects', async (_req, res) => {
  if (!MONDAY_KEY) return res.status(503).json({ error: 'Monday.com not configured' })
  try {
    const { data, error } = await mondayQuery(`{
      boards(ids: [${PROJECT_PORTFOLIO_IDS.join(',')}]) {
        id name
        items_page(limit: 5) {
          items {
            id name
            column_values { id type text value column { title } }
          }
        }
      }
    }`)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    // Normalize column_values: flatten column.title into top-level title for frontend compat
    if (data?.boards) {
      for (const board of data.boards) {
        for (const item of board.items_page?.items || []) {
          for (const cv of item.column_values || []) {
            cv.title = cv.column?.title || cv.id
            delete cv.column
          }
        }
      }
    }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// Task boards for onboarding tracking
app.get('/api/monday/tasks/:boardId', async (req, res) => {
  if (!MONDAY_KEY) return res.status(503).json({ error: 'Monday.com not configured' })
  const boardId = parseInt(req.params.boardId, 10)
  if (isNaN(boardId) || boardId <= 0) return res.status(400).json({ error: 'Invalid board ID' })
  try {
    const { data, error } = await mondayQuery(`{
      boards(ids: [${boardId}]) {
        id name
        groups { id title }
        items_page(limit: 100) {
          items {
            id name group { id title }
            column_values { id type text value column { title } }
          }
        }
      }
    }`)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    // Normalize column.title into top-level title for frontend compat
    if (data?.boards) {
      for (const board of data.boards) {
        for (const item of board.items_page?.items || []) {
          for (const cv of item.column_values || []) {
            cv.title = cv.column?.title || cv.id
            delete cv.column
          }
        }
      }
    }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// All project tasks for onboarding overview
app.get('/api/monday/onboarding', async (_req, res) => {
  if (!MONDAY_KEY) return res.status(503).json({ error: 'Monday.com not configured' })
  try {
    const { data, error } = await mondayQuery(`{
      boards(ids: [${PROJECT_TASK_IDS.join(',')}]) {
        id name
        groups { id title }
        items_page(limit: 50) {
          items {
            id name group { id title }
            column_values(ids: ["status", "person", "timeline", "numbers"]) { id type text value column { title } }
          }
        }
      }
    }`)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    // Normalize column.title into top-level title for frontend compat
    if (data?.boards) {
      for (const board of data.boards) {
        for (const item of board.items_page?.items || []) {
          for (const cv of item.column_values || []) {
            cv.title = cv.column?.title || cv.id
            delete cv.column
          }
        }
      }
    }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Monday: Overdue tasks ──────────────────────────────

function parseMondayOverdue(boards) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdue = []
  for (const b of boards) {
    const projectName = b.name.replace('Project ', '')
    for (const item of b.items_page?.items || []) {
      const cols = {}
      for (const cv of item.column_values || []) {
        cols[cv.id] = cv
      }
      const status = cols['status']?.text || ''
      if (status === 'Done' || status === 'Completed') continue
      // Parse timeline column (JSON value like {"from":"2026-03-01","to":"2026-03-15"})
      const timelineVal = cols['timeline']?.value
      if (!timelineVal) continue
      try {
        const tl = JSON.parse(timelineVal)
        if (!tl.to) continue
        const dueDate = new Date(tl.to)
        dueDate.setHours(0, 0, 0, 0)
        if (dueDate < today) {
          const daysOverdue = Math.round((today - dueDate) / (1000 * 60 * 60 * 24))
          overdue.push({
            taskName: item.name,
            projectName,
            group: item.group?.title || '',
            dueDate: tl.to,
            daysOverdue,
            status,
            owner: cols['person']?.text || 'Unassigned',
          })
        }
      } catch { /* skip bad timeline */ }
    }
  }
  return overdue.sort((a, b) => b.daysOverdue - a.daysOverdue)
}

app.get('/api/monday/overdue', async (_req, res) => {
  if (!MONDAY_KEY) return res.status(503).json({ error: 'Monday.com not configured' })
  try {
    const { data, error } = await mondayQuery(`{
      boards(ids: [${PROJECT_TASK_IDS.join(',')}]) {
        id name
        items_page(limit: 50) {
          items {
            id name group { id title }
            column_values(ids: ["status", "person", "timeline"]) { id type text value column { title } }
          }
        }
      }
    }`)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    const boards = data?.boards || []
    // Normalize column_values
    for (const board of boards) {
      for (const item of board.items_page?.items || []) {
        for (const cv of item.column_values || []) {
          cv.title = cv.column?.title || cv.id
          delete cv.column
        }
      }
    }
    const overdue = parseMondayOverdue(boards)
    res.json({ overdue, total: overdue.length })
  } catch (err) {
    serverError(res, err)
  }
})

app.post('/api/monday/overdue/notify', requireRole('admin'), async (req, res) => {
  if (!MONDAY_KEY) return res.status(503).json({ error: 'Monday.com not configured' })
  if (!SLACK_TOKEN) return res.status(503).json({ error: 'Slack not configured' })
  try {
    const { data, error } = await mondayQuery(`{
      boards(ids: [${PROJECT_TASK_IDS.join(',')}]) {
        id name
        items_page(limit: 50) {
          items {
            id name group { id title }
            column_values(ids: ["status", "person", "timeline"]) { id type text value column { title } }
          }
        }
      }
    }`)
    if (error) return res.status(500).json({ error: 'Internal server error' })
    const boards = data?.boards || []
    for (const board of boards) {
      for (const item of board.items_page?.items || []) {
        for (const cv of item.column_values || []) {
          cv.title = cv.column?.title || cv.id
          delete cv.column
        }
      }
    }
    const overdue = parseMondayOverdue(boards)
    if (overdue.length === 0) return res.json({ ok: true, message: 'No overdue tasks' })

    // Group by project
    const byProject = {}
    for (const t of overdue) {
      if (!byProject[t.projectName]) byProject[t.projectName] = []
      byProject[t.projectName].push(t)
    }

    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    let text = `:rotating_light: *Overdue Onboarding Tasks — ${today}*\n\n`
    for (const [project, tasks] of Object.entries(byProject)) {
      text += `*${project}* (${tasks.length} overdue):\n`
      for (const t of tasks.slice(0, 5)) {
        text += `  • ${t.group} > ${t.taskName} — ${t.daysOverdue}d overdue (${t.owner})\n`
      }
      if (tasks.length > 5) text += `  • ...and ${tasks.length - 5} more\n`
      text += '\n'
    }

    const ALEX_CHANNEL = 'C0AK9CF0BU1'
    const { error: slackErr } = await slackFetch('chat.postMessage', { channel: ALEX_CHANNEL, text })
    if (slackErr) return res.status(500).json({ error: 'Failed to post to Slack' })
    auditLog('monday_overdue_notify', req.user, { count: overdue.length })
    res.json({ ok: true, count: overdue.length })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Monday: Auto-create onboarding board from template ─

const ONBOARDING_TEMPLATE_BOARD_ID = PROJECT_TASK_IDS[0] // Use Project AIR as template

app.post('/api/monday/create-onboarding', requireRole('admin'), async (req, res) => {
  if (!MONDAY_KEY) return res.status(503).json({ error: 'Monday.com not configured' })
  const { companyName } = req.body || {}
  if (!companyName || typeof companyName !== 'string' || companyName.length > 100) {
    return res.status(400).json({ error: 'companyName required (max 100 chars)' })
  }
  try {
    const boardName = `Project ${companyName.trim()}`
    const { data, error } = await mondayQuery(`mutation { duplicate_board(board_id: ${ONBOARDING_TEMPLATE_BOARD_ID}, duplicate_type: duplicate_board_with_structure_and_pulses, board_name: "${boardName.replace(/"/g, '\\"')}") { board { id name } } }`)
    if (error) { console.error('[api] Monday duplicate_board error:', error); return res.status(500).json({ error: 'Failed to create board' }) }
    const newBoard = data?.duplicate_board?.board
    if (!newBoard) return res.status(500).json({ error: 'Board creation returned no result' })
    // Add to runtime list so it appears immediately
    const newId = parseInt(newBoard.id, 10)
    if (!PROJECT_TASK_IDS.includes(newId)) PROJECT_TASK_IDS.push(newId)
    auditLog('monday_create_board', req.user, { boardId: newBoard.id, boardName: newBoard.name, companyName })
    res.json({ ok: true, boardId: newBoard.id, boardName: newBoard.name })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── HubSpot API routes ─────────────────────────────────

const HUBSPOT_STAGE_MAP = {
  // Sales Pipeline (default) — only pipeline we pull
  appointmentscheduled: 'Meeting Qualified',
  qualifiedtobuy: 'NDA',
  presentationscheduled: '1st Closing Call',
  decisionmakerboughtin: '2nd Closing Call',
  '1066193534': '3rd Call / Contract',
  closedwon: 'Closed Won',
  closedlost: 'Closed Lost',
  contractsent: 'Long Term Lead',
  '1066871403': 'Disqualified',
}

app.get('/api/hubspot/deals', async (_req, res) => {
  if (!HUBSPOT_KEY) return res.status(503).json({ error: 'HubSpot not configured' })
  try {
    // Paginate to get ALL deals from Sales Pipeline
    const allDeals = []
    let after = ''
    let pages = 0
    while (pages < 10) {
      const pagination = after ? `&after=${after}` : ''
      const { data, error } = await hubspotFetch(`/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,closedate,pipeline,hubspot_owner_id,createdate,hs_lastmodifieddate,notes_last_updated,hs_lastactivity_date,hs_deal_stage_probability,hs_forecast_amount,hs_deal_score${pagination}`)
      if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
      const results = data.results || []
      // Filter to Sales Pipeline only
      const salesOnly = results.filter(d => !d.properties?.pipeline || d.properties.pipeline === 'default')
      allDeals.push(...salesOnly)
      // Check for next page
      const nextAfter = data.paging?.next?.after
      if (!nextAfter) break
      after = nextAfter
      pages++
    }
    // Enrich with stage names
    const enriched = allDeals.map(d => ({
      ...d,
      properties: {
        ...d.properties,
        stageName: HUBSPOT_STAGE_MAP[d.properties?.dealstage] || d.properties?.dealstage || 'Unknown',
      },
    }))
    res.json({ results: enriched })
  } catch (err) {
    serverError(res, err)
  }
})

app.get('/api/hubspot/pipeline', async (_req, res) => {
  if (!HUBSPOT_KEY) return res.status(503).json({ error: 'HubSpot not configured' })
  try {
    const { data, error } = await hubspotFetch('/crm/v3/pipelines/deals')
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Client Workspace Manager ───────────────────────────

const CLIENTS_FILE = join(__dirname, 'client_workspaces.json')

function loadClients() {
  try {
    if (existsSync(CLIENTS_FILE)) return JSON.parse(readFileSync(CLIENTS_FILE, 'utf-8'))
  } catch { /* use empty */ }
  return []
}

function saveClients(clients) {
  writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2))
}

app.get('/api/clients', (_req, res) => {
  const clients = loadClients()
  // Don't expose full API keys to frontend — mask them
  const safe = clients.map(c => {
    const rawKey = c.apiKey ? decrypt(c.apiKey) : ''
    return {
      ...c,
      apiKey: rawKey ? `${rawKey.slice(0, 6)}...${rawKey.slice(-4)}` : '',
      hasKey: !!c.apiKey,
    }
  })
  res.json(safe)
})

app.post('/api/clients', (req, res) => {
  const { name, apiKey, bisonWorkspaceId } = req.body
  if (!name) return res.status(400).json({ error: 'Name is required' })
  const clients = loadClients()
  const existing = clients.find(c => c.name === name)
  if (existing) {
    // Update
    if (apiKey) existing.apiKey = encrypt(apiKey)
    if (bisonWorkspaceId) existing.bisonWorkspaceId = bisonWorkspaceId
  } else {
    clients.push({ id: Date.now().toString(), name, apiKey: apiKey ? encrypt(apiKey) : '', bisonWorkspaceId: bisonWorkspaceId || null, addedAt: new Date().toISOString() })
  }
  saveClients(clients)
  auditLog(req.user.id, 'update_client', 'clients', { name }, req.ip)
  res.json({ ok: true })
})

app.delete('/api/clients/:id', (req, res) => {
  let clients = loadClients()
  clients = clients.filter(c => c.id !== req.params.id)
  saveClients(clients)
  res.json({ ok: true })
})

// Fetch campaigns for a specific client using their workspace API key
app.get('/api/clients/:id/campaigns', async (req, res) => {
  const clients = loadClients()
  const client = clients.find(c => c.id === req.params.id)
  if (!client) return res.status(404).json({ error: 'Client not found' })
  if (!client.apiKey) return res.status(400).json({ error: 'No API key configured for this client' })

  const clientKey = decrypt(client.apiKey)
  try {
    const allCampaigns = []
    let page = 1
    let lastPage = 1
    while (page <= lastPage && page <= 10) {
      const url = new URL(`${BISON_BASE}/campaigns`)
      url.searchParams.set('per_page', '50')
      url.searchParams.set('page', String(page))
      const r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${clientKey}` },
      })
      if (!r.ok) return res.status(500).json({ error: `Bison API error: ${r.status}` })
      const data = await r.json()
      const items = data?.data || (Array.isArray(data) ? data : [])
      if (items.length === 0) break
      allCampaigns.push(...items)
      if (data?.meta?.last_page) lastPage = data.meta.last_page
      page++
    }
    res.json(allCampaigns)
  } catch (err) {
    serverError(res, err)
  }
})

// Fetch sequence for a campaign using client's workspace API key
app.get('/api/clients/:id/campaigns/:campaignId/sequence', async (req, res) => {
  const clients = loadClients()
  const client = clients.find(c => c.id === req.params.id)
  if (!client?.apiKey) return res.status(400).json({ error: 'No API key' })

  const clientKey = decrypt(client.apiKey)
  try {
    const r = await fetch(`${BISON_BASE}/campaigns/v1.1/${req.params.campaignId}/sequence-steps`, {
      headers: { Authorization: `Bearer ${clientKey}` },
    })
    if (!r.ok) return res.status(500).json({ error: `Bison API error: ${r.status}` })
    const data = await r.json()
    res.json(data?.data || data)
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Google Sheets — Weekly Sales Form ───────────────────

const WEEKLY_SALES_FORM_SHEET = '1AxGg4hgzutTcBdrKlZ2oUnqrUCHMTiU7kxj-PRzOQcc'

async function fetchWeeklySalesForm() {
  const sheets = await getGoogleSheetsClient()
  if (!sheets) { console.warn('fetchWeeklySalesForm: no sheets client'); return { rows: [], tabName: null } }
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: WEEKLY_SALES_FORM_SHEET })
    const allTabs = meta.data.sheets?.map(s => `${s.properties.title}(gid:${s.properties.sheetId})`) || []
    console.log('Weekly sales form tabs:', allTabs.join(', '))
    const targetTab = meta.data.sheets?.find(s => s.properties.sheetId === 2041501325)
    const tabName = targetTab?.properties?.title || 'Form Responses 1'
    console.log('Using tab:', tabName)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: WEEKLY_SALES_FORM_SHEET,
      range: `${tabName}!A1:Z500`,
    })
    const rows = res.data.values || []
    console.log(`Weekly sales form: ${rows.length} rows from tab "${tabName}"`)
    return { rows, tabName }
  } catch (err) {
    console.error('Failed to read weekly sales form:', err.message)
    return { rows: [], tabName: null }
  }
}

// ─── Google Sheets — Rep Daily Check-ins ────────────────

const REP_CHECKIN_SHEET = '1RQoRjAZIMFi6NenrdynzTPRnuDlZl2ynQJ6qRMCBOhA'
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY

// Generic helper to read any Google Sheet via service account
async function readAnySheet(spreadsheetId, range) {
  const sheets = await getGoogleSheetsClient()
  if (!sheets) return null
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range })
    return res.data.values || []
  } catch (err) {
    console.error(`Failed to read sheet ${spreadsheetId}:`, err.message)
    return null
  }
}

async function fetchRepCheckins(days = 45) {
  // Try service account first, then API key, then gviz fallback
  let rows = await readAnySheet(REP_CHECKIN_SHEET, 'A1:F500')

  if (!rows) {
    const url = GOOGLE_API_KEY
      ? `https://sheets.googleapis.com/v4/spreadsheets/${REP_CHECKIN_SHEET}/values/A1:F500?key=${GOOGLE_API_KEY}`
      : `https://docs.google.com/spreadsheets/d/${REP_CHECKIN_SHEET}/gviz/tq?tqx=out:json`

    if (GOOGLE_API_KEY) {
      const r = await fetch(url)
      if (!r.ok) throw new Error('Failed to fetch sheet')
      const json = await r.json()
      rows = json.values || []
    } else {
      const r = await fetch(url)
      if (!r.ok) throw new Error('Failed to fetch sheet')
      const text = await r.text()
      const jsonStr = text.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, '')
      const gviz = JSON.parse(jsonStr)
      const gRows = gviz.table?.rows || []
      const gCols = gviz.table?.cols || []
      rows = [gCols.map(c => c.label || '')]
      for (const gr of gRows) {
        rows.push(gr.c.map(cell => cell?.v != null ? String(cell.v) : ''))
      }
    }
  }

  if (rows.length < 2) return { checkins: [], byDate: [], byRep: {} }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const checkins = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 5) continue
    const rep = (row[1] || '').trim()
    const dateStr = (row[2] || '').trim()
    const scheduled = parseInt(row[3]) || 0
    const completed = parseInt(row[4]) || 0
    const progressed = parseInt(row[5]) || 0

    let date = null
    if (dateStr) {
      const gvizMatch = dateStr.match(/Date\((\d+),(\d+),(\d+)\)/)
      if (gvizMatch) {
        date = new Date(parseInt(gvizMatch[1]), parseInt(gvizMatch[2]), parseInt(gvizMatch[3]))
      } else {
        const parts = dateStr.split('/')
        if (parts.length === 3) {
          const m = parseInt(parts[0]) - 1
          const d = parseInt(parts[1])
          const y = parseInt(parts[2])
          date = new Date(y, m, d)
        }
      }
    }
    if (!date || isNaN(date.getTime())) continue
    if (date < cutoff) continue
    if (rep === 'Lucas') continue

    const dateKey = date.toISOString().slice(0, 10)
    checkins.push({ rep, date: dateKey, scheduled, completed, progressed })
  }

  const dateMap = {}
  for (const c of checkins) {
    if (!dateMap[c.date]) dateMap[c.date] = { date: c.date, totalScheduled: 0, totalCompleted: 0, reps: {} }
    dateMap[c.date].totalScheduled += c.scheduled
    dateMap[c.date].totalCompleted += c.completed
    dateMap[c.date].reps[c.rep] = c.completed
  }
  const byDate = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))

  const repMap = {}
  for (const c of checkins) {
    if (!repMap[c.rep]) repMap[c.rep] = { totalScheduled: 0, totalCompleted: 0, totalProgressed: 0, days: 0 }
    repMap[c.rep].totalScheduled += c.scheduled
    repMap[c.rep].totalCompleted += c.completed
    repMap[c.rep].totalProgressed += c.progressed
    repMap[c.rep].days++
  }

  return { checkins, byDate, byRep: repMap }
}

app.get('/api/rep-checkins', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14
    res.json(await fetchRepCheckins(days))
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Setter EOD Reports (Google Sheet) ──────────────────

const SETTER_SHEET = '1Pt6P0BWtBuxlO7YSojy35WRgYaHPnanrLSY8M5eOEpw'

app.get('/api/setter-checkins', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30
    // Use CSV export to get raw text values (gviz drops text cells as null)
    const url = `https://docs.google.com/spreadsheets/d/${SETTER_SHEET}/export?format=csv&gid=1687379033`
    const r = await fetch(url)
    if (!r.ok) return res.status(500).json({ error: 'Failed to fetch setter sheet' })
    const csvText = await r.text()

    // Parse CSV properly (handle multiline quoted fields)
    const rows = []
    let current = []
    let field = ''
    let inQuotes = false
    for (let i = 0; i < csvText.length; i++) {
      const ch = csvText[i]
      if (ch === '"') {
        if (inQuotes && csvText[i + 1] === '"') { field += '"'; i++; continue }
        inQuotes = !inQuotes; continue
      }
      if (ch === ',' && !inQuotes) { current.push(field); field = ''; continue }
      if (ch === '\n' && !inQuotes) { current.push(field); rows.push(current); current = []; field = ''; continue }
      if (ch === '\r') continue
      field += ch
    }
    if (current.length > 0) { current.push(field); rows.push(current) }

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const checkins = []

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (row.length < 7) continue
      const name = (row[2] || '').trim()
      const dateStr = (row[3] || '').trim()
      const campaignReport = row[4] || ''
      const followupsRaw = row[5] || ''
      const bookingsRaw = row[6] || ''

      // Parse date (M/D/YYYY)
      let date = null
      if (dateStr) {
        const parts = dateStr.split('/')
        if (parts.length === 3) {
          date = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]))
        }
      }
      if (!date || isNaN(date.getTime()) || date < cutoff) continue

      // Parse bookings — handle "Total Number of bookings: N" and plain numbers
      let bookings = 0
      const bookingsMatch = bookingsRaw.match(/bookings:\s*(\d+)/i) || bookingsRaw.match(/^(\d+)$/)
      if (bookingsMatch) bookings = parseInt(bookingsMatch[1])
      else bookings = parseInt(bookingsRaw) || 0

      // Parse followups — could be a number or text with campaign lists
      let followups = parseInt(followupsRaw) || 0
      if (followups === 0 && followupsRaw.includes('-')) {
        // Sum numbers at the END of each line: "Campaign Name - 12/02/2026 - 4"
        // Only match the very last number on each line (after the last dash)
        const fuLines = followupsRaw.split('\n')
        for (const line of fuLines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const lastDash = trimmed.match(/[-–]\s*(\d{1,3})\s*$/)
          if (lastDash) followups += parseInt(lastDash[1])
        }
      }

      // Parse reply count from campaign report
      let totalReplies = 0
      const replyMatches = campaignReport.matchAll(/Mail Replies:\s*(\d+)/gi)
      for (const m of replyMatches) totalReplies += parseInt(m[1])

      checkins.push({
        name: name.trim(),
        date: date.toISOString().slice(0, 10),
        bookings,
        followups,
        totalReplies,
        notes: '',
      })
    }

    // Aggregate by setter
    const setterMap = {}
    for (const c of checkins) {
      if (!setterMap[c.name]) setterMap[c.name] = { totalBookings: 0, totalFollowups: 0, totalReplies: 0, days: 0, dailyData: [] }
      setterMap[c.name].totalBookings += c.bookings
      setterMap[c.name].totalFollowups += c.followups
      setterMap[c.name].totalReplies += c.totalReplies
      setterMap[c.name].days++
      setterMap[c.name].dailyData.push({ date: c.date, bookings: c.bookings, followups: c.followups, replies: c.totalReplies })
    }

    // Daily totals
    const dayMap = {}
    for (const c of checkins) {
      if (!dayMap[c.date]) dayMap[c.date] = { date: c.date, totalBookings: 0, setters: {} }
      dayMap[c.date].totalBookings += c.bookings
      dayMap[c.date].setters[c.name] = c.bookings
    }
    const byDate = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))

    res.json({ checkins, bySetter: setterMap, byDate })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Slack helper ───────────────────────────────────────

async function slackFetch(method, body = {}) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) return { error: await res.text(), data: null }
  const json = await res.json()
  if (!json.ok) return { error: json.error, data: null }
  return { data: json, error: null }
}

// Meetings booked — parse EOD reports from #y-c-meetings-reportings
const MEETINGS_CHANNEL = 'C0A62CG3Z55'

app.get('/api/slack/meetings-booked', async (req, res) => {
  if (!SLACK_TOKEN) return res.status(503).json({ error: 'Slack not configured' })
  try {
    const days = parseInt(req.query.days) || 14
    const oldest = String(Math.floor(Date.now() / 1000) - days * 86400)
    // Paginate Slack to get ALL messages in range
    const messages = []
    let cursor = undefined
    let pages = 0
    while (pages < 10) {
      const params = { channel: MEETINGS_CHANNEL, limit: 200, oldest }
      if (cursor) params.cursor = cursor
      const { data, error } = await slackFetch('conversations.history', params)
      if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
      messages.push(...(data.messages || []))
      cursor = data.response_metadata?.next_cursor
      if (!cursor) break
      pages++
    }
    const dailyReports = []
    let todayIndividual = 0

    for (const m of messages) {
      const text = m.text || ''
      // Parse EOD summary messages
      const eodMatch = text.match(/Total Meetings Booked Today:\*?\s*(\d+)/)
      if (eodMatch) {
        const ts = parseFloat(m.ts)
        const date = new Date(ts * 1000).toISOString().slice(0, 10)
        dailyReports.push({ date, count: parseInt(eodMatch[1]) })
      }
      // Count individual "New Meeting Booked" messages for today (since last EOD)
      if (text.includes('New Meeting Booked')) {
        const ts = parseFloat(m.ts)
        const msgDate = new Date(ts * 1000).toISOString().slice(0, 10)
        const today = new Date().toISOString().slice(0, 10)
        if (msgDate === today) todayIndividual++
      }
    }

    // Parse per-host from individual messages
    const hostCounts = {}
    for (const m of messages) {
      const text = m.text || ''
      if (!text.includes('New Meeting Booked')) continue
      const hostMatch = text.match(/Host:\*?\s*([^\n<]+)/i)
      if (hostMatch) {
        const host = hostMatch[1].trim().replace(/\s*\(.*$/, '')
        hostCounts[host] = (hostCounts[host] || 0) + 1
      }
    }

    const thisWeek = dailyReports.reduce((s, r) => s + r.count, 0) + todayIndividual
    const avgPerDay = dailyReports.length > 0
      ? Math.round(dailyReports.reduce((s, r) => s + r.count, 0) / dailyReports.length)
      : 0

    res.json({
      todaySoFar: todayIndividual,
      thisWeek,
      avgPerDay,
      dailyReports: dailyReports.sort((a, b) => b.date.localeCompare(a.date)),
      byHost: hostCounts,
    })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── CEO Scorecard Targets (persisted in file) ──────────

const TARGETS_FILE = join(__dirname, 'scorecard_targets.json')

const DEFAULT_TARGETS = {
  // Revenue
  revenueTarget: 833000,
  // Funnel (keys must match TargetsModal + hook)
  emailsSentMonth: 350000,
  repliesMonth: 2800,
  interestedMonth: 980,
  meetingsMonth: 60,
  proposalsMonth: 10,
  signedMonth: 3,
  // Email outreach
  replyRate: 0.8,
  bounceRate: 1.0,
  // Sales
  teamAvgScore: 70,
  qualificationRate: 30,
  closeRate: 15,
  stalledDeals: 5,
  c1to2Rate: 35,
  c2to3Rate: 50,
  proposalsSent: 5,
  // LinkedIn
  linkedinMessagesSent: 500,
  linkedinMessageReplyRate: 10,
  linkedinConnectionsSent: 1000,
  linkedinConnectionAcceptRate: 25,
  linkedinMeetingsBooked: 5,
  // Setters
  interestedToMeetingRate: 60,
  meetingsBookedWeek: 15,
}

// Targets persistence: Google Sheet "Targets" tab (survives container redeploys)
// Falls back to local file, then defaults
async function loadTargetsFromSheet() {
  try {
    const rows = await readSheetTab('Targets', 'A:B')
    if (rows && rows.length > 0) {
      const targets = {}
      for (const row of rows) {
        if (row[0] && row[1] !== undefined && row[1] !== '') {
          const val = parseFloat(row[1])
          targets[row[0]] = isNaN(val) ? row[1] : val
        }
      }
      if (Object.keys(targets).length > 0) return targets
    }
  } catch { /* fall through */ }
  return null
}

async function saveTargetsToSheet(targets) {
  const sheets = await getGoogleSheetsClient()
  if (!sheets) return false
  try {
    const rows = Object.entries(targets).map(([k, v]) => [k, v])
    await sheets.spreadsheets.values.update({
      spreadsheetId: CEO_SCORECARD_SPREADSHEET_ID,
      range: 'Targets!A1:B' + rows.length,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    })
    return true
  } catch (err) {
    console.error('Failed to save targets to sheet:', err.message)
    // Try creating the tab if it doesn't exist
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: CEO_SCORECARD_SPREADSHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: 'Targets' } } }] },
      })
      // Retry write
      const rows = Object.entries(targets).map(([k, v]) => [k, v])
      await sheets.spreadsheets.values.update({
        spreadsheetId: CEO_SCORECARD_SPREADSHEET_ID,
        range: 'Targets!A1:B' + rows.length,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      })
      return true
    } catch { return false }
  }
}

function loadTargets() {
  try {
    if (existsSync(TARGETS_FILE)) return JSON.parse(readFileSync(TARGETS_FILE, 'utf-8'))
  } catch { /* use defaults */ }
  return { ...DEFAULT_TARGETS }
}

app.get('/api/scorecard/targets', async (_req, res) => {
  // Try Google Sheet "Targets" tab first (persistent), then local file, then defaults
  const sheetTargets = await loadTargetsFromSheet()
  if (sheetTargets) return res.json({ ...DEFAULT_TARGETS, ...sheetTargets })
  res.json(loadTargets())
})

app.post('/api/scorecard/targets', async (req, res) => {
  const current = loadTargets()
  const sheetTargets = await loadTargetsFromSheet()
  const base = sheetTargets ? { ...DEFAULT_TARGETS, ...sheetTargets } : current
  const updated = { ...base, ...req.body }
  // Save to both Google Sheet (persistent) and local file (fast cache)
  writeFileSync(TARGETS_FILE, JSON.stringify(updated, null, 2))
  await saveTargetsToSheet(updated)
  auditLog(req.user.id, 'update_targets', 'scorecard', { changes: req.body }, req.ip)
  res.json(updated)
})

// ─── Email Daily Reports (Slack #y-c-emails-reportings) ─

const EMAILS_REPORT_CHANNEL = 'C0A6FQPDRPY'

app.get('/api/slack/email-reports', async (req, res) => {
  if (!SLACK_TOKEN) return res.status(503).json({ error: 'Slack not configured' })
  try {
    const days = parseInt(req.query.days) || 30
    const oldest = String(Math.floor(Date.now() / 1000) - days * 86400)
    // Paginate Slack to get ALL messages in range
    const messages = []
    let cursor = undefined
    let pages = 0
    while (pages < 10) {
      const params = { channel: EMAILS_REPORT_CHANNEL, limit: 200, oldest }
      if (cursor) params.cursor = cursor
      const { data, error } = await slackFetch('conversations.history', params)
      if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
      messages.push(...(data.messages || []))
      cursor = data.response_metadata?.next_cursor
      if (!cursor) break
      pages++
    }
    const dailyReports = []

    for (const m of messages) {
      const text = m.text || ''
      if (!text.includes('Daily Email Campaign Report')) continue

      const ts = parseFloat(m.ts)
      const date = new Date(ts * 1000).toISOString().slice(0, 10)

      // Parse aggregate stats
      const sent = text.match(/Total Emails Sent:\*?\s*([\d,]+)/i)
      const contacted = text.match(/Total People Contacted:\*?\s*([\d,]+)/i)
      const replies = text.match(/Total Replies:\*?\s*([\d,]+)/i)
      const replyRate = text.match(/reply rate\)/)
      const replyRateNum = text.match(/Total Replies:\*?\s*[\d,]+\s*\(([\d.]+)%/i)
      const bounced = text.match(/Bounced Emails:\*?\s*([\d,]+)/i)
      const bounceRate = text.match(/Bounced Emails:\*?\s*[\d,]+\s*\(([\d.]+)%/i)
      const unsubscribed = text.match(/Unsubscribed:\*?\s*([\d,]+)/i)
      const interested = text.match(/Interested Replies:\*?\s*([\d,]+)/i)
      const interestedPct = text.match(/Interested Replies:\*?\s*[\d,]+\s*\(([\d.]+)%/i)
      const mailboxes = text.match(/Total Active Mailboxes:\*?\s*([\d,]+)/i)

      const parseNum = (m) => m ? parseInt(m[1].replace(/,/g, '')) : 0
      const parseFloat2 = (m) => m ? parseFloat(m[1]) : 0

      dailyReports.push({
        date,
        emailsSent: parseNum(sent),
        peopleContacted: parseNum(contacted),
        replies: parseNum(replies),
        replyRate: parseFloat2(replyRateNum),
        bounced: parseNum(bounced),
        bounceRate: parseFloat2(bounceRate),
        unsubscribed: parseNum(unsubscribed),
        interested: parseNum(interested),
        interestedPct: parseFloat2(interestedPct),
        activeMailboxes: parseNum(mailboxes),
      })
    }

    // Sort by date ascending
    dailyReports.sort((a, b) => a.date.localeCompare(b.date))

    // Compute period totals
    const totals = {
      emailsSent: dailyReports.reduce((s, r) => s + r.emailsSent, 0),
      peopleContacted: dailyReports.reduce((s, r) => s + r.peopleContacted, 0),
      replies: dailyReports.reduce((s, r) => s + r.replies, 0),
      bounced: dailyReports.reduce((s, r) => s + r.bounced, 0),
      unsubscribed: dailyReports.reduce((s, r) => s + r.unsubscribed, 0),
      interested: dailyReports.reduce((s, r) => s + r.interested, 0),
      days: dailyReports.length,
    }
    totals.replyRate = totals.emailsSent > 0 ? (totals.replies / totals.emailsSent) * 100 : 0
    totals.bounceRate = totals.emailsSent > 0 ? (totals.bounced / totals.emailsSent) * 100 : 0
    totals.interestedPct = totals.replies > 0 ? (totals.interested / totals.replies) * 100 : 0

    res.json({ dailyReports, totals })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Copy Library ───────────────────────────────────────

let copyLibrary = []
try {
  copyLibrary = JSON.parse(readFileSync(join(__dirname, 'copy_library.json'), 'utf-8'))
  console.log(`Copy library loaded: ${copyLibrary.length} sequences`)
} catch { console.warn('copy_library.json not found — copy library page will be empty') }

app.get('/api/copy-library', (req, res) => {
  const { sector, angle } = req.query
  let filtered = copyLibrary
  if (sector) filtered = filtered.filter(s => s.sector === sector)
  if (angle) filtered = filtered.filter(s => s.angle === angle)
  // Return lightweight summary (no full email bodies) unless detail requested
  if (req.query.detail === 'true') return res.json(filtered)
  const summary = filtered.map(s => ({
    sector: s.sector,
    angle: s.angle,
    set_number: s.set_number,
    skeleton: s.skeleton,
    cta_type: s.cta_type,
    subject_lines: s.subject_lines,
  }))
  res.json(summary)
})

app.get('/api/copy-library/sectors', (_req, res) => {
  const sectors = [...new Set(copyLibrary.map(s => s.sector))].sort()
  const angles = [...new Set(copyLibrary.map(s => s.angle))].sort()
  res.json({ sectors, angles, total: copyLibrary.length })
})

app.get('/api/copy-library/sequence', (req, res) => {
  const { sector, angle, set } = req.query
  const match = copyLibrary.find(s =>
    s.sector === sector && s.angle === angle && String(s.set_number) === String(set)
  )
  if (!match) return res.status(404).json({ error: 'Sequence not found' })
  res.json(match)
})

// ─── Intent detection + query routing ───────────────────

const REPS = ['Jake', 'Stanley', 'Thomas', 'Tahawar']

function detectIntent(question) {
  const q = question.toLowerCase()
  const intents = []

  const mentionedReps = REPS.filter(r => q.includes(r.toLowerCase()))

  let dateFilter = ''
  if (q.includes('today')) {
    dateFilter = `scored_at=gte.${new Date().toISOString().split('T')[0]}`
  } else if (q.includes('this week') || q.includes('past week')) {
    const d = new Date(); d.setDate(d.getDate() - 7)
    dateFilter = `scored_at=gte.${d.toISOString()}`
  } else if (q.includes('this month') || q.includes('past month')) {
    const d = new Date(); d.setDate(d.getDate() - 30)
    dateFilter = `scored_at=gte.${d.toISOString()}`
  }

  if (mentionedReps.length > 0 || q.includes('rep') || q.includes('who') || q.includes('compare')) {
    intents.push('rep_performance')
    intents.push('rep_calls')
  }

  if (q.includes('deal') || q.includes('pipeline') || q.includes('stuck') || q.includes('stage') || q.includes('kanban') || q.includes('hubspot')) {
    intents.push('deals')
    intents.push('hubspot')
  }

  if (q.match(/\b[abcdf]\b/i) || q.includes('grade') || q.includes('score') || q.includes('fail') || q.includes('best') || q.includes('worst')) {
    intents.push('rep_calls')
  }

  if (q.includes('coaching') || q.includes('weakness') || q.includes('improve') || q.includes('pattern') || q.includes('issue') || q.includes('common')) {
    intents.push('rep_calls')
    intents.push('rep_performance')
  }

  if (q.includes('flag') || q.includes('inflation') || q.includes('dead end')) {
    intents.push('flagged_calls')
  }

  if (q.includes('summary') || q.includes('overview') || q.includes('how did') || q.includes('today')) {
    intents.push('rep_calls')
    intents.push('rep_performance')
  }

  // Client / fulfillment intents
  if (q.includes('client') || q.includes('onboard') || q.includes('project') || q.includes('fulfillment') || q.includes('monday')) {
    intents.push('clients')
  }

  // Campaign / outbound intents
  if (q.includes('campaign') || q.includes('email') || q.includes('outbound') || q.includes('bison') || q.includes('reply') || q.includes('bounce') || q.includes('sent') || q.includes('sender') || q.includes('deliverability')) {
    intents.push('campaigns')
  }

  // Setter intents
  if (q.includes('setter') || q.includes('meeting') || q.includes('booking') || q.includes('interested') || q.includes('unactioned') || q.includes('inbox')) {
    intents.push('setters')
  }

  // Revenue / finance
  if (q.includes('revenue') || q.includes('cash') || q.includes('money') || q.includes('retainer') || q.includes('fee') || q.includes('finance') || q.includes('won')) {
    intents.push('hubspot')
  }

  if (q.includes('funnel') || q.includes('conversion') || q.includes('dwell') || q.includes('cohort')) {
    intents.push('funnel')
  }

  // Default: lightweight context (not everything)
  if (intents.length === 0) {
    intents.push('rep_calls', 'rep_performance', 'deals')
  }

  return { intents: [...new Set(intents)], mentionedReps, dateFilter }
}

async function gatherContext(question, pillarAccess = []) {
  const { intents, mentionedReps, dateFilter } = detectIntent(question)
  const context = {}
  const has = (p) => pillarAccess.includes(p) || pillarAccess.includes('*')

  const repFilter = mentionedReps.length > 0
    ? `rep=in.(${mentionedReps.join(',')})`
    : ''

  const promises = []

  if (has('sales') && intents.includes('rep_performance')) {
    const params = repFilter
      ? `${repFilter}&order=rep`
      : 'order=rep'
    promises.push(
      supaQuery('rep_performance', params).then(r => { context.rep_performance = r.data })
    )
  }

  if (has('sales') && intents.includes('rep_calls')) {
    const parts = ['order=scored_at.desc', 'limit=25']
    if (repFilter) parts.push(repFilter)
    if (dateFilter) parts.push(dateFilter)
    promises.push(
      supaQuery('call_logs', `select=id,rep,call_type,prospect_company,date,score_percentage,grade,coaching_priority,biggest_miss,qualification_result,pipeline_inflation,next_step_flag,call_context,call_outcome&${parts.join('&')}`).then(r => { context.recent_calls = r.data })
    )
  }

  if (has('sales') && intents.includes('deals')) {
    const params = repFilter
      ? `${repFilter.replace('rep=', 'rep_name=')}&order=updated_at.desc&limit=50`
      : 'deal_status=eq.active&order=updated_at.desc&limit=50'
    promises.push(
      supaQuery('deals_with_calls', `select=deal_id,prospect_company,rep_name,current_stage,deal_status,pipeline_inflation,call_1_score,call_1_grade,call_2_score,call_2_grade,call_3_score,call_3_grade,updated_at&${params}`).then(r => { context.deals = r.data })
    )
  }

  if (has('sales') && intents.includes('flagged_calls')) {
    promises.push(
      supaQuery('call_logs', 'select=id,rep,prospect_company,date,score_percentage,grade,pipeline_inflation,next_step_flag,coaching_priority&or=(pipeline_inflation.eq.true,next_step_flag.neq.NONE)&order=scored_at.desc&limit=30').then(r => { context.flagged_calls = r.data })
    )
  }

  if (has('sales') && intents.includes('funnel')) {
    promises.push((async () => {
      const [counts, dwell, outcomes] = await Promise.all([
        supaRpc('funnel_counts', { cohort_start: '1900-01-01', cohort_end: '2099-12-31' }),
        supaRpc('funnel_dwell_times', { cohort_start: '1900-01-01', cohort_end: '2099-12-31' }),
        supaRpc('funnel_third_call_outcomes', { cohort_start: '1900-01-01', cohort_end: '2099-12-31' }),
      ])
      context.funnel = {
        counts: counts.data?.[0] ?? null,
        dwell: dwell.data ?? [],
        outcomes: outcomes.data?.[0] ?? null,
      }
    })().catch(() => {}))
  }

  if (has('campaigns') && intents.includes('campaigns')) {
    promises.push(
      bisonFetch('/campaigns', { per_page: 50 }).then(r => {
        const campaigns = r.data?.data || (Array.isArray(r.data) ? r.data : [])
        context.campaigns = campaigns.map(c => ({
          name: c.name, status: c.status, emails_sent: c.emails_sent,
          replied: c.replied || c.unique_replies, bounced: c.bounced,
          interested: c.interested, total_leads: c.total_leads,
        }))
      }).catch(() => {})
    )
  }

  if (has('fulfillment') && intents.includes('clients')) {
    if (MONDAY_KEY) {
      promises.push(
        mondayQuery(`{ boards(ids: [${PROJECT_PORTFOLIO_IDS.join(',')}]) { id name items_page(limit: 5) { items { name column_values { id type text value column { title } } } } } }`)
          .then(r => {
            const boards = r.data?.boards || []
            context.clients = boards.map(b => {
              const item = b.items_page?.items?.[0]
              const cols = {}
              if (item) for (const cv of item.column_values || []) cols[cv.column?.title || cv.id] = cv.text
              return { name: b.name.replace('Project ', ''), health: cols['Project Health (RAG)'] || 'Unknown', stage: cols['Stage'] || 'Unknown' }
            })
          }).catch(() => {})
      )
    }
    // Also fetch onboarding data
    if (MONDAY_KEY) {
      promises.push(
        mondayQuery(`{ boards(ids: [${PROJECT_TASK_IDS.join(',')}]) { name items_page(limit: 50) { items { name group { title } column_values(ids: ["status"]) { id type text value } } } } }`)
          .then(r => {
            const boards = r.data?.boards || []
            context.onboarding = boards.map(b => {
              const items = b.items_page?.items || []
              const total = items.length
              const done = items.filter(i => i.column_values?.[0]?.text === 'Done').length
              return { project: b.name.replace('Project ', ''), total_tasks: total, done, completion: total > 0 ? Math.round((done / total) * 100) : 0 }
            })
          }).catch(() => {})
      )
    }
  }

  if (has('campaigns') && intents.includes('setters')) {
    if (AIRTABLE_KEY) {
      promises.push(
        airtableFetch('appoCoN4yDrzKNRPe', 'tbl7Opo9spWMGMXKp', { pageSize: '100' })
          .then(r => {
            const records = r.data?.records || []
            const setterMap = {}
            for (const rec of records) {
              const f = rec.fields || {}
              const setter = f['Setter']
              const cat = f['Lead Category'] || ''
              if (setter) {
                if (!setterMap[setter]) setterMap[setter] = { assigned: 0, meetings: 0, interested: 0, unactioned: 0 }
                setterMap[setter].assigned++
                if (cat === 'Meeting Booked') setterMap[setter].meetings++
                if (cat === 'Interested') setterMap[setter].interested++
                if (f['Open Response'] === true) setterMap[setter].unactioned++
              }
            }
            context.setter_performance = Object.entries(setterMap).map(([name, s]) => ({ name, ...s }))
          }).catch(() => {})
      )
    }
  }

  if (has('sales') && intents.includes('hubspot')) {
    if (HUBSPOT_KEY) {
      promises.push(
        (async () => {
          // Paginate all HubSpot deals but only send summary + active to context
          const allDeals = []
          let after = '', pg = 0
          while (pg < 10) {
            const pagination = after ? `&after=${after}` : ''
            const { data } = await hubspotFetch(`/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,closedate,pipeline,createdate,hs_lastmodifieddate,hs_deal_stage_probability,hs_deal_score${pagination}`)
            if (!data) break
            const sales = (data.results || []).filter(d => !d.properties?.pipeline || d.properties.pipeline === 'default')
            allDeals.push(...sales)
            const nextAfter = data.paging?.next?.after
            if (!nextAfter) break
            after = nextAfter; pg++
          }
          // Build summary
          const CLOSED = ['closedwon', 'closedlost', 'contractsent', '1066871403']
          const activeDeals = allDeals.filter(d => !CLOSED.includes(d.properties?.dealstage || ''))
          const wonDeals = allDeals.filter(d => d.properties?.dealstage === 'closedwon')
          const lostDeals = allDeals.filter(d => d.properties?.dealstage === 'closedlost')
          context.hubspot_summary = {
            total: allDeals.length,
            active: activeDeals.length,
            won: wonDeals.length,
            lost: lostDeals.length,
            activeValue: activeDeals.reduce((s, d) => s + parseFloat(d.properties?.amount || '0'), 0),
            wonValue: wonDeals.reduce((s, d) => s + parseFloat(d.properties?.amount || '0'), 0),
          }
          // Only send active deals (not 400+ closed ones)
          context.hubspot_active_deals = activeDeals.map(d => ({
            name: d.properties.dealname,
            stage: HUBSPOT_STAGE_MAP[d.properties.dealstage] || d.properties.dealstage,
            amount: d.properties.amount,
            closeDate: d.properties.closedate,
          }))
        })().catch(() => {})
      )
    }
  }

  await Promise.all(promises)
  return context
}

// ─── Chat endpoint ──────────────────────────────────────

const SYSTEM_PROMPT = `You are the Yanne Capital Intelligence Platform assistant. You have access to real-time data across the entire business — sales, outbound campaigns, client fulfillment, setter performance, HubSpot deals, and revenue.

Yanne Capital is an SEC-registered boutique investment bank. The team includes 4 closers (Jake, Stanley, Thomas, Tahawar), setters who handle inbound replies, and a fulfillment team managing active client campaigns.

You can answer questions about:
- **Sales**: rep performance, call scores, coaching priorities, deal pipeline, qualification rates
- **Outbound / Campaigns**: EmailBison campaign stats (emails sent, reply rates, bounce rates, interested replies), active vs paused campaigns
- **Clients / Fulfillment**: client onboarding status (Monday.com), project health, task completion, which clients are active
- **Setters**: unactioned replies, meetings booked, setter-by-setter performance, interested-to-meeting conversion
- **Funnel Health**: skip-adjusted MQ→Won conversion, stage-to-stage drop-off, time-in-stage medians, 3rd-Call outcomes, cohort comparison (2025 vs 2026)
- **HubSpot Deals**: Sales Pipeline deal stages, amounts, close dates, won/lost counts, revenue
- **Revenue**: cash collected, retainers, success fees

Rules:
- Be direct, use specific numbers from the data provided
- Never make up data — only reference what's in the <data> block
- Format responses with markdown (bold, lists) for readability
- Keep answers concise but thorough — 3-8 sentences typical
- If data is empty or missing, say so honestly
- Grades: A+/A/A- (excellent), B+/B/B- (good), C+/C/C- (average), D+/D/D- (below average), F (failing)
- Scoring: 75%+ green, 55-74% yellow, <55% red
- Sales pipeline stages: Meeting Qualified → NDA → 1st Closing Call → 2nd Closing Call → 3rd Call / Contract → Closed Won
- Funnel counts are *skip-adjusted* — "1st Call+ Reach" = deals that ever reached 1st Call OR any later stage. Don't compare to HubSpot's literal stage counts.
- qualification_result: QUALIFIED, BORDERLINE, NOT_QUALIFIED
- pipeline_inflation: true = unqualified prospect advanced (judgment issue)
- next_step_flag: DEAD_END = qualified but rep didn't advance (skill gap)

When comparing reps, use a structured format. When discussing trends, reference the trend direction (Improving/Plateauing/Declining) from rep_performance data. When discussing clients, reference their project health (RAG) and onboarding completion %.`

app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const { messages } = req.body
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' })
    }

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMsg) return res.status(400).json({ error: 'no user message' })

    const pillarAccess = req.user?.pillar_access || []
    const context = await gatherContext(lastUserMsg.content, pillarAccess)

    let contextStr = JSON.stringify(context, null, 2)
    // Safety: truncate context to prevent token limit errors
    if (contextStr.length > 50000) {
      contextStr = contextStr.slice(0, 50000) + '\n...(truncated for token limit)'
    }
    // Keep last 10 messages max to stay within token budget
    const recentMessages = messages.slice(-10)
    const enrichedMessages = [
      ...recentMessages.slice(0, -1),
      {
        role: 'user',
        content: `${lastUserMsg.content}\n\n<data>\n${contextStr}\n</data>`,
      },
    ]

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const pillarLine = `The user has access to the following pillars: ${pillarAccess.join(', ') || 'none'}. Refuse to answer questions that require data from pillars the user does not have.`
    const systemForThisRequest = `${pillarLine}\n\n${SYSTEM_PROMPT}`

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemForThisRequest,
      messages: enrichedMessages,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('Chat error:', err)
    if (!res.headersSent) {
      serverError(res, err)
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    }
  }
})

// ─── Revenue Forecast ───────────────────────────────────

// Real probabilities calculated from 557 historical deals (deals that reached stage → closed won)
// Recalculated dynamically in the forecast endpoint
const STAGE_PROBABILITY_FALLBACK = {
  'Meeting Qualified': 0.39,
  'NDA': 0.49,
  '1st Closing Call': 0.52,
  '2nd Closing Call': 0.62,
  '3rd Call / Contract': 0.72,
  'Closed Won': 1.0,
}

app.get('/api/forecast', async (_req, res) => {
  if (!HUBSPOT_KEY) return res.status(503).json({ error: 'HubSpot not configured' })
  try {
    // Fetch all Sales Pipeline deals
    const allDeals = []
    let after = '', pages = 0
    while (pages < 10) {
      const pagination = after ? `&after=${after}` : ''
      const { data, error } = await hubspotFetch(`/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,closedate,pipeline,createdate,hs_lastmodifieddate,hs_lastactivity_date${pagination}`)
      if (error) break
      const sales = (data.results || []).filter(d => !d.properties?.pipeline || d.properties.pipeline === 'default')
      allDeals.push(...sales)
      const nextAfter = data.paging?.next?.after
      if (!nextAfter) break
      after = nextAfter; pages++
    }

    const CLOSED = ['closedwon', 'closedlost', 'contractsent', '1066871403']
    const now = new Date()
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0)

    // Calculate REAL win probability from historical data
    // Exclude Long Term Lead + Disqualified (never real opportunities)
    // Real pipeline = Won + Lost + Active
    const ACTIVE_STAGE_ORDER = ['Meeting Qualified', 'NDA', '1st Closing Call', '2nd Closing Call', '3rd Call / Contract']
    const stageRank = Object.fromEntries(ACTIVE_STAGE_ORDER.map((s, i) => [s, i]))

    const wonDeals = allDeals.filter(d => (HUBSPOT_STAGE_MAP[d.properties?.dealstage] || d.properties?.dealstage) === 'Closed Won')
    const lostDeals = allDeals.filter(d => (HUBSPOT_STAGE_MAP[d.properties?.dealstage] || d.properties?.dealstage) === 'Closed Lost')
    const activeStageDeals = allDeals.filter(d => {
      const s = HUBSPOT_STAGE_MAP[d.properties?.dealstage] || d.properties?.dealstage
      return ACTIVE_STAGE_ORDER.includes(s)
    })
    const realPipelineTotal = wonDeals.length + lostDeals.length + activeStageDeals.length
    const overallWinRate = realPipelineTotal > 0 ? wonDeals.length / realPipelineTotal : 0

    // Stage-specific: later stages have higher probability
    // Deals at/past a stage + won = reached that stage
    // Scale probability proportionally by how far through the funnel they are
    const realProbability = {}
    for (const stage of ACTIVE_STAGE_ORDER) {
      const r = stageRank[stage]
      const atOrPast = activeStageDeals.filter(d => {
        const s = HUBSPOT_STAGE_MAP[d.properties?.dealstage] || d.properties?.dealstage
        return stageRank[s] !== undefined && stageRank[s] >= r
      })
      const reached = atOrPast.length + wonDeals.length
      // Proportional estimate of lost deals at this stage
      const lostEstimate = Math.round(lostDeals.length * (reached / Math.max(realPipelineTotal, 1)))
      const totalEntered = reached + lostEstimate
      realProbability[stage] = totalEntered > 0 ? Math.round((wonDeals.length / totalEntered) * 100) / 100 : overallWinRate
    }

    // Per-stage breakdown
    const stageBreakdown = []
    for (const stage of ACTIVE_STAGE_ORDER) {
      const deals = allDeals.filter(d => {
        const s = HUBSPOT_STAGE_MAP[d.properties?.dealstage] || d.properties?.dealstage
        return s === stage
      })
      const totalAmount = deals.reduce((s, d) => s + parseFloat(d.properties?.amount || '0'), 0)
      const prob = realProbability[stage] || overallWinRate
      const weighted = Math.round(totalAmount * prob)
      stageBreakdown.push({ stage, count: deals.length, totalAmount, probability: prob, weighted })
    }

    // Stale deals (close date passed or no activity 30d+)
    const staleDeals = allDeals.filter(d => {
      if (CLOSED.includes(d.properties?.dealstage || '')) return false
      const closeDate = d.properties?.closedate ? new Date(d.properties.closedate) : null
      const lastActivity = d.properties?.hs_lastactivity_date || d.properties?.hs_lastmodifieddate
      const activityDays = lastActivity ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000) : null
      const overdue = closeDate && closeDate < now
      const inactive = activityDays !== null && activityDays >= 30
      return overdue || inactive
    }).map(d => {
      const stageName = HUBSPOT_STAGE_MAP[d.properties?.dealstage] || d.properties?.dealstage
      const closeDate = d.properties?.closedate
      const lastActivity = d.properties?.hs_lastactivity_date || d.properties?.hs_lastmodifieddate
      const activityDays = lastActivity ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000) : null
      const overdue = closeDate && new Date(closeDate) < now
      return {
        name: d.properties?.dealname,
        stage: stageName,
        amount: parseFloat(d.properties?.amount || '0'),
        closeDate,
        activityDays,
        overdue,
        reason: overdue && activityDays >= 30 ? 'Overdue + Inactive' : overdue ? 'Overdue close date' : 'No activity 30d+',
      }
    })

    const totalWeighted = stageBreakdown.reduce((s, b) => s + b.weighted, 0)
    const totalActive = stageBreakdown.reduce((s, b) => s + b.totalAmount, 0)

    // Monthly projection (deals with close dates this month)
    const thisMonthDeals = allDeals.filter(d => {
      if (CLOSED.includes(d.properties?.dealstage || '')) return false
      const cd = d.properties?.closedate ? new Date(d.properties.closedate) : null
      return cd && cd >= now && cd <= thisMonthEnd
    })
    const thisMonthValue = thisMonthDeals.reduce((s, d) => s + parseFloat(d.properties?.amount || '0'), 0)

    res.json({
      stageBreakdown,
      totalWeighted: Math.round(totalWeighted),
      totalActive: Math.round(totalActive),
      staleDeals,
      staleCount: staleDeals.length,
      staleTotalAmount: Math.round(staleDeals.reduce((s, d) => s + d.amount, 0)),
      thisMonth: {
        deals: thisMonthDeals.length,
        value: Math.round(thisMonthValue),
        month: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      },
    })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Funnel Health routes ──────────────────────────────────

app.get('/api/funnel-health/counts', async (req, res) => {
  try {
    const { cohort_start = '1900-01-01', cohort_end = '2099-12-31' } = req.query
    const { data, error } = await supaRpc('funnel_counts', { cohort_start, cohort_end })
    if (error) return serverError(res, error)
    res.json(data?.[0] ?? null)
  } catch (err) { serverError(res, err) }
})

app.get('/api/funnel-health/dwell', async (req, res) => {
  try {
    const { cohort_start = '1900-01-01', cohort_end = '2099-12-31' } = req.query
    const { data, error } = await supaRpc('funnel_dwell_times', { cohort_start, cohort_end })
    if (error) return serverError(res, error)
    res.json(data ?? [])
  } catch (err) { serverError(res, err) }
})

app.get('/api/funnel-health/outcomes', async (req, res) => {
  try {
    const { cohort_start = '1900-01-01', cohort_end = '2099-12-31' } = req.query
    const { data, error } = await supaRpc('funnel_third_call_outcomes', { cohort_start, cohort_end })
    if (error) return serverError(res, error)
    res.json(data?.[0] ?? null)
  } catch (err) { serverError(res, err) }
})

app.get('/api/funnel-health/last-sync', async (_req, res) => {
  try {
    const { data, error } = await supaQuery('funnel_snapshots', 'select=snapshot_date&order=snapshot_date.desc&limit=1')
    if (error) return serverError(res, error)
    res.json({ last_sync: data?.[0]?.snapshot_date ?? null })
  } catch (err) { serverError(res, err) }
})

app.post('/api/funnel-health/refresh', async (_req, res) => {
  try {
    const webhookUrl = process.env.N8N_FUNNEL_WEBHOOK_URL
    if (!webhookUrl) return res.status(503).json({ error: 'refresh webhook not configured' })
    const r = await fetch(webhookUrl, { method: 'POST' })
    if (!r.ok) return res.status(502).json({ error: `n8n returned ${r.status}`, body: await r.text() })
    res.json({ triggered: true })
  } catch (err) { serverError(res, err) }
})

// ─── Coaching Adherence ─────────────────────────────────

app.get('/api/coaching-adherence', async (_req, res) => {
  try {
    // Get rep performance (current coaching focus)
    const { data: reps } = await supaQuery('rep_performance', 'select=rep,current_coaching_focus,coaching_adherence_rate,weakest_category,strongest_category')
    // Get last 30 calls per rep to check if coaching was addressed
    const { data: calls } = await supaQuery('call_logs', 'select=rep,date,score_percentage,coaching_priority,previous_coaching_addressed,call_type&order=scored_at.desc&limit=100')

    const repAdherence = (reps || []).map(rep => {
      const repCalls = (calls || []).filter(c => c.rep === rep.rep)
      const recent = repCalls.slice(0, 10)
      const addressed = recent.filter(c => c.previous_coaching_addressed).length
      const adherenceRate = recent.length > 0 ? Math.round((addressed / recent.length) * 100) : 0

      // Check if the same coaching priority keeps repeating (= not fixing it)
      const priorities = repCalls.slice(0, 5).map(c => c.coaching_priority).filter(Boolean)
      const priorityFreq = {}
      for (const p of priorities) priorityFreq[p] = (priorityFreq[p] || 0) + 1
      const repeatingIssue = Object.entries(priorityFreq).find(([, count]) => count >= 3)

      return {
        rep: rep.rep,
        currentFocus: rep.current_coaching_focus,
        adherenceRate,
        addressedCount: addressed,
        totalRecent: recent.length,
        weakestCategory: rep.weakest_category,
        strongestCategory: rep.strongest_category,
        repeatingIssue: repeatingIssue ? repeatingIssue[0] : null,
        recentScores: recent.slice(0, 5).map(c => ({ date: c.date, score: c.score_percentage, type: c.call_type })),
      }
    })

    res.json(repAdherence)
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Scorecard Snapshots (Supabase with local fallback) ──

const SNAPSHOTS_FILE = join(__dirname, 'scorecard_snapshots.json')

function loadSnapshotsLocal() {
  try {
    if (existsSync(SNAPSHOTS_FILE)) return JSON.parse(readFileSync(SNAPSHOTS_FILE, 'utf-8'))
  } catch { /* empty */ }
  return []
}

app.get('/api/scorecard/snapshots', async (_req, res) => {
  try {
    // Try Supabase first
    const { data, error } = await supaQuery('ceo_dashboard_snapshots', 'select=*&order=created_at.desc&limit=52')
    if (!error && data && data.length > 0) {
      return res.json(data.map(s => ({ ...s.snapshot_data, created_at: s.created_at, created_by: s.created_by, weekRange: s.week_range })))
    }
    // Fallback to local
    res.json(loadSnapshotsLocal())
  } catch {
    res.json(loadSnapshotsLocal())
  }
})

app.post('/api/scorecard/snapshot', async (req, res) => {
  try {
    const snapshot = req.body
    const created_by = req.user?.name || 'system'
    const week_range = snapshot.weekRange || ''

    // Try Supabase first
    const { error } = await supaInsert('ceo_dashboard_snapshots', {
      week_range,
      snapshot_data: snapshot,
      created_by,
    })

    if (error) {
      // Fallback to local file
      snapshot.created_at = new Date().toISOString()
      snapshot.created_by = created_by
      const snapshots = loadSnapshotsLocal()
      snapshots.push(snapshot)
      if (snapshots.length > 52) snapshots.splice(0, snapshots.length - 52)
      writeFileSync(SNAPSHOTS_FILE, JSON.stringify(snapshots, null, 2))
    }

    auditLog(req.user?.id, 'create_snapshot', 'scorecard', {}, req.ip)
    res.json({ ok: true })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Scorecard Cell Edit (single cell write to Google Sheet) ──

app.post('/api/scorecard/cell', async (req, res) => {
  try {
    const { tab, cell, value } = req.body
    if (!tab || !cell) return res.status(400).json({ error: 'tab and cell are required' })
    await writeSheetCells(tab, [{ cell, value: value ?? '' }])
    auditLog(req.user?.id, 'edit_sheet_cell', 'scorecard', { tab, cell, value }, req.ip)
    res.json({ ok: true })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Scorecard Sync (write API values to Google Sheet) ──

app.post('/api/scorecard/sync', async (req, res) => {
  try {
    const now = new Date()
    const tab = await findBestSheetTab()
    const sheetRows = await readSheetTab(tab, 'A:M')
    if (!sheetRows) return res.status(503).json({ error: 'Google Sheets not available' })

    // Fetch ALL API-derived values
    const daysAgoFn = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString() }
    const [bisonRes, linkedinRes, hubspotDeals, callsRes, dealsRes, inboxRes, meetingsRes, emailReports, salesFormRes] = await Promise.all([
      fetchAllBisonCampaigns().catch(() => []),
      AIRTABLE_KEY ? airtableFetch('appisraRpUPDhzh6b', 'tblosAcipaVFp0zmo', { pageSize: '100' }).then(r => r.data).catch(() => null) : Promise.resolve(null),
      fetchAllHubSpotDeals().catch(() => ({ results: [] })),
      supaQuery('call_logs', `select=rep,call_type,qualification_result,date&scored_at=gte.${daysAgoFn(30)}`).catch(() => ({ data: [] })),
      supaQuery('deals_with_calls', 'select=rep_name,deal_status,current_stage,created_at,updated_at').catch(() => ({ data: [] })),
      AIRTABLE_KEY ? airtableFetch('appoCoN4yDrzKNRPe', 'tbl7Opo9spWMGMXKp', { pageSize: '100' }).then(r => r.data).catch(() => null) : Promise.resolve(null),
      fetchMeetingsParsed().catch(() => ({ thisWeek: 0, thisMonth: 0 })),
      fetchEmailReportsParsed().catch(() => ({ emailsSent: 0, replies: 0, interested: 0, bounced: 0, replyRate: 0, bounceRate: 0 })),
      fetchWeeklySalesForm().catch(() => ({ rows: [], tabName: null })),
    ])

    // ── Email stats from Slack daily reports (truth of source) ──
    const totalSent = emailReports.emailsSent || 0
    const totalReplies = emailReports.replies || 0
    const replyRateAvg = emailReports.replyRate || 0
    // Still count active campaigns from Bison for that metric
    let activeCampaigns = 0
    for (const c of bisonRes) {
      if (c.status === 'active' || c.status === 'launching') activeCampaigns++
    }

    // ── LinkedIn/HeyReach ──
    const liRecords = linkedinRes?.records || []
    // Airtable records are cumulative snapshots by date — use the LATEST record
    const liAgg = { messagesSent: 0, connectionsSent: 0, connectionsAccepted: 0, connectionAcceptanceRate: 0, messageReplyRate: 0, totalReplies: 0, meetingsBooked: 0 }
    if (liRecords.length > 0) {
      const sorted = [...liRecords].sort((a, b) => (b.fields?.Date || '').localeCompare(a.fields?.Date || ''))
      const latest = sorted[0].fields || {}
      liAgg.messagesSent = Number(latest.messagesSent) || 0
      liAgg.connectionsSent = Number(latest.connectionsSent) || 0
      liAgg.connectionsAccepted = Number(latest.connectionsAccepted) || 0
      liAgg.totalReplies = Number(latest.totalMessageReplies) || 0
      liAgg.meetingsBooked = Number(latest['Meeting Booked']) || 0
      liAgg.connectionAcceptanceRate = Math.round((Number(latest.connectionAcceptanceRate) || 0) * 1000) / 10
      liAgg.messageReplyRate = Math.round((Number(latest.messageReplyRate) || 0) * 1000) / 10
    }

    // ── Supabase deals (for mandates count) ──
    const deals = dealsRes.data || []
    const teamMandates = deals.filter(d => d.deal_status === 'signed').length
    // Qualification rate from weekly sales form (progressed / showed)
    const sfRows = salesFormRes?.rows || []
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    let sfShowed = 0, sfProgressed = 0
    for (let i = 1; i < sfRows.length; i++) {
      const r = sfRows[i]
      if (!r || r.length < 6) continue
      const weekEnd = (r[2] || '').trim()
      const parts = weekEnd.split('/')
      if (parts.length === 3) {
        const m = parseInt(parts[0]), y = parseInt(parts[2])
        if (y === now.getFullYear() && m === (now.getMonth() + 1)) {
          sfShowed += parseInt(r[4]) || 0
          sfProgressed += parseInt(r[5]) || 0
        }
      }
    }
    const qualRate = sfShowed > 0 ? Math.round((sfProgressed / sfShowed) * 100) : 0
    const pipelineTotal = activeDeals.length + teamMandates
    const closeRate = pipelineTotal > 0 ? Math.round((teamMandates / pipelineTotal) * 100) : 0

    // ── Inbox interested ──
    const inboxRecords = inboxRes?.records || []
    const totalInterested = inboxRecords.filter(r => r.fields?.['Lead Category'] === 'Interested').length
    const interestedReplyRate = totalReplies > 0 ? Math.round((totalInterested / totalReplies) * 100) : 0

    // ── Meetings ──
    const totalMeetingsMonth = meetingsRes.thisMonth || meetingsRes.thisWeek || 0
    const interestedToMeeting = totalInterested > 0 ? Math.round((totalMeetingsMonth / totalInterested) * 100) : 0

    // ── Week boundaries: W1 = 1st through first Sunday, then Mon-Sun cycles ──
    function getMonthWeeks(year, month) {
      // month is 0-indexed (0=Jan)
      const lastDay = new Date(year, month + 1, 0).getDate()
      const firstDow = new Date(year, month, 1).getDay() // 0=Sun
      // W1: day 1 through first Sunday
      const w1End = firstDow === 0 ? 7 : (7 - firstDow + 1)
      const cols = ['B', 'C', 'D', 'E', 'F']
      const weeks = [{ col: 'B', start: 1, end: Math.min(w1End, lastDay) }]
      let d = w1End + 1
      let ci = 1
      while (d <= lastDay && ci < 4) {
        weeks.push({ col: cols[ci], start: d, end: Math.min(d + 6, lastDay) })
        d += 7
        ci++
      }
      if (d <= lastDay) {
        weeks.push({ col: cols[ci] || 'F', start: d, end: lastDay })
      }
      return weeks
    }
    const weekRanges = getMonthWeeks(now.getFullYear(), now.getMonth())

    function dayInWeek(dateStr) {
      const d = parseInt(dateStr.slice(8, 10))
      const m = parseInt(dateStr.slice(5, 7))
      const y = parseInt(dateStr.slice(0, 4))
      if (y !== now.getFullYear() || m !== (now.getMonth() + 1)) return null
      for (const w of weekRanges) { if (d >= w.start && d <= w.end) return w.col }
      return null
    }

    // Aggregate daily email reports by week (including F=remainder)
    const emptyWeekBucket = () => ({ sent: 0, replies: 0, interested: 0, bounced: 0 })
    const emailByWeek = { B: emptyWeekBucket(), C: emptyWeekBucket(), D: emptyWeekBucket(), E: emptyWeekBucket(), F: emptyWeekBucket() }
    for (const dr of (emailReports.dailyReports || [])) {
      const wk = dayInWeek(dr.date)
      if (wk && emailByWeek[wk]) {
        emailByWeek[wk].sent += dr.emailsSent || 0
        emailByWeek[wk].replies += dr.replies || 0
        emailByWeek[wk].interested += dr.interested || 0
        emailByWeek[wk].bounced += dr.bounced || 0
      }
    }

    // Aggregate daily meeting reports by week
    const meetingsByWeek = { B: 0, C: 0, D: 0, E: 0, F: 0 }
    for (const mr of (meetingsRes.dailyReports || [])) {
      const wk = dayInWeek(mr.date)
      if (wk && meetingsByWeek[wk] !== undefined) meetingsByWeek[wk] += mr.count || 0
    }

    // Aggregate weekly sales form by week (using week ending date)
    const emptySalesBucket = () => ({ showed: 0, progressed: 0, elsSent: 0, dealsClosed: 0 })
    const salesByWeek = { B: emptySalesBucket(), C: emptySalesBucket(), D: emptySalesBucket(), E: emptySalesBucket(), F: emptySalesBucket() }
    for (let i = 1; i < sfRows.length; i++) {
      const r = sfRows[i]
      if (!r || r.length < 6) continue
      const weekEnd = (r[2] || '').trim()
      const parts = weekEnd.split('/')
      if (parts.length !== 3) continue
      const m = parseInt(parts[0]), d = parseInt(parts[1]), y = parseInt(parts[2])
      if (y !== now.getFullYear() || m !== (now.getMonth() + 1)) continue
      // Map the week ending day to the correct week column
      let wkCol = null
      for (const w of weekRanges) { if (d >= w.start && d <= w.end) wkCol = w.col }
      if (!wkCol) wkCol = 'F' // remainder (28+)
      if (salesByWeek[wkCol]) {
        salesByWeek[wkCol].showed += parseInt(r[4]) || 0
        salesByWeek[wkCol].progressed += parseInt(r[5]) || 0
        salesByWeek[wkCol].elsSent += parseInt(r[6]) || 0
        const parseCash = (v) => parseFloat((v || '0').replace(/[$,]/g, '')) || 0
        salesByWeek[wkCol].dealsClosed += parseCash(r[7])
      }
    }

    // Build updates — write column H (Monthly Actual) + weekly columns B-F
    // 2-WAY SYNC: only write to cells that are currently empty.
    // If someone manually edited a cell in Google Sheets, their value stays.
    const updates = []
    const rowMap = {}
    const colIndex = { B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10 }
    sheetRows.forEach((row, i) => { if (row[0]) rowMap[String(row[0]).trim()] = rowMap[String(row[0]).trim()] || []; rowMap[String(row[0]).trim()]?.push(i + 1) })

    // Check if a cell in the sheet currently has a value
    function cellHasValue(rowNum, column) {
      const sheetRowIdx = rowNum - 1 // sheetRows is 0-indexed, rowNum is 1-indexed
      const colIdx = colIndex[column]
      if (!sheetRows[sheetRowIdx] || colIdx === undefined) return false
      const val = sheetRows[sheetRowIdx][colIdx]
      return val !== undefined && val !== null && String(val).trim() !== ''
    }

    function writeRow(rowNum, column, value) {
      if (!rowNum || value === undefined) return
      // 2-way: skip if cell already has a manual value (preserve edits)
      // Exception: column H (Monthly Actual) always gets overwritten with API data
      if (column !== 'H' && cellHasValue(rowNum, column)) return
      updates.push({ cell: `${column}${rowNum}`, value })
    }

    // Helper: write monthly + all weekly columns for a metric
    function writeMetricWeekly(metricName, monthlyVal, weeklyVals) {
      const rowNum = rowMap[metricName]?.[0]
      if (!rowNum) return
      writeRow(rowNum, 'H', monthlyVal)
      for (const [col, val] of Object.entries(weeklyVals)) {
        writeRow(rowNum, col, val)
      }
    }

    // ── Email metrics (from Slack daily reports) ──
    const monthlyReplyRate = totalSent > 0 ? Math.round((totalReplies / totalSent) * 10000) / 100 : 0
    const wkCols = ['B', 'C', 'D', 'E', 'F']
    const emailWk = (col, field) => emailByWeek[col]?.[field] || 0
    writeMetricWeekly('Emails Sent', totalSent, Object.fromEntries(wkCols.map(c => [c, emailWk(c, 'sent')])))
    writeMetricWeekly('Total Replies', totalReplies, Object.fromEntries(wkCols.map(c => [c, emailWk(c, 'replies')])))
    const rateW = (c) => emailWk(c, 'sent') > 0 ? `${((emailWk(c, 'replies') / emailWk(c, 'sent')) * 100).toFixed(2)}%` : ''
    writeMetricWeekly('Reply Rate', `${monthlyReplyRate.toFixed(2)}%`, Object.fromEntries(wkCols.map(c => [c, rateW(c)])))
    writeMetricWeekly('Interested Leads', emailReports.interested || 0, Object.fromEntries(wkCols.map(c => [c, emailWk(c, 'interested')])))
    const intRateW = (c) => emailWk(c, 'replies') > 0 ? `${Math.round((emailWk(c, 'interested') / emailWk(c, 'replies')) * 100)}%` : ''
    writeMetricWeekly('Interested Reply Rate (% of replies)', `${interestedReplyRate}%`, Object.fromEntries(wkCols.map(c => [c, intRateW(c)])))

    // ── LinkedIn metrics (cumulative snapshots — monthly only, no weekly breakdown) ──
    writeRow(rowMap['LinkedIn Messages Sent']?.[0], 'H', liAgg.messagesSent)
    writeRow(rowMap['Connection Requests Sent']?.[0], 'H', liAgg.connectionsSent)
    writeRow(rowMap['Connection Acceptance Rate']?.[0], 'H', liAgg.connectionAcceptanceRate ? `${liAgg.connectionAcceptanceRate}%` : '')
    writeRow(rowMap['LinkedIn Reply Rate']?.[0], 'H', liAgg.messageReplyRate ? `${liAgg.messageReplyRate}%` : '')
    writeRow(rowMap['Meetings Booked from LinkedIn']?.[0], 'H', liAgg.meetingsBooked)

    // ── Meetings (from Slack daily reports) ──
    writeMetricWeekly('Total Meetings Booked (Email + LinkedIn)', totalMeetingsMonth, meetingsByWeek)
    const intToMeetW = (c) => emailWk(c, 'interested') > 0 ? `${Math.round(((meetingsByWeek[c] || 0) / emailWk(c, 'interested')) * 100)}%` : ''
    writeMetricWeekly('Interested Leads → Meetings Conversion', `${interestedToMeeting}%`, Object.fromEntries(wkCols.map(c => [c, intToMeetW(c)])))

    // ── Qualification Rate (from weekly sales form) ──
    const qualW = (c) => salesByWeek[c]?.showed > 0 ? `${Math.round((salesByWeek[c].progressed / salesByWeek[c].showed) * 100)}%` : ''
    writeMetricWeekly('Qualification Rate (Call 1 → Call 2)', `${qualRate}%`, Object.fromEntries(wkCols.map(c => [c, qualW(c)])))

    // -- Per-closer: WEEKLY form = primary (monthly + weekly), DAILY = backup --
    // Aggregate weekly form per rep: monthly totals AND per-week
    const sfByRep = {}
    const sfByRepByWeek = {}
    for (let i = 1; i < sfRows.length; i++) {
      const r = sfRows[i]
      if (!r || r.length < 6) continue
      const rep = (r[1] || '').trim()
      const weekEnd = (r[2] || '').trim()
      const parts = weekEnd.split('/')
      if (parts.length !== 3) continue
      const m = parseInt(parts[0]), d = parseInt(parts[1]), y = parseInt(parts[2])
      if (y !== now.getFullYear() || m !== (now.getMonth() + 1)) continue
      const scheduled = parseInt(r[3]) || 0, showed = parseInt(r[4]) || 0, progressed = parseInt(r[5]) || 0, elsSent = parseInt(r[6]) || 0
      const parseCash = (v) => parseFloat((v || '0').replace(/[$,]/g, '')) || 0
      // Monthly totals
      if (!sfByRep[rep]) sfByRep[rep] = { scheduled: 0, showed: 0, progressed: 0, elsSent: 0, dealsClosed: 0 }
      sfByRep[rep].scheduled += scheduled
      sfByRep[rep].showed += showed
      sfByRep[rep].progressed += progressed
      sfByRep[rep].elsSent += elsSent
      sfByRep[rep].dealsClosed += parseCash(r[7])
      // Map to week column using week ending day
      let wkCol = null
      for (const w of weekRanges) { if (d >= w.start && d <= w.end) wkCol = w.col }
      if (!wkCol) wkCol = weekRanges[weekRanges.length - 1]?.col || 'F'
      if (!sfByRepByWeek[rep]) sfByRepByWeek[rep] = {}
      if (!sfByRepByWeek[rep][wkCol]) sfByRepByWeek[rep][wkCol] = { scheduled: 0, showed: 0, progressed: 0, elsSent: 0 }
      sfByRepByWeek[rep][wkCol].scheduled += scheduled
      sfByRepByWeek[rep][wkCol].showed += showed
      sfByRepByWeek[rep][wkCol].progressed += progressed
      sfByRepByWeek[rep][wkCol].elsSent += elsSent
    }

    // Daily check-in as backup for weekly columns
    const dailyCheckins = await fetchRepCheckins(45).catch(() => ({ checkins: [] }))
    const monthCheckins = dailyCheckins.checkins.filter(c => c.date >= firstOfMonth)
    const dailyByRep = {}
    for (const c of monthCheckins) {
      if (!dailyByRep[c.rep]) dailyByRep[c.rep] = {}
      const wk = dayInWeek(c.date)
      if (wk) {
        if (!dailyByRep[c.rep][wk]) dailyByRep[c.rep][wk] = { scheduled: 0, completed: 0, progressed: 0 }
        dailyByRep[c.rep][wk].scheduled += c.scheduled
        dailyByRep[c.rep][wk].completed += c.completed
        dailyByRep[c.rep][wk].progressed += c.progressed
      }
    }

    // Write per-closer rows
    const repNames = ['Stanley', 'Thomas', 'Tahawar', 'Jake']
    for (const rep of repNames) {
      let subRow = null
      for (let i = 0; i < sheetRows.length; i++) {
        const cell = String(sheetRows[i]?.[0] || '').trim()
        if (cell.includes(rep)) { subRow = i + 1; break }
      }
      if (!subRow) continue
      const sf = sfByRep[rep] || { scheduled: 0, showed: 0, progressed: 0, elsSent: 0, dealsClosed: 0 }
      const showRate = sf.scheduled > 0 ? Math.round((sf.showed / sf.scheduled) * 100) : 0

      // Monthly actuals from weekly form (col H)
      writeRow(subRow + 1, 'H', sf.scheduled)
      writeRow(subRow + 2, 'H', `${showRate}%`)
      writeRow(subRow + 3, 'H', sf.progressed)
      writeRow(subRow + 4, 'H', sf.elsSent)
      writeRow(subRow + 5, 'H', sf.dealsClosed > 0 ? `$${sf.dealsClosed.toLocaleString()}` : '0')

      // Weekly columns: prefer weekly form, fallback to daily
      for (const col of wkCols) {
        const sfWk = sfByRepByWeek[rep]?.[col]
        const dailyWk = dailyByRep[rep]?.[col]
        if (sfWk && sfWk.scheduled > 0) {
          writeRow(subRow + 1, col, sfWk.scheduled)
          writeRow(subRow + 2, col, `${Math.round((sfWk.showed / sfWk.scheduled) * 100)}%`)
          writeRow(subRow + 3, col, sfWk.progressed)
        } else if (dailyWk && dailyWk.scheduled > 0) {
          writeRow(subRow + 1, col, dailyWk.scheduled)
          writeRow(subRow + 2, col, `${Math.round((dailyWk.completed / dailyWk.scheduled) * 100)}%`)
          writeRow(subRow + 3, col, dailyWk.progressed)
        }
      }
    }


    // ── Team aggregate (from weekly form, fallback to daily) ──
    const teamSF = { scheduled: 0, showed: 0, progressed: 0, elsSent: 0 }
    for (const rd of Object.values(sfByRep)) {
      teamSF.scheduled += rd.scheduled
      teamSF.showed += rd.showed
      teamSF.progressed += rd.progressed
      teamSF.elsSent += rd.elsSent
    }
    // Fallback to daily if weekly form has no data
    if (teamSF.scheduled === 0 && monthCheckins.length > 0) {
      teamSF.scheduled = monthCheckins.reduce((s, c) => s + c.scheduled, 0)
      teamSF.showed = monthCheckins.reduce((s, c) => s + c.completed, 0)
      teamSF.progressed = monthCheckins.reduce((s, c) => s + c.progressed, 0)
    }
    writeRow(rowMap['Total Calls Booked']?.[0], 'H', teamSF.scheduled)
    writeRow(rowMap['Total Progressed to Qualified']?.[0], 'H', teamSF.progressed)
    writeRow(rowMap['Total Mandates Signed']?.[0], 'H', teamMandates)
    writeRow(rowMap['Closed from Qualified %']?.[0], 'H', teamSF.showed > 0 ? `${Math.round((teamSF.progressed / teamSF.showed) * 100)}%` : '')

    // ── Fulfillment ──
    writeRow(rowMap['Active Client Campaigns Running']?.[0], 'H', activeCampaigns)

    // ── Update week header labels with actual date ranges ──
    const mo = now.getMonth() + 1
    for (let wi = 0; wi < weekRanges.length; wi++) {
      const w = weekRanges[wi]
      const label = wi < 4 ? `Week ${wi + 1}` : 'Remainder'
      updates.push({ cell: `${w.col}3`, value: `${label}\n[${mo}/${w.start}-${mo}/${w.end}]` })
    }

    const written = updates.length > 0 ? await writeSheetCells(tab, updates) : true
    auditLog(req.user?.id, 'sync_scorecard', 'scorecard', { cellsWritten: updates.length }, req.ip)
    res.json({ ok: true, cellsWritten: updates.length, written, tab, syncedAt: new Date().toISOString() })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Weekly CEO Digest (Slack) ──────────────────────────

app.post('/api/digest/send', requireRole('admin'), async (req, res) => {
  if (!SLACK_TOKEN) return res.status(503).json({ error: 'Slack not configured' })
  try {
    const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString() }

    // Gather all data
    const [callsRes, dealsRes, repsRes] = await Promise.all([
      supaQuery('call_logs', `select=rep,score_percentage,call_type,pipeline_inflation,qualification_result&scored_at=gte.${daysAgo(7)}`),
      supaQuery('deals_with_calls', 'select=deal_id,prospect_company,rep_name,deal_status,current_stage,pipeline_inflation,updated_at'),
      supaQuery('rep_performance', 'select=rep,call_1_rolling_avg,call_1_trend,call_2_rolling_avg,call_2_trend,total_scored_calls,weakest_category,current_coaching_focus'),
    ])

    const calls = callsRes.data || []
    const deals = (dealsRes.data || [])
    const reps = repsRes.data || []

    const weekCalls = calls.length
    const avgScore = weekCalls > 0 ? Math.round(calls.reduce((s, c) => s + c.score_percentage, 0) / weekCalls) : 0
    const inflationCount = calls.filter(c => c.pipeline_inflation).length
    const activeDeals = deals.filter(d => d.deal_status === 'active')
    const stalledDeals = activeDeals.filter(d => {
      if (!d.updated_at) return false
      return (Date.now() - new Date(d.updated_at).getTime()) / 86400000 >= 14
    })

    // Build Slack message
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `Weekly CEO Digest — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Calls Scored:* ${weekCalls}\n*Team Avg Score:* ${avgScore}%\n*Active Deals:* ${activeDeals.length}\n*Pipeline Inflation Flags:* ${inflationCount}` } },
    ]

    if (stalledDeals.length > 0) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*:warning: ${stalledDeals.length} Stalled Deals (14d+):*\n${stalledDeals.slice(0, 5).map(d => `• ${d.prospect_company} (${d.rep_name}) — ${d.current_stage}`).join('\n')}` } })
    }

    // Rep summary
    const repLines = reps.map(r => `• *${r.rep}*: C1 ${r.call_1_rolling_avg}% (${r.call_1_trend}) | C2 ${r.call_2_rolling_avg}% (${r.call_2_trend}) | Weakness: ${r.weakest_category || 'N/A'}`).join('\n')
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Rep Summary:*\n${repLines}` } })

    // Send to #alex-daily-brief
    const ALEX_CHANNEL = 'C0AK9CF0BU1'
    const { error } = await slackFetch('chat.postMessage', { channel: ALEX_CHANNEL, blocks, text: `Weekly CEO Digest — ${weekCalls} calls, ${avgScore}% avg` })
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }

    auditLog(req.user.id, 'send_digest', 'slack', { calls: weekCalls, avgScore }, req.ip)
    res.json({ ok: true, calls: weekCalls, avgScore })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Call Trackers (Gong-style) ─────────────────────────

app.get('/api/trackers', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90
    const floor = new Date(); floor.setDate(floor.getDate() - days)
    const { data, error } = await supaQuery('call_logs', `select=rep,call_type,date,score_percentage,grade,coaching_priority,biggest_miss,objections,red_flags,qualification_result,pipeline_inflation,next_step_flag,call_outcome&scored_at=gte.${floor.toISOString()}&order=scored_at.desc`)
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    const calls = data || []

    // Objection frequency
    const objectionFreq = {}
    const redFlagFreq = {}
    const coachingFreq = {}
    const missFreq = {}

    function parseArray(val) {
      if (Array.isArray(val)) return val
      if (typeof val === 'string') { try { const p = JSON.parse(val); return Array.isArray(p) ? p : [] } catch { return [] } }
      return []
    }
    // Extract text from array items (could be strings or objects with quote/text/name fields)
    function itemText(item) {
      if (typeof item === 'string') return item
      if (typeof item === 'object' && item !== null) {
        return item.quote || item.text || item.name || item.description || item.reason || JSON.stringify(item)
      }
      return String(item)
    }

    for (const c of calls) {
      // Objections (array of {quote, timestamp, heard, reframed, ...})
      const objs = parseArray(c.objections)
      for (const o of objs) {
        const key = itemText(o).slice(0, 100)
        if (key && key !== '{}') objectionFreq[key] = (objectionFreq[key] || 0) + 1
      }
      // Red flags (array of strings or objects)
      const flags = parseArray(c.red_flags)
      for (const f of flags) {
        const key = itemText(f).slice(0, 100)
        if (key && key !== '{}') redFlagFreq[key] = (redFlagFreq[key] || 0) + 1
      }
      // Coaching themes
      if (c.coaching_priority) {
        const key = c.coaching_priority.slice(0, 120)
        coachingFreq[key] = (coachingFreq[key] || 0) + 1
      }
      // Biggest misses
      if (c.biggest_miss) {
        const key = c.biggest_miss.slice(0, 120)
        missFreq[key] = (missFreq[key] || 0) + 1
      }
    }

    const toSorted = (freq) => Object.entries(freq).map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 20)

    // Weekly trends
    const weekMap = {}
    for (const c of calls) {
      if (!c.date) continue
      const d = new Date(c.date)
      const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay())
      const weekKey = weekStart.toISOString().slice(0, 10)
      if (!weekMap[weekKey]) weekMap[weekKey] = { week: weekKey, calls: 0, totalScore: 0, objections: 0, redFlags: 0, inflation: 0 }
      weekMap[weekKey].calls++
      weekMap[weekKey].totalScore += c.score_percentage
      weekMap[weekKey].objections += parseArray(c.objections).length
      weekMap[weekKey].redFlags += parseArray(c.red_flags).length
      weekMap[weekKey].inflation += c.pipeline_inflation ? 1 : 0
    }
    const weeklyTrends = Object.values(weekMap).map(w => ({
      ...w,
      avgScore: w.calls > 0 ? Math.round(w.totalScore / w.calls) : 0,
      avgObjections: w.calls > 0 ? Math.round((w.objections / w.calls) * 10) / 10 : 0,
    })).sort((a, b) => a.week.localeCompare(b.week))

    // Per-rep breakdown
    const repBreakdown = {}
    for (const c of calls) {
      if (!repBreakdown[c.rep]) repBreakdown[c.rep] = { calls: 0, totalScore: 0, objections: 0, redFlags: 0, inflation: 0 }
      repBreakdown[c.rep].calls++
      repBreakdown[c.rep].totalScore += c.score_percentage
      repBreakdown[c.rep].objections += parseArray(c.objections).length
      repBreakdown[c.rep].redFlags += parseArray(c.red_flags).length
      repBreakdown[c.rep].inflation += c.pipeline_inflation ? 1 : 0
    }

    res.json({
      totalCalls: calls.length,
      topObjections: toSorted(objectionFreq),
      topRedFlags: toSorted(redFlagFreq),
      topCoachingThemes: toSorted(coachingFreq),
      topMisses: toSorted(missFreq),
      weeklyTrends,
      repBreakdown: Object.entries(repBreakdown).map(([rep, s]) => ({
        rep, ...s, avgScore: Math.round(s.totalScore / s.calls),
      })),
    })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Call Library Search ────────────────────────────────

app.get('/api/call-search', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase()
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' })

    // Fetch calls with text fields
    const { data, error } = await supaQuery('call_logs', 'select=id,rep,call_type,prospect_company,prospect_contact,date,score_percentage,grade,coaching_priority,biggest_miss,objections,red_flags,strengths_top3,gaps_top3,qualification_result,pipeline_inflation,call_context,call_outcome&order=scored_at.desc&limit=2000')
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }

    function toArr(val) {
      if (Array.isArray(val)) return val
      if (typeof val === 'string') { try { const p = JSON.parse(val); return Array.isArray(p) ? p : [val] } catch { return [val] } }
      return []
    }
    function toText(item) {
      if (typeof item === 'string') return item
      if (typeof item === 'object' && item !== null) return item.quote || item.text || item.name || item.category || item.description || JSON.stringify(item)
      return String(item)
    }

    const calls = (data || []).filter(c => {
      const searchable = [
        c.prospect_company, c.prospect_contact, c.coaching_priority, c.biggest_miss,
        c.call_context, c.call_outcome, c.qualification_result,
        ...toArr(c.objections).map(toText),
        ...toArr(c.red_flags).map(toText),
        ...toArr(c.strengths_top3).map(toText),
        ...toArr(c.gaps_top3).map(toText),
      ].filter(Boolean).join(' ').toLowerCase()
      return searchable.includes(q)
    })

    // Apply filters
    let filtered = calls
    if (req.query.rep) filtered = filtered.filter(c => c.rep === req.query.rep)
    if (req.query.call_type) filtered = filtered.filter(c => c.call_type === req.query.call_type)
    if (req.query.grade) filtered = filtered.filter(c => c.grade === req.query.grade)

    res.json({
      results: filtered.slice(0, 100),
      totalMatches: filtered.length,
      query: q,
    })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Team Benchmarking ──────────────────────────────────

app.get('/api/benchmarks', async (_req, res) => {
  try {
    const { data, error } = await supaQuery('call_logs', 'select=rep,call_type,date,score_percentage,grade,category_scores&order=scored_at.asc&limit=5000')
    if (error) { console.error('[api]', error); return res.status(500).json({ error: 'Internal server error' }) }
    const calls = data || []

    // Weekly avg per rep
    const weeklyRep = {}
    const weeklyTeam = {}
    for (const c of calls) {
      if (!c.date) continue
      const d = new Date(c.date)
      const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay())
      const weekKey = weekStart.toISOString().slice(0, 10)

      // Per rep
      const repKey = `${weekKey}|${c.rep}`
      if (!weeklyRep[repKey]) weeklyRep[repKey] = { week: weekKey, rep: c.rep, total: 0, count: 0 }
      weeklyRep[repKey].total += c.score_percentage
      weeklyRep[repKey].count++

      // Team
      if (!weeklyTeam[weekKey]) weeklyTeam[weekKey] = { week: weekKey, total: 0, count: 0 }
      weeklyTeam[weekKey].total += c.score_percentage
      weeklyTeam[weekKey].count++
    }

    const repTrends = Object.values(weeklyRep).map(w => ({
      week: w.week, rep: w.rep, avgScore: Math.round(w.total / w.count), calls: w.count,
    })).sort((a, b) => a.week.localeCompare(b.week))

    const teamTrend = Object.values(weeklyTeam).map(w => ({
      week: w.week, avgScore: Math.round(w.total / w.count), calls: w.count,
    })).sort((a, b) => a.week.localeCompare(b.week))

    // Grade distribution over time (monthly)
    const monthlyGrades = {}
    for (const c of calls) {
      if (!c.date || !c.grade) continue
      const monthKey = c.date.slice(0, 7)
      if (!monthlyGrades[monthKey]) monthlyGrades[monthKey] = { month: monthKey, A: 0, B: 0, C: 0, D: 0, F: 0, total: 0 }
      const letter = c.grade.charAt(0)
      if (letter in monthlyGrades[monthKey]) monthlyGrades[monthKey][letter]++
      monthlyGrades[monthKey].total++
    }

    // Category performance per rep (all-time avg per scoring category)
    const repCategories = {}
    for (const c of calls) {
      let catScores = c.category_scores
      if (typeof catScores === 'string') { try { catScores = JSON.parse(catScores) } catch { continue } }
      if (!Array.isArray(catScores)) continue
      if (!repCategories[c.rep]) repCategories[c.rep] = {}
      for (const cat of catScores) {
        const catName = cat.category || cat.name || 'Unknown'
        const pct = cat.percentage ?? (cat.max > 0 ? (cat.score / cat.max) * 100 : 0)
        if (!repCategories[c.rep][catName]) repCategories[c.rep][catName] = { total: 0, count: 0 }
        repCategories[c.rep][catName].total += pct
        repCategories[c.rep][catName].count++
      }
    }
    const categoryBreakdown = Object.entries(repCategories).map(([rep, cats]) => ({
      rep,
      categories: Object.entries(cats).map(([category, s]) => ({
        category, avgScore: Math.round(s.total / s.count),
      })).sort((a, b) => a.avgScore - b.avgScore),
    }))

    res.json({
      repTrends,
      teamTrend,
      monthlyGrades: Object.values(monthlyGrades).sort((a, b) => a.month.localeCompare(b.month)),
      categoryBreakdown,
    })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Deal stage update (for Kanban drag-drop) ──────────
app.patch('/api/deals/:id/stage', async (req, res) => {
  const { stage } = req.body
  if (!stage) return res.status(400).json({ error: 'stage required' })
  try {
    const url = `${SUPABASE_URL}/rest/v1/deals?deal_id=eq.${req.params.id}`
    const r = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ current_stage: stage }),
    })
    if (!r.ok) return res.status(500).json({ error: await r.text() })
    auditLog(req.user.id, 'update_deal_stage', 'deals', { deal_id: req.params.id, stage }, req.ip)
    res.json({ ok: true })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Scorecard data fetch helpers ────────────────────────

async function fetchAllBisonCampaigns() {
  if (!EMAILBISON_KEY) return []
  const all = []
  let page = 1, lastPage = 1
  while (page <= lastPage && page <= 10) {
    try {
      const r = await fetch(`${BISON_BASE}/campaigns?per_page=50&page=${page}`, { headers: { Authorization: `Bearer ${EMAILBISON_KEY}` } })
      if (!r.ok) break
      const data = await r.json()
      const items = data?.data || (Array.isArray(data) ? data : [])
      if (items.length === 0) break
      all.push(...items)
      if (data?.meta?.last_page) lastPage = data.meta.last_page
      page++
    } catch { break }
  }
  return all
}

async function fetchMeetingsParsed() {
  if (!SLACK_TOKEN) return { thisWeek: 0, todaySoFar: 0, dailyReports: [] }
  const messages = []
  let cursor = undefined
  let pg = 0
  while (pg < 10) {
    const params = { channel: MEETINGS_CHANNEL, limit: 200, oldest: String(Math.floor(Date.now() / 1000) - 90 * 86400) }
    if (cursor) params.cursor = cursor
    const { data, error } = await slackFetch('conversations.history', params)
    if (error || !data) break
    messages.push(...(data.messages || []))
    cursor = data.response_metadata?.next_cursor
    if (!cursor) break
    pg++
  }
  const dailyReports = []
  let todayIndividual = 0
  for (const m of messages) {
    const text = m.text || ''
    const eodMatch = text.match(/Total Meetings Booked Today:\*?\s*(\d+)/)
    if (eodMatch) {
      const ts = parseFloat(m.ts)
      const date = new Date(ts * 1000).toISOString().slice(0, 10)
      dailyReports.push({ date, count: parseInt(eodMatch[1]) })
    }
    if (text.includes('New Meeting Booked')) {
      const ts = parseFloat(m.ts)
      const msgDate = new Date(ts * 1000).toISOString().slice(0, 10)
      const today = new Date().toISOString().slice(0, 10)
      if (msgDate === today) todayIndividual++
    }
  }
  // Filter to actual time ranges
  const now = new Date()
  const mondayOfWeek = new Date(now)
  const day = mondayOfWeek.getDay()
  mondayOfWeek.setDate(mondayOfWeek.getDate() - (day === 0 ? 6 : day - 1))
  const mondayStr = mondayOfWeek.toISOString().slice(0, 10)
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const sortedReports = dailyReports.sort((a, b) => b.date.localeCompare(a.date))
  const thisWeek = sortedReports.filter(r => r.date >= mondayStr).reduce((s, r) => s + r.count, 0) + todayIndividual
  const thisMonth = sortedReports.filter(r => r.date >= firstOfMonth).reduce((s, r) => s + r.count, 0) + todayIndividual
  return { thisWeek, thisMonth, todaySoFar: todayIndividual, dailyReports: sortedReports }
}

// Fetch monthly email stats from Slack #y-c-emails-reportings channel
async function fetchEmailReportsParsed() {
  if (!SLACK_TOKEN) return { emailsSent: 0, replies: 0, interested: 0, bounced: 0, replyRate: 0, bounceRate: 0, interestedPct: 0, days: 0, dailyReports: [] }
  const now = new Date()
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const oldest = String(Math.floor(new Date(firstOfMonth).getTime() / 1000))
  const messages = []
  let cursor = undefined, pages = 0
  while (pages < 10) {
    const params = { channel: EMAILS_REPORT_CHANNEL, limit: 200, oldest }
    if (cursor) params.cursor = cursor
    const { data, error } = await slackFetch('conversations.history', params)
    if (error || !data) break
    messages.push(...(data.messages || []))
    cursor = data.response_metadata?.next_cursor
    if (!cursor) break
    pages++
  }
  const dailyReports = []
  for (const m of messages) {
    const text = m.text || ''
    if (!text.includes('Daily Email Campaign Report')) continue
    const ts = parseFloat(m.ts)
    const date = new Date(ts * 1000).toISOString().slice(0, 10)
    if (date < firstOfMonth) continue // Safety: only this month
    const sent = text.match(/Total Emails Sent:\*?\s*([\d,]+)/i)
    const replies = text.match(/Total Replies:\*?\s*([\d,]+)/i)
    const bounced = text.match(/Bounced Emails:\*?\s*([\d,]+)/i)
    const interested = text.match(/Interested Replies:\*?\s*([\d,]+)/i)
    const parseN = (m) => m ? parseInt(m[1].replace(/,/g, '')) : 0
    dailyReports.push({ date, emailsSent: parseN(sent), replies: parseN(replies), bounced: parseN(bounced), interested: parseN(interested) })
  }
  dailyReports.sort((a, b) => a.date.localeCompare(b.date))
  const totals = {
    emailsSent: dailyReports.reduce((s, r) => s + r.emailsSent, 0),
    replies: dailyReports.reduce((s, r) => s + r.replies, 0),
    bounced: dailyReports.reduce((s, r) => s + r.bounced, 0),
    interested: dailyReports.reduce((s, r) => s + r.interested, 0),
    days: dailyReports.length,
    dailyReports,
  }
  totals.replyRate = totals.emailsSent > 0 ? (totals.replies / totals.emailsSent) * 100 : 0
  totals.bounceRate = totals.emailsSent > 0 ? (totals.bounced / totals.emailsSent) * 100 : 0
  totals.interestedPct = totals.replies > 0 ? (totals.interested / totals.replies) * 100 : 0
  return totals
}

async function fetchAllHubSpotDeals() {
  if (!HUBSPOT_KEY) return { results: [] }
  const allDeals = []
  let after = '', pages = 0
  while (pages < 10) {
    const pagination = after ? `&after=${after}` : ''
    const { data, error } = await hubspotFetch(`/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,closedate,pipeline,createdate,hs_lastmodifieddate${pagination}`)
    if (error) break
    const results = data.results || []
    const salesOnly = results.filter(d => !d.properties?.pipeline || d.properties.pipeline === 'default')
    allDeals.push(...salesOnly.map(d => ({ ...d, properties: { ...d.properties, stageName: HUBSPOT_STAGE_MAP[d.properties?.dealstage] || d.properties?.dealstage || 'Unknown' } })))
    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
    pages++
  }
  return { results: allDeals }
}

// ─── Phase 3.3: Batch scorecard endpoint ────────────────
app.get('/api/scorecard/data', async (_req, res) => {
  try {
    const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString() }

    const [
      bisonCampaigns, inboxRes, meetingsParsed, sendersRes,
      mondayRes, hubspotParsed,
      callsWeekRes, callsMonthRes, dealsRes, repsRes, allCallsRes,
      targetsData, googleSheetRes, linkedinRes, snapshotsRes,
      onboardingTasksRes, slackEmailTotals, repCheckinsRes, weeklySalesFormRes,
    ] = await Promise.all([
      fetchAllBisonCampaigns(),
      AIRTABLE_KEY ? airtableFetch('appoCoN4yDrzKNRPe', 'tbl7Opo9spWMGMXKp', { pageSize: '100' }).then(r => r.data) : Promise.resolve(null),
      fetchMeetingsParsed(),
      AIRTABLE_KEY ? airtableFetch('app70IAsUKudzw5UI', 'tblIWs6XXXdBW4OdP', { pageSize: '100' }).then(r => r.data) : Promise.resolve(null),
      MONDAY_KEY ? mondayQuery(`{ boards(ids: [${PROJECT_PORTFOLIO_IDS.join(',')}]) { id name items_page(limit: 5) { items { id name column_values { id type text value column { title } } } } } }`).then(r => r.data) : Promise.resolve(null),
      fetchAllHubSpotDeals(),
      supaQuery('call_logs', `select=rep,score_percentage,call_type,coaching_priority,pipeline_inflation,qualification_result,date&scored_at=gte.${daysAgo(7)}`),
      supaQuery('call_logs', `select=rep,score_percentage,call_type,date&scored_at=gte.${daysAgo(30)}`),
      supaQuery('deals_with_calls', 'select=*'),
      supaQuery('rep_performance', 'select=*'),
      supaQuery('call_logs', `select=rep,score_percentage,call_type,date,coaching_priority&scored_at=gte.${daysAgo(14)}`),
      loadTargetsFromSheet().then(st => st ? { ...DEFAULT_TARGETS, ...st } : loadTargets()),
      // Google Sheet — best available month tab
      findBestSheetTab().then(tab => readSheetTab(tab)).catch(() => null),
      // HeyReach LinkedIn from Airtable
      AIRTABLE_KEY ? airtableFetch('appisraRpUPDhzh6b', 'tblosAcipaVFp0zmo', { pageSize: '100' }).then(r => r.data).catch(() => null) : Promise.resolve(null),
      // Recent snapshots for weekly comparison
      supaQuery('ceo_dashboard_snapshots', 'select=snapshot_data,week_range,created_at&order=created_at.desc&limit=2').catch(() => ({ data: null })),
      // Onboarding task boards for progress + overdue
      MONDAY_KEY ? mondayQuery(`{ boards(ids: [${PROJECT_TASK_IDS.join(',')}]) { id name groups { id title } items_page(limit: 50) { items { id name group { id title } column_values(ids: ["status", "person", "timeline"]) { id type text value column { title } } } } } }`).then(r => {
        // Normalize + compute overdue
        const boards = r.data?.boards || []
        for (const board of boards) {
          for (const item of board.items_page?.items || []) {
            for (const cv of item.column_values || []) {
              cv.title = cv.column?.title || cv.id
              delete cv.column
            }
          }
        }
        return { boards, overdue: parseMondayOverdue(boards) }
      }).catch(() => null) : Promise.resolve(null),
      // Slack daily email reports — monthly totals (truth of source for emails/replies/interested)
      fetchEmailReportsParsed().catch(() => ({ emailsSent: 0, replies: 0, interested: 0, bounced: 0, replyRate: 0, bounceRate: 0, days: 0 })),
      // Rep daily check-in forms (Google Sheet) — for qualification rate
      fetchRepCheckins(45).catch(() => ({ checkins: [], byDate: [], byRep: {} })),
      // Weekly sales form (Google Sheet) — north star + per-closer data
      fetchWeeklySalesForm().catch(() => ({ rows: [], tabName: null })),
    ])

    // Build data freshness indicators
    const dataFreshness = {
      bison: bisonCampaigns.length > 0 ? 'live' : 'unavailable',
      googleSheet: googleSheetRes ? 'live' : 'unavailable',
      linkedin: linkedinRes?.records?.length > 0 ? 'live' : 'unavailable',
      hubspot: hubspotParsed?.results?.length > 0 ? 'live' : 'unavailable',
      supabase: callsWeekRes.data ? 'live' : 'unavailable',
      slack: meetingsParsed.dailyReports ? 'live' : 'unavailable',
    }

    res.json({
      bison: bisonCampaigns,
      inbox: inboxRes,
      meetings: meetingsParsed,
      senders: sendersRes,
      monday: mondayRes,
      hubspot: hubspotParsed,
      callsWeek: callsWeekRes.data,
      callsMonth: callsMonthRes.data,
      deals: dealsRes.data,
      reps: repsRes.data,
      allCalls: allCallsRes.data,
      targets: targetsData,
      googleSheet: googleSheetRes,
      linkedin: linkedinRes,
      snapshots: snapshotsRes.data,
      onboardingTasks: onboardingTasksRes,
      slackEmailTotals,
      repCheckins: repCheckinsRes,
      weeklySalesForm: weeklySalesFormRes,
      dataFreshness,
    })
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Phase 5.2: Data export ─────────────────────────────
app.get('/api/export/:type', async (req, res) => {
  try {
    let data = []
    let filename = 'export.csv'

    switch (req.params.type) {
      case 'calls': {
        const result = await supaQuery('call_logs', 'select=rep,call_type,prospect_company,date,score_percentage,grade,coaching_priority,qualification_result,pipeline_inflation,call_context,call_outcome&order=scored_at.desc&limit=5000')
        data = result.data || []
        filename = 'yanne_calls_export.csv'
        break
      }
      case 'deals': {
        const result = await supaQuery('deals_with_calls', 'select=prospect_company,rep_name,current_stage,deal_status,pipeline_inflation,call_1_score,call_1_grade,call_2_score,call_2_grade,call_3_score,call_3_grade,created_at,updated_at&order=updated_at.desc')
        data = result.data || []
        filename = 'yanne_deals_export.csv'
        break
      }
      case 'reps': {
        const result = await supaQuery('rep_performance', 'select=*&order=rep')
        data = result.data || []
        filename = 'yanne_reps_export.csv'
        break
      }
      default:
        return res.status(400).json({ error: 'Invalid export type. Use: calls, deals, reps' })
    }

    if (data.length === 0) return res.status(404).json({ error: 'No data to export' })

    const headers = Object.keys(data[0])
    const csvRows = [headers.join(',')]
    for (const row of data) {
      csvRows.push(headers.map(h => {
        const val = row[h]
        if (val === null || val === undefined) return ''
        const str = String(val)
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str
      }).join(','))
    }

    auditLog(req.user.id, 'export', req.params.type, { rows: data.length }, req.ip)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csvRows.join('\n'))
  } catch (err) {
    serverError(res, err)
  }
})

// ─── Investor Relations ─────────────────────────────────

app.get('/api/investors', async (req, res) => {
  try {
    const select = req.query.select || '*'
    const { data, error } = await supaQuery('investor_profiles', `select=${select}&order=investor_name`)
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    serverError(res, err)
  }
})

app.get('/api/investors/:name', async (req, res) => {
  try {
    const name = req.params.name
    const { data, error } = await supaQuery('investor_profiles', `investor_name=eq.${encodeURIComponent(name)}&select=*`)
    if (error) return res.status(500).json({ error })
    if (!data || data.length === 0) return res.status(404).json({ error: 'Investor not found' })
    res.json(data[0])
  } catch (err) {
    serverError(res, err)
  }
})

const PORT = process.env.API_PORT || 3001
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  app.listen(PORT, () => console.log(`API server on port ${PORT}`))
}
