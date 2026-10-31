begin;
alter table public.teacher_absence add column excluded_dates date[] not null default '{}';
create function public.absence_edit_period(report uuid,first_day date,last_day date,from_time time,to_time time,skip_days date[] default '{}') returns void language plpgsql security definer set search_path='' as $$
declare entry public.teacher_absence;day date;omitted date[];
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);perform pg_catalog.pg_advisory_xact_lock(837261);
 select * into entry from public.teacher_absence where id=report for update;
 if not found then raise exception 'Krankmeldung nicht gefunden.' using errcode='22023';end if;
 if not(public.portal_has_role(auth.uid(),'support') or (entry.teacher_id=auth.uid() and entry.status='reported' and public.portal_has_role(auth.uid(),'teacher'))) then raise exception 'Nur Support oder die Lehrkraft eines offenen Antrags darf den Zeitraum ändern.' using errcode='42501';end if;
 if first_day is null or last_day is null or not isfinite(first_day) or not isfinite(last_day) or last_day<first_day or last_day-first_day>30 or from_time is null or to_time is null or from_time>=to_time or to_time>='24:00'::time then raise exception 'Ungültiger Zeitraum (maximal 31 Tage).';end if;
 select coalesce(array_agg(distinct d),'{}'::date[]) into omitted from unnest(coalesce(skip_days,'{}')) d where d between first_day and last_day;
 if cardinality(omitted)>=last_day-first_day+1 then raise exception 'Mindestens ein Abwesenheitstag muss verbleiben. Nutze sonst Krankmeldung zurücknehmen.';end if;
 if exists(select 1 from public.teacher_absence a where a.id<>report and a.teacher_id=entry.teacher_id and a.start_date<=last_day and a.end_date>=first_day and a.starts<to_time and a.ends>from_time and exists(select 1 from generate_series(greatest(a.start_date,first_day)::timestamp,least(a.end_date,last_day)::timestamp,'1 day') d where not(d::date=any(omitted)) and not(d::date=any(a.excluded_dates)))) then raise exception 'Überlappende Krankmeldung.' using errcode='23P01';end if;
 if exists(select 1 from public.substitution_entry s where s.absence_id is distinct from report and public.school_teacher_key(s.teacher)=public.school_teacher_key(entry.teacher_name) and s.date between first_day and last_day and not(s.date=any(omitted)) and s.start_time<to_time and s.end_time>from_time) then raise exception 'Überlappender Vertretungsplaneintrag. Bitte zuerst dort prüfen.' using errcode='23P01';end if;
 delete from public.substitution_entry where absence_id=report;
 update public.teacher_absence set start_date=first_day,end_date=last_day,starts=from_time,ends=to_time,excluded_dates=omitted where id=report;
 if entry.status='resolved' then
  for day in select generate_series(first_day::timestamp,last_day::timestamp,'1 day')::date loop
   if not(day=any(omitted)) then insert into public.substitution_entry(date,teacher,start_time,end_time,kind,replacement_teacher,absence_id,published) values(day,entry.teacher_name,from_time,to_time,entry.resolution,entry.replacement_teacher,report,true);end if;
  end loop;
 end if;
 insert into public.portal_notification(user_id,title,body,route,absence_id)
 select p.id,'Krankmeldung geändert',entry.teacher_name||': Zeitraum oder einzelne Abwesenheitstage wurden geändert. Bitte die Meldung prüfen.','/krankmeldung',report from public.profiles p where p.id=entry.teacher_id or public.portal_has_role(p.id,'admin');
end;$$;
-- Approval must not recreate deliberately excluded dates.
do $$declare definition text;begin
 select pg_get_functiondef('public.absence_resolve(uuid,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'if not exists(select 1 from public.substitution_entry e where e.absence_id=report and e.date=day) then','if not(day=any(entry.excluded_dates)) and not exists(select 1 from public.substitution_entry e where e.absence_id=report and e.date=day) then');definition:=replace(definition,'e.date between entry.start_date and entry.end_date and lower', 'e.date between entry.start_date and entry.end_date and not(e.date=any(entry.excluded_dates)) and lower');execute definition;
 select pg_get_functiondef('public.absence_request(date,date,time,time,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'a.starts<to_time and a.ends>from_time)', 'a.starts<to_time and a.ends>from_time and exists(select 1 from generate_series(greatest(a.start_date,first_day)::timestamp,least(a.end_date,last_day)::timestamp,''1 day'') d where not(d::date=any(a.excluded_dates))))');execute definition;
end;$$;
revoke all on function public.absence_edit_period(uuid,date,date,time,time,date[]) from public,anon,authenticated;
grant execute on function public.absence_edit_period(uuid,date,date,time,time,date[]) to authenticated;
notify pgrst,'reload schema';commit;
