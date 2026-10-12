-- ============================================================
-- 0009 — Abonnements, sécurité, administration (bloc 6)
--
-- Correspondance avec la liste de conception du cahier des charges
-- (docs/architecture/schema.md) : les entités déjà couvertes ne sont pas
-- dupliquées (financial_situations = financial_profiles, budget_entries =
-- income_sources + budget_items, categories = budget_categories,
-- statement_imports = bank_statements, monthly_reports = monthly_snapshots
-- et versions d'analyse). Cette migration ajoute ce qui manque.
-- ============================================================

-- ============================================================
-- 1. Comptes bancaires identifiés
-- ============================================================
create table public.bank_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label       text not null check (length(label) between 1 and 80),
  bank_name   text check (bank_name is null or length(bank_name) between 1 and 80),
  last4       text check (last4 is null or last4 ~ '^[0-9A-Z]{4}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index bank_accounts_identity_idx on public.bank_accounts (user_id, coalesce(bank_name, ''), coalesce(last4, ''), label);
create trigger bank_accounts_updated_at before update on public.bank_accounts for each row execute function app_private.set_updated_at();
alter table public.bank_accounts enable row level security;
revoke all on public.bank_accounts from anon, authenticated;
grant select, delete on public.bank_accounts to authenticated;
grant update (label) on public.bank_accounts to authenticated;
create policy "bank_accounts_select_own" on public.bank_accounts for select to authenticated using (user_id = (select auth.uid()));
create policy "bank_accounts_update_own" on public.bank_accounts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "bank_accounts_delete_own" on public.bank_accounts for delete to authenticated using (user_id = (select auth.uid()));

alter table public.statement_imports add column account_id uuid references public.bank_accounts (id) on delete set null;
create index statement_imports_account_idx on public.statement_imports (account_id) where account_id is not null;

-- Reprise des comptes existants (déduits du libellé de compte des relevés).
insert into public.bank_accounts (user_id, label, bank_name, last4)
select distinct i.user_id, i.account_label, i.bank_name, nullif(substring(i.account_label from '••([0-9A-Z]{4})$'), '')
from public.statement_imports i where i.account_label is not null
on conflict do nothing;
update public.statement_imports i set account_id = a.id
from public.bank_accounts a
where a.user_id = i.user_id and a.label = i.account_label and i.account_id is null;

-- ============================================================
-- 2. Offres, limites et abonnements
-- ============================================================
-- Compteurs d’usage mensuels (exports PDF…), alimentés par le serveur.
create table app_private.usage_counters (
  user_id  uuid not null references auth.users (id) on delete cascade,
  metric   text not null,
  period   text not null,
  count    integer not null default 0,
  primary key (user_id, metric, period)
);

create table public.plans (
  id                     text primary key check (id ~ '^[a-z][a-z_]*$'),
  name                   text not null,
  tagline                text not null,
  monthly_price_cents    integer not null default 0 check (monthly_price_cents >= 0),
  yearly_price_cents     integer check (yearly_price_cents is null or yearly_price_cents >= 0),
  stripe_price_monthly   text check (stripe_price_monthly is null or stripe_price_monthly ~ '^price_'),
  stripe_price_yearly    text check (stripe_price_yearly is null or stripe_price_yearly ~ '^price_'),
  -- Limites appliquées côté serveur (null = sans limite).
  limits                 jsonb not null,
  features               text[] not null default '{}',
  highlighted            boolean not null default false,
  is_active              boolean not null default true,
  sort_order             integer not null default 0,
  updated_at             timestamptz not null default now(),
  constraint plans_limits_shape check (
    limits ? 'max_goals' and limits ? 'statement_imports_per_month' and limits ? 'coach_questions_per_month'
    and limits ? 'pdf_exports_per_month' and limits ? 'monthly_history' and limits ? 'detailed_comparisons' and limits ? 'advanced_recommendations'
  )
);
create trigger plans_updated_at before update on public.plans for each row execute function app_private.set_updated_at();

insert into public.plans (id, name, tagline, monthly_price_cents, yearly_price_cents, limits, features, highlighted, sort_order) values
  ('free', 'Découverte', 'Pour faire un premier point sur votre budget', 0, null,
   '{"max_goals": 1, "statement_imports_per_month": 1, "coach_questions_per_month": 0, "pdf_exports_per_month": 0, "monthly_history": false, "detailed_comparisons": false, "advanced_recommendations": false}',
   array['Saisie manuelle de votre budget', 'Premier bilan et statut de votre situation', 'Catégories de dépenses', '1 relevé analysé par mois', '1 objectif d’épargne', 'Recommandations essentielles'], false, 10),
  ('premium', 'Premium', 'Pour reprendre le contrôle mois après mois', 599, 5990,
   '{"max_goals": 20, "statement_imports_per_month": 20, "coach_questions_per_month": 100, "pdf_exports_per_month": 10, "monthly_history": true, "detailed_comparisons": true, "advanced_recommendations": true}',
   array['Tout Découverte, plus :', 'Import et analyse avancée des relevés (20 par mois)', 'Historique mensuel et comparaisons détaillées', 'Coach IA (100 questions par mois)', 'Recommandations avancées', 'Objectifs et simulations (jusqu’à 20)', 'Export PDF des bilans (10 par mois)'], true, 20);

-- Client Stripe de chaque utilisateur.
create table public.billing_customers (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id  text not null unique check (stripe_customer_id ~ '^cus_'),
  created_at          timestamptz not null default now()
);

create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused');

create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  stripe_subscription_id   text not null unique check (stripe_subscription_id ~ '^sub_'),
  plan_id                  text not null references public.plans (id),
  status                   public.subscription_status not null,
  billing_interval         text not null check (billing_interval in ('month', 'year')),
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  canceled_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id, updated_at desc);
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function app_private.set_updated_at();

create type public.payment_status as enum ('paid', 'open', 'failed', 'refunded', 'partially_refunded', 'void');

create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  stripe_invoice_id    text not null unique check (stripe_invoice_id ~ '^in_'),
  subscription_id      uuid references public.subscriptions (id) on delete set null,
  amount_cents         integer not null check (amount_cents >= 0),
  refunded_cents       integer not null default 0 check (refunded_cents >= 0),
  currency             text not null default 'eur',
  status               public.payment_status not null,
  hosted_invoice_url   text check (hosted_invoice_url is null or hosted_invoice_url ~ '^https://'),
  invoice_pdf_url      text check (invoice_pdf_url is null or invoice_pdf_url ~ '^https://'),
  period_start         timestamptz,
  period_end           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_subscription_idx on public.payments (subscription_id) where subscription_id is not null;
create trigger payments_updated_at before update on public.payments for each row execute function app_private.set_updated_at();

-- Événements Stripe déjà traités (idempotence des webhooks).
create table app_private.stripe_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now()
);

