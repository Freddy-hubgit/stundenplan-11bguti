-- First deploy portal-notifications and enter its secrets securely in Supabase.
-- Add the SAME random HOMEWORK_CRON_SECRET in Vault as homework_reminder_secret.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$begin
 if not exists(select 1 from vault.decrypted_secrets where name='homework_reminder_secret' and decrypted_secret<>'') then raise exception 'Bitte zuerst homework_reminder_secret im Supabase Vault anlegen.';end if;
 perform cron.unschedule(jobid) from cron.job where jobname='portal-change-notifications';
 perform cron.schedule('portal-change-notifications','* * * * *',$job$
  select net.http_post(url:='https://amwowtaxrgfcojlsxhzk.supabase.co/functions/v1/portal-notifications',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='homework_reminder_secret' limit 1)),
   body:='{"action":"send"}'::jsonb,timeout_milliseconds:=60000);
 $job$);
end$$;
