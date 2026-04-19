-- Adds per-closer breakdown, monthly cohort trend, and 3rd-call deal drill-down.
-- Schema additions are nullable — existing rows stay valid; next n8n sync backfills.

alter table public.funnel_snapshots
  add column if not exists owner_id text,
  add column if not exists last_activity_at timestamptz;

create index if not exists funnel_snapshots_owner_id_idx on public.funnel_snapshots (owner_id);

-- ─── funnel_counts_by_closer ─────────────────────────────────────────
-- Per-owner skip-adjusted funnel counts. NULL owner → 'unassigned'.

create or replace function public.funnel_counts_by_closer(
  cohort_start date default '1900-01-01',
  cohort_end date default '2099-12-31'
)
returns table (
  owner_id text,
  mq_reach bigint,
  first_call_reach bigint,
  second_call_reach bigint,
  third_call_reach bigint,
  won bigint,
  nda_ever bigint
)
language sql stable security definer
set search_path = public, pg_temp
as $func$
  with latest as (
    select distinct on (hubspot_deal_id) *
    from public.funnel_snapshots
    order by hubspot_deal_id, snapshot_date desc
  ),
  in_cohort as (
    select * from latest
    where date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
  )
  select
    coalesce(owner_id, 'unassigned') as owner_id,
    count(*)::bigint as mq_reach,
    count(*) filter (where
      date_entered_presentationscheduled is not null
      or date_entered_decisionmakerboughtin is not null
      or date_entered_1066193534 is not null
      or date_entered_closedwon is not null
    )::bigint as first_call_reach,
    count(*) filter (where
      date_entered_decisionmakerboughtin is not null
      or date_entered_1066193534 is not null
      or date_entered_closedwon is not null
    )::bigint as second_call_reach,
    count(*) filter (where
      date_entered_1066193534 is not null
      or date_entered_closedwon is not null
    )::bigint as third_call_reach,
    count(*) filter (where date_entered_closedwon is not null)::bigint as won,
    count(*) filter (where date_entered_qualifiedtobuy is not null)::bigint as nda_ever
  from in_cohort
  group by coalesce(owner_id, 'unassigned')
  order by count(*) desc;
$func$;

-- ─── funnel_monthly_cohorts ──────────────────────────────────────────
-- Rolling 12-month view: for each month M, count deals that entered MQ in M,
-- how many of those have reached Won, and a conversion %. Cohort is flagged
-- immature when it's younger than the median MQ→Won cycle of mature cohorts
-- (simple heuristic: < 90 days old).

create or replace function public.funnel_monthly_cohorts(
  months_back int default 12
)
returns table (
  cohort_month date,
  mq_count bigint,
  won_count bigint,
  won_pct numeric,
  is_immature boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $func$
  with latest as (
    select distinct on (hubspot_deal_id) *
    from public.funnel_snapshots
    order by hubspot_deal_id, snapshot_date desc
  ),
  months as (
    select generate_series(
      date_trunc('month', current_date - (months_back || ' months')::interval)::date,
      date_trunc('month', current_date)::date,
      '1 month'::interval
    )::date as cohort_month
  ),
  cohort_stats as (
    select
      date_trunc('month', date_entered_appointmentscheduled)::date as cohort_month,
      count(*)::bigint as mq_count,
      count(*) filter (where date_entered_closedwon is not null)::bigint as won_count
    from latest
    where date_entered_appointmentscheduled is not null
    group by date_trunc('month', date_entered_appointmentscheduled)
  )
  select
    m.cohort_month,
    coalesce(cs.mq_count, 0) as mq_count,
    coalesce(cs.won_count, 0) as won_count,
    case when coalesce(cs.mq_count, 0) > 0
         then round(coalesce(cs.won_count, 0)::numeric * 100 / cs.mq_count, 1)
         else 0
    end as won_pct,
    (m.cohort_month > current_date - interval '90 days') as is_immature
  from months m
  left join cohort_stats cs on cs.cohort_month = m.cohort_month
  order by m.cohort_month;
$func$;

-- ─── funnel_third_call_deals ─────────────────────────────────────────
-- Returns deals that ever entered 3rd Call, filtered by outcome bucket.
-- Sorted by dwell_days desc (longest parkers first — most actionable).

create or replace function public.funnel_third_call_deals(
  cohort_start date default '1900-01-01',
  cohort_end date default '2099-12-31',
  outcome text default 'all'
)
returns table (
  hubspot_deal_id text,
  dealname text,
  current_stage_id text,
  current_stage_label text,
  owner_id text,
  amount numeric,
  date_entered_third timestamptz,
  dwell_days numeric,
  last_activity_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $func$
  with latest as (
    select distinct on (hubspot_deal_id) *
    from public.funnel_snapshots
    order by hubspot_deal_id, snapshot_date desc
  )
  select
    l.hubspot_deal_id,
    l.dealname,
    l.current_stage_id,
    l.current_stage_label,
    l.owner_id,
    l.amount,
    l.date_entered_1066193534 as date_entered_third,
    round(extract(epoch from (coalesce(l.last_activity_at, now()) - l.date_entered_1066193534)) / 86400.0, 1) as dwell_days,
    l.last_activity_at
  from latest l
  where l.date_entered_1066193534 is not null
    and l.date_entered_appointmentscheduled is not null
    and l.date_entered_appointmentscheduled::date between cohort_start and cohort_end
    and case outcome
      when 'still' then l.current_stage_id = '1066193534'
      when 'won'   then l.current_stage_id = 'closedwon'
      when 'lost'  then l.current_stage_id = 'closedlost'
      when 'ltl'   then l.current_stage_id = 'contractsent'
      when 'dq'    then l.current_stage_id = '1066871403'
      else true
    end
  order by dwell_days desc nulls last;
$func$;
