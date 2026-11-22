-- Execute no SQL Editor do Supabase
create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  type text not null check(type in ('entrada','despesa')),
  description text not null,
  amount numeric(12,2) not null check(amount>0),
  date date not null,
  category text,
  status text not null default 'pago' check(status in ('pago','pendente')),
  payer text,
  created_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
alter table public.transactions enable row level security;
-- Only members added manually by an admin can see/use the system
create policy "member can read membership" on public.team_members for select to authenticated using (user_id=auth.uid());
create policy "team members read transactions" on public.transactions for select to authenticated using (exists(select 1 from public.team_members m where m.user_id=auth.uid()));
create policy "team members insert transactions" on public.transactions for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.team_members m where m.user_id=auth.uid()));
create policy "team members delete transactions" on public.transactions for delete to authenticated using (exists(select 1 from public.team_members m where m.user_id=auth.uid()));
