-- ============================================================
-- 0011 — Services serveur : webhooks Stripe, maintenance planifiée
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remboursements : rattachement par l'intention de paiement Stripe.
alter table public.payments add column stripe_payment_intent text check (stripe_payment_intent is null or stripe_payment_intent ~ '^pi_');
create index payments_payment_intent_idx on public.payments (stripe_payment_intent) where stripe_payment_intent is not null;

-- Idempotence des webhooks : true si l'événement n'avait pas encore été traité.
create or replace function public.stripe_event_first_seen(p_id text, p_type text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.stripe_events (id, type) values (p_id, p_type);
  return true;
exception when unique_violation then
  return false;
end;
$$;
revoke all on function public.stripe_event_first_seen(text, text) from public, anon, authenticated;
grant execute on function public.stripe_event_first_seen(text, text) to service_role;

-- ------------------------------------------------------------
-- Maintenance quotidienne (tâches internes à la base).
-- Renvoie la liste des comptes à supprimer pour inactivité : leur
-- suppression (fichiers compris) est faite par l'Edge Function maintenance.
-- ------------------------------------------------------------
create or replace function app_private.run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stuck integer;
  v_coach integer;
  v_logs integer;
  v_reminders integer;
  v_warned integer;
  v_to_delete jsonb;
  v_period text := to_char(now(), 'YYYY-MM');
begin
  -- 1. Reprise après erreur : un traitement bloqué depuis plus de 15 minutes passe en échec (relançable).
  update public.statement_imports set status = 'failed', error_code = 'processing_error'
  where status in ('uploaded', 'processing') and updated_at < now() - interval '15 minutes';
  get diagnostics v_stuck = row_count;

  -- 2. Conservation des conversations du coach selon le choix de chaque utilisateur.
  delete from public.coach_conversations c using public.profiles p
  where p.id = c.user_id and c.updated_at < now() - make_interval(days => p.coach_retention_days);
  get diagnostics v_coach = row_count;

  -- 3. Journaux techniques (90 jours), limites de fréquence, notifications lues (180 jours), usage IA (13 mois).
  delete from public.app_logs where created_at < now() - interval '90 days';
  get diagnostics v_logs = row_count;
  delete from app_private.rate_limits where window_start < now() - interval '2 days';
  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  delete from app_private.ai_usage where day < current_date - 400;

  -- 4. Rappel mensuel (une fois par mois) quand le dernier relevé a plus d'un mois.
  insert into public.notifications (user_id, kind, title, body, link)
  select p.id, 'monthly.reminder', 'C’est le moment de mettre à jour votre bilan',
         'Importez le relevé du mois écoulé pour suivre votre progression.', '/app/releves'
  from public.profiles p
  where p.notify_monthly_reminder
    and p.onboarding_completed_at is not null
    and coalesce((select max(i.period_end) from public.statement_imports i where i.user_id = p.id and i.status in ('needs_review', 'confirmed')),
                 p.onboarding_completed_at::date) < (date_trunc('month', now()) - interval '1 month')::date + 25
    and not exists (select 1 from public.notifications n where n.user_id = p.id and n.kind = 'monthly.reminder' and to_char(n.created_at, 'YYYY-MM') = v_period);
  get diagnostics v_reminders = row_count;

  -- 5. Comptes inactifs depuis 3 ans : prévenance, puis suppression 30 jours plus tard.
  update public.profiles p set inactivity_warned_at = now()
  from auth.users u
  where u.id = p.id and p.inactivity_warned_at is null
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '3 years';
  get diagnostics v_warned = row_count;
  insert into public.notifications (user_id, kind, title, body)
  select p.id, 'account.inactivity_warning', 'Votre compte va être supprimé pour inactivité',
         'Sans connexion de votre part dans les 30 jours, votre compte et vos données seront supprimés.'
  from public.profiles p where p.inactivity_warned_at > now() - interval '1 minute';
  -- Une reconnexion annule la prévenance.
  update public.profiles p set inactivity_warned_at = null
  from auth.users u where u.id = p.id and p.inactivity_warned_at is not null and u.last_sign_in_at > p.inactivity_warned_at;

  select coalesce(jsonb_agg(p.id), '[]') into v_to_delete
  from public.profiles p join auth.users u on u.id = p.id
  where p.inactivity_warned_at < now() - interval '30 days'
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '3 years';

  return jsonb_build_object('stuck_imports_reset', v_stuck, 'coach_conversations_purged', v_coach, 'logs_purged', v_logs,
                            'reminders_created', v_reminders, 'inactivity_warnings', v_warned, 'accounts_to_delete', v_to_delete);
end;
$$;

create or replace function public.run_maintenance()
returns jsonb language sql security definer set search_path = '' as $$ select app_private.run_maintenance() $$;
revoke all on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- Destinataires des emails de la maintenance (rappels, prévenance) : service uniquement.
create or replace function public.maintenance_email_targets(p_since timestamptz)
returns table (user_id uuid, email text, kind text, notify_email boolean)
language sql stable security definer set search_path = '' as $$
  select n.user_id, u.email::text, n.kind, p.notify_email
  from public.notifications n join auth.users u on u.id = n.user_id join public.profiles p on p.id = n.user_id
  where n.created_at >= p_since and n.kind in ('monthly.reminder', 'account.inactivity_warning')
$$;
revoke all on function public.maintenance_email_targets(timestamptz) from public, anon, authenticated;
grant execute on function public.maintenance_email_targets(timestamptz) to service_role;

-- Planification quotidienne (3 h UTC) : appel de l'Edge Function maintenance avec
-- un secret conservé dans le coffre-fort de la base (vault), jamais dans le code.
select cron.schedule(
  'economiz-maintenance-quotidienne',
  '0 3 * * *',
  $cron$
  select net.http_post(
    url := 'https://mfvoxrsbogykerpvvaqn.supabase.co/functions/v1/maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-maintenance-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'maintenance_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
