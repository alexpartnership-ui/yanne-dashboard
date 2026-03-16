import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'

const app = express()
app.use(cors())
app.use(express.json())

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY')
  process.exit(1)
}

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

// ─── Intent detection + query routing ───────────────────

const REPS = ['Jake', 'Stanley', 'Thomas', 'Tahawar']

function detectIntent(question) {
  const q = question.toLowerCase()
  const intents = []

  // Detect rep names
  const mentionedReps = REPS.filter(r => q.includes(r.toLowerCase()))

  // Date ranges
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

  // Rep-specific questions
  if (mentionedReps.length > 0 || q.includes('rep') || q.includes('who') || q.includes('compare')) {
    intents.push('rep_performance')
    intents.push('rep_calls')
  }

  // Deal questions
  if (q.includes('deal') || q.includes('pipeline') || q.includes('stuck') || q.includes('stage') || q.includes('kanban')) {
    intents.push('deals')
  }

  // Grade/score questions
  if (q.match(/\b[abcdf]\b/i) || q.includes('grade') || q.includes('score') || q.includes('fail') || q.includes('best') || q.includes('worst')) {
    intents.push('rep_calls')
  }

  // Coaching questions
  if (q.includes('coaching') || q.includes('weakness') || q.includes('improve') || q.includes('pattern') || q.includes('issue') || q.includes('common')) {
    intents.push('rep_calls')
    intents.push('rep_performance')
  }

  // Flag questions
  if (q.includes('flag') || q.includes('inflation') || q.includes('dead end')) {
    intents.push('flagged_calls')
  }

  // Summary / general
  if (q.includes('summary') || q.includes('overview') || q.includes('how did') || q.includes('today')) {
    intents.push('rep_calls')
    intents.push('rep_performance')
  }

  // Default: pull everything relevant
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

    // Gather relevant data
    const context = await gatherContext(lastUserMsg.content)

    // Build messages with context injected
    const contextStr = JSON.stringify(context, null, 2)
    const enrichedMessages = [
      ...messages.slice(0, -1),
      {
        role: 'user',
        content: `${lastUserMsg.content}\n\n<data>\n${contextStr}\n</data>`,
      },
    ]

    // Stream response
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
