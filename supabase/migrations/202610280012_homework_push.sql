begin;
create table public.hw_push_preference(user_id uuid primary key references public.profiles(id) on delete cascade,reminder_time time not null default '19:00' check(reminder_time between '16:00'::time and '22:00'::time));
create table public.hw_push_subscription(user_id uuid not null references public.profiles(id) on delete cascade,endpoint text not null,subscription jsonb not null,primary key(user_id,endpoint));
create table public.hw_push_delivery(user_id uuid not null references public.profiles(id) on delete cascade,reminder_date date not null,lease_token uuid,lease_until timestamptz,sent_at timestamptz,attempts integer not null default 0,primary key(user_id,reminder_date));
alter table public.hw_push_preference enable row level security;alter table public.hw_push_subscription enable row level security;alter table public.hw_push_delivery enable row level security;
revoke all on public.hw_push_preference,public.hw_push_subscription,public.hw_push_delivery from public,anon,authenticated;
create function public.hw_push_settings(device_endpoint text default '') returns table(reminder_time text,active boolean) language sql stable security definer set search_path='' as $$
 select coalesce((select to_char(p.reminder_time,'HH24:MI') from public.hw_push_preference p where p.user_id=auth.uid()),'19:00'),exists(select 1 from public.hw_push_subscription s where s.user_id=auth.uid() and s.endpoint=device_endpoint) where auth.uid() is not null;$$;
create function public.hw_push_save(device jsonb,remind_at time) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid()) then raise exception 'Anmeldung erforderlich.' using errcode='42501';end if;
 if remind_at is null or remind_at not between '16:00'::time and '22:00'::time or device is null or coalesce(device->>'endpoint','') !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[^[:space:]<>]+$' or char_length(device->>'endpoint')>2048 or coalesce(device->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or coalesce(device->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{16,64}={0,2}$' then raise exception 'Ungültige Push-Anmeldung oder Uhrzeit (16–22 Uhr).' using errcode='22023';end if;
 insert into public.hw_push_preference(user_id,reminder_time) values(auth.uid(),remind_at) on conflict(user_id) do update set reminder_time=excluded.reminder_time;
 insert into public.hw_push_subscription(user_id,endpoint,subscription) values(auth.uid(),device->>'endpoint',jsonb_build_object('endpoint',device->>'endpoint','keys',device->'keys')) on conflict(user_id,endpoint) do update set subscription=excluded.subscription;
end;$$;
create function public.hw_push_remove(device_endpoint text) returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null then raise exception 'Anmeldung erforderlich.' using errcode='42501';end if;delete from public.hw_push_subscription s where s.user_id=auth.uid() and s.endpoint=device_endpoint;end;$$;
create function public.hw_push_claim() returns table(user_id uuid,reminder_date date,lease_token uuid,subscriptions jsonb,task_count bigint) language plpgsql security definer set search_path='' as $$
declare local_now timestamp:=current_timestamp at time zone 'Europe/Berlin';
begin
 insert into public.hw_push_delivery(user_id,reminder_date)
 select p.user_id,local_now::date from public.hw_push_preference p
 where local_now::time>=p.reminder_time and local_now::time<p.reminder_time+interval '1 hour'
 and exists(select 1 from public.hw_push_subscription s where s.user_id=p.user_id)
 and exists(select 1 from public.homework_task t left join public.homework_progress g on g.task_id=t.id and g.user_id=p.user_id where not t.archived and t.due_date=local_now::date+1 and ((not t.is_shared and t.author_id=p.user_id) or (t.is_shared and public.portal_has_role(p.user_id,'user'))) and (not coalesce(g.done,false) or (t.requires_submission and not exists(select 1 from public.homework_submission a where a.task_id=t.id and a.student_id=p.user_id))))
 on conflict on constraint hw_push_delivery_pkey do nothing;
 return query
 with candidates as(select d.user_id,d.reminder_date from public.hw_push_delivery d
 where d.reminder_date=local_now::date and d.sent_at is null and d.attempts<3 and (d.lease_until is null or d.lease_until<now())
 and exists(select 1 from public.hw_push_preference p where p.user_id=d.user_id and local_now::time>=p.reminder_time and local_now::time<p.reminder_time+interval '1 hour')
 order by d.user_id limit 20 for update of d skip locked),
 claimed as(update public.hw_push_delivery d set lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid(),attempts=d.attempts+1
 from candidates selected where d.user_id=selected.user_id and d.reminder_date=selected.reminder_date
 returning d.user_id,d.reminder_date,d.lease_token)
 select c.user_id,c.reminder_date,c.lease_token,(select jsonb_agg(s.subscription) from public.hw_push_subscription s where s.user_id=c.user_id),
 (select count(*) from public.homework_task t left join public.homework_progress g on g.task_id=t.id and g.user_id=c.user_id where not t.archived and t.due_date=local_now::date+1 and ((not t.is_shared and t.author_id=c.user_id) or (t.is_shared and public.portal_has_role(c.user_id,'user'))) and (not coalesce(g.done,false) or (t.requires_submission and not exists(select 1 from public.homework_submission a where a.task_id=t.id and a.student_id=c.user_id)))) from claimed c;
end;$$;
create function public.hw_push_finish(person uuid,day date,token uuid,delivered boolean) returns void language plpgsql security definer set search_path='' as $$
begin update public.hw_push_delivery d set sent_at=case when delivered then now() else null end,lease_until=now()+interval '5 minutes' where d.user_id=person and d.reminder_date=day and d.lease_token=token;end;$$;
revoke all on function public.hw_push_settings(text),public.hw_push_save(jsonb,time),public.hw_push_remove(text) from public,anon,authenticated;
grant execute on function public.hw_push_settings(text),public.hw_push_save(jsonb,time),public.hw_push_remove(text) to authenticated;
revoke all on function public.hw_push_claim(),public.hw_push_finish(uuid,date,uuid,boolean) from public,anon,authenticated;
grant execute on function public.hw_push_claim(),public.hw_push_finish(uuid,date,uuid,boolean) to service_role;
grant select,delete on public.hw_push_subscription to service_role;
commit;
