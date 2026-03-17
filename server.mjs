import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'

const app = express()
app.use(cors())
app.use(express.json())

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const EMAILBISON_KEY = process.env.EMAILBISON_API_KEY
const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY
const MONDAY_KEY = process.env.MONDAY_API_KEY
const HUBSPOT_KEY = process.env.HUBSPOT_API_KEY

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

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

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

// ─── EmailBison API routes ──────────────────────────────

// Campaign analytics (aggregated)
app.get('/api/bison/campaigns', async (_req, res) => {
  if (!EMAILBISON_KEY) return res.status(503).json({ error: 'EmailBison not configured' })
  try {
    const { data, error } = await bisonFetch('/campaigns', { per_page: 100 })
    if (error) return res.status(500).json({ error })
    res.json(data)
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

// All client project portfolio boards
const PROJECT_PORTFOLIO_IDS = [5090688381, 5090690637, 5090697102, 5090697393, 5090697433, 5090697490, 5090697501]
const PROJECT_TASK_IDS = [5090688377, 5090690633, 5090697103, 5090697391, 5090697431, 5090697473, 5090697495]

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

app.get('/api/hubspot/deals', async (_req, res) => {
  if (!HUBSPOT_KEY) return res.status(503).json({ error: 'HubSpot not configured' })
  try {
    const { data, error } = await hubspotFetch('/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,closedate,pipeline,hubspot_owner_id,createdate')
    if (error) return res.status(500).json({ error })
    res.json(data)
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

// ─── Copy Library ───────────────────────────────────────

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
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

  if (q.includes('deal') || q.includes('pipeline') || q.includes('stuck') || q.includes('stage') || q.includes('kanban')) {
    intents.push('deals')
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

  if (intents.length === 0) {
    intents.push('rep_calls', 'rep_performance', 'deals')
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

  await Promise.all(promises)
  return context
}

// ─── Chat endpoint ──────────────────────────────────────

const SYSTEM_PROMPT = `You are the Yanne Capital Sales Intelligence analyst. You have access to real-time scoring data from the sales team (4 closers: Jake, Stanley, Thomas, Tahawar).

Answer questions about rep performance, call quality, deal pipeline, and coaching priorities.

Rules:
- Be direct, use specific numbers, reference actual call scores
- When discussing coaching, quote the specific coaching directive from the scorecard
- Never make up data — only reference what's in the query results provided
- Format responses with markdown (bold, lists) for readability
- Keep answers concise but thorough — 3-8 sentences typical
- If data is empty or missing, say so honestly
- Grades: A+/A/A- (excellent), B+/B/B- (good), C+/C/C- (average), D+/D/D- (below average), F (failing)
- Scoring: 75%+ green, 55-74% yellow, <55% red
- Pipeline stages: Call 1 → Call 2 → Call 3 → Call 4/Close
- qualification_result: QUALIFIED, BORDERLINE, NOT_QUALIFIED
- pipeline_inflation: true = unqualified prospect advanced (judgment issue)
- next_step_flag: DEAD_END = qualified but rep didn't advance (skill gap)

When comparing reps, use a structured format. When discussing trends, reference the trend direction (Improving/Plateauing/Declining) from rep_performance data.`

app.post('/api/chat', async (req, res) => {
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

app.get('/api/health', (_, res) => res.json({ ok: true }))

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => console.log(`API server on port ${PORT}`))
