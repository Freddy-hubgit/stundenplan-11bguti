begin;
-- Existing unconfirmed entries remain stored, but are hidden until approval.
alter table public.teacher_absence add column requested_kind text not null default 'cancelled' check(requested_kind in ('cancelled','replacement'));
update public.teacher_absence set requested_kind=case when btrim(requested_teacher)<>'' then 'replacement' else 'cancelled' end;
alter table public.substitution_entry add column published boolean not null default true;
alter table public.portal_notification add column absence_id uuid references public.teacher_absence(id) on delete cascade;
create or replace function public.notify_teaching_change() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.substitution_entry;message text;
begin
 if tg_op<>'DELETE' and (not new.published or (new.absence_id is not null and not exists(select 1 from public.teacher_absence a where a.id=new.absence_id and a.status='resolved'))) then return new;end if;
 if tg_op='DELETE' and (not old.published or (old.absence_id is not null and not exists(select 1 from public.teacher_absence a where a.id=old.absence_id and a.status='resolved'))) then return old;end if;
 if tg_op='UPDATE' and old.published and (new.date,new.teacher,new.start_time,new.end_time,new.kind,new.replacement_teacher,new.room,new.note) is not distinct from (old.date,old.teacher,old.start_time,old.end_time,old.kind,old.replacement_teacher,old.room,old.note) then return new;end if;
 if tg_op='DELETE' then e:=old;message:='Ein Vertretungsplaneintrag wurde entfernt. Bitte den aktuellen Stundenplan prüfen.';
 else e:=new;message:=case when e.kind='cancelled' then 'Unterricht bei '||e.teacher||' fällt aus.' else 'Unterricht bei '||e.teacher||' wird von '||e.replacement_teacher||' vertreten.' end;end if;
 if e.date >= (current_timestamp at time zone 'Europe/Berlin')::date then
  insert into public.portal_notification(user_id,title,body,route,absence_id)
  select p.id,'Unterrichtsänderung · '||to_char(e.date,'DD.MM.YYYY'),message||' Zeitraum: '||to_char(e.start_time,'HH24:MI')||'–'||to_char(e.end_time,'HH24:MI')||'. Details im Stundenplan.','/stundenplan',e.absence_id
  from public.profiles p where public.portal_has_role(p.id,'user');
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;

update public.substitution_entry e set published=false from public.teacher_absence a where e.absence_id=a.id and a.status='reported';
-- Associate only exact system-generated legacy notices with their still-pending report.
update public.portal_notification n set absence_id=e.absence_id,read_at=coalesce(n.read_at,now())
from public.substitution_entry e join public.teacher_absence a on a.id=e.absence_id
where a.status='reported' and n.route='/stundenplan' and n.created_at>=a.created_at
and n.title='Unterrichtsänderung · '||to_char(e.date,'DD.MM.YYYY')
and n.body=(case when e.kind='cancelled' then 'Unterricht bei '||e.teacher||' fällt aus.' else 'Unterricht bei '||e.teacher||' wird von '||e.replacement_teacher||' vertreten.' end)
 ||' Zeitraum: '||to_char(e.start_time,'HH24:MI')||'–'||to_char(e.end_time,'HH24:MI')||'. Details im Stundenplan.';

delete from public.portal_notification n using public.teacher_absence a where n.absence_id=a.id and n.route='/stundenplan' and a.status='reported';

create or replace function public.substitution_list() returns setof public.substitution_entry
language sql stable security definer set search_path='' as $$
 select e.* from public.substitution_entry e where auth.uid() is not null and e.published
 and (e.absence_id is null or exists(select 1 from public.teacher_absence a where a.id=e.absence_id and a.status='resolved'))
 order by e.date,e.start_time,e.teacher,e.id;
$$;
create or replace function public.portal_notifications() returns setof public.portal_notification
language sql stable security definer set search_path='' as $$
 select n.* from public.portal_notification n where n.user_id=auth.uid()
 and (n.route='/krankmeldung' or n.absence_id is null or exists(select 1 from public.teacher_absence a where a.id=n.absence_id and a.status='resolved'))
 order by n.created_at desc,n.id limit 100;
