import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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
  inverted?: boolean // lower is better (bounce, stalled, etc)
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

export interface CEOScorecardData {
  // North star
  revenueCollected: number
  revenueTarget: number
  retainers: number
  successFees: number
  outstanding: number
  monthlyTrend: { month: string; amount: number }[]

  // Funnel
  funnel: FunnelStage[]

  // Department cards
  outbound: ScorecardMetric[]
  setters: ScorecardMetric[]
  setterBreakdown: SetterRow[]
  sales: ScorecardMetric[]
  repLeaderboard: RepRow[]
  topCoachingTheme: string
  worstCategory: string
  fulfillment: ScorecardMetric[]
  clientStatus: ClientRow[]
  finance: ScorecardMetric[]

  // Bottom
  bottleneck: Bottleneck | null
  alerts: Alert[]
  weeklyComparison: WeeklyComparison[]

  // Meta
  weekRange: string
  lastRefreshed: string
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

function metric(name: string, owner: string, target: string, actual: string, rawActual: number, rawTarget: number, inverted = false): ScorecardMetric {
  const met = inverted ? rawActual <= rawTarget : rawActual >= rawTarget
  return {
    name, owner, target, actual, rawActual, rawTarget,
    status: met ? 'green' : 'red',
    trend: 'flat', // Will be overridden when we have snapshot history
    inverted,
  }
}

// ─── Hook ───────────────────────────────────────────────

export function useCEOScorecard() {
  const [data, setData] = useState<CEOScorecardData | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      // Parallel fetch ALL data sources
      const [
        bisonRes, inboxRes, meetingsRes, sendersRes,
        mondayRes, hubspotRes,
        callsWeekRes, callsMonthRes, dealsRes, repsRes, allCallsRes,
      ] = await Promise.all([
        fetch('/api/bison/campaigns').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/airtable/inbox').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/slack/meetings-booked?days=30').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/airtable/senders').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/monday/projects').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/hubspot/deals').then(r => r.ok ? r.json() : null).catch(() => null),
        supabase.from('call_logs').select('rep, score_percentage, call_type, coaching_priority, pipeline_inflation, qualification_result, date').gte('scored_at', daysAgo(7)),
        supabase.from('call_logs').select('rep, score_percentage, call_type, date').gte('scored_at', daysAgo(30)),
        supabase.from('deals_with_calls').select('*'),
        supabase.from('rep_performance').select('*'),
        supabase.from('call_logs').select('rep, score_percentage, call_type, date, coaching_priority').gte('scored_at', daysAgo(14)),
      ])

      // ── Parse sources ──────────────────────────────
      const campaigns = bisonRes?.data || bisonRes?.campaigns || bisonRes || []
      const campaignList = Array.isArray(campaigns) ? campaigns : []
      const inboxRecords = inboxRes?.records || []
      const slackMeetings = meetingsRes || { thisWeek: 0, dailyReports: [], todaySoFar: 0 }
      const senderRecords = sendersRes?.records || []
      const mondayBoards = mondayRes?.boards || []
      const hubspotDeals = hubspotRes?.results || []
      const weekCalls = callsWeekRes.data || []
      void callsMonthRes // reserved for monthly trends
      const deals = (dealsRes.data || []) as Array<Record<string, unknown>>
      const reps = (repsRes.data || []) as Array<Record<string, unknown>>
      const twoWeekCalls = allCallsRes.data || []

      // ── EmailBison aggregates ──────────────────────
      let totalSent = 0, totalReplies = 0, totalBounced = 0, activeCampaigns = 0
      let openRateSum = 0, replyRateSum = 0, bounceRateSum = 0, rateCount = 0
      for (const c of campaignList) {
        if (c.status === 'active' || c.status === 'launching') activeCampaigns++
        const sent = Number(c.emails_sent) || 0
        const replied = Number(c.replied) || Number(c.unique_replies) || 0
        const bounced = Number(c.bounced) || 0
        totalSent += sent
        totalReplies += replied
        totalBounced += bounced
        if (sent > 0) {
          replyRateSum += (replied / sent) * 100
          bounceRateSum += (bounced / sent) * 100
          rateCount++
        }
      }
      void openRateSum
      const avgReplyRate = rateCount > 0 ? replyRateSum / rateCount : 0
      const avgBounceRate = rateCount > 0 ? bounceRateSum / rateCount : 0

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
      const totalMeetingsBooked = (slackMeetings.thisWeek || 0) + (slackMeetings.todaySoFar || 0)
      const totalUnactioned = Object.values(setterMap).reduce((s, v) => s + v.unactioned, 0)
      const meetingsThisMonth = (slackMeetings.dailyReports || []).reduce((s: number, r: { count: number }) => s + r.count, 0) + (slackMeetings.todaySoFar || 0)

      // ── Supabase call aggregates ───────────────────
      const weekCallCount = weekCalls.length
      const weekAvgScore = weekCallCount > 0 ? Math.round(weekCalls.reduce((s: number, c: { score_percentage: number }) => s + c.score_percentage, 0) / weekCallCount) : 0
      const weekCall1s = weekCalls.filter((c: { call_type: string }) => c.call_type === 'Call 1')
      const qualifiedCount = weekCall1s.filter((c: { qualification_result: string }) => c.qualification_result === 'QUALIFIED').length
      const qualRate = weekCall1s.length > 0 ? Math.round((qualifiedCount / weekCall1s.length) * 100) : 0
      const inflationCount = weekCalls.filter((c: { pipeline_inflation: boolean }) => c.pipeline_inflation).length

      // Deals
      const activeDeals = deals.filter(d => d.deal_status === 'active')
      const signedDeals = deals.filter(d => d.deal_status === 'signed')
      const stalledDeals = activeDeals.filter(d => {
        const ua = d.updated_at as string
        if (!ua) return false
        return (Date.now() - new Date(ua).getTime()) / 86400000 >= 14
      })
      const proposalDeals = activeDeals.filter(d => d.current_stage === 'Call 3' || d.current_stage === 'Call 4')

      // Rep leaderboard
      const repCallMap: Record<string, { calls: number; totalScore: number; dealsAdvanced: number }> = {}
      for (const c of weekCalls) {
        const rep = (c as { rep: string }).rep
        if (!repCallMap[rep]) repCallMap[rep] = { calls: 0, totalScore: 0, dealsAdvanced: 0 }
        repCallMap[rep].calls++
        repCallMap[rep].totalScore += (c as { score_percentage: number }).score_percentage
      }
      const repLeaderboard: RepRow[] = Object.entries(repCallMap)
        .map(([name, s]) => ({ name, calls: s.calls, avgScore: Math.round(s.totalScore / s.calls), dealsAdvanced: 0 }))
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

      // Weakest category from rep_performance
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

      // ── HubSpot revenue ────────────────────────────
      let revenueCollected = 0
      const wonDeals = hubspotDeals.filter((d: { properties: Record<string, string> }) => d.properties?.dealstage === 'closedwon')
      for (const d of wonDeals) {
        revenueCollected += parseFloat((d as { properties: Record<string, string> }).properties.amount || '0')
      }

      // ── Monday.com clients ─────────────────────────
      const clientStatus: ClientRow[] = mondayBoards.map((b: { name: string; items_page?: { items: Array<{ column_values: Array<{ text: string }> }> } }) => ({
        name: b.name.replace('Project ', ''),
        status: 'Active',
        campaigns: 0,
      }))

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

      // Outbound metrics
      const outbound: ScorecardMetric[] = [
        metric('Emails Sent / Week', 'Outreachify', '350K', `${(totalSent / 1000).toFixed(0)}K`, totalSent, 350000),
        metric('Active Campaigns', 'Outreachify', '30+', String(activeCampaigns), activeCampaigns, 30),
        metric('Reply Rate', 'Outreachify', '0.8%', `${avgReplyRate.toFixed(2)}%`, avgReplyRate, 0.8),
        metric('Bounce Rate', 'Outreachify', '<1.0%', `${avgBounceRate.toFixed(2)}%`, avgBounceRate, 1.0, true),
        metric('Interested / Week', 'Outreachify', '50', String(totalInterested), totalInterested, 50),
        metric('Connected Senders', 'Outreachify', '100+', String(connectedSenders), connectedSenders, 100),
        metric('Burnt Senders', 'Outreachify', '<10', String(burntSenders), burntSenders, 10, true),
      ]

      // Setter metrics
      const setters: ScorecardMetric[] = [
        metric('Unactioned Replies', 'Alex', '<10', String(totalUnactioned), totalUnactioned, 10, true),
        metric('Interested → Meeting %', 'Alex', '60%', `${interestedToMeeting}%`, interestedToMeeting, 60),
        metric('Meetings Booked / Week', 'Alex', '15', String(totalMeetingsBooked), totalMeetingsBooked, 15),
        metric('Orphaned Replies', 'Alex', '0', String(orphanedReplies), orphanedReplies, 0, true),
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

      // Sales metrics
      const sales: ScorecardMetric[] = [
        metric('Calls Scored / Week', 'VACANT', '40', String(weekCallCount), weekCallCount, 40),
        metric('Team Avg Score', 'VACANT', '70%', `${weekAvgScore}%`, weekAvgScore, 70),
        metric('Call 1 → Call 2 Rate', 'VACANT', '35%', `${c1to2Rate}%`, c1to2Rate, 35),
        metric('Call 2 → Call 3 Rate', 'VACANT', '50%', `${c2to3Rate}%`, c2to3Rate, 50),
        metric('Qualification Rate', 'VACANT', '15%', `${qualRate}%`, qualRate, 15),
        metric('Proposals Sent', 'VACANT', '5', String(proposalDeals.length), proposalDeals.length, 5),
        metric('Close Rate', 'VACANT', '15%', `${closeRate}%`, closeRate, 15),
        metric('Stalled Deals (14d+)', 'VACANT', '<5', String(stalledDeals.length), stalledDeals.length, 5, true),
        metric('Pipeline Inflation', 'VACANT', '0', String(inflationCount), inflationCount, 0, true),
      ]

      // Fulfillment metrics
      const fulfillment: ScorecardMetric[] = [
        metric('Active Clients', 'Philip / Mukul', '10+', String(clientStatus.length), clientStatus.length, 10),
      ]

      // Finance metrics
      const finance: ScorecardMetric[] = [
        metric('Cash Collected MTD', 'Alex', '$833K', `$${(revenueCollected / 1000).toFixed(0)}K`, revenueCollected, 833000),
        metric('Revenue Per Employee', 'Alex', '$55K/mo', `$${(revenueCollected / 45000).toFixed(0)}K`, revenueCollected / 45, 55000),
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
        rootCause: worstGap.stage.includes('Interested') ? `${totalUnactioned} unactioned replies across setters` : `Conversion below target`,
        action: worstGap.stage.includes('Interested') ? 'Promote lead setter to own the queue' : 'Review and optimize this stage',
      } : null

      // ── Alerts ─────────────────────────────────────
      const alerts: Alert[] = []

      // Critical
      alerts.push({ level: 'critical', message: 'Sales Manager role VACANT — no one enforcing coaching directives' })
      for (const [name, s] of Object.entries(setterMap)) {
        if (s.unactioned > 10) alerts.push({ level: 'critical', message: `${name}: ${s.unactioned} unactioned replies`, link: '/outbound/setters' })
      }
      if (inflationCount > 5) alerts.push({ level: 'critical', message: `${inflationCount} deals flagged for pipeline inflation`, link: '/deals' })

      // Warning
      if (avgReplyRate < 0.8) alerts.push({ level: 'warning', message: `Reply rate ${avgReplyRate.toFixed(2)}% (target 0.8%)`, link: '/outbound/email' })
      if (weekAvgScore < 70) alerts.push({ level: 'warning', message: `Team avg call score ${weekAvgScore}% (target 70%)`, link: '/reps' })
      if (stalledDeals.length > 3) alerts.push({ level: 'warning', message: `${stalledDeals.length} deals stalled 14+ days`, link: '/deals' })

      // Wins
      if (weekCallCount > 30) alerts.push({ level: 'win', message: `${weekCallCount} calls scored this week` })
      for (const r of repLeaderboard) {
        if (r.avgScore >= 70) { alerts.push({ level: 'win', message: `${r.name} averaging ${r.avgScore}% this week` }); break }
      }

      // ── Weekly comparison (this week vs last week from 2-week data) ──
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

      const weeklyComparison: WeeklyComparison[] = [
        { metric: 'Calls Scored', thisWeek: thisWeekCalls.length, lastWeek: lastWeekCalls.length, change: pctChange(thisWeekCalls.length, lastWeekCalls.length) },
        { metric: 'Team Avg Score', thisWeek: `${twAvg}%`, lastWeek: `${lwAvg}%`, change: `${twAvg - lwAvg >= 0 ? '+' : ''}${twAvg - lwAvg}pts` },
        { metric: 'Meetings Booked', thisWeek: totalMeetingsBooked, lastWeek: '—', change: '—' },
        { metric: 'Interested Replies', thisWeek: totalInterested, lastWeek: '—', change: '—' },
      ]

      setData({
        revenueCollected,
        revenueTarget: 833000,
        retainers: 0,
        successFees: 0,
        outstanding: 0,
        monthlyTrend: [],
        funnel,
        outbound,
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
      })
    } catch (err) {
      console.error('Scorecard fetch error:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(refresh, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [refresh])

  return { data, loading, refresh }
}
