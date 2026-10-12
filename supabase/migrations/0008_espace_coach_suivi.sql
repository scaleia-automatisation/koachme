-- ============================================================
-- 0008 — Espace utilisateur, coach IA et suivi mensuel (blocs 4 et 5)
-- ============================================================

-- ---------- Préférences du profil ----------
alter table public.profiles
  add column currency text not null default 'EUR' check (currency in ('EUR')),
  add column locale text not null default 'fr-FR' check (locale in ('fr-FR', 'fr-BE', 'fr-CH', 'fr-CA')),
  add column notify_monthly_reminder boolean not null default true,
  add column notify_email boolean not null default false,
  -- Offre : modifiée uniquement par le serveur (facturation), jamais par le client.
  add column plan text not null default 'free' check (plan in ('free', 'essential', 'premium'));

grant update (currency, locale, notify_monthly_reminder, notify_email) on public.profiles to authenticated;

-- ---------- Relevés : empreinte du fichier (détection des fichiers déjà importés) ----------
alter table public.statement_imports add column file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$');
create unique index statement_imports_user_sha_idx on public.statement_imports (user_id, file_sha256) where file_sha256 is not null;
grant insert (file_path, file_name, file_size, file_sha256) on public.statement_imports to authenticated;

-- ---------- Opérations : corrections de l'utilisateur (l'extraction d'origine est conservée) ----------
alter table public.transactions
  add column user_amount_cents bigint check (user_amount_cents is null or user_amount_cents <> 0),
  add column user_op_date date,
  add column user_label text check (user_label is null or length(user_label) between 1 and 300);
grant update (user_amount_cents, user_op_date, user_label) on public.transactions to authenticated;

-- ---------- Objectifs : type, contribution périodique, contributions confirmées ----------
create type public.goal_kind as enum ('emergency_fund', 'purchase', 'vacation', 'debt_reduction', 'unexpected_reserve', 'other');

alter table public.savings_goals
  add column kind public.goal_kind not null default 'other',
  add column monthly_contribution_cents bigint check (monthly_contribution_cents is null or monthly_contribution_cents between 1 and 100000000000);

create table public.goal_contributions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id         uuid not null references public.savings_goals (id) on delete cascade,
  amount_cents    bigint not null check (amount_cents <> 0 and abs(amount_cents) <= 100000000000),
  contributed_on  date not null default current_date,
  -- Opération bancaire associée par l'utilisateur (jamais automatiquement).
  transaction_id  uuid references public.transactions (id) on delete set null,
  note            text check (note is null or length(note) <= 120),
  created_at      timestamptz not null default now(),
  unique (goal_id, transaction_id)
);
create index goal_contributions_goal_idx on public.goal_contributions (goal_id);
create index goal_contributions_user_idx on public.goal_contributions (user_id);
create index goal_contributions_tx_idx on public.goal_contributions (transaction_id) where transaction_id is not null;
alter table public.goal_contributions enable row level security;
revoke all on public.goal_contributions from anon, authenticated;
grant select, insert, delete on public.goal_contributions to authenticated;
create policy "goal_contributions_select_own" on public.goal_contributions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "goal_contributions_insert_own" on public.goal_contributions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.savings_goals g where g.id = goal_id and g.user_id = (select auth.uid()))
    and (transaction_id is null or exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = (select auth.uid())))
  );
create policy "goal_contributions_delete_own" on public.goal_contributions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- Suivi des recommandations ----------
create type public.action_status as enum ('todo', 'in_progress', 'done', 'dismissed');

create table public.recommendation_actions (
  user_id                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rec_key                 text not null check (length(rec_key) between 2 and 120),
  status                  public.action_status not null default 'todo',
  -- Économie mensuelle réellement constatée, déclarée par l'utilisateur (jamais déduite automatiquement).
  confirmed_saving_cents  bigint check (confirmed_saving_cents is null or confirmed_saving_cents between 0 and 100000000000),
  updated_at              timestamptz not null default now(),
  primary key (user_id, rec_key)
);
create trigger recommendation_actions_updated_at before update on public.recommendation_actions
  for each row execute function app_private.set_updated_at();
alter table public.recommendation_actions enable row level security;
revoke all on public.recommendation_actions from anon, authenticated;
grant select, insert, update, delete on public.recommendation_actions to authenticated;
create policy "recommendation_actions_all_own" on public.recommendation_actions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Avis de l'utilisateur sur ses paiements récurrents ----------
create type public.subscription_verdict as enum ('useful', 'to_cancel', 'cancelled');

create table public.subscription_reviews (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  merchant_key  text not null check (length(merchant_key) between 2 and 120),
  verdict       public.subscription_verdict not null,
  updated_at    timestamptz not null default now(),
  primary key (user_id, merchant_key)
);
create trigger subscription_reviews_updated_at before update on public.subscription_reviews
  for each row execute function app_private.set_updated_at();
