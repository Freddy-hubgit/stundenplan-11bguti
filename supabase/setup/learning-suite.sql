-- Einmaliges Gesamtpaket 032–036. Voraussetzung: vorhandene Einrichtung 001–030.
-- Nicht zusätzlich zu denselben einzeln ausgeführten Migrationen ausführen.
-- Migration 031 (Profilbilder) ist unabhängig. Bestehende Noten/Termine werden nicht gelöscht.
begin;

-- 202611110032_grades.sql
create table public.learning_grade(
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.profiles(id) on delete cascade,
 group_id uuid not null references public.school_group(id) on delete cascade,author_id uuid not null references public.profiles(id),
 subject text not null check(char_length(btrim(subject)) between 1 and 100),title text not null check(char_length(btrim(title)) between 1 and 160),
 term text not null check(char_length(btrim(term)) between 1 and 40),entry_date date not null check(isfinite(entry_date)),
 scale text not null check(scale in('grade','points')),category text not null check(category in('written','oral','other')),
 weight numeric not null default 1 check(weight>0 and weight<=100),student_value numeric,revision integer not null default 1,
 check(student_value is null or (scale='grade' and student_value between 1 and 6) or (scale='points' and student_value between 0 and 15))
);
create index on public.learning_grade(student_id,group_id,subject,term);
create table public.learning_self_assessment(grade_id uuid primary key references public.learning_grade on delete cascade,value numeric not null,notes text not null default '' check(char_length(notes)<=2000));
create table public.learning_teacher_grade(grade_id uuid references public.learning_grade on delete cascade,teacher_id uuid references public.profiles on delete cascade,value numeric not null,updated_at timestamptz not null default clock_timestamp(),primary key(grade_id,teacher_id));
alter table public.learning_grade enable row level security;alter table public.learning_self_assessment enable row level security;alter table public.learning_teacher_grade enable row level security;
revoke all on public.learning_grade,public.learning_self_assessment,public.learning_teacher_grade from public,anon,authenticated;
create function public.learning_can_grade(person uuid,student uuid,target uuid,subject_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.school_member m where m.group_id=target and m.user_id=student and m.member_kind='student') and
 (public.portal_has_role(person,'admin') or (public.school_can_teach(person,target) and exists(
 select 1 from public.teacher_identity i join public.school_schedule sc on sc.group_id=target cross join lateral jsonb_array_elements(sc.lessons) l
 where i.user_id=person and lower(btrim(l->>'subject'))=lower(btrim(subject_name)) and exists(select 1 from unnest(string_to_array(l->>'teacher',',')) t where public.school_teacher_key(t)=public.school_teacher_key(i.timetable_name)))));$$;
create function public.learning_roster(target uuid) returns table(id uuid,name text) language sql stable security definer set search_path='' as $$
 select p.id,coalesce(p.full_name,'Nutzer') from public.school_member m join public.profiles p on p.id=m.user_id
 where m.group_id=target and m.member_kind='student' and public.school_can_teach(auth.uid(),target) order by p.full_name,p.id;$$;
create function public.learning_grades() returns table(id uuid,student_id uuid,student_name text,group_id uuid,group_name text,author_id uuid,subject text,title text,term text,entry_date date,scale text,category text,weight numeric,student_value numeric,teacher_value numeric,teacher_name text,self_value numeric,self_notes text,can_edit boolean,revision integer) language sql stable security definer set search_path='' as $$
 select g.id,g.student_id,coalesce(p.full_name,'Nutzer'),g.group_id,c.name,g.author_id,g.subject,g.title,g.term,g.entry_date,g.scale,g.category,g.weight,g.student_value,
 teacher.value,tp.full_name,
 case when g.student_id=auth.uid() or own.value is not null then a.value else null end,
 case when g.student_id=auth.uid() or own.value is not null then a.notes else null end,
 public.learning_can_grade(auth.uid(),g.student_id,g.group_id,g.subject) or (g.student_id=auth.uid() and g.author_id=auth.uid() and not exists(select 1 from public.learning_teacher_grade x where x.grade_id=g.id)),g.revision
 from public.learning_grade g join public.profiles p on p.id=g.student_id join public.school_group c on c.id=g.group_id
 left join public.learning_self_assessment a on a.grade_id=g.id
 left join public.learning_teacher_grade own on own.grade_id=g.id and own.teacher_id=auth.uid()
 left join lateral(select t.* from public.learning_teacher_grade t where t.grade_id=g.id and (g.student_id=auth.uid() or t.teacher_id=auth.uid()) order by t.updated_at desc,t.teacher_id limit 1) teacher on true
 left join public.profiles tp on tp.id=teacher.teacher_id
 where g.student_id=auth.uid()
 or public.learning_can_grade(auth.uid(),g.student_id,g.group_id,g.subject)
 order by g.entry_date desc,g.id;$$;
