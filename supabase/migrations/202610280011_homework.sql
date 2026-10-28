begin;
create table public.homework_task(
 id uuid primary key default gen_random_uuid(),author_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 160),subject text not null check(char_length(btrim(subject)) between 1 and 100),
 description text not null default '' check(char_length(description)<=10000),lesson_date date not null check(isfinite(lesson_date)),due_date date not null check(isfinite(due_date)),
 is_shared boolean not null default false,requires_submission boolean not null default false,archived boolean not null default false,created_at timestamptz not null default now(),
 check(is_shared or not requires_submission)
);
create table public.homework_progress(task_id uuid not null references public.homework_task(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,done boolean not null default false,primary key(task_id,user_id));
create table public.homework_submission(task_id uuid not null references public.homework_task(id) on delete cascade,student_id uuid not null references public.profiles(id) on delete cascade,
 body text not null default '' check(char_length(body)<=10000),link text not null default '' check(char_length(link)<=2000),file_path text not null default '',file_name text not null default '',submitted_at timestamptz not null default now(),primary key(task_id,student_id));
create index on public.homework_task(due_date) where not archived;
alter table public.homework_task enable row level security;alter table public.homework_progress enable row level security;alter table public.homework_submission enable row level security;
revoke all on public.homework_task,public.homework_progress,public.homework_submission from public,anon,authenticated;
create function public.hw_can_view(person uuid,task uuid) returns boolean language sql stable security definer set search_path='' as $$
 select person is not null and exists(select 1 from public.profiles p where p.id=person) and exists(select 1 from public.homework_task t where t.id=task and not t.archived and (t.is_shared or t.author_id=person));$$;
revoke all on function public.hw_can_view(uuid,uuid) from public,anon,authenticated;
create function public.hw_tasks() returns table(id uuid,author_id uuid,author_name text,title text,subject text,description text,lesson_date date,due_date date,is_shared boolean,requires_submission boolean,done boolean,submitted boolean)
language sql stable security definer set search_path='' as $$
 select t.id,t.author_id,coalesce(nullif(btrim(p.full_name),''),'Nutzer'),t.title,t.subject,t.description,t.lesson_date,t.due_date,t.is_shared,t.requires_submission,coalesce(g.done,false),exists(select 1 from public.homework_submission s where s.task_id=t.id and s.student_id=auth.uid())
 from public.homework_task t join public.profiles p on p.id=t.author_id left join public.homework_progress g on g.task_id=t.id and g.user_id=auth.uid()
 where public.hw_can_view(auth.uid(),t.id) order by t.due_date,t.created_at,t.id;$$;
create function public.hw_save(task uuid,task_title text,task_subject text,details text,lesson date,due date,shared boolean,submission_required boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid()) then raise exception 'Anmeldung erforderlich.' using errcode='42501';end if;
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
create function public.hw_archive(task uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.homework_task t set archived=true where t.id=task and t.author_id=auth.uid() and (not t.is_shared or public.portal_has_role(auth.uid(),'teacher') or public.portal_has_role(auth.uid(),'admin'));
 if not found then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
end;$$;
create function public.hw_set_done(task uuid,completed boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.hw_can_view(auth.uid(),task) or completed is null then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 insert into public.homework_progress(task_id,user_id,done) values(task,auth.uid(),completed) on conflict(task_id,user_id) do update set done=excluded.done;
end;$$;
create function public.hw_submissions(task uuid) returns table(student_id uuid,student_name text,body text,link text,file_path text,file_name text,submitted_at timestamptz)
language sql stable security definer set search_path='' as $$
 select s.student_id,coalesce(nullif(btrim(p.full_name),''),'Nutzer'),s.body,s.link,s.file_path,s.file_name,s.submitted_at from public.homework_submission s join public.homework_task t on t.id=s.task_id join public.profiles p on p.id=s.student_id
 where s.task_id=task and auth.uid() is not null and (s.student_id=auth.uid() or (t.author_id=auth.uid() and (public.portal_has_role(auth.uid(),'teacher') or public.portal_has_role(auth.uid(),'admin')))) order by s.submitted_at;
$$;
create function public.hw_submit(task uuid,answer text,answer_link text,attachment text,attachment_name text) returns text
language plpgsql security definer set search_path='' as $$
declare old_path text;
begin
 if not public.portal_has_role(auth.uid(),'user') or not public.hw_can_view(auth.uid(),task) or not exists(select 1 from public.homework_task t where t.id=task and t.is_shared and t.requires_submission) then raise exception 'Keine Abgabe möglich.' using errcode='42501';end if;
 if char_length(coalesce(answer,''))>10000 or char_length(coalesce(answer_link,''))>2000 or char_length(coalesce(attachment_name,''))>200 or (btrim(coalesce(answer,''))='' and btrim(coalesce(answer_link,''))='' and coalesce(attachment,'')='') or (coalesce(answer_link,'')<>'' and answer_link !~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]<>]*)?$') then raise exception 'Text, gültigen HTTPS-Link oder Datei angeben.' using errcode='22023';end if;
 if coalesce(attachment,'')<>'' and (split_part(attachment,'/',1)<>auth.uid()::text or split_part(attachment,'/',2)<>task::text or not exists(select 1 from storage.objects o where o.bucket_id='homework-submissions' and o.name=attachment)) then raise exception 'Ungültige Datei.' using errcode='42501';end if;
 select s.file_path into old_path from public.homework_submission s where s.task_id=task and s.student_id=auth.uid() for update;
 insert into public.homework_submission(task_id,student_id,body,link,file_path,file_name) values(task,auth.uid(),coalesce(answer,''),coalesce(answer_link,''),coalesce(attachment,''),coalesce(attachment_name,''))
 on conflict(task_id,student_id) do update set body=excluded.body,link=excluded.link,file_path=excluded.file_path,file_name=excluded.file_name,submitted_at=clock_timestamp();
 return coalesce(old_path,'');
end;$$;
revoke all on function public.hw_tasks(),public.hw_save(uuid,text,text,text,date,date,boolean,boolean),public.hw_archive(uuid),public.hw_set_done(uuid,boolean),public.hw_submissions(uuid),public.hw_submit(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.hw_tasks(),public.hw_save(uuid,text,text,text,date,date,boolean,boolean),public.hw_archive(uuid),public.hw_set_done(uuid,boolean),public.hw_submissions(uuid),public.hw_submit(uuid,text,text,text,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('homework-submissions','homework-submissions',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.oasis.opendocument.text']) on conflict(id) do nothing;
do $$begin if not exists(select 1 from storage.buckets where id='homework-submissions' and public=false and file_size_limit=10485760) then raise exception 'Bucket homework-submissions muss privat sein, maximal 10 MB.';end if;end$$;
create function public.hw_file_read(path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (split_part(path,'/',1)=auth.uid()::text or exists(select 1 from public.homework_submission s join public.homework_task t on t.id=s.task_id where s.file_path=path and t.author_id=auth.uid() and (public.portal_has_role(auth.uid(),'teacher') or public.portal_has_role(auth.uid(),'admin'))));$$;
create function public.hw_file_write(path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.portal_has_role(auth.uid(),'user') and split_part(path,'/',1)=auth.uid()::text and exists(select 1 from public.homework_task t where t.id::text=split_part(path,'/',2) and t.is_shared and t.requires_submission and not t.archived);
$$;
revoke all on function public.hw_file_read(text),public.hw_file_write(text) from public,anon;grant execute on function public.hw_file_read(text),public.hw_file_write(text) to authenticated,anon;
create policy homework_files_read on storage.objects for select to authenticated using(bucket_id='homework-submissions' and public.hw_file_read(name));
create policy homework_files_insert on storage.objects for insert to authenticated with check(bucket_id='homework-submissions' and public.hw_file_write(name));
create policy homework_files_delete on storage.objects for delete to authenticated using(bucket_id='homework-submissions' and split_part(name,'/',1)=auth.uid()::text);
create policy homework_files_read_boundary on storage.objects as restrictive for select to public using(bucket_id<>'homework-submissions' or (auth.uid() is not null and public.hw_file_read(name)));
create policy homework_files_insert_boundary on storage.objects as restrictive for insert to public with check(bucket_id<>'homework-submissions' or (auth.uid() is not null and public.hw_file_write(name)));
create policy homework_files_update_boundary on storage.objects as restrictive for update to public using(bucket_id<>'homework-submissions') with check(bucket_id<>'homework-submissions');
create policy homework_files_delete_boundary on storage.objects as restrictive for delete to public using(bucket_id<>'homework-submissions' or split_part(name,'/',1)=auth.uid()::text);
commit;
