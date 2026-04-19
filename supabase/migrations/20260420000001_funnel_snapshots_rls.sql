-- Lock funnel_snapshots from anon + authenticated keys.
-- Server (service role) bypasses RLS — no policies needed.
alter table public.funnel_snapshots enable row level security;
