begin;
do $$begin
 if to_regclass('public.substitution_entry') is null or to_regprocedure('public.portal_has_role(uuid,text)') is null then
  raise exception 'Bitte zuerst den Vertretungsplan (Migration 002) und Mehrfachrollen (Migration 010) einrichten.';
 end if;
end$$;
-- Teacher identities are assigned by admins, never chosen by the reporting account.
create table public.teacher_identity (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 timetable_name text not null check(char_length(btrim(timetable_name)) between 1 and 160)
);
create unique index teacher_identity_name on public.teacher_identity(lower(btrim(timetable_name)));
create table public.teacher_absence (
 id uuid primary key default gen_random_uuid(),teacher_id uuid not null references public.profiles(id) on delete cascade,
 teacher_name text not null,start_date date not null,end_date date not null,
 starts time not null,ends time not null,requested_teacher text not null default '' check(char_length(requested_teacher)<=160),
 status text not null default 'reported' check(status in ('reported','resolved')),
 resolution text not null default '',replacement_teacher text not null default '',
 created_at timestamptz not null default now(),resolved_by uuid references public.profiles(id) on delete set null,
 check(isfinite(start_date) and isfinite(end_date) and end_date>=start_date and end_date-start_date<=30),check(starts<ends and ends<'24:00'::time)
);
alter table public.substitution_entry add column absence_id uuid references public.teacher_absence(id) on delete set null;
create table public.portal_notification (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null,body text not null,route text not null check(route in ('/krankmeldung','/stundenplan')),
 created_at timestamptz not null default now(),read_at timestamptz
);
create index on public.portal_notification(user_id,created_at desc);
alter table public.teacher_identity enable row level security;
alter table public.teacher_absence enable row level security;
alter table public.portal_notification enable row level security;
revoke all on public.teacher_identity,public.teacher_absence,public.portal_notification from public,anon,authenticated;

create function public.absence_identities() returns table(user_id uuid,full_name text,timetable_name text)
language sql stable security definer set search_path='' as $$
 select p.id,coalesce(p.full_name,''),coalesce(i.timetable_name,'') from public.profiles p
 left join public.teacher_identity i on i.user_id=p.id
 where public.portal_has_role(p.id,'teacher') and (p.id=auth.uid() or public.portal_has_role(auth.uid(),'admin'))
 order by p.full_name,p.id;
$$;
create function public.absence_set_identity(person uuid,teacher text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 if not public.portal_has_role(person,'teacher') or teacher is null or char_length(btrim(teacher)) not between 1 and 160 then raise exception 'Lehrerkonto und gültiger Stundenplanname erforderlich.' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(837261);
 if exists(select 1 from public.teacher_absence where teacher_id=person and status='reported') then raise exception 'Bitte offene Krankmeldungen zuerst bearbeiten.' using errcode='22023';end if;
 insert into public.teacher_identity(user_id,timetable_name) values(person,btrim(teacher)) on conflict(user_id) do update set timetable_name=excluded.timetable_name;
end;$$;
create function public.absence_list() returns setof public.teacher_absence
language sql stable security definer set search_path='' as $$
 select a.* from public.teacher_absence a where public.portal_has_role(auth.uid(),'admin')
 or (a.teacher_id=auth.uid() and public.portal_has_role(auth.uid(),'teacher')) order by a.created_at desc,a.id;
$$;
create function public.absence_report(first_day date,last_day date,from_time time,to_time time,wish text) returns uuid
language plpgsql security definer set search_path='' as $$
declare who text;report uuid;day date;
begin
 if not public.portal_has_role(auth.uid(),'teacher') then raise exception 'Lehrerrolle erforderlich.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837261);
 select timetable_name into who from public.teacher_identity where user_id=auth.uid();
 if who is null then raise exception 'Ein Admin muss dein Konto zuerst dem Namen im Stundenplan zuordnen.' using errcode='22023';end if;
 if first_day is null or last_day is null or not isfinite(first_day) or not isfinite(last_day) or first_day<(current_timestamp at time zone 'Europe/Berlin')::date
 or last_day<first_day or last_day-first_day>30 or from_time is null or to_time is null or from_time>=to_time or to_time>='24:00'::time
 or char_length(coalesce(wish,''))>160 or lower(btrim(coalesce(wish,'')))=lower(btrim(who)) then raise exception 'Bitte gültigen Zeitraum (max. 31 Tage) und eine andere Wunschvertretung wählen.' using errcode='22023';end if;
 if exists(select 1 from public.substitution_entry e where e.date between first_day and last_day and lower(btrim(e.teacher))=lower(btrim(who)) and e.start_time<to_time and e.end_time>from_time) then raise exception 'Für diesen Zeitraum gibt es bereits einen Eintrag. Bitte einen Admin kontaktieren oder einen anderen Zeitraum wählen.' using errcode='23P01';end if;
 insert into public.teacher_absence(teacher_id,teacher_name,start_date,end_date,starts,ends,requested_teacher)
 values(auth.uid(),who,first_day,last_day,from_time,to_time,btrim(coalesce(wish,''))) returning id into report;
 for day in select generate_series(first_day::timestamp,last_day::timestamp,'1 day')::date loop
  insert into public.substitution_entry(date,teacher,start_time,end_time,kind,absence_id)
  values(day,who,from_time,to_time,'cancelled',report);
 end loop;
 insert into public.portal_notification(user_id,title,body,route)
 select p.id,'Neue Krankmeldung',who||' ist vom '||to_char(first_day,'DD.MM.YYYY')||' bis '||to_char(last_day,'DD.MM.YYYY')||' abwesend. Bitte Vertretung prüfen.','/krankmeldung'
 from public.profiles p where public.portal_has_role(p.id,'admin');
 return report;
end;$$;
create function public.absence_resolve(report uuid,kind text,replacement text) returns void
language plpgsql security definer set search_path='' as $$
declare entry public.teacher_absence;
begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837261);
 select * into entry from public.teacher_absence where id=report for update;
 if not found then raise exception 'Meldung nicht gefunden.' using errcode='22023';end if;
 if kind is null or kind not in ('cancelled','replacement') or char_length(coalesce(replacement,''))>160
 or (kind='replacement' and (btrim(coalesce(replacement,''))='' or lower(btrim(replacement))=lower(btrim(entry.teacher_name)))) then raise exception 'Bitte eine andere Ersatzlehrkraft auswählen.' using errcode='22023';end if;
 if not exists(select 1 from public.substitution_entry where absence_id=report) then raise exception 'Einträge wurden im Vertretungsplan entfernt. Bitte dort prüfen.' using errcode='22023';end if;
 if entry.status='resolved' and entry.resolution=kind and entry.replacement_teacher=(case when kind='replacement' then btrim(replacement) else '' end)
 and not exists(select 1 from public.substitution_entry e where e.absence_id=report and (e.kind<>absence_resolve.kind or e.replacement_teacher<>(case when absence_resolve.kind='replacement' then btrim(replacement) else '' end))) then return;end if;
 update public.substitution_entry set kind=absence_resolve.kind,replacement_teacher=case when absence_resolve.kind='replacement' then btrim(replacement) else '' end,updated_at=clock_timestamp() where absence_id=report;
 update public.teacher_absence set status='resolved',resolution=kind,replacement_teacher=case when kind='replacement' then btrim(replacement) else '' end,resolved_by=auth.uid() where id=report;
 insert into public.portal_notification(user_id,title,body,route) values(entry.teacher_id,'Krankmeldung bearbeitet',case when kind='replacement' then 'Die bestätigte Vertretung ist '||btrim(replacement)||'.' else 'Unterrichtsausfall wurde bestätigt.' end,'/krankmeldung');