create function public.learning_grade_save(entry uuid,expected_revision integer,student uuid,target uuid,subject_name text,label text,period text,day date,grading_scale text,grade_category text,grade_weight numeric,score numeric) returns uuid language plpgsql security definer set search_path='' as $$
declare g public.learning_grade;result uuid;teacher boolean;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if not exists(select 1 from public.profiles where profiles.id=auth.uid()) then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 teacher:=public.learning_can_grade(auth.uid(),student,target,subject_name) and student<>auth.uid();
 if not teacher and not (student=auth.uid() and public.portal_has_role(auth.uid(),'user') and exists(select 1 from public.school_member m where m.group_id=target and m.user_id=student and m.member_kind='student')) then raise exception 'Nur eigene Noten oder das eigene Unterrichtsfach sind bearbeitbar.' using errcode='42501';end if;
 if score is not null and not ((grading_scale='grade' and score between 1 and 6) or (grading_scale='points' and score between 0 and 15)) then raise exception 'Note 1–6 oder Punkte 0–15 angeben.' using errcode='22023';end if;
 if entry is null then
 insert into public.learning_grade(student_id,group_id,author_id,subject,title,term,entry_date,scale,category,weight,student_value)
 values(student,target,auth.uid(),btrim(subject_name),btrim(label),btrim(period),day,grading_scale,grade_category,grade_weight,case when teacher then null else score end) returning learning_grade.id into result;
 else
 select * into g from public.learning_grade where learning_grade.id=entry for update;
 if not found or g.revision is distinct from expected_revision then raise exception 'Eintrag wurde inzwischen geändert. Bitte neu laden.' using errcode='40001';end if;
 if (g.student_id,g.group_id,g.subject,g.term,g.scale) is distinct from (student,target,btrim(subject_name),btrim(period),grading_scale) then raise exception 'Person, Fach, Gruppe, Halbjahr und Notensystem eines vorhandenen Eintrags bleiben erhalten.';end if;
 if not teacher and (g.author_id<>auth.uid() or exists(select 1 from public.learning_teacher_grade t where t.grade_id=entry)) then raise exception 'Lehrereinträge können nur von zuständigen Lehrkräften geändert werden.' using errcode='42501';end if;
 update public.learning_grade set title=btrim(label),entry_date=day,category=grade_category,weight=grade_weight,student_value=case when teacher then student_value else score end,revision=revision+1 where learning_grade.id=entry;result:=entry;
 end if;
 if teacher and score is not null then insert into public.learning_teacher_grade values(result,auth.uid(),score,clock_timestamp()) on conflict(grade_id,teacher_id) do update set value=excluded.value,updated_at=excluded.updated_at;end if;
 return result;
end;$$;
create function public.learning_assess(entry uuid,score numeric,comment text) returns void language plpgsql security definer set search_path='' as $$
declare g public.learning_grade;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 select * into g from public.learning_grade where id=entry and student_id=auth.uid() for update;
 if not found or not exists(select 1 from public.school_member m where m.group_id=g.group_id and m.user_id=auth.uid() and m.member_kind='student') then raise exception 'Nur die eigene Selbsteinschätzung ist bearbeitbar.' using errcode='42501';end if;
 if score is null or not ((g.scale='grade' and score between 1 and 6) or (g.scale='points' and score between 0 and 15)) then raise exception 'Ungültige Selbsteinschätzung.';end if;
 insert into public.learning_self_assessment values(entry,score,coalesce(comment,'')) on conflict(grade_id) do update set value=excluded.value,notes=excluded.notes;