$$;
create function public.absence_request(first_day date,last_day date,from_time time,to_time time,request_kind text,wish text) returns uuid
language plpgsql security definer set search_path='' as $$
declare who text;report uuid;
begin
 if not public.portal_has_role(auth.uid(),'teacher') then raise exception 'Lehrerrolle erforderlich.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837261);
 select timetable_name into who from public.teacher_identity where user_id=auth.uid();
 if who is null then raise exception 'Ein Admin muss dein Konto zuerst dem Namen im Stundenplan zuordnen.' using errcode='22023';end if;
 if first_day is null or last_day is null or not isfinite(first_day) or not isfinite(last_day) or first_day<(current_timestamp at time zone 'Europe/Berlin')::date
 or last_day<first_day or last_day-first_day>30 or from_time is null or to_time is null or from_time>=to_time or to_time>='24:00'::time
 or request_kind is null or request_kind not in ('cancelled','replacement') or char_length(coalesce(wish,''))>160
 or (request_kind='replacement' and (btrim(coalesce(wish,''))='' or lower(btrim(wish))=lower(btrim(who)))) then raise exception 'Bitte gültigen Zeitraum und bei Wunschvertretung eine andere Lehrkraft angeben.' using errcode='22023';end if;
 if exists(select 1 from public.substitution_entry e where e.date between first_day and last_day and lower(btrim(e.teacher))=lower(btrim(who)) and e.start_time<to_time and e.end_time>from_time)
 or exists(select 1 from public.teacher_absence a where a.status='reported' and lower(btrim(a.teacher_name))=lower(btrim(who)) and a.start_date<=last_day and a.end_date>=first_day and a.starts<to_time and a.ends>from_time)
 then raise exception 'Für diesen Zeitraum gibt es bereits einen Eintrag oder offenen Antrag.' using errcode='23P01';end if;
 insert into public.teacher_absence(teacher_id,teacher_name,start_date,end_date,starts,ends,requested_kind,requested_teacher)
 values(auth.uid(),who,first_day,last_day,from_time,to_time,request_kind,case when request_kind='replacement' then btrim(wish) else '' end) returning id into report;
 insert into public.portal_notification(user_id,title,body,route,absence_id)
 select p.id,'Neue Krankmeldung',who||' ist vom '||to_char(first_day,'DD.MM.YYYY')||' bis '||to_char(last_day,'DD.MM.YYYY')||' abwesend. Bitte Antrag prüfen.','/krankmeldung',report
 from public.profiles p where public.portal_has_role(p.id,'admin');
 return report;
end;$$;
-- Older clients also submit a pending request and cannot publish immediately.
create or replace function public.absence_report(first_day date,last_day date,from_time time,to_time time,wish text) returns uuid
language sql security definer set search_path='' as $$
 select public.absence_request(first_day,last_day,from_time,to_time,case when btrim(coalesce(wish,''))='' then 'cancelled' else 'replacement' end,wish);
$$;
create function public.absence_request_preference(report uuid,request_kind text,wish text) returns void
language plpgsql security definer set search_path='' as $$
declare entry public.teacher_absence;wanted text;
begin
 if not public.portal_has_role(auth.uid(),'teacher') then raise exception 'Lehrerrolle erforderlich.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837261);
 select * into entry from public.teacher_absence where id=report for update;
 if not found or entry.teacher_id<>auth.uid() then raise exception 'Antrag nicht verfügbar.' using errcode='42501';end if;
 if entry.status<>'reported' then raise exception 'Der Antrag wurde bereits bestätigt. Bitte einen Admin kontaktieren.' using errcode='22023';end if;
 if request_kind is null or request_kind not in ('cancelled','replacement') or char_length(coalesce(wish,''))>160
 or (request_kind='replacement' and (btrim(coalesce(wish,''))='' or lower(btrim(wish))=lower(btrim(entry.teacher_name)))) then raise exception 'Bitte Entfall oder eine andere Wunschvertretung auswählen.' using errcode='22023';end if;
 wanted:=case when request_kind='replacement' then btrim(wish) else '' end;
 if entry.requested_kind=request_kind and entry.requested_teacher=wanted then return;end if;
 update public.teacher_absence set requested_kind=request_kind,requested_teacher=wanted where id=report;
 insert into public.portal_notification(user_id,title,body,route,absence_id)
 select p.id,'Antrag geändert',entry.teacher_name||' hat den Wunsch für eine offene Krankmeldung geändert. Bitte erneut prüfen.','/krankmeldung',report
 from public.profiles p where public.portal_has_role(p.id,'admin');
