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

const HUBSPOT_STAGE_MAP = {
  // Sales Pipeline (default)
  appointmentscheduled: 'Meeting Qualified',
  qualifiedtobuy: 'NDA',
  presentationscheduled: '1st Closing Call',
  decisionmakerboughtin: '2nd Closing Call',
  '1066193534': '3rd Call / Contract',
  closedwon: 'Closed Won',
  closedlost: 'Closed Lost',
  contractsent: 'Long Term Lead',
  '1066871403': 'Disqualified',
  // Master Project Tracker
  '1068620433': 'Appointment Scheduled',
  '1068620434': 'Qualified To Buy',
  '1068620435': 'Presentation Scheduled',
  '1068620436': 'Decision Maker Bought-In',
  '1068620437': 'Contract Sent',
  '1068620438': 'Closed Won',
  '1068620439': 'Closed Lost',
  // Master Fulfillment
  '1081726001': 'New Clients',
  '1081726002': 'In Onboarding',
  '1081726003': 'Live (Pre-Campaign)',
  '1081726004': 'Active Campaign',
  '1081726005': 'Campaign Complete',
}

app.get('/api/hubspot/deals', async (_req, res) => {
  if (!HUBSPOT_KEY) return res.status(503).json({ error: 'HubSpot not configured' })
  try {
    const { data, error } = await hubspotFetch('/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,closedate,pipeline,hubspot_owner_id,createdate,hs_lastmodifieddate')
    if (error) return res.status(500).json({ error })
    // Enrich with stage names
    const results = (data.results || []).map(d => ({
      ...d,
      properties: {
        ...d.properties,
        stageName: HUBSPOT_STAGE_MAP[d.properties?.dealstage] || d.properties?.dealstage || 'Unknown',
      },
    }))
    res.json({ ...data, results })
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
    const url = `https://docs.google.com/spreadsheets/d/${SETTER_SHEET}/gviz/tq?tqx=out:json`
    const r = await fetch(url)
    if (!r.ok) return res.status(500).json({ error: 'Failed to fetch setter sheet' })
    const text = await r.text()
    const jsonStr = text.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, '')
    const gviz = JSON.parse(jsonStr)
    const gRows = gviz.table?.rows || []

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const checkins = []

    for (const gr of gRows) {
      const cells = gr.c || []
      const name = cells[2]?.v || ''
      const dateVal = cells[3]?.v || ''
      const campaignReport = cells[4]?.v || ''
      const followupsRaw = cells[5]?.v
      const bookingsRaw = cells[6]?.v
      const notes = cells[7]?.v || ''

      // Parse date
      let date = null
      const gvizMatch = String(dateVal).match(/Date\((\d+),(\d+),(\d+)\)/)
      if (gvizMatch) {
        date = new Date(parseInt(gvizMatch[1]), parseInt(gvizMatch[2]), parseInt(gvizMatch[3]))
      } else if (typeof dateVal === 'string' && dateVal.includes('/')) {
        const parts = dateVal.split('/')
        if (parts.length === 3) date = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]))
      }
      if (!date || isNaN(date.getTime()) || date < cutoff) continue

      // Parse bookings (handle "Total Number of bookings: N" pattern)
      let bookings = 0
      if (typeof bookingsRaw === 'number') {
        bookings = bookingsRaw
      } else if (typeof bookingsRaw === 'string') {
        const numMatch = bookingsRaw.match(/(\d+)\s*$/) || bookingsRaw.match(/bookings:\s*(\d+)/i)
        if (numMatch) bookings = parseInt(numMatch[1])
        else bookings = parseInt(bookingsRaw) || 0
      }

      // Parse followups
      let followups = 0
      if (typeof followupsRaw === 'number') {
        followups = followupsRaw
      } else if (typeof followupsRaw === 'string') {
        followups = parseInt(followupsRaw) || 0
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
        notes: notes.slice(0, 200),
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
