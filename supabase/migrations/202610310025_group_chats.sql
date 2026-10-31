begin;
create table public.chat_group(id uuid primary key default gen_random_uuid(),name text not null check(char_length(btrim(name)) between 1 and 100),owner_id uuid not null references public.profiles(id) on delete cascade,created_at timestamptz not null default now());
create table public.chat_member(group_id uuid not null references public.chat_group(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,joined_at timestamptz not null default now(),read_at timestamptz not null default '-infinity',primary key(group_id,user_id));
create table public.chat_group_message(id uuid primary key default gen_random_uuid(),group_id uuid not null references public.chat_group(id) on delete cascade,sender_id uuid references public.profiles(id) on delete set null,body text not null check(char_length(btrim(body)) between 1 and 5000),created_at timestamptz not null default clock_timestamp());
create index on public.chat_group_message(group_id,created_at,id);
alter table public.chat_group enable row level security;alter table public.chat_member enable row level security;alter table public.chat_group_message enable row level security;
revoke all on public.chat_group,public.chat_member,public.chat_group_message from public,anon,authenticated;
create function public.chat_is_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.chat_member where group_id=target and user_id=auth.uid());$$;
revoke all on function public.chat_is_member(uuid) from public,anon,authenticated;
create function public.chat_groups() returns table(id uuid,name text,owner_id uuid,member_count bigint,unread bigint) language sql stable security definer set search_path='' as $$
 select g.id,g.name,g.owner_id,(select count(*) from public.chat_member m where m.group_id=g.id),(select count(*) from public.chat_group_message msg join public.chat_member me on me.group_id=msg.group_id and me.user_id=auth.uid() where msg.group_id=g.id and msg.sender_id is distinct from auth.uid() and msg.created_at>me.read_at) from public.chat_group g where public.chat_is_member(g.id) order by g.name,g.id;$$;
