-- ============================================================
-- 0003 — Comptes, onboarding et parcours financiers (bloc 2)
-- Toutes les tables utilisateur : RLS activée, accès limité au propriétaire,
-- aucun accès anonyme. Les opérations extraites des relevés sont écrites
-- par l'Edge Function (service role) ; l'utilisateur ne peut modifier que
-- ses propres décisions (catégorie, exclusion).
-- ============================================================

-- ---------- Types ----------
alter type public.budget_frequency add value if not exists 'once';

create type public.onboarding_path as enum ('statements', 'manual');
create type public.entry_source as enum ('manual', 'off_statement');
create type public.import_status as enum ('uploaded', 'processing', 'needs_review', 'confirmed', 'failed');
create type public.balance_check as enum ('ok', 'mismatch', 'unknown');
create type public.financial_goal as enum (
  'end_month_comfortably', 'build_emergency_fund', 'reduce_debt', 'save_for_project', 'prepare_retirement', 'other'
);

-- ---------- Profils ----------
create table public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  display_name             text check (display_name is null or length(display_name) between 1 and 60),
  terms_version            text,
  terms_accepted_at        timestamptz,
  onboarding_path          public.onboarding_path,
  onboarding_completed_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint profiles_terms_consistent check ((terms_version is null) = (terms_accepted_at is null))
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function app_private.set_updated_at();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, terms_version, terms_accepted_at, onboarding_path, onboarding_completed_at)
  on public.profiles to authenticated;

create policy "profiles_select_own" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Création automatique du profil à l'inscription, avec la version des CGU
-- acceptée (transmise dans les métadonnées d'inscription).
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terms text := nullif(new.raw_user_meta_data ->> 'terms_version', '');
  v_name  text := nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 60), '');
begin
  insert into public.profiles (id, display_name, terms_version, terms_accepted_at)
  values (new.id, v_name, v_terms, case when v_terms is not null then now() end);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- ---------- Situation complémentaire ----------
create table public.financial_situations (
  user_id                  uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  savings_available_cents  bigint check (savings_available_cents between 0 and 100000000000),
  debt_remaining_cents     bigint check (debt_remaining_cents between 0 and 100000000000),
  has_payment_delays       boolean,
  main_goal                public.financial_goal,
  household_size           smallint check (household_size between 1 and 20),
  updated_at               timestamptz not null default now()
);

create trigger financial_situations_updated_at before update on public.financial_situations
  for each row execute function app_private.set_updated_at();

alter table public.financial_situations enable row level security;
revoke all on public.financial_situations from anon, authenticated;
grant select, insert, update, delete on public.financial_situations to authenticated;

create policy "situations_all_own" on public.financial_situations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Lignes de budget déclarées ----------
create table public.budget_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_code  text not null references public.categories (code),
  label          text check (label is null or length(label) between 1 and 80),
  amount_cents   bigint not null check (amount_cents between 0 and 10000000000),
  frequency      public.budget_frequency not null default 'monthly',
  source         public.entry_source not null default 'manual',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index budget_entries_user_idx on public.budget_entries (user_id);
create trigger budget_entries_updated_at before update on public.budget_entries
  for each row execute function app_private.set_updated_at();

alter table public.budget_entries enable row level security;
revoke all on public.budget_entries from anon, authenticated;
grant select, insert, update, delete on public.budget_entries to authenticated;

create policy "budget_entries_all_own" on public.budget_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Imports de relevés ----------
create table public.statement_imports (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_path              text not null unique,
  file_name              text not null check (length(file_name) between 1 and 255),
  file_size              integer not null check (file_size between 1 and 10485760),
  status                 public.import_status not null default 'uploaded',
  error_code             text,
  bank_name              text,
  account_label          text check (account_label is null or length(account_label) between 1 and 80),
  period_start           date,
  period_end             date,
  opening_balance_cents  bigint,
  closing_balance_cents  bigint,
  balance_check          public.balance_check not null default 'unknown',
  operations_count       integer not null default 0,
  confirmed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint statement_imports_path_owner check (split_part(file_path, '/', 1) = user_id::text),
  constraint statement_imports_period check (period_start is null or period_end is null or period_start <= period_end)
);

create index statement_imports_user_idx on public.statement_imports (user_id, created_at desc);
create trigger statement_imports_updated_at before update on public.statement_imports
  for each row execute function app_private.set_updated_at();

alter table public.statement_imports enable row level security;
revoke all on public.statement_imports from anon, authenticated;
grant select, delete on public.statement_imports to authenticated;
grant insert (file_path, file_name, file_size) on public.statement_imports to authenticated;
grant update (account_label, status, confirmed_at) on public.statement_imports to authenticated;

create policy "imports_select_own" on public.statement_imports for select to authenticated
  using (user_id = (select auth.uid()));
create policy "imports_insert_own" on public.statement_imports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'uploaded');
-- L'utilisateur peut seulement confirmer un import analysé (ou renommer le compte).
create policy "imports_update_own" on public.statement_imports for update to authenticated
  using (user_id = (select auth.uid()) and status in ('needs_review', 'confirmed'))
  with check (user_id = (select auth.uid()) and status in ('needs_review', 'confirmed'));
create policy "imports_delete_own" on public.statement_imports for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- Opérations bancaires extraites ----------
create table public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  import_id           uuid not null references public.statement_imports (id) on delete cascade,
  position            integer not null,
  op_date             date not null,
  label               text not null check (length(label) between 1 and 300),
  amount_cents        bigint not null check (amount_cents <> 0),
  ai_category_code    text references public.categories (code),
  ai_confidence       real check (ai_confidence between 0 and 1),
  -- Décisions de l'utilisateur (null = décision automatique du moteur)
  user_category_code  text references public.categories (code),
  user_excluded       boolean,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (import_id, position)
);

create index transactions_user_date_idx on public.transactions (user_id, op_date);
create index transactions_import_idx on public.transactions (import_id);
create trigger transactions_updated_at before update on public.transactions
  for each row execute function app_private.set_updated_at();

alter table public.transactions enable row level security;
revoke all on public.transactions from anon, authenticated;
grant select on public.transactions to authenticated;
grant update (user_category_code, user_excluded) on public.transactions to authenticated;

create policy "transactions_select_own" on public.transactions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "transactions_update_own" on public.transactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Historique des corrections de catégorie ----------
-- Une correction faite une fois s'applique aux opérations du même marchand,
-- présentes et futures.
create table public.category_rules (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  merchant_key   text not null check (length(merchant_key) between 2 and 120),
  category_code  text not null references public.categories (code),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, merchant_key)
);

create trigger category_rules_updated_at before update on public.category_rules
  for each row execute function app_private.set_updated_at();

alter table public.category_rules enable row level security;
revoke all on public.category_rules from anon, authenticated;
grant select, insert, update, delete on public.category_rules to authenticated;

create policy "category_rules_all_own" on public.category_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Messages de contact ----------
create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  name        text not null check (length(trim(name)) between 1 and 100),
  email       text not null check (length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  topic       text not null check (topic in ('question', 'technique', 'abonnement', 'donnees', 'autre')),
  message     text not null check (length(trim(message)) between 10 and 4000),
  created_at  timestamptz not null default now()
);

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
grant insert (name, email, topic, message) on public.contact_messages to anon, authenticated;

-- Dépôt uniquement : personne ne peut relire les messages via l'API.
create policy "contact_insert" on public.contact_messages for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- ---------- Stockage privé des relevés ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('statements', 'statements', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "statements_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'statements' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "statements_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'statements' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "statements_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'statements' and (storage.foldername(name))[1] = (select auth.uid())::text);
