begin;
do $$begin
 if to_regclass('public.portal_trash') is null or to_regprocedure('public.exam_calendar_list()') is null or to_regprocedure('public.consult_busy(uuid,timestamptz,timestamptz,uuid)') is null then
 raise exception 'Bitte zuerst die Grundeinrichtung 032–036 aus supabase/setup/learning-suite.sql ausführen.';end if;
end$$;
create table public.personal_exam(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id) on delete cascade,
 group_id uuid references public.school_group(id) on delete set null,title text not null check(char_length(btrim(title)) between 1 and 160),
 subject text not null check(char_length(btrim(subject)) between 1 and 100),date date not null check(isfinite(date)),starts time not null,ends time not null,
 room text not null default '' check(char_length(room)<=100),details text not null default '' check(char_length(details)<=5000),check(starts<ends and ends<'24:00'::time)
);
create index on public.personal_exam(owner_id,date);
alter table public.personal_exam enable row level security;revoke all on public.personal_exam from public,anon,authenticated;
create function public.personal_exam_groups() returns table(id uuid,name text) language sql stable security definer set search_path='' as $$
 select g.id,g.name from public.school_member m join public.school_group g on g.id=m.group_id where m.user_id=auth.uid() and m.member_kind='student' and g.kind='class' order by g.name,g.id;$$;
-- Only the caller's personal entries are added to the shared calendar response.
drop function public.exam_calendar_list();
create function public.exam_calendar_list() returns table(id uuid,group_id uuid,group_name text,author_id uuid,title text,subject text,date date,starts time,ends time,room text,details text,class_ids uuid[],personal boolean) language sql stable security definer set search_path='' as $$
 select e.id,e.group_id,g.name as group_name,e.author_id,e.title,e.subject,e.date,e.starts,e.ends,e.room,e.details,array(select public.exam_classes(e.group_id)),false from public.school_exam e join public.school_group g on g.id=e.group_id
 where public.portal_has_role(auth.uid(),'teacher') or public.portal_has_role(auth.uid(),'admin') or public.school_can_read(auth.uid(),e.group_id)
 union all select e.id,e.group_id,coalesce(g.name,'Persönlich'),e.owner_id,e.title,e.subject,e.date,e.starts,e.ends,e.room,e.details,case when e.group_id is null then '{}'::uuid[] else array[e.group_id] end,true
 from public.personal_exam e left join public.school_group g on g.id=e.group_id where e.owner_id=auth.uid()
 order by date,starts,group_name,id;$$;
create function public.personal_exam_save(exam uuid,target uuid,label text,subject_name text,day date,from_time time,to_time time,new_room text,info text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if not public.portal_has_role(auth.uid(),'user') then raise exception 'Nutzerrolle erforderlich.' using errcode='42501';end if;
 if target is not null and not exists(select 1 from public.school_member m join public.school_group g on g.id=m.group_id where m.user_id=auth.uid() and m.group_id=target and m.member_kind='student' and g.kind='class') then raise exception 'Bitte eine eigene Klasse auswählen oder den Eintrag ohne Klasse speichern.' using errcode='42501';end if;
 if exam is null then insert into public.personal_exam(owner_id,group_id,title,subject,date,starts,ends,room,details) values(auth.uid(),target,btrim(label),btrim(subject_name),day,from_time,to_time,coalesce(new_room,''),coalesce(info,'')) returning id into result;
 else update public.personal_exam set group_id=target,title=btrim(label),subject=btrim(subject_name),date=day,starts=from_time,ends=to_time,room=coalesce(new_room,''),details=coalesce(info,'') where id=exam and owner_id=auth.uid() returning id into result;
 if not found then raise exception 'Nur eigene persönliche Arbeiten sind bearbeitbar.' using errcode='42501';end if;end if;return result;
end;$$;
alter table public.portal_trash drop constraint portal_trash_kind_check;
alter table public.portal_trash add constraint portal_trash_kind_check check(kind in('notebook','material','exam','homework','personal_exam'));
create or replace function public.trash_can_manage(item public.portal_trash) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and ((item.kind in('notebook','personal_exam') and item.owner_id=auth.uid()) or
 (item.kind not in('notebook','personal_exam') and ((item.owner_id=auth.uid() and (item.group_id is null or public.school_can_teach(auth.uid(),item.group_id) or (item.kind='exam' and public.portal_has_role(auth.uid(),'teacher')))) or (item.group_id is not null and public.portal_has_role(auth.uid(),'admin')))));$$;
create function public.personal_exam_delete(exam uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.personal_exam;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);select * into e from public.personal_exam where id=exam and owner_id=auth.uid() for update;
 if not found then raise exception 'Nur eigene persönliche Arbeiten sind löschbar.' using errcode='42501';end if;
 insert into public.portal_trash(kind,entity_id,owner_id,title,payload) values('personal_exam',e.id,e.owner_id,e.title,to_jsonb(e));delete from public.personal_exam where id=exam;
end;$$;
do $$declare definition text;begin
 select pg_get_functiondef('public.portal_trash_restore(uuid)'::regprocedure) into definition;
 definition:=replace(definition,$patch$ elsif t.kind='homework' then$patch$, $patch$ elsif t.kind='personal_exam' then
 if not exists(select 1 from public.school_group where id=(t.payload->>'group_id')::uuid) then t.payload:=t.payload||jsonb_build_object('group_id',null);end if;
 insert into public.personal_exam select r.* from jsonb_populate_record(null::public.personal_exam,t.payload) r;
 elsif t.kind='homework' then$patch$);execute definition;
 select pg_get_functiondef('public.consult_busy(uuid,timestamptz,timestamptz,uuid)'::regprocedure) into definition;
 definition:=replace(definition,' or exists(select 1 from public.school_exam e', ' or exists(select 1 from public.personal_exam e where e.owner_id=person and ((e.date+e.starts) at time zone ''Europe/Berlin'')<period_end and ((e.date+e.ends) at time zone ''Europe/Berlin'')>period_start) or exists(select 1 from public.school_exam e');execute definition;
 select pg_get_functiondef('public.school_reset_plan(boolean,boolean,boolean)'::regprocedure) into definition;
 definition:=replace(definition,'counts:=jsonb_build_object(', 'counts:=jsonb_build_object(''Persönliche Prüfungseinträge'',(select count(*) from public.personal_exam),');execute definition;
 select pg_get_functiondef('public.school_reset_execute(uuid,text)'::regprocedure) into definition;
 definition:=replace(definition,'delete from public.school_exam;', 'delete from public.personal_exam;delete from public.school_exam;');execute definition;
end$$;
create trigger school_reset_revision before insert or update or delete on public.personal_exam for each statement execute function public.school_track_change();
create constraint trigger consultation_personal_exam_conflict after insert or update or delete on public.personal_exam deferrable initially deferred for each row execute function public.consultation_conflict_guard();
revoke all on function public.exam_calendar_list(),public.personal_exam_groups(),public.personal_exam_save(uuid,uuid,text,text,date,time,time,text,text),public.personal_exam_delete(uuid) from public,anon;
grant execute on function public.exam_calendar_list(),public.personal_exam_groups(),public.personal_exam_save(uuid,uuid,text,text,date,time,time,text,text),public.personal_exam_delete(uuid) to authenticated;
notify pgrst,'reload schema';commit;
