begin;
create table public.portal_push_subscription(user_id uuid not null references public.profiles(id) on delete cascade,endpoint text not null,subscription jsonb not null,created_at timestamptz not null default now(),primary key(user_id,endpoint));
create table public.portal_push_delivery(notification_id uuid primary key references public.portal_notification(id) on delete cascade,lease_token uuid,lease_until timestamptz,sent_at timestamptz,attempts integer not null default 0);
alter table public.portal_push_subscription enable row level security;alter table public.portal_push_delivery enable row level security;
revoke all on public.portal_push_subscription,public.portal_push_delivery from public,anon,authenticated;
create function public.portal_push_settings(device_endpoint text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.portal_push_subscription s where s.user_id=auth.uid() and s.endpoint=device_endpoint);
$$;
create function public.portal_push_save(device jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Anmeldung erforderlich.' using errcode='42501';end if;
 if device is null or coalesce(device->>'endpoint','') !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[^[:space:]<>]+$' or char_length(device->>'endpoint')>2048 or coalesce(device->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or coalesce(device->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{16,64}={0,2}$' then raise exception 'Ungültige Push-Anmeldung.' using errcode='22023';end if;
 insert into public.portal_push_subscription(user_id,endpoint,subscription) values(auth.uid(),device->>'endpoint',jsonb_build_object('endpoint',device->>'endpoint','keys',device->'keys')) on conflict(user_id,endpoint) do update set subscription=excluded.subscription;
end;$$;
create function public.portal_push_remove(device_endpoint text) returns void language sql security definer set search_path='' as $$
 delete from public.portal_push_subscription where user_id=auth.uid() and endpoint=device_endpoint;
$$;
create function public.portal_push_claim() returns table(notification_id uuid,user_id uuid,title text,body text,route text,lease_token uuid,subscriptions jsonb)
language plpgsql security definer set search_path='' as $$
begin
 insert into public.portal_push_delivery(notification_id)
 select n.id from public.portal_notification n where n.read_at is null and n.created_at>now()-interval '1 day'
 and exists(select 1 from public.portal_push_subscription s where s.user_id=n.user_id and s.created_at<=n.created_at)
 on conflict on constraint portal_push_delivery_pkey do nothing;
 return query
 with candidates as(select d.notification_id from public.portal_push_delivery d join public.portal_notification n on n.id=d.notification_id
 where d.sent_at is null and d.attempts<3 and (d.lease_until is null or d.lease_until<now()) and n.read_at is null and n.created_at>now()-interval '1 day'
 and exists(select 1 from public.portal_push_subscription s where s.user_id=n.user_id and s.created_at<=n.created_at)
 order by n.created_at,d.notification_id limit 40 for update of d skip locked),
 claimed as(update public.portal_push_delivery d set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=d.attempts+1
 from candidates c where d.notification_id=c.notification_id returning d.notification_id,d.lease_token)
 select n.id,n.user_id,n.title,case when n.route='/krankmeldung' then 'Eine neue Meldung liegt vor. Bitte im Schulportal prüfen.' else n.body end,n.route,c.lease_token,
 (select jsonb_agg(s.subscription) from public.portal_push_subscription s where s.user_id=n.user_id and s.created_at<=n.created_at)
 from claimed c join public.portal_notification n on n.id=c.notification_id;
end;$$;
create function public.portal_push_finish(notification uuid,token uuid,delivered boolean) returns void language sql security definer set search_path='' as $$
 update public.portal_push_delivery set sent_at=case when delivered then now() else null end,lease_until=now()+interval '5 minutes'
 where notification_id=notification and lease_token=token;
$$;
revoke all on function public.portal_push_settings(text),public.portal_push_save(jsonb),public.portal_push_remove(text),public.portal_push_claim(),public.portal_push_finish(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.portal_push_settings(text),public.portal_push_save(jsonb),public.portal_push_remove(text) to authenticated;
grant execute on function public.portal_push_claim(),public.portal_push_finish(uuid,uuid,boolean) to service_role;
grant select,delete on public.portal_push_subscription to service_role;
commit;