end;$$;
create function public.learning_grade_delete(entry uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 delete from public.learning_grade g where g.id=entry and (public.learning_can_grade(auth.uid(),g.student_id,g.group_id,g.subject) or (g.student_id=auth.uid() and g.author_id=auth.uid() and not exists(select 1 from public.learning_teacher_grade t where t.grade_id=g.id)));
 if not found then raise exception 'Eintrag nicht löschbar.' using errcode='42501';end if;
end;$$;
revoke all on function public.learning_can_grade(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.learning_roster(uuid),public.learning_grades(),public.learning_grade_save(uuid,integer,uuid,uuid,text,text,text,date,text,text,numeric,numeric),public.learning_assess(uuid,numeric,text),public.learning_grade_delete(uuid) from public,anon;
grant execute on function public.learning_roster(uuid),public.learning_grades(),public.learning_grade_save(uuid,integer,uuid,uuid,text,text,text,date,text,text,numeric,numeric),public.learning_assess(uuid,numeric,text),public.learning_grade_delete(uuid) to authenticated;
notify pgrst,'reload schema';

-- 202611110033_exam_calendar.sql
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

notify pgrst,'reload schema';

-- 202611110034_consultations.sql
-- Existing events without an owner remain shared blockers. Newly created entries belong to their creator.
alter table public.portal_event add column owner_id uuid references public.profiles(id) on delete set null;
alter table public.portal_event alter column owner_id set default auth.uid();
create table public.consultation_slot(id uuid primary key default gen_random_uuid(),teacher_id uuid not null references public.profiles on delete cascade,starts_at timestamptz not null,ends_at timestamptz not null,location text not null default '' check(char_length(location)<=200),cancelled boolean not null default false,check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at and ends_at-starts_at<=interval '1 hour'));
create table public.consultation_booking(id uuid primary key default gen_random_uuid(),slot_id uuid not null references public.consultation_slot on delete cascade,student_id uuid not null references public.profiles on delete cascade,topic text not null check(char_length(btrim(topic)) between 1 and 500),cancelled_at timestamptz);
create unique index consultation_one_booking on public.consultation_booking(slot_id) where cancelled_at is null;
alter table public.consultation_slot enable row level security;alter table public.consultation_booking enable row level security;
revoke all on public.consultation_slot,public.consultation_booking from public,anon,authenticated;
create function public.person_teaching(person uuid,day date) returns table(starts time,ends time) language sql stable security definer set search_path='' as $$
 with lessons as(select sc.group_id,l from public.school_schedule sc cross join lateral jsonb_array_elements(sc.lessons) l where l->>'day'=(array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from day)::integer+1]),
 segments as(select group_id,l,points.at,lead(points.at) over(partition by group_id,l order by points.at) until from lessons cross join lateral (
 select (l->>'start')::time at union select (l->>'end')::time union
 select greatest(s.start_time,(l->>'start')::time) from public.substitution_list() s where s.date=day and public.school_teacher_key(s.teacher)=public.school_teacher_key(l->>'teacher') and s.start_time<(l->>'end')::time and s.end_time>(l->>'start')::time union
 select least(s.end_time,(l->>'end')::time) from public.substitution_list() s where s.date=day and public.school_teacher_key(s.teacher)=public.school_teacher_key(l->>'teacher') and s.start_time<(l->>'end')::time and s.end_time>(l->>'start')::time) points)
 select distinct seg.at,seg.until from segments seg left join lateral(select s.* from public.substitution_list() s where s.date=day and public.school_teacher_key(s.teacher)=public.school_teacher_key(seg.l->>'teacher') and s.start_time<=seg.at and s.end_time>=seg.until order by s.updated_at desc,s.id limit 1) change on true
 where seg.until>seg.at and coalesce(change.kind,'')<>'cancelled' and
 (exists(select 1 from public.school_member m where m.user_id=person and m.member_kind='student' and m.group_id=seg.group_id)
 or exists(select 1 from public.teacher_identity i cross join lateral unnest(string_to_array(case when change.kind='replacement' then change.replacement_teacher else seg.l->>'teacher' end,',')) t where i.user_id=person and public.school_teacher_key(i.timetable_name)=public.school_teacher_key(t)));$$;
