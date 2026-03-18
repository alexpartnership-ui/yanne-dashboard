import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import crypto from 'crypto'

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

// ─── Phase 1.1: JWT Auth ───────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')
const JWT_EXPIRES = '24h'

// ─── Phase 1.8: Client API key encryption ──────────────
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')

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

// ─── Phase 2: User store ───────────────────────────────
const USERS_FILE = join(__dirname, 'users.json')

function loadUsers() {
  try {
    if (existsSync(USERS_FILE)) return JSON.parse(readFileSync(USERS_FILE, 'utf-8'))
  } catch { /* use defaults */ }
  // Default admin user
  const defaultHash = bcrypt.hashSync('REDACTED_PASSWORD', 10)
  const defaults = [
    { id: '1', email: 'alex@yannetr.net', name: 'Alex Ozdemir', role: 'admin', password_hash: defaultHash, created_at: new Date().toISOString() },
  ]
  writeFileSync(USERS_FILE, JSON.stringify(defaults, null, 2))
  return defaults
}

function saveUsers(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
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

// ─── JWT middleware ─────────────────────────────────────
function verifyToken(req, res, next) {
  // Check cookie first, then Authorization header
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Authentication required' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Role-based access
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

// Cookie parser (simple — just reads token cookie)
app.use((req, _res, next) => {
  req.cookies = {}
  const cookieHeader = req.headers.cookie
  if (cookieHeader) {
    for (const pair of cookieHeader.split(';')) {
      const [name, ...rest] = pair.trim().split('=')
      req.cookies[name] = rest.join('=')
    }
  }
  next()
})

// ─── Auth routes (no JWT required) ─────────────────────

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

  const users = loadUsers()
  const user = users.find(u => u.email === email)
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    auditLog(user?.id || 'unknown', 'login_failed', 'auth', { email }, req.ip)
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  )

  auditLog(user.id, 'login', 'auth', { email: user.email }, req.ip)

  res.setHeader('Set-Cookie', `token=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.NODE_ENV !== 'development' ? '; Secure' : ''}`)
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    token,
  })
})

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.token
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      auditLog(decoded.id, 'logout', 'auth', {}, req.ip)
    } catch { /* expired token, fine */ }
  }
  res.setHeader('Set-Cookie', `token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`)
  res.json({ ok: true })
})

app.get('/api/auth/me', verifyToken, (req, res) => {
  res.json({ user: req.user })
})

// ─── Phase 2.3: User management (admin only) ──────────

app.get('/api/users', verifyToken, requireRole('admin'), (_req, res) => {
  const users = loadUsers()
  res.json(users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, created_at: u.created_at })))
})

app.post('/api/users', verifyToken, requireRole('admin'), (req, res) => {
  const { email, name, role, password } = req.body
  if (!email || !name || !password) return res.status(400).json({ error: 'email, name, and password required' })
  if (!['admin', 'manager', 'rep', 'finance'].includes(role)) return res.status(400).json({ error: 'Invalid role' })

  const users = loadUsers()
  if (users.find(u => u.email === email)) return res.status(409).json({ error: 'User already exists' })

  const newUser = {
    id: Date.now().toString(),
    email,
    name,
    role,
    password_hash: bcrypt.hashSync(password, 10),
    created_at: new Date().toISOString(),
  }
  users.push(newUser)
  saveUsers(users)
  auditLog(req.user.id, 'create_user', 'users', { email, role }, req.ip)
  res.json({ id: newUser.id, email, name, role })
})

app.delete('/api/users/:id', verifyToken, requireRole('admin'), (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' })
  let users = loadUsers()
  const target = users.find(u => u.id === req.params.id)
  if (!target) return res.status(404).json({ error: 'User not found' })
  users = users.filter(u => u.id !== req.params.id)
  saveUsers(users)
  auditLog(req.user.id, 'delete_user', 'users', { email: target.email }, req.ip)
  res.json({ ok: true })
})

// ─── Phase 5.1: Audit log endpoint ─────────────────────

app.get('/api/audit-log', verifyToken, requireRole('admin'), (req, res) => {
  const logs = loadAuditLog()
  const limit = parseInt(req.query.limit) || 100
  res.json(logs.slice(-limit).reverse())
})

// Health + public routes (no auth)
app.get('/api/health', (_, res) => res.json({ ok: true }))