alter table public.subscription_reviews enable row level security;
revoke all on public.subscription_reviews from anon, authenticated;
grant select, insert, update, delete on public.subscription_reviews to authenticated;
create policy "subscription_reviews_all_own" on public.subscription_reviews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Bilans mensuels (instantanés) ----------
create table public.monthly_reports (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period      text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  snapshot    jsonb not null check (pg_column_size(snapshot) < 200000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, period)
);
create trigger monthly_reports_updated_at before update on public.monthly_reports
  for each row execute function app_private.set_updated_at();
alter table public.monthly_reports enable row level security;
revoke all on public.monthly_reports from anon, authenticated;
grant select, insert, update, delete on public.monthly_reports to authenticated;
create policy "monthly_reports_all_own" on public.monthly_reports for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Coach IA ----------
create table public.coach_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (length(title) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index coach_conversations_user_idx on public.coach_conversations (user_id, updated_at desc);
create trigger coach_conversations_updated_at before update on public.coach_conversations
  for each row execute function app_private.set_updated_at();

create table public.coach_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.coach_conversations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null check (length(content) between 1 and 8000),
  -- Réponse structurée : faits, estimations, suggestions, actions, liens, période utilisée.
  structured       jsonb,
  is_fallback      boolean not null default false,
  created_at       timestamptz not null default now()
);
create index coach_messages_conversation_idx on public.coach_messages (conversation_id, created_at);
create index coach_messages_user_idx on public.coach_messages (user_id);

-- Lecture et suppression par le propriétaire ; écriture réservée à l'Edge Function (service role).
alter table public.coach_conversations enable row level security;
alter table public.coach_messages enable row level security;
revoke all on public.coach_conversations from anon, authenticated;
revoke all on public.coach_messages from anon, authenticated;
grant select, delete on public.coach_conversations to authenticated;
grant select on public.coach_messages to authenticated;
create policy "coach_conversations_select_own" on public.coach_conversations for select to authenticated using (user_id = (select auth.uid()));
create policy "coach_conversations_delete_own" on public.coach_conversations for delete to authenticated using (user_id = (select auth.uid()));
create policy "coach_messages_select_own" on public.coach_messages for select to authenticated using (user_id = (select auth.uid()));

-- Consommation de l'IA (quotas et maîtrise des coûts) : jamais exposée au client.
create table app_private.ai_usage (
  user_id     uuid not null references auth.users (id) on delete cascade,
  day         date not null default current_date,
  requests    integer not null default 0,
  tokens      integer not null default 0,
  fallbacks   integer not null default 0,
  primary key (user_id, day)
);

-- Comptage atomique d'une requête du coach ; renvoie l'usage du mois et du jour (tous utilisateurs).
create or replace function app_private.record_ai_request(p_user uuid, p_tokens integer, p_fallback boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app_private.ai_usage (user_id, day, requests, tokens, fallbacks)
  values (p_user, current_date, 1, greatest(p_tokens, 0), case when p_fallback then 1 else 0 end)
  on conflict (user_id, day) do update
    set requests = app_private.ai_usage.requests + 1,
        tokens = app_private.ai_usage.tokens + greatest(p_tokens, 0),
        fallbacks = app_private.ai_usage.fallbacks + case when p_fallback then 1 else 0 end;
$$;

create or replace function app_private.ai_usage_summary(p_user uuid)
returns table (user_month_requests bigint, global_day_tokens bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select coalesce(sum(requests - fallbacks), 0) from app_private.ai_usage where user_id = p_user and day >= date_trunc('month', current_date)::date),
    (select coalesce(sum(tokens), 0) from app_private.ai_usage where day = current_date);
$$;

revoke all on function app_private.record_ai_request(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function app_private.ai_usage_summary(uuid) from public, anon, authenticated;

-- Points d'entrée RPC pour l'Edge Function uniquement (service role).
create or replace function public.coach_record_usage(p_user uuid, p_tokens integer, p_fallback boolean)
returns void language sql security definer set search_path = '' as $$ select app_private.record_ai_request(p_user, p_tokens, p_fallback) $$;
create or replace function public.coach_usage_summary(p_user uuid)
returns table (user_month_requests bigint, global_day_tokens bigint) language sql stable security definer set search_path = '' as $$ select * from app_private.ai_usage_summary(p_user) $$;
revoke all on function public.coach_record_usage(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.coach_usage_summary(uuid) from public, anon, authenticated;
grant execute on function public.coach_record_usage(uuid, integer, boolean) to service_role;
grant execute on function public.coach_usage_summary(uuid) to service_role;
