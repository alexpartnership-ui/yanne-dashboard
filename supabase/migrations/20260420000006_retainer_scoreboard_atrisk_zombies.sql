-- Retainer scoreboard, retainer-by-stage, at-risk 3rd-Call deals,
-- walking-dead deals. Retainer = funnel_snapshots.amount (USD, confirmed).

-- ─── funnel_retainer_scoreboard ───────────────────────────
-- Won retainer for MTD / QTD / YTD, plus prior period for trend deltas.
create or replace function public.funnel_retainer_scoreboard()
returns table (
  mtd_retainer numeric,
  qtd_retainer numeric,
  ytd_retainer numeric,
  prev_mtd_retainer numeric,
  prev_qtd_retainer numeric,
  prev_ytd_retainer numeric
)
language sql stable security definer
set search_path = public, pg_temp
as $func$
  with latest as (
    select distinct on (hubspot_deal_id) *
    from public.funnel_snapshots
    order by hubspot_deal_id, snapshot_date desc
  ),
  won as (
    select amount, date_entered_closedwon::date as wd
    from latest
    where date_entered_closedwon is not null and amount is not null
  ),
  now_tz as (select current_date as today)
  select
    coalesce(sum(amount) filter (where wd >= date_trunc('month', today)::date and wd <= today), 0) as mtd_retainer,
    coalesce(sum(amount) filter (where wd >= date_trunc('quarter', today)::date and wd <= today), 0) as qtd_retainer,
    coalesce(sum(amount) filter (where wd >= date_trunc('year', today)::date and wd <= today), 0) as ytd_retainer,
    coalesce(sum(amount) filter (where wd >= (date_trunc('month', today) - interval '1 month')::date
                                   and wd < date_trunc('month', today)::date), 0) as prev_mtd_retainer,
    coalesce(sum(amount) filter (where wd >= (date_trunc('quarter', today) - interval '3 months')::date
                                   and wd < date_trunc('quarter', today)::date), 0) as prev_qtd_retainer,
    coalesce(sum(amount) filter (where wd >= (date_trunc('year', today) - interval '1 year')::date
                                   and wd < date_trunc('year', today)::date), 0) as prev_ytd_retainer
  from won, now_tz;
$func$;

-- ─── funnel_retainer_by_stage ─────────────────────────────
-- Retainer $ reached per stage — mirrors funnel_counts but in dollars.
create or replace function public.funnel_retainer_by_stage(
  cohort_start date default '1900-01-01',
  cohort_end date default '2099-12-31'
)
returns table (
  mq_retainer numeric,
  first_call_retainer numeric,
  second_call_retainer numeric,
  third_call_retainer numeric,
  won_retainer numeric,
  nda_ever_retainer numeric
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
      and amount is not null
  )
  select
    coalesce(sum(amount), 0) as mq_retainer,
    coalesce(sum(amount) filter (where
      date_entered_presentationscheduled is not null
      or date_entered_decisionmakerboughtin is not null
      or date_entered_1066193534 is not null
      or date_entered_closedwon is not null), 0) as first_call_retainer,
    coalesce(sum(amount) filter (where
      date_entered_decisionmakerboughtin is not null
      or date_entered_1066193534 is not null
      or date_entered_closedwon is not null), 0) as second_call_retainer,
    coalesce(sum(amount) filter (where
      date_entered_1066193534 is not null
      or date_entered_closedwon is not null), 0) as third_call_retainer,
    coalesce(sum(amount) filter (where date_entered_closedwon is not null), 0) as won_retainer,
    coalesce(sum(amount) filter (where date_entered_qualifiedtobuy is not null), 0) as nda_ever_retainer
  from in_cohort;
$func$;

-- ─── funnel_at_risk_third_call ────────────────────────────
-- Deals currently IN 3rd Call whose dwell exceeds threshold (default 15d).
-- These are the "intervention window closing" deals.
create or replace function public.funnel_at_risk_third_call(
  threshold_days int default 15
)
returns table (
  hubspot_deal_id text,
  dealname text,
  owner_id text,
  amount numeric,
  date_entered_third timestamptz,
  dwell_days numeric,
  last_activity_at timestamptz,
  days_over_threshold numeric,
  risk_score numeric
)
language sql stable security definer
set search_path = public, pg_temp
as $func$
  with latest as (
    select distinct on (hubspot_deal_id) *
    from public.funnel_snapshots
    order by hubspot_deal_id, snapshot_date desc
  ),
  live as (
    select
      hubspot_deal_id, dealname, owner_id, amount,
      date_entered_1066193534 as date_entered_third,
      last_activity_at,
      round(extract(epoch from (now() - date_entered_1066193534)) / 86400.0, 1) as dwell_days
    from latest
    where current_stage_id = '1066193534'
      and date_entered_1066193534 is not null
  )
  select
    hubspot_deal_id, dealname, owner_id, amount,
    date_entered_third, dwell_days, last_activity_at,
    round(dwell_days - threshold_days, 1) as days_over_threshold,
    -- risk_score = retainer × days-over-threshold (in thousands, rounded)
    round(coalesce(amount, 0) * greatest(dwell_days - threshold_days, 0) / 1000.0, 1) as risk_score
  from live
  where dwell_days >= threshold_days
  order by risk_score desc nulls last, dwell_days desc;
$func$;

-- ─── funnel_walking_dead ──────────────────────────────────
-- Active-stage deals with no activity in N days. Default 30. Excludes
-- terminal stages (Won/Lost/LTL/DQ).
create or replace function public.funnel_walking_dead(
  stale_days int default 30
)
returns table (
  hubspot_deal_id text,
  dealname text,
  owner_id text,
  current_stage_id text,
  current_stage_label text,
  amount numeric,
  last_activity_at timestamptz,
  days_since_activity numeric
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
    hubspot_deal_id, dealname, owner_id,
    current_stage_id, current_stage_label, amount, last_activity_at,
    round(extract(epoch from (now() - coalesce(last_activity_at, createdate))) / 86400.0, 1) as days_since_activity
  from latest
  where current_stage_id not in ('closedwon', 'closedlost', 'contractsent', '1066871403')
    and extract(epoch from (now() - coalesce(last_activity_at, createdate))) / 86400.0 >= stale_days
  order by days_since_activity desc;
$func$;