create function public.consult_busy(person uuid,period_start timestamptz,period_end timestamptz,except_booking uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.portal_event e where (e.owner_id is null or e.owner_id=person) and e.starts_at<period_end and e.ends_at>period_start)
 or exists(select 1 from public.room_booking r where r.owner_id=person and r.starts_at<period_end and r.ends_at>period_start)
 or exists(select 1 from public.consultation_booking b join public.consultation_slot s on s.id=b.slot_id where b.cancelled_at is null and not s.cancelled and b.id is distinct from except_booking and (b.student_id=person or s.teacher_id=person) and s.starts_at<period_end and s.ends_at>period_start)
 or exists(select 1 from public.person_teaching(person,(period_start at time zone 'Europe/Berlin')::date) t where (((period_start at time zone 'Europe/Berlin')::date+t.starts) at time zone 'Europe/Berlin')<period_end and (((period_start at time zone 'Europe/Berlin')::date+t.ends) at time zone 'Europe/Berlin')>period_start)
 or exists(select 1 from public.school_exam e where ((e.date+e.starts) at time zone 'Europe/Berlin')<period_end and ((e.date+e.ends) at time zone 'Europe/Berlin')>period_start and (e.author_id=person or exists(select 1 from public.school_member m where m.user_id=person and m.member_kind='student' and m.group_id=e.group_id)));$$;
create function public.consultation_list() returns table(id uuid,teacher_id uuid,teacher_name text,starts_at timestamptz,ends_at timestamptz,location text,booking_id uuid,student_name text,topic text,available boolean,can_manage boolean,can_cancel boolean) language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 return query select s.id,s.teacher_id,coalesce(p.full_name,'Lehrkraft'),s.starts_at,s.ends_at,s.location,
 case when b.student_id=auth.uid() or s.teacher_id=auth.uid() then b.id else null end,
 case when b.student_id=auth.uid() or s.teacher_id=auth.uid() then sp.full_name else null end,
 case when b.student_id=auth.uid() or s.teacher_id=auth.uid() then b.topic else null end,
 b.id is null and s.starts_at>now() and not public.consult_busy(s.teacher_id,s.starts_at,s.ends_at) and not public.consult_busy(auth.uid(),s.starts_at,s.ends_at),
 s.teacher_id=auth.uid() or public.portal_has_role(auth.uid(),'admin'),b.student_id=auth.uid() or s.teacher_id=auth.uid()
 from public.consultation_slot s join public.profiles p on p.id=s.teacher_id left join public.consultation_booking b on b.slot_id=s.id and b.cancelled_at is null left join public.profiles sp on sp.id=b.student_id
 where not s.cancelled and s.ends_at>now() and (public.portal_has_role(auth.uid(),'user') or s.teacher_id=auth.uid() or public.portal_has_role(auth.uid(),'admin')) order by s.starts_at,s.id;