// ─── Protect all remaining /api/* routes ────────────────
app.use('/api/', verifyToken)

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const EMAILBISON_KEY = process.env.EMAILBISON_API_KEY
const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY
const MONDAY_KEY = process.env.MONDAY_API_KEY
const HUBSPOT_KEY = process.env.HUBSPOT_API_KEY
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN

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
      res.status(500).json({ error: err.message })
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

// ─── Phase 1.7: Supabase proxy routes ──────────────────

// Call logs with filters
app.get('/api/calls', async (req, res) => {
  try {
    const parts = ['select=*', 'order=scored_at.desc', 'limit=1000']
    if (req.query.rep) parts.push(`rep=eq.${req.query.rep}`)
    if (req.query.call_type) parts.push(`call_type=eq.${req.query.call_type}`)
    if (req.query.grade) parts.push(`grade=eq.${req.query.grade}`)
    if (req.query.scored_after) parts.push(`scored_at=gte.${req.query.scored_after}`)
    const { data, error } = await supaQuery('call_logs', parts.join('&'))
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Single call detail
app.get('/api/calls/:id', async (req, res) => {
  try {
    const { data, error } = await supaQuery('call_logs', `id=eq.${req.params.id}&limit=1`)
    if (error) return res.status(500).json({ error })
    if (!data || data.length === 0) return res.status(404).json({ error: 'Call not found' })
    res.json(data[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Deals
app.get('/api/deals', async (_req, res) => {
  try {
    const { data, error } = await supaQuery('deals_with_calls', 'select=*&order=updated_at.desc')
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Rep performance
app.get('/api/reps', async (_req, res) => {
  try {
    const { data, error } = await supaQuery('rep_performance', 'select=*&order=rep')
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Dashboard stats (aggregated — call logs + HubSpot)
app.get('/api/dashboard-stats', async (_req, res) => {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const floor = thirtyDaysAgo.toISOString()

    const [callsResult, hubspotRes] = await Promise.all([
      supaQuery('call_logs', `select=rep,date,score_percentage,grade,coaching_priority&scored_at=gte.${floor}&order=scored_at.desc`),
      HUBSPOT_KEY ? hubspotFetch('/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
    ])

    const calls = callsResult.data || []
    const hubspotDeals = hubspotRes?.data?.results || []
    const ACTIVE_STAGES = ['appointmentscheduled', 'qualifiedtobuy', 'presentationscheduled', 'decisionmakerboughtin', '1066193534', 'closedwon']
    const activeDeals = hubspotDeals.filter(d => ACTIVE_STAGES.includes(d.properties?.dealstage || '')).length

    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    for (const c of calls) {
      if (!c.grade) continue
      const letter = c.grade.charAt(0)
      if (letter in gradeDistribution) gradeDistribution[letter]++
    }

    const avgScore = calls.length ? Math.round(calls.reduce((s, c) => s + c.score_percentage, 0) / calls.length) : 0

    // Calls per day (last 14d)
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    const recentCalls = calls.filter(c => c.date && new Date(c.date) >= fourteenDaysAgo)
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

    res.json({ totalCalls: calls.length, avgScore, activeDeals, gradeDistribution, callsPerDay, coachingThemes, repQuickStats })
  } catch (err) {
    res.status(500).json({ error: err.message })
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
    res.status(500).json({ error: err.message })
  }
})

// Rep call history (sparklines)
app.get('/api/rep-call-history', async (_req, res) => {
  try {
    const { data, error } = await supaQuery('call_logs', 'select=rep,date,score_percentage,call_type&order=scored_at.desc&limit=200')
    if (error) return res.status(500).json({ error })
    const rows = data || []
    const grouped = {}
    for (const row of rows) {
      if (!grouped[row.rep]) grouped[row.rep] = []
      if (grouped[row.rep].length < 30) {
        grouped[row.rep].push({ date: row.date ?? '', score: row.score_percentage ?? 0, call_type: row.call_type ?? '' })
      }
    }
    for (const rep of Object.keys(grouped)) grouped[rep].reverse()
    res.json(grouped)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Deal staleness (call dates)
app.post('/api/deal-staleness', async (req, res) => {
  try {
    const { callIds } = req.body
    if (!callIds || !Array.isArray(callIds) || callIds.length === 0) return res.json([])
    const ids = callIds.slice(0, 100).map(id => `"${id}"`).join(',')
    const { data, error } = await supaQuery('call_logs', `select=id,date&id=in.(${ids})`)
    if (error) return res.status(500).json({ error })
    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── EmailBison API routes ──────────────────────────────

// Switch to Yanne Capital CA workspace on startup
const BISON_DEFAULT_WORKSPACE = 14 // "YANNE CAPITAL CA"
async function switchBisonWorkspace() {
  if (!EMAILBISON_KEY) return
  try {
    await fetch(`${BISON_BASE}/workspaces/switch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${EMAILBISON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: BISON_DEFAULT_WORKSPACE }),
    })
    console.log('EmailBison workspace set to YANNE CAPITAL CA')
  } catch (err) {
    console.warn('Failed to switch Bison workspace:', err.message)
  }
}
switchBisonWorkspace()

// Campaign analytics — paginate to get ALL campaigns
app.get('/api/bison/campaigns', async (_req, res) => {
  if (!EMAILBISON_KEY) return res.status(503).json({ error: 'EmailBison not configured' })
  try {
    const allCampaigns = []
    let page = 1
    let lastPage = 1
    while (page <= lastPage && page <= 30) {
      const { data, error } = await bisonFetch('/campaigns', { per_page: 50, page })
      if (error) return res.status(500).json({ error })
      const items = data?.data || (Array.isArray(data) ? data : [])
      if (items.length === 0) break
      allCampaigns.push(...items)
      // Update lastPage from meta
      if (data?.meta?.last_page) lastPage = data.meta.last_page
      page++
    }
    res.json(allCampaigns)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Campaign sequence steps
app.get('/api/bison/campaigns/:id/sequence', async (req, res) => {
  if (!EMAILBISON_KEY) return res.status(503).json({ error: 'EmailBison not configured' })
  try {
    const { data, error } = await bisonFetch(`/campaigns/v1.1/${req.params.id}/sequence-steps`)
    if (error) return res.status(500).json({ error })
    res.json(data?.data || data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Campaign stats for a specific campaign
app.get('/api/bison/campaigns/:id/stats', async (req, res) => {
  if (!EMAILBISON_KEY) return res.status(503).json({ error: 'EmailBison not configured' })
  try {
    const { data, error } = await bisonFetch(`/campaigns/${req.params.id}/statistics`)
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
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
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
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
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Sender accounts (for deliverability)
app.get('/api/bison/senders', async (_req, res) => {
  if (!EMAILBISON_KEY) return res.status(503).json({ error: 'EmailBison not configured' })
  try {
    const { data, error } = await bisonFetch('/sender-emails', { per_page: 100 })
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Airtable API routes ────────────────────────────────

// Inbox Manager — lead categories, setter performance
app.get('/api/airtable/inbox', async (req, res) => {
  if (!AIRTABLE_KEY) return res.status(503).json({ error: 'Airtable not configured' })
  try {
    const params = { pageSize: '100', view: req.query.view }
    if (req.query.formula) params.filterByFormula = req.query.formula
    if (req.query.sort) params['sort[0][field]'] = req.query.sort
    if (req.query.direction) params['sort[0][direction]'] = req.query.direction
    const { data, error } = await airtableFetch('appoCoN4yDrzKNRPe', 'tbl7Opo9spWMGMXKp', params)
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Deliverability — sender inboxes
app.get('/api/airtable/senders', async (req, res) => {
  if (!AIRTABLE_KEY) return res.status(503).json({ error: 'Airtable not configured' })
  try {
    const params = { pageSize: '100' }
    if (req.query.formula) params.filterByFormula = req.query.formula
    const { data, error } = await airtableFetch('app70IAsUKudzw5UI', 'tblIWs6XXXdBW4OdP', params)
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Meetings
app.get('/api/airtable/meetings', async (req, res) => {
  if (!AIRTABLE_KEY) return res.status(503).json({ error: 'Airtable not configured' })
  try {
    const params = { pageSize: '100' }
    if (req.query.formula) params.filterByFormula = req.query.formula
    params['sort[0][field]'] = 'Start Time'
    params['sort[0][direction]'] = 'desc'
    const { data, error } = await airtableFetch('appzvZe6ctSCK79zj', 'tblsRnOQbDiAa64nD', params)
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
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
    if (error) return res.status(500).json({ error })
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
    res.status(500).json({ error: err.message })
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
    res.status(500).json({ error: err.message })
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
            column_values { id title text value }
          }
        }
      }
    }`)
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Task boards for onboarding tracking
app.get('/api/monday/tasks/:boardId', async (req, res) => {
  if (!MONDAY_KEY) return res.status(503).json({ error: 'Monday.com not configured' })
  try {
    const { data, error } = await mondayQuery(`{
      boards(ids: [${req.params.boardId}]) {
        id name
        groups { id title }
        items_page(limit: 100) {
          items {
            id name group { id title }
            column_values { id title text value }
          }
        }
      }
    }`)
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
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
            column_values(ids: ["status", "person", "timeline", "numbers"]) { id title text value }
          }
        }
      }
    }`)
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
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
      const { data, error } = await hubspotFetch(`/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,closedate,pipeline,hubspot_owner_id,createdate,hs_lastmodifieddate,notes_last_updated,hs_lastactivity_date${pagination}`)
      if (error) return res.status(500).json({ error })
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
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/hubspot/pipeline', async (_req, res) => {
  if (!HUBSPOT_KEY) return res.status(503).json({ error: 'HubSpot not configured' })
  try {
    const { data, error } = await hubspotFetch('/crm/v3/pipelines/deals')
    if (error) return res.status(500).json({ error })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
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
    res.status(500).json({ error: err.message })
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
    res.status(500).json({ error: err.message })
  }
})

// ─── Google Sheets — Rep Daily Check-ins ────────────────

const REP_CHECKIN_SHEET = '1RQoRjAZIMFi6NenrdynzTPRnuDlZl2ynQJ6qRMCBOhA'
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY

app.get('/api/rep-checkins', async (req, res) => {
  // Fetch from Google Sheets API (public read via API key) or direct URL
  try {
    const days = parseInt(req.query.days) || 14
    // Fetch all rows — sheet is small enough
    const url = GOOGLE_API_KEY
      ? `https://sheets.googleapis.com/v4/spreadsheets/${REP_CHECKIN_SHEET}/values/A1:F500?key=${GOOGLE_API_KEY}`
      : `https://docs.google.com/spreadsheets/d/${REP_CHECKIN_SHEET}/gviz/tq?tqx=out:json`

    let rows = []

    if (GOOGLE_API_KEY) {
      const r = await fetch(url)
      if (!r.ok) return res.status(500).json({ error: 'Failed to fetch sheet' })
      const json = await r.json()
      rows = json.values || []
    } else {
      // Fallback: use gviz endpoint (works for sheets shared as "anyone with link")
      const r = await fetch(url)
      if (!r.ok) return res.status(500).json({ error: 'Failed to fetch sheet' })
      const text = await r.text()
      // gviz returns: google.visualization.Query.setResponse({...})
      const jsonStr = text.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, '')
      const gviz = JSON.parse(jsonStr)
      const gRows = gviz.table?.rows || []
      const gCols = gviz.table?.cols || []
      rows = [gCols.map(c => c.label || '')]
      for (const gr of gRows) {
        rows.push(gr.c.map(cell => cell?.v != null ? String(cell.v) : ''))
      }
    }

    if (rows.length < 2) return res.json({ checkins: [], byDate: [], byRep: {} })

    // Parse rows (skip header)
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

      // Parse date — handles both M/D/YYYY and Date(YYYY,M,D) from gviz
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

      // Filter out ex-reps
      if (rep === 'Lucas') continue

      const dateKey = date.toISOString().slice(0, 10)
      checkins.push({ rep, date: dateKey, scheduled, completed, progressed })
    }

    // Group by date
    const dateMap = {}
    for (const c of checkins) {
      if (!dateMap[c.date]) dateMap[c.date] = { date: c.date, totalScheduled: 0, totalCompleted: 0, reps: {} }
      dateMap[c.date].totalScheduled += c.scheduled
      dateMap[c.date].totalCompleted += c.completed
      dateMap[c.date].reps[c.rep] = c.completed
    }
    const byDate = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))

    // Group by rep
    const repMap = {}
    for (const c of checkins) {
      if (!repMap[c.rep]) repMap[c.rep] = { totalScheduled: 0, totalCompleted: 0, totalProgressed: 0, days: 0 }
      repMap[c.rep].totalScheduled += c.scheduled
      repMap[c.rep].totalCompleted += c.completed
      repMap[c.rep].totalProgressed += c.progressed
      repMap[c.rep].days++
    }

    res.json({ checkins, byDate, byRep: repMap })
  } catch (err) {
    res.status(500).json({ error: err.message })
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
    res.status(500).json({ error: err.message })
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
    const { data, error } = await slackFetch('conversations.history', {
      channel: MEETINGS_CHANNEL,
      limit: 200,
      oldest,
    })
    if (error) return res.status(500).json({ error })

    const messages = data.messages || []
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
    res.status(500).json({ error: err.message })
  }
})

// ─── CEO Scorecard Targets (persisted in file) ──────────

const TARGETS_FILE = join(__dirname, 'scorecard_targets.json')

const DEFAULT_TARGETS = {
  revenueTarget: 833000,
  emailsSentWeek: 350000,
  activeCampaigns: 30,
  replyRate: 0.8,
  bounceRate: 1.0,
  interestedWeek: 50,
  connectedSenders: 100,
  burntSenders: 10,
  unactionedReplies: 10,
  interestedToMeeting: 60,
  meetingsBookedWeek: 15,
  callsScoredWeek: 40,
  teamAvgScore: 70,
  c1toC2Rate: 35,
  c2toC3Rate: 50,
  qualificationRate: 15,
  proposalsSent: 5,
  closeRate: 15,
  stalledDeals: 5,
}

function loadTargets() {
  try {
    if (existsSync(TARGETS_FILE)) return JSON.parse(readFileSync(TARGETS_FILE, 'utf-8'))
  } catch { /* use defaults */ }
  return { ...DEFAULT_TARGETS }
}

app.get('/api/scorecard/targets', (_req, res) => {
  res.json(loadTargets())
})

app.post('/api/scorecard/targets', (req, res) => {
  const current = loadTargets()
  const updated = { ...current, ...req.body }
  writeFileSync(TARGETS_FILE, JSON.stringify(updated, null, 2))
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
    const { data, error } = await slackFetch('conversations.history', {
      channel: EMAILS_REPORT_CHANNEL,
      limit: 200,
      oldest,
    })
    if (error) return res.status(500).json({ error })

    const messages = data.messages || []
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
    res.status(500).json({ error: err.message })
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

  // If asking about a specific company name (not a rep), assume client
  if (intents.length === 0) {
    // Default: broad context
    intents.push('rep_calls', 'rep_performance', 'deals', 'campaigns', 'clients')
  }

  return { intents: [...new Set(intents)], mentionedReps, dateFilter }
}

async function gatherContext(question) {
  const { intents, mentionedReps, dateFilter } = detectIntent(question)
  const context = {}

  const repFilter = mentionedReps.length > 0
    ? `rep=in.(${mentionedReps.join(',')})`
    : ''

  const promises = []

  if (intents.includes('rep_performance')) {
    const params = repFilter
      ? `${repFilter}&order=rep`
      : 'order=rep'
    promises.push(
      supaQuery('rep_performance', params).then(r => { context.rep_performance = r.data })
    )
  }

  if (intents.includes('rep_calls')) {
    const parts = ['order=scored_at.desc', 'limit=50']
    if (repFilter) parts.push(repFilter)
    if (dateFilter) parts.push(dateFilter)
    promises.push(
      supaQuery('call_logs', `select=id,rep,call_type,prospect_company,date,score_percentage,grade,coaching_priority,biggest_miss,strengths_top3,gaps_top3,qualification_result,pipeline_inflation,next_step_flag,call_context,call_outcome,scored_at&${parts.join('&')}`).then(r => { context.recent_calls = r.data })
    )
  }

  if (intents.includes('deals')) {
    const params = repFilter
      ? `${repFilter.replace('rep=', 'rep_name=')}&order=updated_at.desc`
      : 'order=updated_at.desc'
    promises.push(
      supaQuery('deals_with_calls', params).then(r => { context.deals = r.data })
    )
  }

  if (intents.includes('flagged_calls')) {
    promises.push(
      supaQuery('call_logs', 'select=id,rep,prospect_company,date,score_percentage,grade,pipeline_inflation,next_step_flag,coaching_priority&or=(pipeline_inflation.eq.true,next_step_flag.neq.NONE)&order=scored_at.desc&limit=30').then(r => { context.flagged_calls = r.data })
    )
  }

  if (intents.includes('campaigns')) {
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

  if (intents.includes('clients')) {
    if (MONDAY_KEY) {
      promises.push(
        mondayQuery(`{ boards(ids: [${PROJECT_PORTFOLIO_IDS.join(',')}]) { id name items_page(limit: 5) { items { name column_values { title text } } } } }`)
          .then(r => {
            const boards = r.data?.boards || []
            context.clients = boards.map(b => {
              const item = b.items_page?.items?.[0]
              const cols = {}
              if (item) for (const cv of item.column_values || []) cols[cv.title] = cv.text
              return { name: b.name.replace('Project ', ''), health: cols['Project Health (RAG)'] || 'Unknown', stage: cols['Stage'] || 'Unknown' }
            })
          }).catch(() => {})
      )
    }
    // Also fetch onboarding data
    if (MONDAY_KEY) {
      promises.push(
        mondayQuery(`{ boards(ids: [${PROJECT_TASK_IDS.join(',')}]) { name items_page(limit: 50) { items { name group { title } column_values(ids: ["status"]) { text } } } } }`)
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

  if (intents.includes('setters')) {
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

  if (intents.includes('hubspot')) {
    if (HUBSPOT_KEY) {
      promises.push(
        hubspotFetch('/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,closedate,pipeline,createdate,hs_lastmodifieddate')
          .then(r => {
            const allDeals = r.data?.results || []
            const salesDeals = allDeals.filter(d => !d.properties?.pipeline || d.properties.pipeline === 'default')
            context.hubspot_deals = salesDeals.map(d => ({
              name: d.properties.dealname,
              stage: HUBSPOT_STAGE_MAP[d.properties.dealstage] || d.properties.dealstage,
              amount: d.properties.amount,
              closeDate: d.properties.closedate,
              lastModified: d.properties.hs_lastmodifieddate,
            }))
          }).catch(() => {})
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

    const context = await gatherContext(lastUserMsg.content)

    const contextStr = JSON.stringify(context, null, 2)
    const enrichedMessages = [
      ...messages.slice(0, -1),
      {
        role: 'user',
        content: `${lastUserMsg.content}\n\n<data>\n${contextStr}\n</data>`,
      },
    ]

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
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
      res.status(500).json({ error: err.message })
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    }
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
    res.status(500).json({ error: err.message })
  }
})

// ─── Phase 3.3: Batch scorecard endpoint ────────────────
app.get('/api/scorecard/data', async (_req, res) => {
  try {
    const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString() }

    const [
      bisonRes, inboxRes, meetingsRes, sendersRes,
      mondayRes, hubspotRes,
      callsWeekRes, callsMonthRes, dealsRes, repsRes, allCallsRes,
      targetsData,
    ] = await Promise.all([
      EMAILBISON_KEY ? fetch(`${BISON_BASE}/campaigns?per_page=50`, { headers: { Authorization: `Bearer ${EMAILBISON_KEY}` } }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
      AIRTABLE_KEY ? airtableFetch('appoCoN4yDrzKNRPe', 'tbl7Opo9spWMGMXKp', { pageSize: '100' }).then(r => r.data) : Promise.resolve(null),
      SLACK_TOKEN ? slackFetch('conversations.history', { channel: MEETINGS_CHANNEL, limit: 200, oldest: String(Math.floor(Date.now() / 1000) - 30 * 86400) }).then(r => r.data) : Promise.resolve(null),
      AIRTABLE_KEY ? airtableFetch('app70IAsUKudzw5UI', 'tblIWs6XXXdBW4OdP', { pageSize: '100' }).then(r => r.data) : Promise.resolve(null),
      MONDAY_KEY ? mondayQuery(`{ boards(ids: [${PROJECT_PORTFOLIO_IDS.join(',')}]) { id name items_page(limit: 5) { items { id name column_values { id title text value } } } } }`).then(r => r.data) : Promise.resolve(null),
      HUBSPOT_KEY ? hubspotFetch('/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,closedate,pipeline,createdate,hs_lastmodifieddate').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      supaQuery('call_logs', `select=rep,score_percentage,call_type,coaching_priority,pipeline_inflation,qualification_result,date&scored_at=gte.${daysAgo(7)}`),
      supaQuery('call_logs', `select=rep,score_percentage,call_type,date&scored_at=gte.${daysAgo(30)}`),
      supaQuery('deals_with_calls', 'select=*'),
      supaQuery('rep_performance', 'select=*'),
      supaQuery('call_logs', `select=rep,score_percentage,call_type,date,coaching_priority&scored_at=gte.${daysAgo(14)}`),
      Promise.resolve(loadTargets()),
    ])

    res.json({
      bison: bisonRes,
      inbox: inboxRes,
      meetings: meetingsRes,
      senders: sendersRes,
      monday: mondayRes,
      hubspot: hubspotRes?.data || hubspotRes,
      callsWeek: callsWeekRes.data,
      callsMonth: callsMonthRes.data,
      deals: dealsRes.data,
      reps: repsRes.data,
      allCalls: allCallsRes.data,
      targets: targetsData,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
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
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => console.log(`API server on port ${PORT}`))
