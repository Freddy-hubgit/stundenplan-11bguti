-- Einmaliges Gesamtpaket 024–028. Nicht zusätzlich zu den einzelnen Migrationen ausführen.
-- Voraussetzung: Migrationen 001–023. Keine produktiven Daten werden beim Einrichten gelöscht.
begin;

-- 202610310024_absence_periods.sql
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
notify pgrst,'reload schema';

-- 202610310025_group_chats.sql
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
notify pgrst,'reload schema';

-- 202610310026_submission_review.sql
create table public.homework_feedback(task_id uuid not null references public.homework_task(id) on delete cascade,student_id uuid not null references public.profiles(id) on delete cascade,reviewer_id uuid references public.profiles(id) on delete set null,body text not null check(char_length(body)<=5000),reviewed_at timestamptz not null default now(),primary key(task_id,student_id));
alter table public.homework_feedback enable row level security;revoke all on public.homework_feedback from public,anon,authenticated;
create function public.hw_can_review(task uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.homework_task t where t.id=task and t.is_shared and t.requires_submission and (public.portal_has_role(auth.uid(),'admin') or public.school_can_teach(auth.uid(),t.group_id)));$$;
revoke all on function public.hw_can_review(uuid) from public,anon,authenticated;
create function public.hw_review_overview() returns table(task_id uuid,title text,subject text,group_name text,due_date date,expected bigint,submitted bigint,reviewed bigint) language sql stable security definer set search_path='' as $$
 select t.id,t.title,t.subject,g.name,t.due_date,
 (select count(*) from public.school_member m where m.group_id=t.group_id and m.member_kind='student' and public.portal_has_role(m.user_id,'user')),
 (select count(*) from public.homework_submission s where s.task_id=t.id and public.portal_has_role(s.student_id,'user') and exists(select 1 from public.school_member m where m.group_id=t.group_id and m.user_id=s.student_id and m.member_kind='student')),
 (select count(*) from public.homework_feedback f where f.task_id=t.id and public.portal_has_role(f.student_id,'user') and exists(select 1 from public.school_member m where m.group_id=t.group_id and m.user_id=f.student_id and m.member_kind='student'))
 from public.homework_task t join public.school_group g on g.id=t.group_id where not t.archived and public.hw_can_review(t.id) order by t.due_date,t.id;$$;
create function public.hw_review_students(task uuid) returns table(student_id uuid,student_name text,done boolean,body text,link text,file_path text,file_name text,submitted_at timestamptz,feedback text,reviewed_at timestamptz) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.hw_can_review(task) then raise exception 'Keine Berechtigung für diese Abgabeübersicht.' using errcode='42501';end if;
 return query select p.id,p.full_name,coalesce(pr.done,false),s.body,s.link,s.file_path,s.file_name,s.submitted_at,f.body,f.reviewed_at
 from public.homework_task t join public.school_member m on m.group_id=t.group_id and m.member_kind='student' join public.profiles p on p.id=m.user_id
 left join public.homework_submission s on s.task_id=t.id and s.student_id=p.id left join public.homework_progress pr on pr.task_id=t.id and pr.user_id=p.id left join public.homework_feedback f on f.task_id=t.id and f.student_id=p.id
 where t.id=task and public.portal_has_role(p.id,'user') order by p.full_name,p.id;
