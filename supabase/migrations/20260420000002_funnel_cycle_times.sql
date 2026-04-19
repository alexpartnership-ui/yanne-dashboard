-- End-to-end cycle times: median/mean/P75 days between two stage-entry dates.
-- Returns one row per segment, in this fixed order:
--   MQ→1st, MQ→2nd, MQ→3rd, MQ→Won, 1st→Won, MQ→NDA
-- Computed over the latest snapshot per deal; outliers (>400 days) discarded.

create or replace function public.funnel_cycle_times(
  cohort_start date default '1900-01-01',
  cohort_end date default '2099-12-31'
)
returns table (
  segment_id text,
  segment_label text,
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
    select 'mq_to_first' as segment_id, 'MQ → 1st Call' as segment_label,
           extract(epoch from (date_entered_presentationscheduled - date_entered_appointmentscheduled)) / 86400.0 as days
    from latest
    where date_entered_appointmentscheduled is not null
      and date_entered_presentationscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    union all
    select 'mq_to_second', 'MQ → 2nd Call',
           extract(epoch from (date_entered_decisionmakerboughtin - date_entered_appointmentscheduled)) / 86400.0
    from latest
    where date_entered_appointmentscheduled is not null
      and date_entered_decisionmakerboughtin is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    union all
    select 'mq_to_third', 'MQ → 3rd Call',
           extract(epoch from (date_entered_1066193534 - date_entered_appointmentscheduled)) / 86400.0
    from latest
    where date_entered_appointmentscheduled is not null
      and date_entered_1066193534 is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    union all
    select 'mq_to_won', 'MQ → Won',
           extract(epoch from (date_entered_closedwon - date_entered_appointmentscheduled)) / 86400.0
    from latest
    where date_entered_appointmentscheduled is not null
      and date_entered_closedwon is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    union all
    select 'first_to_won', '1st Call → Won',
           extract(epoch from (date_entered_closedwon - date_entered_presentationscheduled)) / 86400.0
    from latest
    where date_entered_appointmentscheduled is not null
      and date_entered_presentationscheduled is not null
      and date_entered_closedwon is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    union all
    select 'mq_to_nda', 'MQ → NDA',
           extract(epoch from (date_entered_qualifiedtobuy - date_entered_appointmentscheduled)) / 86400.0
    from latest
    where date_entered_appointmentscheduled is not null
      and date_entered_qualifiedtobuy is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
  ),
  filtered as (
    select segment_id, segment_label, days
    from pairs
    where days > 0 and days < 400
  ),
  agg as (
    select
      segment_id,
      segment_label,
      count(*)::bigint as sample_count,
      round(percentile_cont(0.5) within group (order by days)::numeric, 1) as median_days,
      round(avg(days)::numeric, 1) as mean_days,
      round(percentile_cont(0.75) within group (order by days)::numeric, 1) as p75_days
    from filtered
    group by segment_id, segment_label
  ),
  ordered as (
    select *, case segment_id
      when 'mq_to_first' then 1
      when 'mq_to_second' then 2
      when 'mq_to_third' then 3
      when 'mq_to_won' then 4
      when 'first_to_won' then 5
      when 'mq_to_nda' then 6
    end as sort_order
    from agg
  )
  select segment_id, segment_label, sample_count, median_days, mean_days, p75_days
  from ordered
  order by sort_order;
$func$;
