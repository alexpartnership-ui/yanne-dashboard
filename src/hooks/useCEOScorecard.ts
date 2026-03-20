import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from './useAuth'

// ─── Types ──────────────────────────────────────────────

interface FunnelStage {
  label: string
  value: number
  target: number
  conversionRate: number | null
  conversionTarget: number | null
}

interface ScorecardMetric {
  name: string
  owner: string
  target: string
  actual: string
  rawActual: number
  rawTarget: number
  status: 'green' | 'red' | 'yellow'
  trend: 'up' | 'down' | 'flat'
  inverted?: boolean
}

interface SetterRow {
  name: string
  assigned: number
  unactioned: number
  meetings: number
  conversionRate: number
}

interface RepRow {
  name: string
  calls: number
  avgScore: number
  dealsAdvanced: number
}

interface ClientRow {
  name: string
  status: string
  campaigns: number
}

interface OnboardingProgress {
  name: string
  completionRate: number
  totalTasks: number
  doneTasks: number
  overdueTasks: number
  groups: { title: string; total: number; done: number }[]
}

interface OverdueTask {
  taskName: string
  projectName: string
  group: string
  dueDate: string
  daysOverdue: number
  owner: string
}

interface Alert {
  level: 'critical' | 'warning' | 'win'
  message: string
  link?: string
}

interface Bottleneck {
  stage: string
  actual: number
  target: number
  owner: string
  impact: string
  rootCause: string
  action: string
}

interface WeeklyComparison {
  metric: string
  thisWeek: number | string
  lastWeek: number | string
  change: string
}

export interface SheetRow {
  rowIndex: number
  metric: string
  isSection: boolean
  isSubheader: boolean
  week1: string | number
  week2: string | number
  week3: string | number
  week4: string | number
  type: string
  monthlyActual: string | number
  monthlyTarget: string | number
  status: string
  owner: string
  source: string
  editable: boolean
}

export interface CEOScorecardData {
  revenueCollected: number
  revenueTarget: number
  retainers: number
  successFees: number
  outstanding: number
  monthlyTrend: { month: string; amount: number }[]
  funnel: FunnelStage[]
  outbound: ScorecardMetric[]
  linkedin: ScorecardMetric[]
  setters: ScorecardMetric[]
  setterBreakdown: SetterRow[]
  sales: ScorecardMetric[]
  repLeaderboard: RepRow[]
  topCoachingTheme: string
  worstCategory: string
  fulfillment: ScorecardMetric[]
  clientStatus: ClientRow[]
  finance: ScorecardMetric[]
  bottleneck: Bottleneck | null
  alerts: Alert[]
  weeklyComparison: WeeklyComparison[]
  weekRange: string
  lastRefreshed: string
  dataFreshness: Record<string, 'live' | 'stale' | 'unavailable'>
  sheetRows: SheetRow[]
  sheetTab: string
  onboardingProjects: OnboardingProgress[]
  overdueTasks: OverdueTask[]
}

// ─── Helpers ────────────────────────────────────────────

function getWeekRange(): string {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(monday)} – ${fmt(sunday)}, ${sunday.getFullYear()}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function metric(name: string, owner: string, target: string, actual: string, rawActual: number, rawTarget: number, inverted = false, prevActual?: number): ScorecardMetric {
  // Yellow band: >= 75% of target but below target
  const ratio = inverted
    ? (rawTarget / Math.max(rawActual, 0.01))
    : (rawActual / Math.max(rawTarget, 0.01))
  const status: 'green' | 'yellow' | 'red' = ratio >= 1 ? 'green' : ratio >= 0.75 ? 'yellow' : 'red'

  // Real trend: compare to previous value if available
  let trend: 'up' | 'down' | 'flat' = 'flat'
  if (prevActual !== undefined && prevActual !== 0) {
    const changePct = ((rawActual - prevActual) / Math.abs(prevActual)) * 100
    if (inverted) {
      trend = changePct <= -5 ? 'up' : changePct >= 5 ? 'down' : 'flat'
    } else {
      trend = changePct >= 5 ? 'up' : changePct <= -5 ? 'down' : 'flat'
    }
  }

  return { name, owner, target, actual, rawActual, rawTarget, status, trend, inverted }
}

