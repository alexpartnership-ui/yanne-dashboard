-- Funnel Health snapshots + RPCs

create table public.funnel_snapshots (
  id bigserial primary key,
  snapshot_date date not null,
  hubspot_deal_id text not null,
  current_stage_id text not null,
  current_stage_label text,
  pipeline text,
  dealname text,
  amount numeric,
  createdate timestamptz,
  closedate timestamptz,
  date_entered_appointmentscheduled timestamptz,
  date_entered_qualifiedtobuy timestamptz,
  date_entered_presentationscheduled timestamptz,
  date_entered_decisionmakerboughtin timestamptz,
  date_entered_1066193534 timestamptz,
  date_entered_closedwon timestamptz,
  date_entered_closedlost timestamptz,
  date_entered_1066871403 timestamptz,
  date_entered_contractsent timestamptz,
  cumulative_time_in_appointmentscheduled bigint,
  cumulative_time_in_qualifiedtobuy bigint,
  cumulative_time_in_presentationscheduled bigint,
  cumulative_time_in_decisionmakerboughtin bigint,
  cumulative_time_in_1066193534 bigint,
  raw_hubspot_payload jsonb,
  created_at timestamptz default now(),
  unique (snapshot_date, hubspot_deal_id)
);

create index funnel_snapshots_snapshot_date_idx on public.funnel_snapshots (snapshot_date desc);
create index funnel_snapshots_hubspot_deal_id_idx on public.funnel_snapshots (hubspot_deal_id);
create index funnel_snapshots_current_stage_id_idx on public.funnel_snapshots (current_stage_id);

create or replace function public.funnel_counts(
  cohort_start date default '1900-01-01',
  cohort_end date default '2099-12-31'
)
returns table (
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
  )
  select
    count(*) filter (where
      date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    )::bigint as mq_reach,
    count(*) filter (where
      date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
      and (
        date_entered_presentationscheduled is not null
        or date_entered_decisionmakerboughtin is not null
        or date_entered_1066193534 is not null
        or date_entered_closedwon is not null
      )
    )::bigint as first_call_reach,
    count(*) filter (where
      date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
      and (
        date_entered_decisionmakerboughtin is not null
        or date_entered_1066193534 is not null
        or date_entered_closedwon is not null
      )
    )::bigint as second_call_reach,
    count(*) filter (where
      date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
      and (
        date_entered_1066193534 is not null
        or date_entered_closedwon is not null
      )
    )::bigint as third_call_reach,
    count(*) filter (where
      date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
      and date_entered_closedwon is not null
    )::bigint as won,
    count(*) filter (where
      date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
      and date_entered_qualifiedtobuy is not null
    )::bigint as nda_ever
  from latest;
$func$;

