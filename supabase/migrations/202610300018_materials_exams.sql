begin;
alter table public.school_group add column grade integer check(grade between 1 and 20);
create table public.school_config(singleton boolean primary key default true check(singleton),final_grade integer not null default 13 check(final_grade between 1 and 20));insert into public.school_config default values;
alter table public.school_config enable row level security;revoke all on public.school_config from public,anon,authenticated;
create function public.school_year_config(new_final_grade integer default null) returns integer language plpgsql security definer set search_path='' as $$
declare result integer;
begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 if new_final_grade is not null then update public.school_config set final_grade=new_final_grade;end if;
 select final_grade into result from public.school_config;return result;
end;$$;
create function public.school_grade(target uuid,new_grade integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 update public.school_group set grade=new_grade where id=target and kind='class';if not found then raise exception 'Klasse fehlt.';end if;
end;$$;
drop function public.school_groups();
create function public.school_groups() returns table(id uuid,name text,kind text,parent_id uuid,can_teach boolean,grade integer) language sql stable security definer set search_path='' as $$
 select g.id,g.name,g.kind,g.parent_id,public.school_can_teach(auth.uid(),g.id),g.grade from public.school_group g where public.school_can_read(auth.uid(),g.id) order by g.kind,g.name,g.id;$$;
create table public.school_material(id uuid primary key default gen_random_uuid(),group_id uuid not null references public.school_group(id) on delete cascade,author_id uuid not null references public.profiles(id),title text not null check(char_length(btrim(title)) between 1 and 160),subject text not null default '' check(char_length(subject)<=100),description text not null default '' check(char_length(description)<=5000),link text not null default '' check(char_length(link)<=2000),file_path text not null default '' check(char_length(file_path)<=500),file_name text not null default '' check(char_length(file_name)<=200),created_at timestamptz not null default now(),check(link<>'' or file_path<>''));
create table public.school_exam(id uuid primary key default gen_random_uuid(),group_id uuid not null references public.school_group(id) on delete cascade,author_id uuid not null references public.profiles(id),title text not null check(char_length(btrim(title)) between 1 and 160),subject text not null check(char_length(btrim(subject)) between 1 and 100),date date not null check(isfinite(date)),starts time not null,ends time not null,room text not null default '' check(char_length(room)<=100),details text not null default '' check(char_length(details)<=5000),created_at timestamptz not null default now(),check(starts<ends and ends<'24:00'::time));
alter table public.school_material enable row level security;alter table public.school_exam enable row level security;revoke all on public.school_material,public.school_exam from public,anon,authenticated;
create function public.school_materials() returns table(id uuid,group_id uuid,group_name text,author_id uuid,title text,subject text,description text,link text,file_path text,file_name text,created_at timestamptz) language sql stable security definer set search_path='' as $$
 select m.id,m.group_id,g.name,m.author_id,m.title,m.subject,m.description,m.link,m.file_path,m.file_name,m.created_at from public.school_material m join public.school_group g on g.id=m.group_id where public.school_can_read(auth.uid(),m.group_id) order by m.created_at desc;$$;
create function public.school_material_save(target uuid,label text,subject_name text,details text,external_link text,path text,filename text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.school_can_teach(auth.uid(),target) then raise exception 'Keine Berechtigung für diese Gruppe.' using errcode='42501';end if;
 if coalesce(external_link,'')<>'' and external_link !~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]<>]*)?$' then raise exception 'Bitte gültigen HTTPS-Link verwenden.';end if;
 if coalesce(path,'')<>'' and (split_part(path,'/',1)<>target::text or split_part(path,'/',2)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='school-materials' and name=path)) then raise exception 'Ungültige Datei.' using errcode='42501';end if;
 insert into public.school_material(group_id,author_id,title,subject,description,link,file_path,file_name) values(target,auth.uid(),btrim(label),coalesce(subject_name,''),coalesce(details,''),coalesce(external_link,''),coalesce(path,''),coalesce(filename,'')) returning id into result;return result;
