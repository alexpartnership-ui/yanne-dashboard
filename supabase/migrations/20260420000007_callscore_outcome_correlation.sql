-- Call-score × outcome correlation.
-- For each call slot (1, 2, 3), bucket deals by the score they received on
-- that call, then compute win rate within each bucket. Tests whether the
-- rubric is actually predictive. Source: deals_with_calls (terminal only).

create or replace function public.funnel_callscore_outcome()
returns table (
  call_slot int,
  score_bucket text,
  sample_count bigint,
  signed_count bigint,
  lost_count bigint,
  won_pct numeric,
  avg_score numeric
)
language sql stable security definer
set search_path = public, pg_temp
as $func$
  with terminal as (
    select deal_id, deal_status,
      call_1_score, call_2_score, call_3_score
    from public.deals_with_calls
    where deal_status in ('signed', 'lost')
  ),
  unpivoted as (
    select 1 as call_slot, deal_id, deal_status, call_1_score as score from terminal where call_1_score is not null
    union all
    select 2, deal_id, deal_status, call_2_score from terminal where call_2_score is not null
    union all
    select 3, deal_id, deal_status, call_3_score from terminal where call_3_score is not null
  ),
  bucketed as (
    select call_slot, deal_id, deal_status, score,
      case
        when score >= 85 then '85+'
        when score >= 75 then '75-84'
        when score >= 65 then '65-74'
        when score >= 55 then '55-64'
        else '<55'
      end as score_bucket
    from unpivoted
  )
  select
    call_slot,
    score_bucket,
    count(*)::bigint as sample_count,
    count(*) filter (where deal_status = 'signed')::bigint as signed_count,
    count(*) filter (where deal_status = 'lost')::bigint as lost_count,
    case when count(*) > 0
         then round(count(*) filter (where deal_status = 'signed')::numeric * 100 / count(*), 1)
         else 0 end as won_pct,
    round(avg(score)::numeric, 1) as avg_score
  from bucketed
  group by call_slot, score_bucket
  order by call_slot,
    case score_bucket
      when '85+' then 1
      when '75-84' then 2
      when '65-74' then 3
      when '55-64' then 4
      when '<55' then 5
    end;
$func$;
