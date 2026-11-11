begin;
create function public.exam_classes(target uuid) returns setof uuid language sql stable security definer set search_path='' as $$
 select c.id from public.school_group c join public.school_group g on g.id=target where c.kind='class' and
 (c.id=g.id or c.id=g.parent_id or (g.kind='course' and exists(select 1 from public.school_member a join public.school_member b on b.user_id=a.user_id where a.group_id=g.id and b.group_id=c.id and a.member_kind='student' and b.member_kind='student')));$$;
create function public.exam_week_limit() returns trigger language plpgsql security definer set search_path='' as $$
declare c uuid;week_start date;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 week_start:=new.date-(extract(isodow from new.date)::integer-1);
 for c in select public.exam_classes(new.group_id) loop
 if (select count(*) from public.school_exam e where e.id<>new.id and e.date>=week_start and e.date<week_start+7 and c in(select public.exam_classes(e.group_id)))>=3 then
 raise exception 'In dieser Klasse sind bereits drei Klassenarbeiten in dieser Woche eingetragen. Bitte eine andere Woche auswählen.' using errcode='23514';end if;
 end loop;return new;
end;$$;
create trigger exam_max_three before insert or update on public.school_exam for each row execute function public.exam_week_limit();
create function public.exam_calendar_groups() returns table(id uuid,name text) language sql stable security definer set search_path='' as $$
 select g.id,g.name from public.school_group g where g.kind='class' and (public.portal_has_role(auth.uid(),'teacher') or public.portal_has_role(auth.uid(),'admin') or public.school_can_read(auth.uid(),g.id)) order by g.name,g.id;$$;
create function public.exam_calendar_list() returns table(id uuid,group_id uuid,group_name text,author_id uuid,title text,subject text,date date,starts time,ends time,room text,details text,class_ids uuid[]) language sql stable security definer set search_path='' as $$
 select e.id,e.group_id,g.name,e.author_id,e.title,e.subject,e.date,e.starts,e.ends,e.room,e.details,array(select public.exam_classes(e.group_id)) from public.school_exam e join public.school_group g on g.id=e.group_id
 where public.portal_has_role(auth.uid(),'teacher') or public.portal_has_role(auth.uid(),'admin') or public.school_can_read(auth.uid(),e.group_id)
 order by e.date,e.starts,g.name,e.id;$$;
create or replace function public.school_exam_save(exam uuid,target uuid,label text,subject_name text,day date,from_time time,to_time time,new_room text,info text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if not (public.school_can_teach(auth.uid(),target) or (public.portal_has_role(auth.uid(),'teacher') and exists(select 1 from public.school_group where id=target and kind='class'))) then raise exception 'Lehrerrolle erforderlich.' using errcode='42501';end if;
 if exam is null then insert into public.school_exam(group_id,author_id,title,subject,date,starts,ends,room,details) values(target,auth.uid(),btrim(label),btrim(subject_name),day,from_time,to_time,coalesce(new_room,''),coalesce(info,'')) returning id into result;
 else update public.school_exam set title=btrim(label),subject=btrim(subject_name),date=day,starts=from_time,ends=to_time,room=coalesce(new_room,''),details=coalesce(info,'') where id=exam and group_id=target and (author_id=auth.uid() or public.portal_has_role(auth.uid(),'admin')) returning id into result;if not found then raise exception 'Nur eigene Prüfungen sind bearbeitbar.' using errcode='42501';end if;end if;return result;
end;$$;
-- The existing timetable keeps showing relevant examinations from the same table.
revoke all on function public.exam_classes(uuid),public.exam_week_limit() from public,anon,authenticated;
revoke all on function public.exam_calendar_groups(),public.exam_calendar_list() from public,anon;
grant execute on function public.exam_calendar_groups(),public.exam_calendar_list() to authenticated;

-- Reassigning a course or its members must not bypass the class limit.
create function public.exam_assignment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare changed_groups uuid[];person uuid;classes uuid[];c uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if tg_table_name='school_member' then
  changed_groups:=array[coalesce(new.group_id,old.group_id),old.group_id];person:=coalesce(new.user_id,old.user_id);
 else changed_groups:=array[coalesce(new.id,old.id),old.id,old.parent_id,new.parent_id];end if;
 select array_agg(distinct g.id) into classes from public.school_group g where g.kind='class' and
 (g.id=any(changed_groups) or exists(select 1 from unnest(changed_groups) target where g.id in(select public.exam_classes(target))) or exists(select 1 from public.school_member m where m.group_id=g.id and m.user_id=person and m.member_kind='student'));
 foreach c in array coalesce(classes,'{}'::uuid[]) loop
 if exists(select 1 from public.school_exam e where e.date>=((current_timestamp at time zone 'Europe/Berlin')::date-(extract(isodow from current_timestamp at time zone 'Europe/Berlin')::integer-1)) and c in(select public.exam_classes(e.group_id)) group by e.date-(extract(isodow from e.date)::integer-1) having count(*)>3) then raise exception 'Die Zuordnung würde mehr als drei Klassenarbeiten pro Woche in einer betroffenen Klasse ergeben. Bitte die Arbeiten zuerst umplanen.' using errcode='23514';end if;
 end loop;return null;
end;$$;
create constraint trigger exam_assignment_limit after insert or update or delete on public.school_member deferrable initially deferred for each row execute function public.exam_assignment_guard();
create constraint trigger exam_parent_limit after insert or update or delete on public.school_group deferrable initially deferred for each row execute function public.exam_assignment_guard();
revoke all on function public.exam_assignment_guard() from public,anon,authenticated;

notify pgrst,'reload schema';commit;