alter table public.plans enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
revoke all on public.plans, public.billing_customers, public.subscriptions, public.payments from anon, authenticated;
grant select on public.plans to anon, authenticated;
grant select on public.subscriptions, public.payments to authenticated;
create policy "plans_lecture_publique" on public.plans for select to anon, authenticated using (is_active);
create policy "subscriptions_select_own" on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "payments_select_own" on public.payments for select to authenticated using (user_id = (select auth.uid()));
-- billing_customers : aucun accès client (service role uniquement).

-- L'offre en vigueur se déduit uniquement des abonnements écrits par le
-- serveur à partir des webhooks Stripe vérifiés, jamais d'une valeur client.
create or replace function app_private.plan_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.plan_id from public.subscriptions s
      where s.user_id = p_user
        and (s.status in ('active', 'trialing', 'past_due')
             or (s.status = 'canceled' and s.current_period_end > now()))
      order by s.updated_at desc limit 1),
    'free')
$$;

create or replace function app_private.limits_of(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select p.limits from public.plans p where p.id = app_private.plan_of(p_user) $$;

-- Droits de l'utilisateur connecté (offre, limites, abonnement).
create or replace function public.my_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', p.id,
    'plan_name', p.name,
    'limits', p.limits,
    'subscription', (
      select jsonb_build_object('status', s.status, 'interval', s.billing_interval, 'current_period_end', s.current_period_end,
                                'cancel_at_period_end', s.cancel_at_period_end, 'plan_id', s.plan_id)
      from public.subscriptions s where s.user_id = auth.uid() order by s.updated_at desc limit 1),
    'usage', jsonb_build_object(
      'goals', (select count(*) from public.savings_goals g where g.user_id = auth.uid()),
      'statement_imports_this_month', (select count(*) from public.statement_imports i where i.user_id = auth.uid()
                                         and i.created_at >= date_trunc('month', now()) and i.status <> 'failed'),
      'coach_questions_this_month', (select coalesce(sum(requests - fallbacks), 0) from app_private.ai_usage u where u.user_id = auth.uid()
                                       and u.day >= date_trunc('month', current_date)::date),
      'pdf_exports_this_month', (select coalesce(sum(c.count), 0) from app_private.usage_counters c where c.user_id = auth.uid()
                                   and c.metric = 'pdf_export' and c.period = to_char(now(), 'YYYY-MM'))
    )
  )
  from public.plans p where p.id = app_private.plan_of(auth.uid())