end;$$;
create or replace function public.absence_resolve(report uuid,kind text,replacement text) returns void
language plpgsql security definer set search_path='' as $$
declare entry public.teacher_absence;day date;
begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837261);
 select * into entry from public.teacher_absence where id=report for update;
 if not found then raise exception 'Meldung nicht gefunden.' using errcode='22023';end if;
 if kind is null or kind not in ('cancelled','replacement') or char_length(coalesce(replacement,''))>160
 or (kind='replacement' and (btrim(coalesce(replacement,''))='' or lower(btrim(replacement))=lower(btrim(entry.teacher_name)))) then raise exception 'Bitte eine andere Ersatzlehrkraft auswählen.' using errcode='22023';end if;
 if entry.status='resolved' and not exists(select 1 from public.substitution_entry where absence_id=report) then raise exception 'Einträge wurden im Vertretungsplan entfernt. Bitte dort prüfen.' using errcode='22023';end if;
 if entry.status='resolved' and entry.resolution=kind and entry.replacement_teacher=(case when kind='replacement' then btrim(replacement) else '' end)
 and not exists(select 1 from public.substitution_entry e where e.absence_id=report and (e.kind<>absence_resolve.kind or e.replacement_teacher<>(case when absence_resolve.kind='replacement' then btrim(replacement) else '' end))) then return;end if;
 if exists(select 1 from public.substitution_entry e where e.date between entry.start_date and entry.end_date and lower(btrim(e.teacher))=lower(btrim(entry.teacher_name)) and e.start_time<entry.ends and e.end_time>entry.starts and e.absence_id is distinct from report)
 then raise exception 'Es gibt inzwischen einen überlappenden Vertretungsplaneintrag. Bitte zuerst im Vertretungsplan prüfen.' using errcode='23P01';end if;
 update public.teacher_absence set status='resolved',resolution=kind,replacement_teacher=case when kind='replacement' then btrim(replacement) else '' end,resolved_by=auth.uid() where id=report;
 if entry.status='reported' then
  for day in select generate_series(entry.start_date::timestamp,entry.end_date::timestamp,'1 day')::date loop
   if not exists(select 1 from public.substitution_entry e where e.absence_id=report and e.date=day) then
    insert into public.substitution_entry(date,teacher,start_time,end_time,kind,replacement_teacher,absence_id,published)
    values(day,entry.teacher_name,entry.starts,entry.ends,kind,case when kind='replacement' then btrim(replacement) else '' end,report,true);
   end if;
  end loop;
 end if;
 update public.substitution_entry set kind=absence_resolve.kind,replacement_teacher=case when absence_resolve.kind='replacement' then btrim(replacement) else '' end,published=true,updated_at=clock_timestamp() where absence_id=report;
 insert into public.portal_notification(user_id,title,body,route,absence_id) values(entry.teacher_id,'Krankmeldung bearbeitet',case when kind='replacement' then 'Die bestätigte Vertretung ist '||btrim(replacement)||'.' else 'Unterrichtsausfall wurde bestätigt.' end,'/krankmeldung',report);
end;$$;
revoke all on function public.absence_request(date,date,time,time,text,text),public.absence_request_preference(uuid,text,text) from public,anon,authenticated;
grant execute on function public.absence_request(date,date,time,time,text,text),public.absence_request_preference(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
