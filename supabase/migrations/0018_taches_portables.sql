-- Tâches planifiées indépendantes du projet : l'adresse des Edge Functions est
-- lue dans le coffre-fort (vault.project_url, posé par npm run secrets:sync),
-- comme le secret de maintenance. Le même schéma se déploie ainsi sur un
-- projet de production sans modification.
select cron.unschedule('economiz-maintenance-quotidienne');
select cron.unschedule('economiz-surveillance');

select cron.schedule(
  'economiz-maintenance-quotidienne',
  '0 3 * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-maintenance-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'maintenance_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

select cron.schedule(
  'economiz-surveillance',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-maintenance-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'maintenance_secret')
    ),
    body := '{"mode":"surveillance"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
