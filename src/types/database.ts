export type RepName = 'Jake' | 'Stanley' | 'Thomas' | 'Tahawar'
export type CallType = 'Call 1' | 'Call 2' | 'Call 3' | 'Misc'
export type Grade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F'
export type DealStatus = 'active' | 'signed' | 'lost'
export type DealStage = 'Call 1' | 'Call 2' | 'Call 3' | 'Call 4'
export type TrendDirection = 'Improving' | 'Plateauing' | 'Declining'
export type QualificationResult = 'QUALIFIED' | 'BORDERLINE' | 'NOT_QUALIFIED'
export type NextStepFlag = 'NONE' | 'DEAD_END' | 'PIPELINE_INFLATION'

export interface CategoryScore {
  category: string
  score: number
  max: number
  percentage: number
}

export interface PenaltyOrBonus {
  name: string
  points: number
  reason?: string
}

export interface CallLog {
  id: string
  fireflies_id: string
  rep: RepName
  call_type: CallType
  scorecard_name: string | null
  prospect_company: string | null
  prospect_contact: string | null
  prospect_email: string | null
  date: string | null
  duration_minutes: number
  hubspot_deal_id: string | null
  hubspot_deal_stage: string | null
  total_score: number
  max_possible: number
  score_percentage: number
  grade: Grade | null
  category_scores: CategoryScore[]
  penalties_total: number
  penalties: PenaltyOrBonus[]
  bonuses_total: number
  bonuses: PenaltyOrBonus[]
  objections_count: number
  objections: string[]
  red_flags_count: number
  red_flags: string[]
  coaching_priority: string | null
  previous_coaching_addressed: boolean
  strengths_top3: string[] | null
  gaps_top3: string[] | null
  biggest_miss: string | null
  intel_extracted: Record<string, unknown>
  decision_makers_identified: string | null
  next_step: string | null
  qualification_result: QualificationResult | null
  pipeline_inflation: boolean
  next_step_flag: NextStepFlag | null
  call_context: string | null
  call_outcome: string | null
  full_scorecard_text: string | null
  gdrive_doc_url: string | null
  scored_at: string
  model_used: string
  rubric_version: string | null
  created_at: string
  updated_at: string
}

export interface RepPerformance {
  id: string
  rep: RepName
  call_1_rolling_avg: number
  call_1_trend: TrendDirection
  call_2_rolling_avg: number
  call_2_trend: TrendDirection
  call_3_rolling_avg: number
  call_3_trend: TrendDirection
  total_scored_calls: number
  most_common_penalty: string | null
  most_common_bonus: string | null
  weakest_category: string | null
  strongest_category: string | null
  coaching_adherence_rate: number
  current_coaching_focus: string | null
  qualification_rate: number
  last_updated: string
}

export interface DealWithCalls {
  deal_id: string
  prospect_company: string
  rep_name: RepName
  current_stage: DealStage
  deal_status: DealStatus
  hubspot_deal_id: string | null
  pipeline_inflation: boolean
  call_1_qualification: string | null
  created_at: string
  updated_at: string
  call_1_record_id: string | null
  call_1_score: number | null
  call_1_grade: Grade | null
  call_1_biggest_miss: string | null
  call_1_coaching: string | null
  call_2_record_id: string | null
  call_2_score: number | null
  call_2_grade: Grade | null
  call_2_biggest_miss: string | null
  call_2_coaching: string | null
  call_3_record_id: string | null
  call_3_score: number | null
  call_3_grade: Grade | null
  call_3_biggest_miss: string | null
  call_3_coaching: string | null
  call_4_record_id: string | null
  call_4_score: number | null
  call_4_grade: Grade | null
  call_4_biggest_miss: string | null
  call_4_coaching: string | null
}