end;$$;
create function public.consultation_offer(starts timestamptz,ends timestamptz,place text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if not public.portal_has_role(auth.uid(),'teacher') then raise exception 'Lehrerrolle erforderlich.' using errcode='42501';end if;
 if starts is null or ends is null or starts<=now() or starts>now()+interval '366 days' or (starts at time zone 'Europe/Berlin')::date<>(ends at time zone 'Europe/Berlin')::date or ends<=starts or ends-starts>interval '1 hour' then raise exception 'Zukünftigen Zeitraum am selben Tag, höchstens 60 Minuten, wählen.';end if;
 if public.consult_busy(auth.uid(),starts,ends) then raise exception 'Der Zeitraum ist durch Kalender, Unterricht, Prüfung oder eine Buchung belegt.' using errcode='23P01';end if;
 if exists(select 1 from public.consultation_slot s where s.teacher_id=auth.uid() and not s.cancelled and s.starts_at<ends and s.ends_at>starts) then raise exception 'Es besteht bereits ein Sprechstundenangebot in diesem Zeitraum.';end if;
 insert into public.consultation_slot(teacher_id,starts_at,ends_at,location) values(auth.uid(),starts,ends,coalesce(place,'')) returning id into result;return result;
end;$$;
create function public.consultation_book(slot uuid,details text) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.consultation_slot;result uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if not public.portal_has_role(auth.uid(),'user') then raise exception 'Schülerrolle erforderlich.' using errcode='42501';end if;
 select * into s from public.consultation_slot where id=slot and not cancelled for update;
 if not found or s.teacher_id=auth.uid() or s.starts_at<=now() then raise exception 'Sprechstunde ist nicht buchbar.';end if;
 if public.consult_busy(auth.uid(),s.starts_at,s.ends_at) or public.consult_busy(s.teacher_id,s.starts_at,s.ends_at) then raise exception 'Kalender, Unterricht, Prüfung oder Buchung einer beteiligten Person überschneidet sich.' using errcode='23P01';end if;
 insert into public.consultation_booking(slot_id,student_id,topic) values(slot,auth.uid(),btrim(details)) returning id into result;return result;
end;$$;
create function public.consultation_cancel(booking uuid default null,slot uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if booking is not null then
 update public.consultation_booking b set cancelled_at=clock_timestamp() from public.consultation_slot s where b.id=booking and b.slot_id=s.id and b.cancelled_at is null and (b.student_id=auth.uid() or s.teacher_id=auth.uid());
 if not found then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 elsif slot is not null then
 update public.consultation_slot s set cancelled=true where s.id=slot and (s.teacher_id=auth.uid() or public.portal_has_role(auth.uid(),'admin'));
 if not found then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 update public.consultation_booking set cancelled_at=clock_timestamp() where slot_id=slot and cancelled_at is null;
 end if;
end;$$;
-- A later change cannot silently double-book a confirmed appointment.
create function public.consultation_conflict_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if exists(select 1 from public.consultation_booking b join public.consultation_slot s on s.id=b.slot_id where b.cancelled_at is null and not s.cancelled and s.ends_at>now() and (public.consult_busy(b.student_id,s.starts_at,s.ends_at,b.id) or public.consult_busy(s.teacher_id,s.starts_at,s.ends_at,b.id))) then raise exception 'Änderung kollidiert mit einer gebuchten Sprechstunde. Bitte die Sprechstunde zuerst absagen.' using errcode='23P01';end if;
 return null;
end;$$;
do $$declare t text;begin foreach t in array array['portal_event','school_schedule','substitution_entry','room_booking','school_exam','school_member','teacher_identity'] loop execute format('create constraint trigger consultation_conflict after insert or update or delete on public.%I deferrable initially deferred for each row execute function public.consultation_conflict_guard()',t);end loop;end$$;
revoke all on function public.person_teaching(uuid,date),public.consult_busy(uuid,timestamptz,timestamptz,uuid),public.consultation_conflict_guard() from public,anon,authenticated;
revoke all on function public.consultation_list(),public.consultation_offer(timestamptz,timestamptz,text),public.consultation_book(uuid,text),public.consultation_cancel(uuid,uuid) from public,anon;
grant execute on function public.consultation_list(),public.consultation_offer(timestamptz,timestamptz,text),public.consultation_book(uuid,text),public.consultation_cancel(uuid,uuid) to authenticated;
create or replace function public.portal_event_save(entry_id uuid, entry_kind text, entry_title text, details text,
 starts timestamptz, ends timestamptz, place text, meeting_link text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
 if auth.uid() is null or not (public.support_is_staff() or public.portal_has_role(auth.uid(),'teacher')) then raise exception 'Lehrer-, Support- oder Adminrolle erforderlich.' using errcode='42501';end if;
 if entry_kind is null or entry_kind not in ('event','meeting') or entry_title is null
  or char_length(btrim(entry_title)) not between 1 and 160 or starts is null or ends is null
  or not pg_catalog.isfinite(starts) or not pg_catalog.isfinite(ends) or ends <= starts
  or char_length(coalesce(details,'')) > 5000 or char_length(coalesce(place,'')) > 200
  or char_length(coalesce(meeting_link,'')) > 2000
  or (entry_kind = 'meeting' and btrim(coalesce(meeting_link,'')) = '')
  or (btrim(coalesce(meeting_link,'')) <> '' and btrim(meeting_link) !~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]<>]*)?$') then
  raise exception 'Invalid event or HTTPS meeting URL' using errcode = '22023';
 end if;
 if entry_id is null then
  insert into public.portal_event(kind,title,description,starts_at,ends_at,location,meeting_url)
  values(entry_kind,btrim(entry_title),btrim(coalesce(details,'')),starts,ends,btrim(coalesce(place,'')),btrim(coalesce(meeting_link,'')))
  returning id into saved_id;
 else
  update public.portal_event e set kind=entry_kind,title=btrim(entry_title),description=btrim(coalesce(details,'')),
   starts_at=starts,ends_at=ends,location=btrim(coalesce(place,'')),meeting_url=btrim(coalesce(meeting_link,'')),updated_at=clock_timestamp()
  where e.id=entry_id and (public.support_is_staff() or e.owner_id=auth.uid()) returning e.id into saved_id;
  if not found then raise exception 'Event unavailable' using errcode = '22023'; end if;
 end if;
 return saved_id;
end;
$$;
create or replace function public.portal_event_delete(entry_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not (public.support_is_staff() or public.portal_has_role(auth.uid(),'teacher')) then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 delete from public.portal_event e where e.id=entry_id and (public.support_is_staff() or e.owner_id=auth.uid());
 if not found then raise exception 'Event unavailable' using errcode = '22023'; end if;
end;
$$;

notify pgrst,'reload schema';

-- 202611110035_search_trash.sql
create table public.portal_trash(id uuid primary key default gen_random_uuid(),kind text not null check(kind in('notebook','material','exam','homework')),entity_id uuid not null,owner_id uuid not null references public.profiles on delete cascade,group_id uuid references public.school_group on delete cascade,title text not null,payload jsonb not null,deleted_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '30 days',unique(kind,entity_id));
alter table public.portal_trash enable row level security;revoke all on public.portal_trash from public,anon,authenticated;
create function public.trash_can_manage(item public.portal_trash) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and ((item.kind='notebook' and item.owner_id=auth.uid()) or
 (item.kind<>'notebook' and ((item.owner_id=auth.uid() and (item.group_id is null or public.school_can_teach(auth.uid(),item.group_id) or (item.kind='exam' and public.portal_has_role(auth.uid(),'teacher')))) or (item.group_id is not null and public.portal_has_role(auth.uid(),'admin')))));$$;
create or replace function public.notebook_delete(page uuid,expected_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare p public.notebook_page;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 select * into p from public.notebook_page where id=page and owner_id=auth.uid() and revision=expected_revision for update;
 if not found then raise exception 'Seite wurde geändert oder gehört nicht dir.' using errcode='40001';end if;
 insert into public.portal_trash(kind,entity_id,owner_id,title,payload) values('notebook',p.id,p.owner_id,p.title,to_jsonb(p));
 delete from public.notebook_page where id=page;
end;$$;
create or replace function public.school_material_delete(material uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.school_material;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);select * into m from public.school_material where id=material for update;
 if not found or not (public.portal_has_role(auth.uid(),'admin') or (m.author_id=auth.uid() and public.school_can_teach(auth.uid(),m.group_id))) then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 insert into public.portal_trash(kind,entity_id,owner_id,group_id,title,payload) values('material',m.id,m.author_id,m.group_id,m.title,to_jsonb(m));
 delete from public.school_material where id=material;
end;$$;
create or replace function public.school_material_can_delete(path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.portal_has_role(auth.uid(),'admin') or public.school_material_file(path,true))
 and not exists(select 1 from public.portal_trash t where t.kind='material' and t.payload->>'file_path'=path);
$$;
create or replace function public.school_exam_delete(exam uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.school_exam;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);select * into e from public.school_exam where id=exam for update;
 if not found or not(public.portal_has_role(auth.uid(),'admin') or (e.author_id=auth.uid() and (public.school_can_teach(auth.uid(),e.group_id) or public.portal_has_role(auth.uid(),'teacher')))) then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 insert into public.portal_trash(kind,entity_id,owner_id,group_id,title,payload) values('exam',e.id,e.author_id,e.group_id,e.title,to_jsonb(e));delete from public.school_exam where id=exam;
end;$$;
create or replace function public.hw_archive(task uuid) returns void language plpgsql security definer set search_path='' as $$
declare t public.homework_task;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);select * into t from public.homework_task where id=task and author_id=auth.uid() and not archived and (not is_shared or public.portal_has_role(auth.uid(),'teacher') or public.portal_has_role(auth.uid(),'admin')) for update;
 if not found then raise exception 'Keine Berechtigung oder bereits im Papierkorb.' using errcode='42501';end if;
 insert into public.portal_trash(kind,entity_id,owner_id,group_id,title,payload) values('homework',t.id,t.author_id,t.group_id,t.title,to_jsonb(t));update public.homework_task set archived=true where id=task;
end;$$;
create function public.portal_trash_list() returns table(id uuid,kind text,title text,deleted_at timestamptz,expires_at timestamptz) language sql stable security definer set search_path='' as $$
 select t.id,t.kind,t.title,t.deleted_at,t.expires_at from public.portal_trash t where public.trash_can_manage(t) and t.expires_at>now() order by t.deleted_at desc,t.id;$$;
create function public.portal_trash_restore(item uuid) returns void language plpgsql security definer set search_path='' as $$
declare t public.portal_trash;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);select * into t from public.portal_trash where id=item and expires_at>now() for update;
 if not found or not public.trash_can_manage(t) then raise exception 'Eintrag fehlt, ist abgelaufen oder nicht freigegeben.' using errcode='42501';end if;
 if t.kind='notebook' then insert into public.notebook_page select r.* from jsonb_populate_record(null::public.notebook_page,t.payload||jsonb_build_object('revision',(t.payload->>'revision')::integer+1)) r;
 elsif t.kind='material' then
 if coalesce(t.payload->>'file_path','')<>'' and not exists(select 1 from storage.objects where bucket_id='school-materials' and name=t.payload->>'file_path') then raise exception 'Die ursprüngliche Datei ist nicht mehr vorhanden.';end if;
 insert into public.school_material select r.* from jsonb_populate_record(null::public.school_material,t.payload) r;
 elsif t.kind='exam' then insert into public.school_exam select r.* from jsonb_populate_record(null::public.school_exam,t.payload) r;
 elsif t.kind='homework' then update public.homework_task set archived=false where homework_task.id=t.entity_id;if not found then raise exception 'Hausaufgabe ist nicht mehr vorhanden.';end if;
 end if;delete from public.portal_trash where id=item;
end;$$;
create function public.portal_trash_purge(item uuid) returns void language plpgsql security definer set search_path='' as $$
declare t public.portal_trash;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);select * into t from public.portal_trash where id=item for update;
 if not found or not public.trash_can_manage(t) then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 if t.kind='material' and coalesce(t.payload->>'file_path','')<>'' then insert into public.school_cleanup_file(bucket,path) values('school-materials',t.payload->>'file_path') on conflict do nothing;end if;
 if t.kind='homework' then
 insert into public.school_cleanup_file(bucket,path) select 'homework-submissions',file_path from public.homework_submission where task_id=t.entity_id and file_path<>'' on conflict do nothing;
 delete from public.homework_task where homework_task.id=t.entity_id and archived;
 end if;delete from public.portal_trash where id=item;
