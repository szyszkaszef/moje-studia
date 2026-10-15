-- Schemat bazy dla synchronizacji (uruchamiasz raz w Supabase: SQL Editor -> New query -> Run).

-- Tabela na dane aplikacji (jeden wiersz na użytkownika)
create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;

create policy "own_state_select" on public.user_state for select to authenticated
  using (auth.uid() = user_id);
create policy "own_state_insert" on public.user_state for insert to authenticated
  with check (auth.uid() = user_id);
create policy "own_state_update" on public.user_state for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger user_state_touch before insert or update on public.user_state
  for each row execute function public.touch_updated_at();

-- Prywatny magazyn na zdjęcia i pliki (limit 50 MB na plik)
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800) on conflict (id) do nothing;

create policy "own_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own_files_update" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
