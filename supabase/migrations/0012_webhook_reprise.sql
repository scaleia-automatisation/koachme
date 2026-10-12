-- ============================================================
-- 0012 — Reprise des webhooks : un événement en échec n'est pas marqué
-- comme traité, pour que la relance de Stripe le traite à nouveau.
-- ============================================================
create or replace function public.stripe_event_forget(p_id text)
returns void language sql security definer set search_path = '' as $$
  delete from app_private.stripe_events where id = p_id
$$;
revoke all on function public.stripe_event_forget(text) from public, anon, authenticated;
grant execute on function public.stripe_event_forget(text) to service_role;

-- ============================================================
-- Consommation atomique d'un quota mensuel (mois calendaire) :
-- renvoie true et comptabilise si la limite le permet (p_max null = illimité).
-- ============================================================
create or replace function public.usage_try(p_user uuid, p_metric text, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period text := to_char(now(), 'YYYY-MM');
  v_count integer;
begin
  insert into app_private.usage_counters (user_id, metric, period, count) values (p_user, p_metric, v_period, 0)
  on conflict (user_id, metric, period) do nothing;
  update app_private.usage_counters set count = count + 1
  where user_id = p_user and metric = p_metric and period = v_period and (p_max is null or count < p_max)
  returning count into v_count;
  return v_count is not null;
end;
$$;
revoke all on function public.usage_try(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.usage_try(uuid, text, integer) to service_role;
