begin;
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
notify pgrst,'reload schema';commit;
