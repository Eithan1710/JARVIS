-- JARVIS scheduler on Supabase Cron (free): calls /api/cron/tick every minute so reminders
-- arrive on time. Run once in Supabase → SQL editor after deploying, replacing the two values.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secrets live in Supabase Vault, not in the job text.
select vault.create_secret('https://YOUR-APP.vercel.app', 'jarvis_url');
select vault.create_secret('YOUR_CRON_SECRET', 'jarvis_cron_secret');

select cron.schedule(
  'jarvis-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'jarvis_url') || '/api/cron/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jarvis_cron_secret'),
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- Check it:   select * from cron.job_run_details order by start_time desc limit 5;
-- Stop it:    select cron.unschedule('jarvis-tick');
