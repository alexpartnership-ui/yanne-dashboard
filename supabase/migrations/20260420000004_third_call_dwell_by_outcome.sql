-- Dwell in 3rd Call, split by exit outcome. One row per bucket.
-- Hypothesis: Wons close fast; LTLs drift. If true, long dwell becomes
-- a leading indicator to alert on before the deal dies.

create or replace function public.funnel_third_call_dwell_by_outcome(
  cohort_start date default '1900-01-01',
  cohort_end date default '2099-12-31'
)
returns table (
  outcome text,
  outcome_label text,
  sample_count bigint,
  median_days numeric,
  mean_days numeric,
  p75_days numeric
)
language sql stable security definer
set search_path = public, pg_temp
as $func$
  with latest as (
    select distinct on (hubspot_deal_id) *
    from public.funnel_snapshots
    order by hubspot_deal_id, snapshot_date desc
  ),
  pairs as (
    select
      case current_stage_id
        when '1066193534'   then 'still'
        when 'closedwon'    then 'won'
        when 'closedlost'   then 'lost'
        when 'contractsent' then 'ltl'
        when '1066871403'   then 'dq'
        else 'other'
      end as outcome,
      case current_stage_id
        when '1066193534'   then 'Still in 3rd'
        when 'closedwon'    then 'Won'
        when 'closedlost'   then 'Lost'
        when 'contractsent' then 'LTL'
        when '1066871403'   then 'DQ'
        else 'Other'
      end as outcome_label,
      extract(epoch from (coalesce(last_activity_at, now()) - date_entered_1066193534)) / 86400.0 as days
    from latest
    where date_entered_1066193534 is not null
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
  ),
  filtered as (
    select outcome, outcome_label, days
    from pairs
    where days > 0 and days < 400 and outcome <> 'other'
  ),
  agg as (
    select outcome, outcome_label,
      count(*)::bigint as sample_count,
      round(percentile_cont(0.5) within group (order by days)::numeric, 1) as median_days,
      round(avg(days)::numeric, 1) as mean_days,
      round(percentile_cont(0.75) within group (order by days)::numeric, 1) as p75_days
    from filtered
    group by outcome, outcome_label
  )
  select outcome, outcome_label, sample_count, median_days, mean_days, p75_days
  from agg
  order by case outcome
    when 'won' then 1
    when 'still' then 2
    when 'ltl' then 3
    when 'lost' then 4
    when 'dq' then 5
  end;
$func$;