$$;

-- ============================================================
-- 3. Compteurs d'usage et limites de fréquence
-- ============================================================
create table app_private.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (key, window_start)
);

-- Renvoie true si l'action est autorisée (et la comptabilise), false si la limite est atteinte.
create or replace function app_private.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into app_private.rate_limits (key, window_start, count) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = app_private.rate_limits.count + 1
  returning count into v_count;
  return v_count <= p_max;
end;
$$;

create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language sql security definer set search_path = '' as $$ select app_private.rate_limit_hit(p_key, p_max, p_window_seconds) $$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

create or replace function public.usage_increment(p_user uuid, p_metric text)
returns void language sql security definer set search_path = '' as $$
  insert into app_private.usage_counters (user_id, metric, period, count) values (p_user, p_metric, to_char(now(), 'YYYY-MM'), 1)
  on conflict (user_id, metric, period) do update set count = app_private.usage_counters.count + 1
$$;
revoke all on function public.usage_increment(uuid, text) from public, anon, authenticated;
grant execute on function public.usage_increment(uuid, text) to service_role;

create or replace function public.plan_limits_of(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select jsonb_build_object('plan', app_private.plan_of(p_user), 'limits', app_private.limits_of(p_user)) $$;
revoke all on function public.plan_limits_of(uuid) from public, anon, authenticated;
grant execute on function public.plan_limits_of(uuid) to service_role;

-- Limite d'objectifs appliquée par la base, quelle que soit l'origine de la requête.
create or replace function app_private.enforce_goal_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer := (app_private.limits_of(new.user_id) ->> 'max_goals')::integer;
begin
  if v_max is not null and (select count(*) from public.savings_goals where user_id = new.user_id) >= v_max then
    raise exception 'plan_limit_goals' using errcode = 'P0001', hint = 'Limite d’objectifs de votre offre atteinte';
  end if;
  return new;
end;
$$;
create trigger savings_goals_plan_limit before insert on public.savings_goals for each row execute function app_private.enforce_goal_limit();

-- Anti-abus du formulaire de contact : 5 messages par heure et par adresse email.
create or replace function app_private.limit_contact_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.rate_limit_hit('contact:' || lower(new.email), 5, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001', hint = 'Trop de messages, réessayez plus tard';
  end if;
  return new;
end;
$$;
create trigger contact_messages_rate_limit before insert on public.contact_messages for each row execute function app_private.limit_contact_messages();

-- ============================================================
-- 4. Rôles et administration
-- ============================================================
create type public.staff_role as enum ('support', 'admin');

create table public.user_roles (
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.staff_role not null,
  granted_by  uuid references auth.users (id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function app_private.has_role(p_role public.staff_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- L'administrateur dispose aussi des droits de support.
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and (r.role = p_role or r.role = 'admin'))
$$;
grant usage on schema app_private to authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.has_role(public.staff_role) to authenticated;

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
create policy "user_roles_select" on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.has_role('admin')));

create or replace function public.my_roles()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(role::text order by role), '{}') from public.user_roles where user_id = auth.uid()
$$;

-- Administration des offres et limites (prix, identifiants Stripe, limites).
grant update (name, tagline, monthly_price_cents, yearly_price_cents, stripe_price_monthly, stripe_price_yearly, limits, features, highlighted, is_active, sort_order) on public.plans to authenticated;
create policy "plans_admin_update" on public.plans for update to authenticated
  using ((select app_private.has_role('admin'))) with check ((select app_private.has_role('admin')));
create policy "plans_admin_select" on public.plans for select to authenticated using ((select app_private.has_role('admin')));

-- ============================================================
-- 5. Journal d'audit, journal technique, notifications
-- ============================================================
create table public.audit_logs (
  id              bigint generated always as identity primary key,
  actor_id        uuid references auth.users (id) on delete set null,
  action          text not null check (action ~ '^[a-z_.]+$'),
  target_user_id  uuid references auth.users (id) on delete set null,
  -- Métadonnées minimisées : jamais de donnée bancaire ni de contenu de relevé.
  metadata        jsonb not null default '{}' check (pg_column_size(metadata) < 4000),
  created_at      timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id) where actor_id is not null;
create index audit_logs_target_idx on public.audit_logs (target_user_id) where target_user_id is not null;
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
-- L'utilisateur consulte les événements de sécurité de son compte ; l'administrateur, tous.
create policy "audit_logs_select" on public.audit_logs for select to authenticated
  using (actor_id = (select auth.uid()) or target_user_id = (select auth.uid()) or (select app_private.has_role('admin')));

create or replace function app_private.audit(p_actor uuid, p_action text, p_target uuid, p_metadata jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, target_user_id, metadata) values (p_actor, p_action, p_target, coalesce(p_metadata, '{}'))
$$;

-- Événements de sécurité déclarés par le client (liste fermée).
create or replace function public.log_security_event(p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_action not in ('auth.password_changed', 'auth.mfa_enabled', 'auth.mfa_disabled', 'auth.sessions_revoked', 'data.export') then
    raise exception 'invalid_event';
  end if;
  if not app_private.rate_limit_hit('audit:' || auth.uid()::text, 30, 3600) then raise exception 'rate_limited'; end if;
  perform app_private.audit(auth.uid(), p_action, auth.uid(), '{}');
end;
$$;

create or replace function public.audit_event(p_actor uuid, p_action text, p_target uuid, p_metadata jsonb)
returns void language sql security definer set search_path = '' as $$ select app_private.audit(p_actor, p_action, p_target, p_metadata) $$;
revoke all on function public.audit_event(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.audit_event(uuid, text, uuid, jsonb) to service_role;

-- Journal technique : erreurs des services, sans donnée bancaire ni personnelle.
create table public.app_logs (
  id          bigint generated always as identity primary key,
  level       text not null check (level in ('info', 'warn', 'error')),
  source      text not null check (length(source) <= 60),
  code        text not null check (length(code) <= 80),
  message     text check (message is null or length(message) <= 500),
  context     jsonb not null default '{}' check (pg_column_size(context) < 2000),
  created_at  timestamptz not null default now()
);
create index app_logs_created_idx on public.app_logs (created_at desc);
alter table public.app_logs enable row level security;
revoke all on public.app_logs from anon, authenticated;
grant select on public.app_logs to authenticated;
create policy "app_logs_staff_select" on public.app_logs for select to authenticated using ((select app_private.has_role('support')));

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind ~ '^[a-z_.]+$'),
  title       text not null check (length(title) between 1 and 120),
  body        text check (body is null or length(body) <= 500),
  link        text check (link is null or link ~ '^/app'),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "notifications_select_own" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications_update_own" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications_delete_own" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- Notification à la fin du traitement d'un relevé (succès ou échec).
create or replace function app_private.notify_import_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('needs_review', 'failed') then
    insert into public.notifications (user_id, kind, title, body, link)
    values (
      new.user_id,
      case when new.status = 'failed' then 'import.failed' else 'import.ready' end,
      case when new.status = 'failed' then 'L’analyse de votre relevé a échoué' else 'Votre relevé est prêt à être vérifié' end,
      left(new.file_name, 200),
      case when new.status = 'failed' then '/app/releves' else '/app/releves/' || new.id end
    );
  end if;
  return new;
end;
$$;
create trigger statement_imports_notify after update of status on public.statement_imports for each row execute function app_private.notify_import_result();

-- ============================================================
-- 6. FAQ éditable et demandes de support
-- ============================================================
create table public.faq_items (
  id            uuid primary key default gen_random_uuid(),
  section       text not null check (length(section) between 1 and 60),
  question      text not null check (length(question) between 5 and 200),
  answer        text not null check (length(answer) between 5 and 2000),
  sort_order    integer not null default 0,
  is_published  boolean not null default true,
  updated_at    timestamptz not null default now()
);
create trigger faq_items_updated_at before update on public.faq_items for each row execute function app_private.set_updated_at();
alter table public.faq_items enable row level security;
revoke all on public.faq_items from anon, authenticated;
grant select on public.faq_items to anon, authenticated;
grant insert, update, delete on public.faq_items to authenticated;
create policy "faq_public_select" on public.faq_items for select to anon, authenticated using (is_published or (select app_private.has_role('admin')));
create policy "faq_admin_insert" on public.faq_items for insert to authenticated with check ((select app_private.has_role('admin')));
create policy "faq_admin_update" on public.faq_items for update to authenticated using ((select app_private.has_role('admin'))) with check ((select app_private.has_role('admin')));
create policy "faq_admin_delete" on public.faq_items for delete to authenticated using ((select app_private.has_role('admin')));

create type public.support_status as enum ('new', 'in_progress', 'resolved');
alter table public.contact_messages
  add column status public.support_status not null default 'new',
  add column assigned_to uuid references auth.users (id) on delete set null,
  add column internal_note text check (internal_note is null or length(internal_note) <= 2000),
  add column resolved_at timestamptz;
create index contact_messages_status_idx on public.contact_messages (status, created_at desc);
create index contact_messages_assigned_idx on public.contact_messages (assigned_to) where assigned_to is not null;
grant select on public.contact_messages to authenticated;
grant update (status, assigned_to, internal_note, resolved_at) on public.contact_messages to authenticated;
create policy "contact_staff_select" on public.contact_messages for select to authenticated using ((select app_private.has_role('support')));
create policy "contact_staff_update" on public.contact_messages for update to authenticated using ((select app_private.has_role('support'))) with check ((select app_private.has_role('support')));

-- ============================================================
-- 7. Accès exceptionnel de l'assistance (consenti, limité, tracé)
-- ============================================================
create table public.support_access_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason      text not null check (length(reason) between 3 and 300),
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz not null check (expires_at <= granted_at + interval '7 days'),
  revoked_at  timestamptz
);
create index support_access_grants_user_idx on public.support_access_grants (user_id, expires_at desc);
alter table public.support_access_grants enable row level security;
revoke all on public.support_access_grants from anon, authenticated;
grant select, insert on public.support_access_grants to authenticated;
grant update (revoked_at) on public.support_access_grants to authenticated;
create policy "grants_select" on public.support_access_grants for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.has_role('support')));
create policy "grants_insert_own" on public.support_access_grants for insert to authenticated
  with check (user_id = (select auth.uid()) and expires_at > now());