end;$$;
create function public.portal_search(query text) returns table(kind text,id uuid,title text,preview text,route text) language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 if query is null or char_length(btrim(query)) not between 2 and 100 then return;end if;
 return query select x.kind,x.id,x.title,left(x.preview,180),x.route from (
 select 'Heft'::text kind,p.id,p.title,concat_ws(' · ',nullif(p.subject,''),p.body) preview,'/hefte'::text route from public.notebook_pages() p
 union all select 'Material',m.id,m.title,concat_ws(' · ',m.group_name,m.subject,m.description),'/materialien' from public.school_materials() m
 union all select 'Hausaufgabe',h.id,h.title,concat_ws(' · ',h.group_name,h.subject,h.description),'/hausaufgaben' from public.hw_tasks_group() h
 union all select 'Prüfung',e.id,e.title,concat_ws(' · ',e.group_name,e.subject,e.date::text,e.details),'/pruefungen' from public.exam_calendar_list() e
 union all select 'Termin',e.id,e.title,concat_ws(' · ',e.description,e.location),case when e.kind='meeting' then '/videokonferenz' else '/kalender' end from public.portal_events_list() e
 ) x where strpos(lower(x.title||' '||x.preview),lower(btrim(query)))>0 order by x.kind,x.title,x.id limit 50;
