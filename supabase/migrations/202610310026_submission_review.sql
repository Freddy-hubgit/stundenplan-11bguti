begin;
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
notify pgrst,'reload schema';commit;