create policy "grants_revoke_own" on public.support_access_grants for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function app_private.audit_grant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform app_private.audit(new.user_id, 'support.access_granted', new.user_id, jsonb_build_object('expires_at', new.expires_at));
  elsif new.revoked_at is not null and old.revoked_at is null then
    perform app_private.audit(new.user_id, 'support.access_revoked', new.user_id, '{}');
  end if;
  return new;
end;
$$;
create trigger support_access_grants_audit after insert or update on public.support_access_grants for each row execute function app_private.audit_grant();

-- Vue d'assistance d'un utilisateur : uniquement avec son accord en cours,
-- uniquement des métadonnées (jamais le contenu des relevés ni les opérations),
-- et chaque consultation est journalisée.
create or replace function public.support_user_overview(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not app_private.has_role('support') then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.support_access_grants g where g.user_id = p_user and g.revoked_at is null and g.expires_at > now()) then
    raise exception 'no_active_grant';
  end if;
  perform app_private.audit(auth.uid(), 'support.user_viewed', p_user, '{}');
  select jsonb_build_object(
    'email', (select email from auth.users where id = p_user),
    'created_at', (select created_at from auth.users where id = p_user),
    'plan', app_private.plan_of(p_user),
    'onboarding_path', (select onboarding_path from public.profiles where id = p_user),
    'imports', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'error_code', i.error_code, 'created_at', i.created_at,
                          'period_start', i.period_start, 'period_end', i.period_end, 'operations_count', i.operations_count,
                          'balance_check', i.balance_check, 'extraction_method', i.extraction_method, 'attempts', i.extraction_attempts) order by i.created_at desc)
                         from public.statement_imports i where i.user_id = p_user), '[]'),
    'budget_lines', (select count(*) from public.budget_entries where user_id = p_user),
    'goals', (select count(*) from public.savings_goals where user_id = p_user),
    'grant_expires_at', (select max(expires_at) from public.support_access_grants where user_id = p_user and revoked_at is null)
  ) into v_result;
  return v_result;
