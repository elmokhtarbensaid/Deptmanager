create table if not exists public.credit_card_data(
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"version":1,"cards":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.credit_card_data enable row level security;

grant select, insert, update, delete on public.credit_card_data to authenticated;

drop policy if exists "Users can read own credit card data" on public.credit_card_data;
create policy "Users can read own credit card data"
on public.credit_card_data for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own credit card data" on public.credit_card_data;
create policy "Users can insert own credit card data"
on public.credit_card_data for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own credit card data" on public.credit_card_data;
create policy "Users can update own credit card data"
on public.credit_card_data for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own credit card data" on public.credit_card_data;
create policy "Users can delete own credit card data"
on public.credit_card_data for delete to authenticated
using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'credit_card_data'
  ) then
    alter publication supabase_realtime add table public.credit_card_data;
  end if;
end $$;