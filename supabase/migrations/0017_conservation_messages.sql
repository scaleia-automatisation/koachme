-- Conservation des messages adressés à l'assistance : 3 ans après leur envoi
-- (politique de confidentialité). Purge quotidienne à 3 h 30 UTC.
select cron.schedule(
  'economiz-purge-messages-assistance',
  '30 3 * * *',
  $cron$ delete from public.contact_messages where created_at < now() - interval '3 years' $cron$
);