end;
$$;

-- ============================================================
-- 8. Préférences de conservation et inactivité
-- ============================================================
alter table public.profiles
  add column coach_retention_days integer not null default 365 check (coach_retention_days in (30, 90, 365, 730)),
  add column inactivity_warned_at timestamptz;
grant update (coach_retention_days) on public.profiles to authenticated;

-- L'offre ne se lit plus dans le profil : elle découle des abonnements vérifiés.
alter table public.profiles drop column plan;

-- ============================================================
-- 9. Fonctions d'administration (contrôle du rôle côté base)
-- ============================================================
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.has_role('support') then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'signups_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'signups_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'subscriptions_active', (select count(*) from public.subscriptions where status in ('active', 'trialing')),
    'subscriptions_past_due', (select count(*) from public.subscriptions where status = 'past_due'),
    'mrr_cents', (select coalesce(sum(case when s.billing_interval = 'year' then coalesce(p.yearly_price_cents, 0) / 12 else p.monthly_price_cents end), 0)
                  from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status in ('active', 'trialing', 'past_due')),
    'imports_30d', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.statement_imports where created_at > now() - interval '30 days' group by status) x),
    'coach_requests_30d', (select coalesce(sum(requests), 0) from app_private.ai_usage where day > current_date - 30),
    'coach_tokens_30d', (select coalesce(sum(tokens), 0) from app_private.ai_usage where day > current_date - 30),
    'goals_total', (select count(*) from public.savings_goals),
    'support_open', (select count(*) from public.contact_messages where status <> 'resolved'),
    'errors_24h', (select count(*) from public.app_logs where level = 'error' and created_at > now() - interval '24 hours')
  );
