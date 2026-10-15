-- Powiadomienia: tabele i harmonogram (uruchamiasz raz: Supabase -> SQL Editor -> New query -> Run).
-- Najpierw musi być już uruchomiony supabase/schema.sql.

-- Urządzenia, które włączyły powiadomienia (jedno na przeglądarkę/telefon)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own_subs_select" on public.push_subscriptions for select to authenticated using (auth.uid() = user_id);
create policy "own_subs_insert" on public.push_subscriptions for insert to authenticated with check (auth.uid() = user_id);
create policy "own_subs_update" on public.push_subscriptions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_subs_delete" on public.push_subscriptions for delete to authenticated using (auth.uid() = user_id);

-- Już wysłane przypomnienia (żeby żadne nie przyszło dwa razy). Bez polityk: dostęp ma tylko funkcja.
create table if not exists public.push_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_sent enable row level security;

-- Ustawienia serwera: klucze VAPID (tworzy funkcja) i sekret harmonogramu. Bez polityk: tylko funkcja.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid_public text,
  vapid_private text,
  cron_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.push_config enable row level security;
insert into public.push_config (id) values (1) on conflict (id) do nothing;

-- Harmonogram: co minutę wywołuje funkcję "push" (z sekretem zapisanym w bazie)
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://njsatvlmgwwqtgffdedu.supabase.co/functions/v1/push?run=reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select cron_secret from public.push_config where id = 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