// Parse Google Sheet rows into a lookup map
function parseSheetData(rows: unknown[][] | null): Map<string, { weekValues: (number | string)[], monthlyActual: number | string, monthlyTarget: number | string, status: string, owner: string, source: string }> {
  const map = new Map()
  if (!rows) return map
  for (let i = 3; i < rows.length; i++) { // Skip header rows (0-2)
    const row = rows[i] as (string | number)[]
    const name = row[0]
    if (!name || typeof name !== 'string') continue
    // Section headers (all caps, no data in other columns) — skip
    if (name === name.toUpperCase() && !row[1] && !row[7]) continue
    map.set(name, {
      weekValues: [row[1], row[2], row[3], row[4], row[5]].filter(v => v !== undefined && v !== ''),
      monthlyActual: row[7] ?? '',  // Column H
      monthlyTarget: row[8] ?? '',  // Column I
      status: String(row[9] ?? ''), // Column J
      owner: String(row[10] ?? ''), // Column K
      source: String(row[11] ?? ''), // Column L
    })
  }
  return map
}

// ─── Hook ───────────────────────────────────────────────

export function useCEOScorecard() {
  const [data, setData] = useState<CEOScorecardData | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/scorecard/data')
      if (!res.ok) throw new Error('Failed to fetch scorecard data')
      const raw = await res.json()

      // ── Parse sources ───
      const campaignList = Array.isArray(raw.bison) ? raw.bison : []
      const inboxRecords = raw.inbox?.records || []
      const slackMeetings = raw.meetings || { thisWeek: 0, dailyReports: [], todaySoFar: 0 }
      const senderRecords = raw.senders?.records || []
      const mondayBoards = raw.monday?.boards || []
      const hubspotDeals = raw.hubspot?.results || []
      // Onboarding task data
      const onboardingBoards = raw.onboardingTasks?.boards || []
      const rawOverdue: OverdueTask[] = (raw.onboardingTasks?.overdue || []).map((t: { taskName: string; projectName: string; group: string; dueDate: string; daysOverdue: number; owner: string }) => ({
        taskName: t.taskName, projectName: t.projectName, group: t.group,
        dueDate: t.dueDate, daysOverdue: t.daysOverdue, owner: t.owner,
      }))
      const weekCalls = raw.callsWeek || []
      const deals = (raw.deals || []) as Array<Record<string, unknown>>
      const reps = (raw.reps || []) as Array<Record<string, unknown>>
      const twoWeekCalls = raw.allCalls || []
      const sheetData = parseSheetData(raw.googleSheet)

      // Build sheetRows from raw Google Sheet data
      const NON_EDITABLE_SOURCES = ['Email Bison', 'Email Bison CA', 'HeyReach Airtable', 'HeyReach AT', 'HubSpot', 'Calculated', 'Inbox Manager Airtable', 'Setter Form + HeyReach']
      const rawSheetRows: unknown[][] = Array.isArray(raw.googleSheet) ? raw.googleSheet : []
      // Extract tab name from row 1 if available, fallback
      const extractedTabName: string = (rawSheetRows[0]?.[0] as string)?.includes('202')
        ? String(rawSheetRows[0][0]).trim()
        : (rawSheetRows[1]?.[0] as string)?.includes('202')
          ? String(rawSheetRows[1][0]).trim()
          : 'April 2026'
      const parsedSheetRows: SheetRow[] = []
      for (let i = 3; i < rawSheetRows.length; i++) {
        const row = rawSheetRows[i] as (string | number)[]
        const metricName = String(row[0] ?? '').trim()
        if (!metricName) continue
        const hasNoData = !row[1] && !row[2] && !row[3] && !row[4] && !row[7]
        const isSection = metricName === metricName.toUpperCase() && hasNoData && metricName.length > 2
        const isSubheader = typeof row[0] === 'string' && row[0].startsWith('    ')
        const source = String(row[12] ?? row[11] ?? '')
        const editable = !NON_EDITABLE_SOURCES.includes(source.trim())
        parsedSheetRows.push({
          rowIndex: i + 1, // 1-indexed for Google Sheets API
          metric: metricName,
          isSection,
          isSubheader,
          week1: row[1] ?? '',
          week2: row[2] ?? '',
          week3: row[3] ?? '',
          week4: row[4] ?? '',
          type: String(row[6] ?? ''),
          monthlyActual: row[7] ?? '',
          monthlyTarget: row[8] ?? '',
          status: String(row[9] ?? ''),
          owner: String(row[10] ?? ''),
          source,
          editable,
        })
      }

      const linkedinRecords = raw.linkedin?.records || []
      const lastSnapshot = raw.snapshots?.[0]?.snapshot_data || null
      const dataFreshness = raw.dataFreshness || {}

      // Date boundaries for filtering
      const now = new Date()
      const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

      // ── EmailBison aggregates ──────────────────────
      // Note: emails_sent is cumulative per campaign. We use Google Sheet monthly actual
      // when available, otherwise show the cumulative as-is (it resets with new campaigns monthly).
      let totalSentCumulative = 0, totalRepliesCumulative = 0, totalBounced = 0, activeCampaigns = 0
      let replyRateSum = 0, bounceRateSum = 0, rateCount = 0
      for (const c of campaignList) {
        if (c.status === 'active' || c.status === 'launching') activeCampaigns++
        const sent = Number(c.emails_sent) || 0
        const replied = Number(c.replied) || Number(c.unique_replies) || 0
        const bounced = Number(c.bounced) || 0
        totalSentCumulative += sent
        totalRepliesCumulative += replied
        totalBounced += bounced
        if (sent > 0) {
          replyRateSum += (replied / sent) * 100
          bounceRateSum += (bounced / sent) * 100
          rateCount++
        }
      }
      const avgReplyRate = rateCount > 0 ? replyRateSum / rateCount : 0
      const avgBounceRate = rateCount > 0 ? bounceRateSum / rateCount : 0
      // Use Google Sheet monthly actual for emails if available, otherwise use cumulative
      const sheetEmailsSent = sheetData.get('Emails Sent')
      const totalSent = sheetEmailsSent && Number(sheetEmailsSent.monthlyActual) > 0
        ? Number(sheetEmailsSent.monthlyActual)
        : totalSentCumulative
      const totalReplies = totalRepliesCumulative

      // ── Airtable Inbox aggregates ──────────────────
      const categoryCounts: Record<string, number> = {}
      const setterMap: Record<string, { assigned: number; unactioned: number; meetings: number; interested: number }> = {}
      let orphanedReplies = 0

      for (const r of inboxRecords) {
        const f = r.fields || {}
        const cat = (f['Lead Category'] as string) || ''
        if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
        const setter = f['Setter'] as string
        if (setter) {
          if (!setterMap[setter]) setterMap[setter] = { assigned: 0, unactioned: 0, meetings: 0, interested: 0 }
          setterMap[setter].assigned++
          if (f['Open Response'] === true) setterMap[setter].unactioned++
          if (cat === 'Meeting Booked') setterMap[setter].meetings++
          if (cat === 'Interested') setterMap[setter].interested++
        } else {
          if (f['Open Response'] === true) orphanedReplies++
        }
      }

      const totalInterested = categoryCounts['Interested'] || 0
      const totalMeetingsBooked = slackMeetings.thisWeek || 0
      const meetingsThisMonth = slackMeetings.thisMonth || slackMeetings.thisWeek || 0

      // ── Supabase call aggregates ───────────────────
      const weekCallCount = weekCalls.length
      const weekAvgScore = weekCallCount > 0 ? Math.round(weekCalls.reduce((s: number, c: { score_percentage: number }) => s + c.score_percentage, 0) / weekCallCount) : 0
      const inflationCount = weekCalls.filter((c: { pipeline_inflation: boolean }) => c.pipeline_inflation).length

      // Deals — signed filtered to this month
      const activeDeals = deals.filter(d => d.deal_status === 'active')
      const allSignedDeals = deals.filter(d => d.deal_status === 'signed')
      const signedDeals = allSignedDeals.filter(d => {
        const ca = d.created_at as string || d.updated_at as string || ''
        return ca >= firstOfMonth
      })
      const stalledDeals = activeDeals.filter(d => {
        const ua = d.updated_at as string
        if (!ua) return false
        return (Date.now() - new Date(ua).getTime()) / 86400000 >= 14
      })
      const proposalDeals = activeDeals.filter(d => d.current_stage === 'Call 3' || d.current_stage === 'Call 4')

      // Rep leaderboard — enhanced with deals advanced
      const repCallMap: Record<string, { calls: number; totalScore: number; dealsAdvanced: number }> = {}
      for (const c of weekCalls) {
        const rep = (c as { rep: string }).rep
        if (!repCallMap[rep]) repCallMap[rep] = { calls: 0, totalScore: 0, dealsAdvanced: 0 }
        repCallMap[rep].calls++
        repCallMap[rep].totalScore += (c as { score_percentage: number }).score_percentage
      }
      // Count deals advanced per rep
      for (const d of deals) {
        const rep = d.rep_name as string
        if (rep && repCallMap[rep]) {
          const stage = d.current_stage as string
          if (stage && stage !== 'Call 1') repCallMap[rep].dealsAdvanced++
        }
      }
      const repLeaderboard: RepRow[] = Object.entries(repCallMap)
        .map(([name, s]) => ({ name, calls: s.calls, avgScore: Math.round(s.totalScore / s.calls), dealsAdvanced: s.dealsAdvanced }))
        .sort((a, b) => b.avgScore - a.avgScore)

      // Coaching theme
      const coachingFreq: Record<string, number> = {}
      for (const c of weekCalls) {
        const cp = (c as { coaching_priority: string | null }).coaching_priority
        if (cp) {
          const key = cp.slice(0, 80)
          coachingFreq[key] = (coachingFreq[key] || 0) + 1
        }
      }
      const topCoachingTheme = Object.entries(coachingFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None this week'

      // Weakest category
      const catFreq: Record<string, number> = {}
      for (const r of reps) {
        const wc = r.weakest_category as string
        if (wc) catFreq[wc] = (catFreq[wc] || 0) + 1
      }
      const worstCategory = Object.entries(catFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'

      // Call progression rates
      const call1Deals = deals.filter(d => d.call_1_record_id)
      const call2Deals = deals.filter(d => d.call_2_record_id)
      const call3Deals = deals.filter(d => d.call_3_record_id)
      const c1to2Rate = call1Deals.length > 0 ? Math.round((call2Deals.length / call1Deals.length) * 100) : 0
      const c2to3Rate = call2Deals.length > 0 ? Math.round((call3Deals.length / call2Deals.length) * 100) : 0
      const closeRate = deals.length > 0 ? Math.round((signedDeals.length / deals.length) * 100) : 0

      // ── HubSpot revenue (this month only) ─────────
      let revenueCollected = 0
      let revenueAllTime = 0
      const wonDeals = hubspotDeals.filter((d: { properties: Record<string, string> }) => d.properties?.dealstage === 'closedwon')
      for (const d of wonDeals) {
        const amt = parseFloat((d as { properties: Record<string, string> }).properties.amount || '0')
        revenueAllTime += amt
        // Only count this month's revenue
        const closeDate = (d as { properties: Record<string, string> }).properties.closedate || ''
        if (closeDate >= firstOfMonth) {
          revenueCollected += amt
        }
      }

      // ── Google Sheet manual data ───────────────────
      // Finance from Sheet
      const sheetRetainers = Number(sheetData.get('Revenue')?.monthlyActual) || 0
      const sheetSuccessFees = Number(sheetData.get('Cash Collected')?.monthlyActual) || 0
      const sheetDistributable = Number(sheetData.get('Distributable Cash Balance')?.monthlyActual) || 0
      const sheetBurnRate = Number(sheetData.get('Monthly Burn Rate')?.monthlyActual) || 0
      const sheetHeadcount = 15 // default headcount
      const revenuePerEmployee = revenueCollected > 0 ? Math.round(revenueCollected / sheetHeadcount) : 0

      // ── LinkedIn/HeyReach aggregates ───────────────
      const liAgg = { messagesSent: 0, connectionsSent: 0, connectionsAccepted: 0, connectionAcceptanceRate: 0, messageReplyRate: 0, totalReplies: 0, meetingsBooked: 0 }
      for (const r of linkedinRecords) {
        const f = r.fields || {}
        liAgg.messagesSent += Number(f.messagesSent) || 0
        liAgg.connectionsSent += Number(f.connectionsSent) || 0
        liAgg.connectionsAccepted += Number(f.connectionsAccepted) || 0
        liAgg.totalReplies += Number(f.totalMessageReplies) || 0
        liAgg.meetingsBooked += Number(f['Meeting Booked']) || 0
        if (f.connectionAcceptanceRate) liAgg.connectionAcceptanceRate = Number(f.connectionAcceptanceRate) || 0
        if (f.messageReplyRate) liAgg.messageReplyRate = Number(f.messageReplyRate) || 0
      }

      // ── Previous snapshot values for trends ────────
      const prevOutbound = lastSnapshot?.outbound || []
      const prevSales = lastSnapshot?.sales || []
      function prevValue(arr: { name: string; rawActual: number }[], name: string): number | undefined {
        const m = arr.find((x: { name: string }) => x.name === name)
        return m?.rawActual
      }

      // ── Monday.com clients ─────────────────────────
      const clientStatus: ClientRow[] = mondayBoards.map((b: { name: string }) => ({
        name: b.name.replace('Project ', ''),
        status: 'Active',
        campaigns: 0,
      }))

      // ── Onboarding progress ────────────────────────
      const onboardingProjects: OnboardingProgress[] = onboardingBoards.map((b: {
        id: string; name: string;
        groups?: Array<{ id: string; title: string }>;
        items_page?: { items: Array<{ id: string; name: string; group: { title: string }; column_values: Array<{ id: string; text: string }> }> }
      }) => {
        const items = b.items_page?.items || []
        const totalTasks = items.length
        const doneTasks = items.filter(i => {
          const status = i.column_values?.find(cv => cv.id === 'status')?.text || ''
          return status === 'Done' || status === 'Completed'
        }).length
        const overdueTasks = rawOverdue.filter(t => t.projectName === b.name.replace('Project ', '')).length
        const groupMap: Record<string, { total: number; done: number }> = {}
        for (const g of b.groups || []) groupMap[g.title] = { total: 0, done: 0 }
        for (const item of items) {
          const grp = item.group?.title || ''
          if (groupMap[grp]) {
            groupMap[grp].total++
            const st = item.column_values?.find(cv => cv.id === 'status')?.text || ''
            if (st === 'Done' || st === 'Completed') groupMap[grp].done++
          }
        }
        return {
          name: b.name.replace('Project ', ''),
          completionRate: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
          totalTasks,
          doneTasks,
          overdueTasks,
          groups: Object.entries(groupMap).map(([title, s]) => ({ title, ...s })),
        }
      })

      // ── Senders ────────────────────────────────────
      const connectedSenders = senderRecords.length
      const burntSenders = senderRecords.filter((r: { fields: Record<string, unknown> }) => {
        const status = r.fields?.['Status'] as string
        return status && (status.toLowerCase().includes('paused') || status.toLowerCase().includes('disabled'))
      }).length

      // ── BUILD SCORECARD ────────────────────────────

      // Funnel
      const interestedToMeeting = totalInterested > 0 ? Math.round((totalMeetingsBooked / totalInterested) * 100) : 0
      const meetingToProposal = meetingsThisMonth > 0 ? Math.round((proposalDeals.length / meetingsThisMonth) * 100) : 0
      const proposalToSigned = proposalDeals.length > 0 ? Math.round((signedDeals.length / Math.max(proposalDeals.length, 1)) * 100) : 0

      const funnel: FunnelStage[] = [
        { label: 'Emails Sent', value: totalSent, target: 350000, conversionRate: rateCount > 0 ? Math.round(avgReplyRate * 100) / 100 : null, conversionTarget: 0.8 },
        { label: 'Replies', value: totalReplies, target: 2800, conversionRate: totalReplies > 0 ? Math.round((totalInterested / totalReplies) * 100) : null, conversionTarget: 35 },
        { label: 'Interested', value: totalInterested, target: 980, conversionRate: interestedToMeeting, conversionTarget: 60 },
        { label: 'Meetings', value: meetingsThisMonth, target: 588, conversionRate: meetingToProposal, conversionTarget: 30 },
        { label: 'Proposals', value: proposalDeals.length, target: 176, conversionRate: proposalToSigned, conversionTarget: 25 },
        { label: 'Signed', value: signedDeals.length, target: 44, conversionRate: null, conversionTarget: null },
        { label: 'Cash', value: revenueCollected, target: 833000, conversionRate: null, conversionTarget: null },
      ]

      const outbound: ScorecardMetric[] = [
        metric('Emails Sent / Week', 'Outreachify', '350K', `${(totalSent / 1000).toFixed(0)}K`, totalSent, 350000, false, prevValue(prevOutbound, 'Emails Sent / Week')),
        metric('Active Campaigns', 'Outreachify', '30+', String(activeCampaigns), activeCampaigns, 30, false, prevValue(prevOutbound, 'Active Campaigns')),
        metric('Reply Rate', 'Outreachify', '0.8%', `${avgReplyRate.toFixed(2)}%`, avgReplyRate, 0.8, false, prevValue(prevOutbound, 'Reply Rate')),
        metric('Bounce Rate', 'Outreachify', '<1.0%', `${avgBounceRate.toFixed(2)}%`, avgBounceRate, 1.0, true, prevValue(prevOutbound, 'Bounce Rate')),
        metric('Interested / Week', 'Outreachify', '50', String(totalInterested), totalInterested, 50, false, prevValue(prevOutbound, 'Interested / Week')),
        metric('Connected Senders', 'Outreachify', '100+', String(connectedSenders), connectedSenders, 100, false, prevValue(prevOutbound, 'Connected Senders')),
        metric('Burnt Senders', 'Outreachify', '<10', String(burntSenders), burntSenders, 10, true, prevValue(prevOutbound, 'Burnt Senders')),
      ]

      // LinkedIn outbound section
      const linkedin: ScorecardMetric[] = [
        metric('Messages Sent', 'Outreachify', '500', String(liAgg.messagesSent), liAgg.messagesSent, 500),
        metric('Message Reply Rate', 'Outreachify', '10%', `${liAgg.messageReplyRate.toFixed(1)}%`, liAgg.messageReplyRate, 10),
        metric('Connections Sent', 'Outreachify', '1000', String(liAgg.connectionsSent), liAgg.connectionsSent, 1000),
        metric('Connection Accept Rate', 'Outreachify', '25%', `${liAgg.connectionAcceptanceRate.toFixed(1)}%`, liAgg.connectionAcceptanceRate, 25),
        metric('LinkedIn Meetings Booked', 'Outreachify', '5', String(liAgg.meetingsBooked), liAgg.meetingsBooked, 5),
      ]

      const setters: ScorecardMetric[] = [
        metric('Interested → Meeting %', 'Alex', '60%', `${interestedToMeeting}%`, interestedToMeeting, 60),
        metric('Meetings Booked / Week', 'Alex', '15', String(totalMeetingsBooked), totalMeetingsBooked, 15),
      ]

      const setterBreakdown: SetterRow[] = Object.entries(setterMap)
        .map(([name, s]) => ({
          name,
          assigned: s.assigned,
          unactioned: s.unactioned,
          meetings: s.meetings,
          conversionRate: s.interested > 0 ? Math.round((s.meetings / s.interested) * 100) : 0,
        }))
        .sort((a, b) => b.meetings - a.meetings)

      // Qualification Rate = calls progressed to Call 2+ / total Call 1 deals (from Closer Form / deal data)
      // Use Google Sheet value if available, otherwise use deal progression
      const sheetQualRate = sheetData.get('Qualification Rate (Call 1 → Call 2)')
      const qualRate = sheetQualRate && Number(sheetQualRate.monthlyActual) > 0
        ? Math.round(Number(sheetQualRate.monthlyActual) * 100)
        : c1to2Rate

      const sales: ScorecardMetric[] = [
        metric('Calls Scored / Week', 'VACANT', '40', String(weekCallCount), weekCallCount, 40, false, prevValue(prevSales, 'Calls Scored / Week')),
        metric('Team Avg Score', 'VACANT', '70%', `${weekAvgScore}%`, weekAvgScore, 70, false, prevValue(prevSales, 'Team Avg Score')),
        metric('Qualification Rate', 'VACANT', '30%', `${qualRate}%`, qualRate, 30, false, prevValue(prevSales, 'Qualification Rate')),
        metric('Call 1 → Call 2 Rate', 'VACANT', '35%', `${c1to2Rate}%`, c1to2Rate, 35, false, prevValue(prevSales, 'Call 1 → Call 2 Rate')),
        metric('Call 2 → Call 3 Rate', 'VACANT', '50%', `${c2to3Rate}%`, c2to3Rate, 50, false, prevValue(prevSales, 'Call 2 → Call 3 Rate')),
        metric('Proposals Sent', 'VACANT', '5', String(proposalDeals.length), proposalDeals.length, 5),
        metric('Close Rate', 'VACANT', '15%', `${closeRate}%`, closeRate, 15),
        metric('Stalled Deals (14d+)', 'VACANT', '<5', String(stalledDeals.length), stalledDeals.length, 5, true),
        metric('Pipeline Inflation', 'VACANT', '0', String(inflationCount), inflationCount, 0, true),
      ]

      // Fulfillment — enhanced with Sheet data
      const sheetMeetingsPerClient = sheetData.get('Meetings/Client/Week') || sheetData.get('Meetings Per Client Per Week')
      const sheetTestimonials = sheetData.get('Testimonials')
      const sheetDealMovement = sheetData.get('Deal Stage Movement') || sheetData.get('Deal Movement')

      const fulfillment: ScorecardMetric[] = [
        metric('Active Clients', 'Philip / Mukul', '10+', String(clientStatus.length), clientStatus.length, 10),
        ...(sheetMeetingsPerClient ? [metric('Meetings / Client / Week', 'Philip / Mukul', String(sheetMeetingsPerClient.monthlyTarget || '3'), String(sheetMeetingsPerClient.monthlyActual || '0'), Number(sheetMeetingsPerClient.monthlyActual) || 0, Number(sheetMeetingsPerClient.monthlyTarget) || 3)] : []),
        ...(sheetTestimonials ? [metric('Testimonials', 'Philip / Mukul', String(sheetTestimonials.monthlyTarget || '2'), String(sheetTestimonials.monthlyActual || '0'), Number(sheetTestimonials.monthlyActual) || 0, Number(sheetTestimonials.monthlyTarget) || 2)] : []),
        ...(sheetDealMovement ? [metric('Deal Stage Movement', 'Philip / Mukul', String(sheetDealMovement.monthlyTarget || '5'), String(sheetDealMovement.monthlyActual || '0'), Number(sheetDealMovement.monthlyActual) || 0, Number(sheetDealMovement.monthlyTarget) || 5)] : []),
      ]

      const finance: ScorecardMetric[] = [
        metric('Cash Collected MTD', 'Alex', '$833K', `$${(revenueCollected / 1000).toFixed(0)}K`, revenueCollected, 833000),
        metric('Revenue Per Employee', 'Alex', '$55K/mo', `$${(revenuePerEmployee / 1000).toFixed(0)}K`, revenuePerEmployee, 55000),
        ...(sheetDistributable ? [metric('Distributable Cash', 'Alex', '$200K', `$${(sheetDistributable / 1000).toFixed(0)}K`, sheetDistributable, 200000)] : []),
        ...(sheetBurnRate ? [metric('Monthly Burn Rate', 'Alex', '<$50K', `$${(sheetBurnRate / 1000).toFixed(0)}K`, sheetBurnRate, 50000, true)] : []),
      ]

      // ── Bottleneck ─────────────────────────────────
      const funnelGaps = funnel.slice(0, -1).map((stage, i) => {
        if (stage.conversionRate === null || stage.conversionTarget === null) return null
        const gap = stage.conversionTarget - stage.conversionRate
        if (gap <= 0) return null
        return { stage: `${stage.label} → ${funnel[i + 1].label}`, gap, actual: stage.conversionRate, target: stage.conversionTarget }
      }).filter(Boolean) as { stage: string; gap: number; actual: number; target: number }[]

      const worstGap = funnelGaps.sort((a, b) => b.gap - a.gap)[0]
      const bottleneck: Bottleneck | null = worstGap ? {
        stage: worstGap.stage,
        actual: worstGap.actual,
        target: worstGap.target,
        owner: worstGap.stage.includes('Interested') ? 'Alex (Setters)' : worstGap.stage.includes('Email') ? 'Outreachify' : 'Sales Team',
        impact: `~${Math.round(worstGap.gap * 0.5)}% revenue upside if fixed`,
        rootCause: worstGap.stage.includes('Interested') ? 'Setter response time or follow-up quality' : 'Conversion below target',
        action: worstGap.stage.includes('Interested') ? 'Promote lead setter to own the queue' : 'Review and optimize this stage',
      } : null

      // ── Alerts ─────────────────────────────────────
      const alerts: Alert[] = []
      alerts.push({ level: 'critical', message: 'Sales Manager role VACANT — no one enforcing coaching directives' })
      if (inflationCount > 5) alerts.push({ level: 'critical', message: `${inflationCount} deals flagged for pipeline inflation`, link: '/deals' })
      if (avgReplyRate < 0.8) alerts.push({ level: 'warning', message: `Reply rate ${avgReplyRate.toFixed(2)}% (target 0.8%)`, link: '/outbound/email' })
      if (weekAvgScore < 70) alerts.push({ level: 'warning', message: `Team avg call score ${weekAvgScore}% (target 70%)`, link: '/reps' })
      if (stalledDeals.length > 3) alerts.push({ level: 'warning', message: `${stalledDeals.length} deals stalled 14+ days`, link: '/deals' })
      // Onboarding overdue alerts
      if (rawOverdue.length > 0) alerts.push({ level: rawOverdue.length > 5 ? 'critical' : 'warning', message: `${rawOverdue.length} onboarding tasks overdue across ${new Set(rawOverdue.map(t => t.projectName)).size} projects`, link: '/onboarding' })
      // LinkedIn alerts
      if (liAgg.messageReplyRate > 0 && liAgg.messageReplyRate < 5) alerts.push({ level: 'warning', message: `LinkedIn reply rate ${liAgg.messageReplyRate.toFixed(1)}% (below 5%)` })
      // Google Sheet manual red overrides
      for (const [metricName, sheetRow] of sheetData.entries()) {
        if (sheetRow.status.toLowerCase() === 'red' && sheetRow.source === 'Manual') {
          alerts.push({ level: 'warning', message: `${metricName} manually flagged RED by ${sheetRow.owner}` })
        }
      }
      // Wins
      if (weekCallCount > 30) alerts.push({ level: 'win', message: `${weekCallCount} calls scored this week` })
      for (const r of repLeaderboard) {
        if (r.avgScore >= 70) { alerts.push({ level: 'win', message: `${r.name} averaging ${r.avgScore}% this week` }); break }
      }
      if (liAgg.meetingsBooked > 0) alerts.push({ level: 'win', message: `${liAgg.meetingsBooked} meetings booked from LinkedIn` })

      // ── Weekly comparison ──────────────────────────
      const thisWeekCalls = twoWeekCalls.filter((c: { date: string }) => c.date && new Date(c.date) >= new Date(daysAgo(7)))
      const lastWeekCalls = twoWeekCalls.filter((c: { date: string }) => {
        if (!c.date) return false
        const d = new Date(c.date)
        return d >= new Date(daysAgo(14)) && d < new Date(daysAgo(7))
      })
      const twAvg = thisWeekCalls.length > 0 ? Math.round(thisWeekCalls.reduce((s: number, c: { score_percentage: number }) => s + c.score_percentage, 0) / thisWeekCalls.length) : 0
      const lwAvg = lastWeekCalls.length > 0 ? Math.round(lastWeekCalls.reduce((s: number, c: { score_percentage: number }) => s + c.score_percentage, 0) / lastWeekCalls.length) : 0
      function pctChange(a: number, b: number): string {
        if (b === 0) return a > 0 ? '+100%' : '—'
        const c = Math.round(((a - b) / b) * 100)
        return c >= 0 ? `+${c}%` : `${c}%`
      }

      // Use snapshot for last week comparison when available
      const prevMeetings = lastSnapshot?.funnel?.find((f: { label: string }) => f.label === 'Meetings')?.value
      const prevInterested = lastSnapshot?.outbound?.find((m: { name: string }) => m.name === 'Interested / Week')?.rawActual

      const weeklyComparison: WeeklyComparison[] = [
        { metric: 'Calls Scored', thisWeek: thisWeekCalls.length, lastWeek: lastWeekCalls.length, change: pctChange(thisWeekCalls.length, lastWeekCalls.length) },
        { metric: 'Team Avg Score', thisWeek: `${twAvg}%`, lastWeek: `${lwAvg}%`, change: `${twAvg - lwAvg >= 0 ? '+' : ''}${twAvg - lwAvg}pts` },
        { metric: 'Meetings Booked', thisWeek: totalMeetingsBooked, lastWeek: prevMeetings ?? '—', change: prevMeetings != null ? pctChange(totalMeetingsBooked, prevMeetings) : '—' },
        { metric: 'Interested Replies', thisWeek: totalInterested, lastWeek: prevInterested ?? '—', change: prevInterested != null ? pctChange(totalInterested, prevInterested) : '—' },
        { metric: 'LinkedIn Messages', thisWeek: liAgg.messagesSent, lastWeek: '—', change: '—' },
      ]

      setData({
        revenueCollected,
        revenueTarget: 833000,
        retainers: sheetRetainers || 0,
        successFees: sheetSuccessFees || 0,
        outstanding: 0,
        monthlyTrend: [],
        funnel,
        outbound,
        linkedin,
        setters,
        setterBreakdown,
        sales,
        repLeaderboard,
        topCoachingTheme,
        worstCategory,
        fulfillment,
        clientStatus,
        finance,
        bottleneck,
        alerts,
        weeklyComparison,
        weekRange: getWeekRange(),
        lastRefreshed: new Date().toLocaleTimeString(),
        dataFreshness,
        sheetRows: parsedSheetRows,
        sheetTab: extractedTabName,
        onboardingProjects,
        overdueTasks: rawOverdue,
      })
    } catch (err) {
      console.error('Scorecard fetch error:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const interval = setInterval(refresh, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [refresh])

  return { data, loading, refresh }
}