end;
$$;

create or replace function public.admin_signups_series(p_days integer default 30)
returns table (day date, signups bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.has_role('support') then raise exception 'forbidden'; end if;
  return query select d::date, (select count(*) from auth.users u where u.created_at::date = d::date)
    from generate_series(current_date - (least(p_days, 365) - 1), current_date, interval '1 day') d;
end;
$$;

create or replace function public.admin_ai_usage(p_days integer default 30)
returns table (day date, requests bigint, tokens bigint, fallbacks bigint, users bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.has_role('support') then raise exception 'forbidden'; end if;
  return query select u.day, sum(u.requests)::bigint, sum(u.tokens)::bigint, sum(u.fallbacks)::bigint, count(distinct u.user_id)
    from app_private.ai_usage u where u.day > current_date - least(p_days, 365) group by u.day order by u.day;
end;
$$;

create or replace function public.admin_failed_imports(p_limit integer default 50)
returns table (id uuid, created_at timestamptz, error_code text, attempts smallint, file_size integer, extraction_method public.extraction_method, user_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.has_role('support') then raise exception 'forbidden'; end if;
  return query select i.id, i.created_at, i.error_code, i.extraction_attempts, i.file_size, i.extraction_method, i.user_id
    from public.statement_imports i where i.status = 'failed' order by i.created_at desc limit least(p_limit, 200);
end;
$$;

create or replace function public.admin_find_user(p_email text)
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, plan text, has_active_grant boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.has_role('support') then raise exception 'forbidden'; end if;
  perform app_private.audit(auth.uid(), 'admin.user_search', null, '{}');
  return query select u.id, u.email::text, u.created_at, u.last_sign_in_at, app_private.plan_of(u.id),
    exists (select 1 from public.support_access_grants g where g.user_id = u.id and g.revoked_at is null and g.expires_at > now())
    from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
end;
$$;

create or replace function public.admin_staff()
returns table (user_id uuid, email text, role public.staff_role, granted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.has_role('admin') then raise exception 'forbidden'; end if;
  return query select r.user_id, u.email::text, r.role, r.granted_at from public.user_roles r join auth.users u on u.id = r.user_id order by r.granted_at;
end;
$$;

create or replace function public.admin_set_role(p_email text, p_role public.staff_role, p_grant boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not app_private.has_role('admin') then raise exception 'forbidden'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'user_not_found'; end if;
  if not p_grant and v_user = auth.uid() and p_role = 'admin' then raise exception 'cannot_revoke_self'; end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (v_user, p_role, auth.uid()) on conflict do nothing;
  else
    delete from public.user_roles where user_id = v_user and role = p_role;
  end if;
  perform app_private.audit(auth.uid(), case when p_grant then 'admin.role_granted' else 'admin.role_revoked' end, v_user, jsonb_build_object('role', p_role));
end;
$$;

-- Les fonctions d'administration vérifient elles-mêmes le rôle ; inaccessibles aux visiteurs.
revoke all on function public.my_entitlements(), public.my_roles(), public.log_security_event(text), public.support_user_overview(uuid),
  public.admin_overview(), public.admin_signups_series(integer), public.admin_ai_usage(integer), public.admin_failed_imports(integer),
  public.admin_find_user(text), public.admin_staff(), public.admin_set_role(text, public.staff_role, boolean) from public, anon;
grant execute on function public.my_entitlements(), public.my_roles(), public.log_security_event(text), public.support_user_overview(uuid),
  public.admin_overview(), public.admin_signups_series(integer), public.admin_ai_usage(integer), public.admin_failed_imports(integer),
  public.admin_find_user(text), public.admin_staff(), public.admin_set_role(text, public.staff_role, boolean) to authenticated;