end;$$;
revoke all on function public.trash_can_manage(public.portal_trash) from public,anon,authenticated;
revoke all on function public.portal_trash_list(),public.portal_trash_restore(uuid),public.portal_trash_purge(uuid),public.portal_search(text) from public,anon;
grant execute on function public.portal_trash_list(),public.portal_trash_restore(uuid),public.portal_trash_purge(uuid),public.portal_search(text) to authenticated;
notify pgrst,'reload schema';

-- 202611110036_learning_integration.sql
-- Only the caller's teaching entries are returned, never entire foreign class plans.
create or replace function public.school_my_teaching() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare who text;entries jsonb;
begin
 if not public.portal_has_role(auth.uid(),'teacher') then raise exception 'Lehrerrolle erforderlich.' using errcode='42501';end if;
 select timetable_name into who from public.teacher_identity where user_id=auth.uid();
 if coalesce(btrim(who),'')='' then return jsonb_build_object('teacher','','lessons','[]'::jsonb);end if;
 select coalesce(jsonb_agg(l||jsonb_build_object('group_id',g.id,'group_name',g.name)),'[]'::jsonb) into entries
 from public.school_schedule sc join public.school_group g on g.id=sc.group_id cross join lateral jsonb_array_elements(sc.lessons) l
 where exists(select 1 from unnest(string_to_array(l->>'teacher',',')) t where public.school_teacher_key(t)=public.school_teacher_key(who))
 or exists(select 1 from public.substitution_list() s where s.kind='replacement' and public.school_teacher_key(s.replacement_teacher)=public.school_teacher_key(who) and public.school_teacher_key(s.teacher)=public.school_teacher_key(l->>'teacher') and s.start_time::text<l->>'end' and s.end_time::text>l->>'start');
 return jsonb_build_object('teacher',who,'lessons',entries);
