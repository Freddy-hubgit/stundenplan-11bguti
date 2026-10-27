begin;
create table public.dm_thread (
 id uuid primary key default gen_random_uuid(),
 participant_a uuid not null references public.profiles(id) on delete cascade,
 participant_b uuid not null references public.profiles(id) on delete cascade,
 updated_at timestamptz not null default now(),
 check(participant_a < participant_b), unique(participant_a,participant_b)
);
create table public.dm_message (
 id uuid primary key default gen_random_uuid(),
 thread_id uuid not null references public.dm_thread(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 5000),
 created_at timestamptz not null default clock_timestamp()
);
create index on public.dm_thread(participant_a,updated_at desc);
create index on public.dm_thread(participant_b,updated_at desc);
create index on public.dm_message(thread_id,created_at,id);
alter table public.dm_thread enable row level security;
alter table public.dm_message enable row level security;
revoke all on public.dm_thread,public.dm_message from public,anon,authenticated;

create function public.dm_people() returns table(id uuid,full_name text,role text)
language sql stable security definer set search_path='' as $$
 select p.id,coalesce(nullif(btrim(p.full_name),''),'Nutzer'),p.role::text from public.profiles p
 where p.id<>auth.uid() and p.role in ('user','teacher','support','admin')
 and exists(select 1 from public.profiles me where me.id=auth.uid() and me.role in ('user','teacher','support','admin'))
 order by p.full_name,p.id;
$$;

create function public.dm_open(peer_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); result uuid;
begin
 if caller is null or peer_id is null or caller=peer_id or not exists(
  select 1 from public.profiles p where p.id=caller and p.role in ('user','teacher','support','admin')
 ) or not exists(select 1 from public.profiles p where p.id=peer_id and p.role in ('user','teacher','support','admin')) then
  raise exception 'Chat nicht verfügbar.' using errcode='42501';
 end if;
 insert into public.dm_thread(participant_a,participant_b) values(least(caller,peer_id),greatest(caller,peer_id))
 on conflict(participant_a,participant_b) do nothing;
 select t.id into result from public.dm_thread t where t.participant_a=least(caller,peer_id) and t.participant_b=greatest(caller,peer_id);
 return result;
end;
$$;

create function public.dm_threads() returns table(id uuid,peer_id uuid,peer_name text,peer_role text,updated_at timestamptz,last_message text)
language sql stable security definer set search_path='' as $$
 select t.id,p.id,coalesce(nullif(btrim(p.full_name),''),'Nutzer'),p.role::text,t.updated_at,m.body
 from public.dm_thread t join public.profiles p on p.id=case when t.participant_a=auth.uid() then t.participant_b else t.participant_a end
 left join lateral(select left(message.body,100) body from public.dm_message message where message.thread_id=t.id order by message.created_at desc,message.id desc limit 1)m on true
 where auth.uid() is not null and auth.uid() in (t.participant_a,t.participant_b)
 order by t.updated_at desc,t.id;
$$;

create function public.dm_messages(chat_id uuid) returns table(id uuid,sender_id uuid,sender_name text,body text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select m.id,m.sender_id,coalesce(nullif(btrim(p.full_name),''),'Nutzer'),m.body,m.created_at
 from public.dm_message m join public.dm_thread t on t.id=m.thread_id join public.profiles p on p.id=m.sender_id
 where t.id=chat_id and auth.uid() is not null and auth.uid() in (t.participant_a,t.participant_b)
 order by m.created_at,m.id;
$$;

create function public.dm_send(chat_id uuid,message_body text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Anmeldung erforderlich.' using errcode='42501';end if;
 perform 1 from public.dm_thread t where t.id=chat_id and auth.uid() in (t.participant_a,t.participant_b) for update;
 if not found then raise exception 'Chat nicht verfügbar.' using errcode='42501';end if;
 if message_body is null or char_length(btrim(message_body)) not between 1 and 5000 then
  raise exception 'Nachricht muss zwischen 1 und 5000 Zeichen enthalten.' using errcode='22023';end if;
 insert into public.dm_message(thread_id,sender_id,body) values(chat_id,auth.uid(),btrim(message_body));
 update public.dm_thread t set updated_at=clock_timestamp() where t.id=chat_id;
end;
$$;
revoke all on function public.dm_people(),public.dm_open(uuid),public.dm_threads(),public.dm_messages(uuid),public.dm_send(uuid,text) from public,anon,authenticated;
grant execute on function public.dm_people(),public.dm_open(uuid),public.dm_threads(),public.dm_messages(uuid),public.dm_send(uuid,text) to authenticated;
commit;