create or replace function public.funnel_dwell_times(
  cohort_start date default '1900-01-01',
  cohort_end date default '2099-12-31'
)
returns table (
  stage_id text,
  stage_label text,
  sample_count bigint,
  median_ms bigint,
  mean_ms bigint,
  p75_ms bigint
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
    'appointmentscheduled'::text as stage_id,
    'Meeting Qualified'::text as stage_label,
    count(*) filter (where
      current_stage_id != 'appointmentscheduled'
      and cumulative_time_in_appointmentscheduled is not null
      and cumulative_time_in_appointmentscheduled > 0
      and cumulative_time_in_appointmentscheduled < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    )::bigint as sample_count,
    (percentile_cont(0.5) within group (order by cumulative_time_in_appointmentscheduled) filter (where
      current_stage_id != 'appointmentscheduled'
      and cumulative_time_in_appointmentscheduled is not null
      and cumulative_time_in_appointmentscheduled > 0
      and cumulative_time_in_appointmentscheduled < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as median_ms,
    (avg(cumulative_time_in_appointmentscheduled) filter (where
      current_stage_id != 'appointmentscheduled'
      and cumulative_time_in_appointmentscheduled is not null
      and cumulative_time_in_appointmentscheduled > 0
      and cumulative_time_in_appointmentscheduled < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as mean_ms,
    (percentile_cont(0.75) within group (order by cumulative_time_in_appointmentscheduled) filter (where
      current_stage_id != 'appointmentscheduled'
      and cumulative_time_in_appointmentscheduled is not null
      and cumulative_time_in_appointmentscheduled > 0
      and cumulative_time_in_appointmentscheduled < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as p75_ms
  from latest
  union all
  select
    'qualifiedtobuy'::text as stage_id,
    'NDA'::text as stage_label,
    count(*) filter (where
      current_stage_id != 'qualifiedtobuy'
      and cumulative_time_in_qualifiedtobuy is not null
      and cumulative_time_in_qualifiedtobuy > 0
      and cumulative_time_in_qualifiedtobuy < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    )::bigint as sample_count,
    (percentile_cont(0.5) within group (order by cumulative_time_in_qualifiedtobuy) filter (where
      current_stage_id != 'qualifiedtobuy'
      and cumulative_time_in_qualifiedtobuy is not null
      and cumulative_time_in_qualifiedtobuy > 0
      and cumulative_time_in_qualifiedtobuy < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as median_ms,
    (avg(cumulative_time_in_qualifiedtobuy) filter (where
      current_stage_id != 'qualifiedtobuy'
      and cumulative_time_in_qualifiedtobuy is not null
      and cumulative_time_in_qualifiedtobuy > 0
      and cumulative_time_in_qualifiedtobuy < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as mean_ms,
    (percentile_cont(0.75) within group (order by cumulative_time_in_qualifiedtobuy) filter (where
      current_stage_id != 'qualifiedtobuy'
      and cumulative_time_in_qualifiedtobuy is not null
      and cumulative_time_in_qualifiedtobuy > 0
      and cumulative_time_in_qualifiedtobuy < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as p75_ms
  from latest
  union all
  select
    'presentationscheduled'::text as stage_id,
    '1st Closing Call'::text as stage_label,
    count(*) filter (where
      current_stage_id != 'presentationscheduled'
      and cumulative_time_in_presentationscheduled is not null
      and cumulative_time_in_presentationscheduled > 0
      and cumulative_time_in_presentationscheduled < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    )::bigint as sample_count,
    (percentile_cont(0.5) within group (order by cumulative_time_in_presentationscheduled) filter (where
      current_stage_id != 'presentationscheduled'
      and cumulative_time_in_presentationscheduled is not null
      and cumulative_time_in_presentationscheduled > 0
      and cumulative_time_in_presentationscheduled < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as median_ms,
    (avg(cumulative_time_in_presentationscheduled) filter (where
      current_stage_id != 'presentationscheduled'
      and cumulative_time_in_presentationscheduled is not null
      and cumulative_time_in_presentationscheduled > 0
      and cumulative_time_in_presentationscheduled < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as mean_ms,
    (percentile_cont(0.75) within group (order by cumulative_time_in_presentationscheduled) filter (where
      current_stage_id != 'presentationscheduled'
      and cumulative_time_in_presentationscheduled is not null
      and cumulative_time_in_presentationscheduled > 0
      and cumulative_time_in_presentationscheduled < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as p75_ms
  from latest
  union all
  select
    'decisionmakerboughtin'::text as stage_id,
    '2nd Closing Call'::text as stage_label,
    count(*) filter (where
      current_stage_id != 'decisionmakerboughtin'
      and cumulative_time_in_decisionmakerboughtin is not null
      and cumulative_time_in_decisionmakerboughtin > 0
      and cumulative_time_in_decisionmakerboughtin < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    )::bigint as sample_count,
    (percentile_cont(0.5) within group (order by cumulative_time_in_decisionmakerboughtin) filter (where
      current_stage_id != 'decisionmakerboughtin'
      and cumulative_time_in_decisionmakerboughtin is not null
      and cumulative_time_in_decisionmakerboughtin > 0
      and cumulative_time_in_decisionmakerboughtin < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as median_ms,
    (avg(cumulative_time_in_decisionmakerboughtin) filter (where
      current_stage_id != 'decisionmakerboughtin'
      and cumulative_time_in_decisionmakerboughtin is not null
      and cumulative_time_in_decisionmakerboughtin > 0
      and cumulative_time_in_decisionmakerboughtin < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as mean_ms,
    (percentile_cont(0.75) within group (order by cumulative_time_in_decisionmakerboughtin) filter (where
      current_stage_id != 'decisionmakerboughtin'
      and cumulative_time_in_decisionmakerboughtin is not null
      and cumulative_time_in_decisionmakerboughtin > 0
      and cumulative_time_in_decisionmakerboughtin < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as p75_ms
  from latest
  union all
  select
    '1066193534'::text as stage_id,
    '3rd Call / Contract Sent'::text as stage_label,
    count(*) filter (where
      current_stage_id != '1066193534'
      and cumulative_time_in_1066193534 is not null
      and cumulative_time_in_1066193534 > 0
      and cumulative_time_in_1066193534 < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    )::bigint as sample_count,
    (percentile_cont(0.5) within group (order by cumulative_time_in_1066193534) filter (where
      current_stage_id != '1066193534'
      and cumulative_time_in_1066193534 is not null
      and cumulative_time_in_1066193534 > 0
      and cumulative_time_in_1066193534 < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as median_ms,
    (avg(cumulative_time_in_1066193534) filter (where
      current_stage_id != '1066193534'
      and cumulative_time_in_1066193534 is not null
      and cumulative_time_in_1066193534 > 0
      and cumulative_time_in_1066193534 < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as mean_ms,
    (percentile_cont(0.75) within group (order by cumulative_time_in_1066193534) filter (where
      current_stage_id != '1066193534'
      and cumulative_time_in_1066193534 is not null
      and cumulative_time_in_1066193534 > 0
      and cumulative_time_in_1066193534 < 34560000000
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
    ))::bigint as p75_ms
  from latest;
$func$;

create or replace function public.funnel_third_call_outcomes(
  cohort_start date default '1900-01-01',
  cohort_end date default '2099-12-31'
)
returns table (
  still bigint,
  won bigint,
  lost bigint,
  ltl bigint,
  dq bigint
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
    count(*) filter (where
      date_entered_1066193534 is not null
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
      and current_stage_id = '1066193534'
    )::bigint as still,
    count(*) filter (where
      date_entered_1066193534 is not null
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
      and current_stage_id = 'closedwon'
    )::bigint as won,
    count(*) filter (where
      date_entered_1066193534 is not null
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
      and current_stage_id = 'closedlost'
    )::bigint as lost,
    count(*) filter (where
      date_entered_1066193534 is not null
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
      and current_stage_id = 'contractsent'
    )::bigint as ltl,
    count(*) filter (where
      date_entered_1066193534 is not null
      and date_entered_appointmentscheduled is not null
      and date_entered_appointmentscheduled::date between cohort_start and cohort_end
      and current_stage_id = '1066871403'
    )::bigint as dq
  from latest;
$func$;
