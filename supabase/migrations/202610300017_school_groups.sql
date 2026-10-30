begin;
create table public.school_group(id uuid primary key default gen_random_uuid(),name text not null check(char_length(btrim(name)) between 1 and 100),kind text not null check(kind in ('class','course')),parent_id uuid references public.school_group(id) on delete cascade,created_at timestamptz not null default now(),check(kind='course' or parent_id is null));
create table public.school_member(group_id uuid not null references public.school_group(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,member_kind text not null check(member_kind in ('student','teacher')),primary key(group_id,user_id));
create table public.school_schedule(group_id uuid primary key references public.school_group(id) on delete cascade,lessons jsonb not null default '[]',updated_at timestamptz not null default now());
alter table public.school_group enable row level security;alter table public.school_member enable row level security;alter table public.school_schedule enable row level security;
revoke all on public.school_group,public.school_member,public.school_schedule from public,anon,authenticated;
create function public.school_can_read(person uuid,target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select person is not null and target is not null and (public.portal_has_role(person,'admin') or public.portal_has_role(person,'support') or exists(select 1 from public.school_member m where m.user_id=person and m.group_id=target and ((m.member_kind='student' and public.portal_has_role(person,'user')) or (m.member_kind='teacher' and public.portal_has_role(person,'teacher')))));$$;
create function public.school_can_teach(person uuid,target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.portal_has_role(person,'admin') or (public.portal_has_role(person,'teacher') and exists(select 1 from public.school_member m where m.user_id=person and m.group_id=target and m.member_kind='teacher'));$$;
create function public.school_groups() returns table(id uuid,name text,kind text,parent_id uuid,can_teach boolean) language sql stable security definer set search_path='' as $$
 select g.id,g.name,g.kind,g.parent_id,public.school_can_teach(auth.uid(),g.id) from public.school_group g where public.school_can_read(auth.uid(),g.id) order by g.kind,g.name,g.id;$$;
create function public.school_group_save(target uuid,label text,group_kind text,parent uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 if label is null or char_length(btrim(label)) not between 1 and 100 or group_kind is null or group_kind not in ('class','course') or (parent is not null and (group_kind<>'course' or parent=target or not exists(select 1 from public.school_group where id=parent and kind='class'))) then raise exception 'Ungültige Klasse oder Kurs.' using errcode='22023';end if;
 if target is null then insert into public.school_group(name,kind,parent_id) values(btrim(label),group_kind,parent) returning id into result;insert into public.school_schedule(group_id) values(result);
 else update public.school_group set name=btrim(label) where id=target returning id into result;if not found then raise exception 'Gruppe fehlt.';end if;end if;return result;
end;$$;
create function public.school_roster(target uuid) returns table(user_id uuid,full_name text,member_kind text,email text) language sql stable security definer set search_path='' as $$
 select m.user_id,coalesce(p.full_name,''),m.member_kind,p.email from public.school_member m join public.profiles p on p.id=m.user_id where m.group_id=target and public.portal_has_role(auth.uid(),'admin') order by p.full_name;$$;
create function public.school_people() returns table(id uuid,full_name text,roles text[],email text) language sql stable security definer set search_path='' as $$
 select p.id,coalesce(p.full_name,''),p.roles,p.email from public.profiles p where public.portal_has_role(auth.uid(),'admin') order by p.full_name;$$;
create function public.school_enrol(target uuid,person uuid,member_type text,remove_member boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 if remove_member then delete from public.school_member where group_id=target and user_id=person;return;end if;
 if member_type is null or member_type not in ('student','teacher') or (member_type='teacher' and not public.portal_has_role(person,'teacher')) or (member_type='student' and not public.portal_has_role(person,'user')) then raise exception 'Für Schüler wird Nutzerrolle benötigt, für Lehrkräfte Lehrerrolle.' using errcode='22023';end if;
 insert into public.school_member(group_id,user_id,member_kind) values(target,person,member_type) on conflict(group_id,user_id) do update set member_kind=excluded.member_kind;
end;$$;
create function public.school_lessons(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select s.lessons from public.school_schedule s where s.group_id=target and public.school_can_read(auth.uid(),target);$$;
create function public.school_schedule_save(target uuid,entries jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not (public.school_can_teach(auth.uid(),target) or (public.portal_has_role(auth.uid(),'support') and public.school_can_read(auth.uid(),target))) then raise exception 'Keine Berechtigung für diesen Stundenplan.' using errcode='42501';end if;
 if entries is null or jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>300 then raise exception 'Ungültiger Stundenplan.';end if;
 if exists(select 1 from jsonb_array_elements(entries) l where jsonb_typeof(l)<>'object' or jsonb_typeof(l->'subject') is distinct from 'string' or jsonb_typeof(l->'teacher') is distinct from 'string' or jsonb_typeof(l->'room') is distinct from 'string' or coalesce(l->>'day','') not in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun') or btrim(coalesce(l->>'subject',''))='' or char_length(l->>'subject')>100 or coalesce(l->>'start','') !~ '^[0-2][0-9]:[0-5][0-9]$' or coalesce(l->>'end','') !~ '^[0-2][0-9]:[0-5][0-9]$' or (l->>'start')::time>=(l->>'end')::time or (l->>'end')::time>='24:00'::time or char_length(coalesce(l->>'teacher',''))>160 or char_length(coalesce(l->>'room',''))>100 or coalesce(l->>'track','') not in ('','Informatik','Umwelttechnik') or coalesce(l->>'language','') not in ('','Spanisch') or coalesce(l->>'scienceGroup','') not in ('','Chemie','Physik','Biologie')) then raise exception 'Ungültige Unterrichtsstunde.' using errcode='22023';end if;
 insert into public.school_schedule(group_id,lessons) values(target,coalesce((select jsonb_agg(l-'cancelled') from jsonb_array_elements(entries) l),'[]'::jsonb)) on conflict(group_id) do update set lessons=excluded.lessons,updated_at=now();
end;$$;
alter table public.homework_task add column group_id uuid references public.school_group(id) on delete cascade;
-- Old shared homework is kept for authors; admins/teachers can explicitly assign it to a group.
create or replace function public.hw_can_view(person uuid,task uuid) returns boolean language sql stable security definer set search_path='' as $$
 select person is not null and exists(select 1 from public.profiles where id=person) and exists(select 1 from public.homework_task t where t.id=task and not t.archived and (t.author_id=person or (t.is_shared and public.school_can_read(person,t.group_id))));$$;
create or replace function public.hw_save(task uuid,task_title text,task_subject text,details text,lesson date,due date,shared boolean,submission_required boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid()) then raise exception 'Anmeldung erforderlich.' using errcode='42501';end if;
 if shared is true and task is null then raise exception 'Bitte eine Klasse oder einen Kurs auswählen und die Webseite aktualisieren.' using errcode='22023';end if;
 if shared is true and task is not null and not exists(select 1 from public.homework_task t where t.id=task and public.school_can_teach(auth.uid(),t.group_id)) then raise exception 'Klassen-Zuordnung erforderlich.' using errcode='42501';end if;
 if shared is true and not (public.portal_has_role(auth.uid(),'teacher') or public.portal_has_role(auth.uid(),'admin')) then raise exception 'Nur Lehrkräfte dürfen Aufgaben veröffentlichen.' using errcode='42501';end if;
 if task_title is null or char_length(btrim(task_title)) not between 1 and 160 or task_subject is null or char_length(btrim(task_subject)) not between 1 and 100 or char_length(coalesce(details,''))>10000 or lesson is null or due is null or not isfinite(lesson) or not isfinite(due) or shared is null or submission_required is null or (not shared and submission_required) then raise exception 'Ungültige Hausaufgabe.' using errcode='22023';end if;
 if task is null then insert into public.homework_task(author_id,title,subject,description,lesson_date,due_date,is_shared,requires_submission) values(auth.uid(),btrim(task_title),btrim(task_subject),coalesce(details,''),lesson,due,shared,submission_required) returning id into result;
 else
  perform 1 from public.homework_task t where t.id=task and t.author_id=auth.uid() and not t.archived and (not t.is_shared or public.portal_has_role(auth.uid(),'teacher') or public.portal_has_role(auth.uid(),'admin')) for update;
  if not found then raise exception 'Aufgabe nicht bearbeitbar.' using errcode='42501';end if;
  update public.homework_task t set title=btrim(task_title),subject=btrim(task_subject),description=coalesce(details,''),lesson_date=lesson,due_date=due,is_shared=shared,requires_submission=submission_required where t.id=task returning id into result;
 end if;
 return result;
end;$$;

create function public.hw_save_group(task uuid,task_title text,task_subject text,details text,lesson date,due date,shared boolean,submission_required boolean,target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid;existing public.homework_task;
begin
 if shared and (target is null or not public.school_can_teach(auth.uid(),target)) then raise exception 'Bitte eine zugeordnete Klasse oder einen Kurs auswählen.' using errcode='42501';end if;
 if task is not null then select * into existing from public.homework_task where id=task and author_id=auth.uid() for update;if not found then raise exception 'Aufgabe nicht bearbeitbar.' using errcode='42501';end if;end if;
 -- Reuse validated personal-save path; publish and target atomically in this function.
 saved:=public.hw_save(task,task_title,task_subject,details,lesson,due,false,false);
 update public.homework_task set is_shared=shared,requires_submission=submission_required and shared,group_id=case when shared then target else null end where id=saved;
 return saved;
end;$$;
create function public.hw_tasks_group() returns table(id uuid,author_id uuid,author_name text,title text,subject text,description text,lesson_date date,due_date date,is_shared boolean,requires_submission boolean,done boolean,submitted boolean,group_id uuid,group_name text)
language sql stable security definer set search_path='' as $$
 select t.id,t.author_id,coalesce(p.full_name,'Nutzer'),t.title,t.subject,t.description,t.lesson_date,t.due_date,t.is_shared,t.requires_submission,coalesce(g.done,false),exists(select 1 from public.homework_submission a where a.task_id=t.id and a.student_id=auth.uid()),t.group_id,c.name
 from public.homework_task t join public.profiles p on p.id=t.author_id left join public.homework_progress g on g.task_id=t.id and g.user_id=auth.uid() left join public.school_group c on c.id=t.group_id
 where public.hw_can_view(auth.uid(),t.id) order by t.due_date,t.created_at;
$$;
create or replace function public.hw_push_claim() returns table(user_id uuid,reminder_date date,lease_token uuid,subscriptions jsonb,task_count bigint) language plpgsql security definer set search_path='' as $$
declare local_now timestamp:=current_timestamp at time zone 'Europe/Berlin';
begin
 insert into public.hw_push_delivery(user_id,reminder_date)
 select p.user_id,local_now::date from public.hw_push_preference p
 where local_now::time>=p.reminder_time and local_now::time<p.reminder_time+interval '1 hour'
 and exists(select 1 from public.hw_push_subscription s where s.user_id=p.user_id)
 and exists(select 1 from public.homework_task t left join public.homework_progress g on g.task_id=t.id and g.user_id=p.user_id where not t.archived and t.due_date=local_now::date+1 and ((not t.is_shared and t.author_id=p.user_id) or (t.is_shared and public.portal_has_role(p.user_id,'user') and public.school_can_read(p.user_id,t.group_id))) and (not coalesce(g.done,false) or (t.requires_submission and not exists(select 1 from public.homework_submission a where a.task_id=t.id and a.student_id=p.user_id))))
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
 (select count(*) from public.homework_task t left join public.homework_progress g on g.task_id=t.id and g.user_id=c.user_id where not t.archived and t.due_date=local_now::date+1 and ((not t.is_shared and t.author_id=c.user_id) or (t.is_shared and public.portal_has_role(c.user_id,'user') and public.school_can_read(c.user_id,t.group_id))) and (not coalesce(g.done,false) or (t.requires_submission and not exists(select 1 from public.homework_submission a where a.task_id=t.id and a.student_id=c.user_id)))) from claimed c;
end;$$;
create function public.school_teacher_key(name text) returns text language sql immutable set search_path='' as $$
 select case when lower(btrim(name))='her bendig' then 'herr bendig' else regexp_replace(lower(btrim(name)),'^faru roos(,|$)','frau roos\1') end;
$$;
revoke all on function public.school_teacher_key(text) from public,anon,authenticated;
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
  from public.profiles p where public.portal_has_role(p.id,'user') and exists(
 select 1 from public.school_member m join public.school_schedule sc on sc.group_id=m.group_id cross join lateral jsonb_array_elements(sc.lessons) l
 where m.user_id=p.id and m.member_kind='student' and l->>'day'=(array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from e.date)::int+1]
 and public.school_teacher_key(l->>'teacher')=public.school_teacher_key(e.teacher) and (l->>'start')::time<e.end_time and (l->>'end')::time>e.start_time);
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;

-- Security-definer helpers are internal; clients use only the guarded RPCs below.
revoke all on function public.school_can_read(uuid,uuid),public.school_can_teach(uuid,uuid) from public,anon,authenticated;
revoke all on function public.school_groups(),public.school_group_save(uuid,text,text,uuid),public.school_roster(uuid),public.school_people(),public.school_enrol(uuid,uuid,text,boolean),public.school_lessons(uuid),public.school_schedule_save(uuid,jsonb),public.hw_save_group(uuid,text,text,text,date,date,boolean,boolean,uuid),public.hw_tasks_group() from public,anon,authenticated;
grant execute on function public.school_groups(),public.school_group_save(uuid,text,text,uuid),public.school_roster(uuid),public.school_people(),public.school_enrol(uuid,uuid,text,boolean),public.school_lessons(uuid),public.school_schedule_save(uuid,jsonb),public.hw_save_group(uuid,text,text,text,date,date,boolean,boolean,uuid),public.hw_tasks_group() to authenticated;
create or replace function public.hw_file_write(path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.portal_has_role(auth.uid(),'user') and split_part(path,'/',1)=auth.uid()::text and exists(select 1 from public.homework_task t where t.id::text=split_part(path,'/',2) and t.is_shared and t.requires_submission and not t.archived and public.hw_can_view(auth.uid(),t.id));
$$;
create function public.school_timetable(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(l||jsonb_build_object('group_id',sc.group_id)),'[]'::jsonb)
 from public.school_schedule sc join public.school_group g on g.id=sc.group_id cross join lateral jsonb_array_elements(sc.lessons) l
 where public.school_can_read(auth.uid(),target) and public.school_can_read(auth.uid(),g.id)
 and (g.id=target or (exists(select 1 from public.school_group selected where selected.id=target and selected.kind='class') and g.kind='course' and (g.parent_id=target or g.parent_id is null)));
$$;
revoke all on function public.school_timetable(uuid) from public,anon;grant execute on function public.school_timetable(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