create function public.chat_group_start(label text,people uuid[],message_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;members uuid[];
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 select array_agg(distinct p) into members from unnest(array_append(coalesce(people,'{}'),auth.uid())) p;
 if label is null or char_length(btrim(label)) not between 1 and 100 or cardinality(members) not between 2 and 50 or exists(select 1 from unnest(members) m where m is null or not exists(select 1 from public.profiles where id=m)) then raise exception 'Gruppenname und 2–50 gültige Mitglieder erforderlich.';end if;
 if message_body is null or char_length(btrim(message_body)) not between 1 and 5000 then raise exception 'Eine erste Nachricht ist erforderlich.';end if;
 insert into public.chat_group(name,owner_id) values(btrim(label),auth.uid()) returning id into target;
 insert into public.chat_member(group_id,user_id) select target,unnest(members);
 insert into public.chat_group_message(group_id,sender_id,body) values(target,auth.uid(),btrim(message_body));return target;
end;$$;
create function public.chat_group_messages(target uuid) returns table(id uuid,sender_id uuid,sender_name text,body text,created_at timestamptz) language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(hashtextextended(target::text,84));
 if not public.chat_is_member(target) then raise exception 'Kein Gruppenmitglied.' using errcode='42501';end if;
 -- Read marker is bounded by rows visible to this statement, not by wall-clock time.
 update public.chat_member set read_at=greatest(read_at,coalesce((select max(m.created_at) from public.chat_group_message m where m.group_id=target),'-infinity'::timestamptz)) where group_id=target and user_id=auth.uid();
 return query select m.id,m.sender_id,coalesce(p.full_name,'Gelöschtes Konto'),m.body,m.created_at from public.chat_group_message m left join public.profiles p on p.id=m.sender_id where m.group_id=target order by m.created_at,m.id;
end;$$;
create function public.chat_group_send(target uuid,message_body text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);perform pg_catalog.pg_advisory_xact_lock(hashtextextended(target::text,84));
 if not public.chat_is_member(target) then raise exception 'Kein Gruppenmitglied.' using errcode='42501';end if;
 if message_body is null or char_length(btrim(message_body)) not between 1 and 5000 then raise exception 'Nachricht muss 1–5000 Zeichen enthalten.';end if;
 insert into public.chat_group_message(group_id,sender_id,body) values(target,auth.uid(),btrim(message_body));
end;$$;
create function public.chat_group_roster(target uuid) returns table(user_id uuid,full_name text) language plpgsql stable security definer set search_path='' as $$begin
 if not public.chat_is_member(target) then raise exception 'Kein Gruppenmitglied.' using errcode='42501';end if;
 return query select m.user_id,p.full_name from public.chat_member m join public.profiles p on p.id=m.user_id where m.group_id=target order by p.full_name,m.user_id;end;$$;
create function public.chat_group_manage(target uuid,label text,person uuid default null,remove_person boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);perform pg_catalog.pg_advisory_xact_lock(hashtextextended(target::text,84));
 if not exists(select 1 from public.chat_group where id=target and owner_id=auth.uid()) or not public.chat_is_member(target) then raise exception 'Nur die Gruppenerstellerin oder der Gruppenersteller darf Mitglieder verwalten.' using errcode='42501';end if;
 if label is null or char_length(btrim(label)) not between 1 and 100 then raise exception 'Gruppenname erforderlich.';end if;
 if person=auth.uid() and remove_person then raise exception 'Gruppenbesitz zuerst übertragen oder Gruppe löschen.';end if;
 if person is not null then
  if remove_person then delete from public.chat_member where group_id=target and user_id=person;
  else
   if (select count(*) from public.chat_member where group_id=target)>=50 and not exists(select 1 from public.chat_member where group_id=target and user_id=person) then raise exception 'Maximal 50 Mitglieder.';end if;
   insert into public.chat_member(group_id,user_id) values(target,person) on conflict do nothing;
  end if;
 end if;
 update public.chat_group set name=btrim(label) where id=target;
end;$$;
create function public.chat_group_leave(target uuid,delete_group boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);perform pg_catalog.pg_advisory_xact_lock(hashtextextended(target::text,84));
 if not public.chat_is_member(target) then raise exception 'Kein Gruppenmitglied.' using errcode='42501';end if;
 if exists(select 1 from public.chat_group where id=target and owner_id=auth.uid()) then
  if not delete_group then raise exception 'Als Ersteller kannst du die Gruppe vollständig löschen.';end if;
  delete from public.chat_group where id=target and owner_id=auth.uid();
 else
  if delete_group then raise exception 'Nur Ersteller dürfen Gruppen löschen.' using errcode='42501';end if;
  delete from public.chat_member where group_id=target and user_id=auth.uid();
 end if;
end;$$;
revoke all on function public.chat_groups(),public.chat_group_start(text,uuid[],text),public.chat_group_messages(uuid),public.chat_group_send(uuid,text),public.chat_group_roster(uuid),public.chat_group_manage(uuid,text,uuid,boolean),public.chat_group_leave(uuid,boolean) from public,anon,authenticated;
grant execute on function public.chat_groups(),public.chat_group_start(text,uuid[],text),public.chat_group_messages(uuid),public.chat_group_send(uuid,text),public.chat_group_roster(uuid),public.chat_group_manage(uuid,text,uuid,boolean),public.chat_group_leave(uuid,boolean) to authenticated;
create or replace function public.dm_unread() returns bigint language sql stable security definer set search_path='' as $$
 select (select count(*) from public.dm_message m join public.dm_thread t on t.id=m.thread_id left join public.dm_read r on r.thread_id=t.id and r.user_id=auth.uid() where auth.uid() in (t.participant_a,t.participant_b) and m.sender_id<>auth.uid() and (r.thread_id is null or (m.created_at,m.id)>(r.last_seen,r.last_message)))+coalesce((select sum(g.unread) from public.chat_groups() g),0)::bigint;
$$;
notify pgrst,'reload schema';commit;