end;$$;
create function public.hw_review_save(task uuid,student uuid,comment_text text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if not public.hw_can_review(task) then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 if not public.portal_has_role(student,'user') or not exists(select 1 from public.homework_submission s join public.homework_task t on t.id=s.task_id join public.school_member m on m.group_id=t.group_id and m.user_id=s.student_id and m.member_kind='student' where s.task_id=task and s.student_id=student) then raise exception 'Keine aktuelle Abgabe vorhanden.';end if;
 if comment_text is null or char_length(comment_text)>5000 then raise exception 'Rückmeldung maximal 5000 Zeichen.';end if;
 insert into public.homework_feedback(task_id,student_id,reviewer_id,body) values(task,student,auth.uid(),btrim(comment_text)) on conflict(task_id,student_id) do update set body=excluded.body,reviewer_id=excluded.reviewer_id,reviewed_at=clock_timestamp();
end;$$;
create function public.hw_my_feedback(task uuid) returns table(body text,reviewed_at timestamptz) language sql stable security definer set search_path='' as $$
 select f.body,f.reviewed_at from public.homework_feedback f where f.task_id=task and f.student_id=auth.uid() and public.hw_can_view(auth.uid(),task);$$;
-- Teachers reviewing their groups may download only files referenced by those submissions.
create or replace function public.hw_file_read(path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (split_part(path,'/',1)=auth.uid()::text or exists(select 1 from public.homework_submission s where s.file_path=path and public.hw_can_review(s.task_id)));$$;

create or replace function public.hw_submissions(task uuid) returns table(student_id uuid,student_name text,body text,link text,file_path text,file_name text,submitted_at timestamptz) language sql stable security definer set search_path='' as $$
 select s.student_id,coalesce(p.full_name,'Nutzer'),s.body,s.link,s.file_path,s.file_name,s.submitted_at from public.homework_submission s join public.profiles p on p.id=s.student_id where s.task_id=task and (s.student_id=auth.uid() or public.hw_can_review(task)) order by s.submitted_at;$$;
create function public.hw_feedback_stale() returns trigger language plpgsql security definer set search_path='' as $$begin delete from public.homework_feedback where task_id=new.task_id and student_id=new.student_id;return new;end;$$;
create trigger hw_resubmission_feedback before update on public.homework_submission for each row execute function public.hw_feedback_stale();
revoke all on function public.hw_review_overview(),public.hw_review_students(uuid),public.hw_review_save(uuid,uuid,text),public.hw_my_feedback(uuid) from public,anon,authenticated;
grant execute on function public.hw_review_overview(),public.hw_review_students(uuid),public.hw_review_save(uuid,uuid,text),public.hw_my_feedback(uuid) to authenticated;
revoke all on function public.hw_feedback_stale() from public,anon,authenticated;
notify pgrst,'reload schema';

-- 202610310027_room_booking.sql
create table public.school_room(id uuid primary key default gen_random_uuid(),name text not null check(char_length(btrim(name)) between 1 and 80),details text not null default '' check(char_length(details)<=1000),bookable boolean not null default false);
create unique index school_room_name on public.school_room(lower(btrim(name)));
create table public.room_booking(id uuid primary key default gen_random_uuid(),room_id uuid not null references public.school_room(id),owner_id uuid not null references public.profiles(id) on delete cascade,title text not null check(char_length(btrim(title)) between 1 and 160),starts_at timestamptz not null,ends_at timestamptz not null,created_at timestamptz not null default now(),check(ends_at>starts_at and ends_at-starts_at<=interval '12 hours'));
create index on public.room_booking(room_id,starts_at,ends_at);
alter table public.school_room enable row level security;alter table public.room_booking enable row level security;revoke all on public.school_room,public.room_booking from public,anon,authenticated;
create function public.school_rooms() returns setof public.school_room language sql stable security definer set search_path='' as $$ select r.* from public.school_room r where auth.uid() is not null and (r.bookable or public.portal_has_role(auth.uid(),'admin') or exists(select 1 from public.room_booking b where b.room_id=r.id and b.owner_id=auth.uid() and b.ends_at>now())) order by r.name,r.id;$$;
create function public.school_room_save(target uuid,label text,info text,enabled boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if enabled is null then raise exception 'Buchbarkeit erforderlich.';end if;
 if target is null then insert into public.school_room(name,details,bookable) values(btrim(label),coalesce(info,''),enabled) returning id into result;
 else update public.school_room set name=btrim(label),details=coalesce(info,''),bookable=enabled where id=target returning id into result;if result is null then raise exception 'Raum fehlt.';end if;end if;return result;
end;$$;
-- Resolve ordinary teaching and approved partial substitutions into occupied room segments.
create function public.room_teaching(day date) returns table(room text,starts time,ends time) language sql stable security definer set search_path='' as $$
 with lessons as(select l from public.school_schedule sc cross join lateral jsonb_array_elements(sc.lessons) l where l->>'day'=(array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from day)::int+1]),
 segments as(select l,points.at,lead(points.at) over(partition by l order by points.at) until from lessons cross join lateral (
 select (l->>'start')::time at union select (l->>'end')::time union
 select greatest(s.start_time,(l->>'start')::time) from public.substitution_list() s where s.date=day and public.school_teacher_key(s.teacher)=public.school_teacher_key(l->>'teacher') and s.start_time<(l->>'end')::time and s.end_time>(l->>'start')::time union
 select least(s.end_time,(l->>'end')::time) from public.substitution_list() s where s.date=day and public.school_teacher_key(s.teacher)=public.school_teacher_key(l->>'teacher') and s.start_time<(l->>'end')::time and s.end_time>(l->>'start')::time) points)
 select distinct btrim(r),seg.at,seg.until from segments seg left join lateral(select s.* from public.substitution_list() s where s.date=day and public.school_teacher_key(s.teacher)=public.school_teacher_key(seg.l->>'teacher') and s.start_time<=seg.at and s.end_time>=seg.until order by s.updated_at desc,s.id limit 1) change on true
 cross join lateral unnest(string_to_array(coalesce(nullif(change.room,''),seg.l->>'room'),',')) r
 where seg.until>seg.at and coalesce(change.kind,'')<>'cancelled';$$;
revoke all on function public.room_teaching(date) from public,anon,authenticated;
create function public.school_room_slots(day date) returns table(id uuid,room_id uuid,label text,starts_at timestamptz,ends_at timestamptz,can_cancel boolean,teaching boolean) language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where profiles.id=auth.uid()) then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 if day is null or not isfinite(day) then raise exception 'Tag erforderlich.';end if;
 return query select b.id,b.room_id,case when b.owner_id=auth.uid() or public.portal_has_role(auth.uid(),'admin') then b.title else 'Reserviert' end,b.starts_at,b.ends_at,b.owner_id=auth.uid() or public.portal_has_role(auth.uid(),'admin'),false
 from public.room_booking b join public.school_room r on r.id=b.room_id where (r.bookable or public.portal_has_role(auth.uid(),'admin') or b.owner_id=auth.uid()) and b.starts_at<(day+1)::timestamp at time zone 'Europe/Berlin' and b.ends_at>day::timestamp at time zone 'Europe/Berlin'
 union all select null::uuid,r.id,'Unterricht'::text,(day+t.starts) at time zone 'Europe/Berlin',(day+t.ends) at time zone 'Europe/Berlin',false,true from public.room_teaching(day) t join public.school_room r on lower(btrim(r.name))=lower(btrim(t.room)) where r.bookable or public.portal_has_role(auth.uid(),'admin');
end;$$;
create function public.school_room_book(target uuid,label text,from_time timestamptz,to_time timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;local_day date;
begin
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837266);perform pg_catalog.pg_advisory_xact_lock(hashtextextended(target::text,85));
 if not exists(select 1 from public.school_room where id=target and bookable) then raise exception 'Raum ist nicht zur Buchung freigegeben.' using errcode='42501';end if;
 if from_time is null or to_time is null or not isfinite(from_time) or not isfinite(to_time) or from_time<=now() or to_time<=from_time or to_time-from_time>interval '12 hours' or from_time>now()+interval '366 days' or (from_time at time zone 'Europe/Berlin')::date<>(to_time at time zone 'Europe/Berlin')::date then raise exception 'Bitte einen zukünftigen Zeitraum am selben Tag (maximal 12 Stunden) wählen.';end if;
 local_day:=(from_time at time zone 'Europe/Berlin')::date;
 if exists(select 1 from public.room_booking b where b.room_id=target and b.starts_at<to_time and b.ends_at>from_time) or exists(select 1 from public.room_teaching(local_day) t join public.school_room r on r.id=target and lower(btrim(r.name))=lower(btrim(t.room)) where (local_day+t.starts) at time zone 'Europe/Berlin'<to_time and (local_day+t.ends) at time zone 'Europe/Berlin'>from_time) then raise exception 'Raum ist durch Unterricht oder eine Buchung belegt.' using errcode='23P01';end if;
 insert into public.room_booking(room_id,owner_id,title,starts_at,ends_at) values(target,auth.uid(),btrim(label),from_time,to_time) returning id into result;return result;
end;$$;
create function public.school_room_cancel(booking uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 delete from public.room_booking where id=booking and (owner_id=auth.uid() or public.portal_has_role(auth.uid(),'admin'));
 if not found then raise exception 'Keine Berechtigung oder Buchung bereits entfernt.' using errcode='42501';end if;
end;$$;
-- A later timetable/room substitution may not silently overwrite an existing reservation.
create function public.school_room_teaching_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.room_booking b join public.school_room r on r.id=b.room_id cross join lateral public.room_teaching((b.starts_at at time zone 'Europe/Berlin')::date) t
 where b.ends_at>now() and lower(btrim(t.room))=lower(btrim(r.name)) and (((b.starts_at at time zone 'Europe/Berlin')::date+t.starts) at time zone 'Europe/Berlin')<b.ends_at and (((b.starts_at at time zone 'Europe/Berlin')::date+t.ends) at time zone 'Europe/Berlin')>b.starts_at) then raise exception 'Die Unterrichtsänderung kollidiert mit einer Raumbuchung. Bitte die Buchung zuerst im Bereich Raumbuchung prüfen.' using errcode='23P01';end if;
 return null;
end;$$;
create constraint trigger room_timetable_conflict after insert or update or delete on public.school_schedule deferrable initially deferred for each row execute function public.school_room_teaching_guard();
create constraint trigger room_substitution_conflict after insert or update or delete on public.substitution_entry deferrable initially deferred for each row execute function public.school_room_teaching_guard();
revoke all on function public.school_rooms(),public.school_room_save(uuid,text,text,boolean),public.school_room_slots(date),public.school_room_book(uuid,text,timestamptz,timestamptz),public.school_room_cancel(uuid) from public,anon,authenticated;
grant execute on function public.school_rooms(),public.school_room_save(uuid,text,text,boolean),public.school_room_slots(date),public.school_room_book(uuid,text,timestamptz,timestamptz),public.school_room_cancel(uuid) to authenticated;
revoke all on function public.school_room_teaching_guard() from public,anon,authenticated;
notify pgrst,'reload schema';

-- 202610310028_change_history.sql
create table public.portal_audit(id bigint generated always as identity primary key,actor uuid references public.profiles(id) on delete set null,actor_name text not null,entity text not null,record_key text not null,record_label text not null,action text not null,before_value jsonb,after_value jsonb,created_at timestamptz not null default clock_timestamp(),reverted_by bigint references public.portal_audit(id));
alter table public.portal_audit enable row level security;revoke all on public.portal_audit from public,anon,authenticated;
create function public.portal_audit_write() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb;after_row jsonb;record_id text;label text;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 if tg_table_name='profiles' then
  before_row:=case when before_row is null then null else jsonb_build_object('roles',before_row->'roles','role',before_row->'role') end;
  after_row:=case when after_row is null then null else jsonb_build_object('roles',after_row->'roles','role',after_row->'role') end;
  if before_row is not distinct from after_row then return null;end if;
 end if;
 if before_row is not distinct from after_row then return null;end if;
 if tg_table_name='school_schedule' then record_id:=coalesce(new.group_id,old.group_id)::text;
 elsif tg_table_name='school_member' then record_id:=coalesce(new.group_id,old.group_id)::text||'/'||coalesce(new.user_id,old.user_id)::text;
 else record_id:=coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id');end if;
 label:=case tg_table_name
 when 'profiles' then coalesce(to_jsonb(new)->>'full_name',to_jsonb(old)->>'full_name',record_id)
 when 'school_schedule' then coalesce((select name from public.school_group where id=record_id::uuid),record_id)
 when 'school_member' then coalesce((select name from public.school_group where id=coalesce(to_jsonb(new)->>'group_id',to_jsonb(old)->>'group_id')::uuid),'Gruppe')||' · '||coalesce((select full_name from public.profiles where id=coalesce(to_jsonb(new)->>'user_id',to_jsonb(old)->>'user_id')::uuid),coalesce(to_jsonb(new)->>'user_id',to_jsonb(old)->>'user_id'))
 when 'school_group' then coalesce(after_row->>'name',before_row->>'name',record_id)
 when 'teacher_absence' then coalesce(after_row->>'teacher_name',before_row->>'teacher_name',record_id)
 when 'substitution_entry' then coalesce(after_row->>'teacher',before_row->>'teacher',record_id)
 when 'school_room' then coalesce(after_row->>'name',before_row->>'name',record_id)
 when 'room_booking' then coalesce((select name from public.school_room where id=coalesce(after_row->>'room_id',before_row->>'room_id')::uuid),'Raum')||' · '||coalesce(after_row->>'title',before_row->>'title','Buchung')
 else record_id end;
 insert into public.portal_audit(actor,actor_name,entity,record_key,record_label,action,before_value,after_value) values(auth.uid(),coalesce((select p.full_name from public.profiles p where p.id=auth.uid()),'System'),tg_table_name,record_id,label,tg_op,before_row,after_row);
 return null;
end;$$;
do $$declare tbl text;begin
 foreach tbl in array array['profiles','school_schedule','school_member','school_group','teacher_absence','substitution_entry','school_room','room_booking'] loop
 execute format('create trigger portal_change_history after insert or update or delete on public.%I for each row execute function public.portal_audit_write()',tbl);end loop;
 -- Extend preview staleness protection to all newly introduced content.
 foreach tbl in array array['chat_group','chat_group_message','homework_feedback','school_room','room_booking'] loop
 execute format('create trigger school_reset_revision before insert or update or delete on public.%I for each statement execute function public.school_track_change()',tbl);end loop;
create trigger school_reset_revision before insert or delete on public.chat_member for each statement execute function public.school_track_change();
end;$$;
create function public.portal_changes(before_id bigint default null,entity_filter text default '') returns setof public.portal_audit language plpgsql stable security definer set search_path='' as $$begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 return query select a.* from public.portal_audit a where (before_id is null or a.id<before_id) and (entity_filter='' or a.entity=entity_filter) order by a.id desc limit 50;
end;$$;
create function public.portal_change_undo(change_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare change public.portal_audit;current_row jsonb;undo_id bigint;
begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837266);
 select * into change from public.portal_audit where id=change_id for update;
 if not found or change.entity<>'school_schedule' or change.action<>'UPDATE' or change.reverted_by is not null or change.before_value is null then raise exception 'Nur noch nicht zurückgenommene Stundenplanänderungen können rückgängig gemacht werden.';end if;
 select to_jsonb(s) into current_row from public.school_schedule s where s.group_id=change.record_key::uuid for update;
 if current_row is distinct from change.after_value or exists(select 1 from public.portal_audit a where a.entity=change.entity and a.record_key=change.record_key and a.id>change.id) then raise exception 'Inzwischen geändert. Bitte aktuellen Stundenplan prüfen.' using errcode='40001';end if;
 perform public.school_schedule_save(change.record_key::uuid,change.before_value->'lessons');
 select max(id) into undo_id from public.portal_audit where entity='school_schedule' and record_key=change.record_key;
 update public.portal_audit set reverted_by=undo_id where id=change.id;
end;$$;
revoke all on function public.portal_changes(bigint,text),public.portal_change_undo(bigint) from public,anon,authenticated;
grant execute on function public.portal_changes(bigint,text),public.portal_change_undo(bigint) to authenticated;
-- Extend the existing, explicitly confirmed reset; keep room definitions and change history.
do $$declare definition text;begin
 select pg_get_functiondef('public.school_reset_plan(boolean,boolean,boolean)'::regprocedure) into definition;
 definition:=replace(definition,'''Hausaufgaben'',','''Raumbuchungen'',(select count(*) from public.room_booking),''Gruppenchats'',(select count(*) from public.chat_group g where remove_chats or g.owner_id=any(ids)),''Hausaufgaben'',');
 execute definition;
 select pg_get_functiondef('public.school_reset_execute(uuid,text)'::regprocedure) into definition;
 definition:=replace(definition,'delete from public.hw_push_delivery;','delete from public.hw_push_delivery;delete from public.room_booking where true;');
 definition:=replace(definition,'if preview.clear_chats then delete from public.dm_thread;', 'if preview.clear_chats then delete from public.chat_group where true;delete from public.dm_thread;');
 execute definition;
end;$$;
revoke all on function public.portal_audit_write() from public,anon,authenticated;
notify pgrst,'reload schema';

commit;
