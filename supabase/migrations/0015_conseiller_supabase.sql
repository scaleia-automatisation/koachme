-- Corrections signalées par le conseiller Supabase.

-- pg_net hors du schéma public (ses fonctions restent dans le schéma « net »,
-- utilisé par la tâche planifiée de maintenance).
drop extension if exists pg_net;
create extension pg_net with schema extensions;

-- Index des clés étrangères.
create index if not exists subscriptions_plan_idx on public.subscriptions (plan_id);
create index if not exists user_roles_granted_by_idx on public.user_roles (granted_by) where granted_by is not null;

-- Une seule politique de lecture des offres par rôle.
drop policy if exists "plans_lecture_publique" on public.plans;
drop policy if exists "plans_admin_select" on public.plans;
create policy "plans_lecture_anon" on public.plans for select to anon using (is_active);
create policy "plans_lecture" on public.plans for select to authenticated using (is_active or (select app_private.has_role('admin')));

-- Table réservée au webhook (clé de service) : aucun accès client, volontairement sans politique.
comment on table public.billing_customers is 'Lien utilisateur ↔ client Stripe. Écrit et lu uniquement par les Edge Functions (clé de service) ; RLS sans politique = aucun accès client.';