end;$$;
create function public.school_material_delete(material uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.school_material where id=material and (public.portal_has_role(auth.uid(),'admin') or (author_id=auth.uid() and public.school_can_teach(auth.uid(),group_id)));
 if not found then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
end;$$;
create function public.school_exams() returns table(id uuid,group_id uuid,group_name text,author_id uuid,title text,subject text,date date,starts time,ends time,room text,details text) language sql stable security definer set search_path='' as $$
 select e.id,e.group_id,g.name,e.author_id,e.title,e.subject,e.date,e.starts,e.ends,e.room,e.details from public.school_exam e join public.school_group g on g.id=e.group_id where public.school_can_read(auth.uid(),e.group_id) order by e.date,e.starts;$$;
create function public.school_exam_save(exam uuid,target uuid,label text,subject_name text,day date,from_time time,to_time time,new_room text,info text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.school_can_teach(auth.uid(),target) then raise exception 'Keine Berechtigung für diese Gruppe.' using errcode='42501';end if;
 if exam is null then insert into public.school_exam(group_id,author_id,title,subject,date,starts,ends,room,details) values(target,auth.uid(),btrim(label),btrim(subject_name),day,from_time,to_time,coalesce(new_room,''),coalesce(info,'')) returning id into result;
 else update public.school_exam set title=btrim(label),subject=btrim(subject_name),date=day,starts=from_time,ends=to_time,room=coalesce(new_room,''),details=coalesce(info,'') where id=exam and group_id=target and (author_id=auth.uid() or public.portal_has_role(auth.uid(),'admin')) returning id into result;if not found then raise exception 'Prüfung nicht bearbeitbar.' using errcode='42501';end if;end if;
 return result;
end;$$;
create function public.school_exam_delete(exam uuid) returns void language plpgsql security definer set search_path='' as $$
begin delete from public.school_exam where id=exam and (public.portal_has_role(auth.uid(),'admin') or (author_id=auth.uid() and public.school_can_teach(auth.uid(),group_id)));if not found then raise exception 'Keine Berechtigung.' using errcode='42501';end if;end;$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('school-materials','school-materials',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.oasis.opendocument.text']) on conflict(id) do nothing;
do $$begin
 if not exists(select 1 from storage.buckets where id='school-materials' and public=false and file_size_limit=10485760 and allowed_mime_types @> array['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.oasis.opendocument.text'] and allowed_mime_types <@ array['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.oasis.opendocument.text']) then raise exception 'Bucket school-materials muss privat sein, maximal 10 MB und die vorgesehenen Dateiformate erlauben.';end if;
end$$;
create function public.school_material_file(path text,write_access boolean default false) returns boolean language plpgsql stable security definer set search_path='' as $$
declare target uuid;
begin
 begin target:=split_part(path,'/',1)::uuid;exception when invalid_text_representation then return false;end;
 if write_access then return public.school_can_teach(auth.uid(),target) and split_part(path,'/',2)=auth.uid()::text;end if;
 return public.portal_has_role(auth.uid(),'admin') or (public.school_can_teach(auth.uid(),target) and split_part(path,'/',2)=auth.uid()::text) or (public.school_can_read(auth.uid(),target) and exists(select 1 from public.school_material m where m.file_path=path and m.group_id=target));
end;$$;
create function public.school_material_can_delete(path text) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and (public.portal_has_role(auth.uid(),'admin') or public.school_material_file(path,true));$$;
revoke all on function public.school_material_can_delete(text) from public;grant execute on function public.school_material_can_delete(text) to authenticated,anon;
create policy school_material_read on storage.objects for select to authenticated using(bucket_id='school-materials' and public.school_material_file(name,false));
create policy school_material_insert on storage.objects for insert to authenticated with check(bucket_id='school-materials' and public.school_material_file(name,true));
create policy school_material_delete on storage.objects for delete to authenticated using(bucket_id='school-materials' and public.school_material_can_delete(name));
-- Restrictive boundaries defeat unrelated legacy public Storage policies.
create policy school_material_read_boundary on storage.objects as restrictive for select to public using(bucket_id<>'school-materials' or public.school_material_file(name,false));
create policy school_material_insert_boundary on storage.objects as restrictive for insert to public with check(bucket_id<>'school-materials' or public.school_material_file(name,true));
create policy school_material_update_boundary on storage.objects as restrictive for update to public using(bucket_id<>'school-materials') with check(bucket_id<>'school-materials');
create policy school_material_delete_boundary on storage.objects as restrictive for delete to public using(bucket_id<>'school-materials' or public.school_material_can_delete(name));
-- Allow Storage to evaluate its guarded helpers for anon too; they always deny unauthenticated access.
revoke all on function public.school_material_file(text,boolean) from public;grant execute on function public.school_material_file(text,boolean) to authenticated,anon;
revoke all on function public.school_groups(),public.school_year_config(integer),public.school_grade(uuid,integer),public.school_materials(),public.school_material_save(uuid,text,text,text,text,text,text),public.school_material_delete(uuid),public.school_exams(),public.school_exam_save(uuid,uuid,text,text,date,time,time,text,text),public.school_exam_delete(uuid) from public,anon,authenticated;
grant execute on function public.school_groups(),public.school_year_config(integer),public.school_grade(uuid,integer),public.school_materials(),public.school_material_save(uuid,text,text,text,text,text,text),public.school_material_delete(uuid),public.school_exams(),public.school_exam_save(uuid,uuid,text,text,date,time,time,text,text),public.school_exam_delete(uuid) to authenticated;
create function public.school_exam_conflicts(target uuid,day date,except_exam uuid default null) returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.school_exam e where public.school_can_teach(auth.uid(),target) and e.date=day and e.id is distinct from except_exam and (e.group_id=target or exists(select 1 from public.school_member a join public.school_member b on b.user_id=a.user_id where a.group_id=target and b.group_id=e.group_id and a.member_kind='student' and b.member_kind='student'));
$$;
revoke all on function public.school_exam_conflicts(uuid,date,uuid) from public,anon;grant execute on function public.school_exam_conflicts(uuid,date,uuid) to authenticated;
create table public.dm_read(thread_id uuid not null references public.dm_thread(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,last_seen timestamptz not null,last_message uuid not null,primary key(thread_id,user_id));
alter table public.dm_read enable row level security;revoke all on public.dm_read from public,anon,authenticated;
create function public.dm_mark_read(chat_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare last_entry public.dm_message;
begin
 perform 1 from public.dm_thread where id=chat_id and auth.uid() in (participant_a,participant_b) for update;if not found then raise exception 'Chat nicht verfügbar.' using errcode='42501';end if;
 select * into last_entry from public.dm_message where thread_id=chat_id order by created_at desc,id desc limit 1;if found then insert into public.dm_read(thread_id,user_id,last_seen,last_message) values(chat_id,auth.uid(),last_entry.created_at,last_entry.id) on conflict(thread_id,user_id) do update set last_seen=excluded.last_seen,last_message=excluded.last_message;end if;
end;$$;
create function public.dm_unread() returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.dm_message m join public.dm_thread t on t.id=m.thread_id left join public.dm_read r on r.thread_id=t.id and r.user_id=auth.uid() where auth.uid() in (t.participant_a,t.participant_b) and m.sender_id<>auth.uid() and (r.thread_id is null or (m.created_at,m.id)>(r.last_seen,r.last_message));
$$;
revoke all on function public.dm_mark_read(uuid),public.dm_unread() from public,anon;grant execute on function public.dm_mark_read(uuid),public.dm_unread() to authenticated;
notify pgrst,'reload schema';
commit;