end;$$;
-- Student notifications contain only teaching changes, never the health reason or requested replacement.
create function public.notify_teaching_change() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.substitution_entry;message text;
begin
 if tg_op='UPDATE' and (new.date,new.teacher,new.start_time,new.end_time,new.kind,new.replacement_teacher,new.room,new.note) is not distinct from (old.date,old.teacher,old.start_time,old.end_time,old.kind,old.replacement_teacher,old.room,old.note) then return new;end if;
 if tg_op='DELETE' then e:=old;message:='Ein Vertretungsplaneintrag wurde entfernt. Bitte den aktuellen Stundenplan prüfen.';
 else e:=new;message:=case when e.kind='cancelled' then 'Unterricht bei '||e.teacher||' fällt aus.' else 'Unterricht bei '||e.teacher||' wird von '||e.replacement_teacher||' vertreten.' end;end if;
 if e.date >= (current_timestamp at time zone 'Europe/Berlin')::date then
  insert into public.portal_notification(user_id,title,body,route)
  select p.id,'Unterrichtsänderung · '||to_char(e.date,'DD.MM.YYYY'),message||' Zeitraum: '||to_char(e.start_time,'HH24:MI')||'–'||to_char(e.end_time,'HH24:MI')||'. Details im Stundenplan.','/stundenplan'
  from public.profiles p where public.portal_has_role(p.id,'user');
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
create trigger substitution_notifications after insert or update or delete on public.substitution_entry for each row execute function public.notify_teaching_change();
create function public.portal_notifications() returns setof public.portal_notification language sql stable security definer set search_path='' as $$
 select n.* from public.portal_notification n where n.user_id=auth.uid() order by n.created_at desc,n.id limit 100;
$$;
create function public.portal_notification_read(notification uuid) returns void language sql security definer set search_path='' as $$
 update public.portal_notification set read_at=coalesce(read_at,now()) where id=notification and user_id=auth.uid();
$$;
revoke all on function public.absence_identities(),public.absence_set_identity(uuid,text),public.absence_list(),public.absence_report(date,date,time,time,text),public.absence_resolve(uuid,text,text),public.portal_notifications(),public.portal_notification_read(uuid),public.notify_teaching_change() from public,anon,authenticated;
grant execute on function public.absence_identities(),public.absence_set_identity(uuid,text),public.absence_list(),public.absence_report(date,date,time,time,text),public.absence_resolve(uuid,text,text),public.portal_notifications(),public.portal_notification_read(uuid) to authenticated;
commit;
