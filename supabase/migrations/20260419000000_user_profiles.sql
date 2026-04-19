create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('admin','manager','member')),
  pillar_access text[] not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.user_profiles enable row level security;

create policy "read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "admins manage all profiles"
  on public.user_profiles for all
  using (exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin'));

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $func$
begin new.updated_at = now(); return new; end;
$func$;

create trigger user_profiles_touch
  before update on public.user_profiles
  for each row execute function public.touch_updated_at();
