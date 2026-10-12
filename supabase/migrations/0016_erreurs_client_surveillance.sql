-- Erreurs du navigateur et surveillance continue.

-- 1. Erreurs JavaScript remontées par l'application (journal technique).
--    Messages nettoyés (emails, IBAN, suites de chiffres), taille et fréquence limitées.
create or replace function public.log_client_error(p_code text, p_message text, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'client_error:' || coalesce(auth.uid()::text, 'anonyme');
  v_message text;
begin
  if not app_private.rate_limit_hit(v_key, case when auth.uid() is null then 100 else 20 end, 3600) then return; end if;
  v_message := left(coalesce(p_message, ''), 500);
  v_message := regexp_replace(v_message, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g');
  v_message := regexp_replace(v_message, '[A-Z]{2}[0-9]{2}( ?[A-Z0-9]{4}){2,7}', '[iban]', 'gi');
  v_message := regexp_replace(v_message, '[0-9][0-9 ,.]{5,}[0-9]', '[nombre]', 'g');
  insert into public.app_logs (level, source, code, message, context)
  values ('error', 'frontend', left(coalesce(nullif(p_code, ''), 'client_error'), 80), nullif(v_message, ''),
          jsonb_build_object('path', left(regexp_replace(coalesce(p_path, ''), '[0-9a-f]{8}-[0-9a-f-]{27}', ':id', 'g'), 120), 'authenticated', auth.uid() is not null));
end;
$$;
revoke all on function public.log_client_error(text, text, text) from public;
grant execute on function public.log_client_error(text, text, text) to anon, authenticated;

-- 2. Surveillance toutes les 15 minutes : alerte de l'équipe si les erreurs s'accumulent.
select cron.schedule(
  'economiz-surveillance',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://mfvoxrsbogykerpvvaqn.supabase.co/functions/v1/maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-maintenance-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'maintenance_secret')
    ),
    body := '{"mode":"surveillance"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

-- Indicateurs de surveillance (fenêtre glissante), pour la fonction maintenance.
create or replace function public.monitoring_snapshot(p_minutes integer default 15)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'errors', (select count(*) from public.app_logs where level = 'error' and created_at > now() - make_interval(mins => p_minutes)),
    'frontend_errors', (select count(*) from public.app_logs where level = 'error' and source = 'frontend' and created_at > now() - make_interval(mins => p_minutes)),
    'webhook_errors', (select count(*) from public.app_logs where level = 'error' and source = 'stripe-webhook' and created_at > now() - make_interval(mins => p_minutes)),
    'failed_imports', (select count(*) from public.statement_imports where status = 'failed' and updated_at > now() - make_interval(mins => p_minutes)),
    'top_codes', (select coalesce(jsonb_agg(x), '[]') from (select source || ':' || code as code, count(*) n from public.app_logs
                   where level = 'error' and created_at > now() - make_interval(mins => p_minutes) group by 1 order by 2 desc limit 5) x)
  )
$$;
revoke all on function public.monitoring_snapshot(integer) from public, anon, authenticated;
grant execute on function public.monitoring_snapshot(integer) to service_role;