end;$$;
revoke all on function public.school_my_teaching() from public,anon,authenticated;
grant execute on function public.school_my_teaching() to authenticated;


alter table public.portal_tile_setting drop constraint portal_tile_setting_route_check;
alter table public.portal_tile_setting add constraint portal_tile_setting_route_check check(route in('/hefte','/klassen','/materialien','/meldungen','/hausaufgaben','/nachrichten','/videokonferenz','/stundenplan','/krankmeldung','/schuljahr','/raumbuchung','/abgaben','/aenderungsverlauf','/kalender','/support','/vertretungsplan','/noten','/pruefungen','/sprechstunden','/suche','/papierkorb','/lehrerstundenplan'));
-- New school-year content participates in the existing reviewed reset and its staleness checks.
do $$declare t text;definition text;begin
 foreach t in array array['learning_grade','learning_self_assessment','learning_teacher_grade','consultation_slot','consultation_booking','portal_trash'] loop
 execute format('create trigger school_reset_revision before insert or update or delete on public.%I for each statement execute function public.school_track_change()',t);end loop;
 select pg_get_functiondef('public.school_reset_plan(boolean,boolean,boolean)'::regprocedure) into definition;
 definition:=replace(definition,'counts:=jsonb_build_object(', 'counts:=jsonb_build_object(''Noteneinträge'',(select count(*) from public.learning_grade),''Sprechstundenangebote'',(select count(*) from public.consultation_slot),''Sprechstundenbuchungen'',(select count(*) from public.consultation_booking),''Papierkorb'',(select count(*) from public.portal_trash),');execute definition;
 select pg_get_functiondef('public.school_reset_execute(uuid,text)'::regprocedure) into definition;
 definition:=replace(definition,'delete from public.teacher_absence;', 'delete from public.consultation_slot;delete from public.learning_grade;delete from public.portal_trash;delete from public.teacher_absence;');execute definition;
end$$;
notify pgrst,'reload schema';

notify pgrst,'reload schema';
commit;
