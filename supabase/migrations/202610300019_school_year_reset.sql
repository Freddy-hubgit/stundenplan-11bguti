begin;
-- Graduation deletion must cascade through the guarded profile row in the Auth transaction.
do $$begin
 if not exists(select 1 from pg_constraint c where c.conrelid='public.profiles'::regclass and c.confrelid='auth.users'::regclass and c.contype='f' and c.confdeltype='c' and c.conkey=array[(select attnum from pg_attribute where attrelid='public.profiles'::regclass and attname='id')]::smallint[]) then
  alter table public.profiles add constraint school_profile_auth_cascade foreign key(id) references auth.users(id) on delete cascade;
 end if;
end$$;
create table public.school_revision(singleton boolean primary key default true check(singleton),revision bigint not null default 0);insert into public.school_revision default values;
create table public.school_reset_preview(token uuid primary key default gen_random_uuid(),actor uuid not null references public.profiles(id) on delete cascade,revision bigint not null,expires_at timestamptz not null,clear_groups boolean not null,clear_chats boolean not null,delete_graduates boolean not null,graduates uuid[] not null,counts jsonb not null);
create table public.school_cleanup_file(bucket text not null,path text not null,lease_token uuid,lease_until timestamptz,primary key(bucket,path));
create table public.school_cleanup_user(user_id uuid primary key,lease_token uuid,lease_until timestamptz);
create table public.school_reset_audit(id uuid primary key default gen_random_uuid(),actor uuid references public.profiles(id) on delete set null,created_at timestamptz not null default now(),counts jsonb not null,options jsonb not null);
alter table public.school_revision enable row level security;alter table public.school_reset_preview enable row level security;alter table public.school_cleanup_file enable row level security;alter table public.school_cleanup_user enable row level security;alter table public.school_reset_audit enable row level security;
revoke all on public.school_revision,public.school_reset_preview,public.school_cleanup_file,public.school_cleanup_user,public.school_reset_audit from public,anon,authenticated;
-- All relevant writes share the reset lock; a changed preview must be refreshed.
create function public.school_track_change() returns trigger language plpgsql security definer set search_path='' as $$begin perform pg_catalog.pg_advisory_xact_lock(837266);update public.school_revision set revision=revision+1 where singleton=true;return null;end;$$;
do $$declare tbl text;begin
 foreach tbl in array array['profiles','school_group','school_member','school_schedule','school_config','school_material','school_exam','homework_task','homework_progress','homework_submission','teacher_absence','substitution_entry','portal_event','dm_thread','dm_message','support_ticket','support_ticket_message','portal_notification'] loop
  execute format('create trigger school_reset_revision before insert or update or delete on public.%I for each statement execute function public.school_track_change()',tbl);
 end loop;
end$$;
create trigger school_storage_revision before insert or update or delete on storage.objects for each statement execute function public.school_track_change();
create function public.school_guard_pending_files() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.school_cleanup_file f where f.path=new.file_path and f.bucket=case when tg_table_name='school_material' then 'school-materials' else 'homework-submissions' end) then raise exception 'Diese Datei gehört zum vorherigen Schuljahr. Bitte neu hochladen.' using errcode='22023';end if;return new;
end;$$;
create trigger school_material_pending_file before insert or update on public.school_material for each row execute function public.school_guard_pending_files();
create trigger school_homework_pending_file before insert or update on public.homework_submission for each row execute function public.school_guard_pending_files();
create function public.school_block_graduate_upload() returns trigger language plpgsql security definer set search_path='' as $$
begin if auth.uid() is not null and not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Konto nicht mehr verfügbar.' using errcode='42501';end if;if exists(select 1 from public.school_cleanup_user where user_id=auth.uid()) then raise exception 'Dieses Konto ist zur bestätigten Löschung vorgemerkt.' using errcode='42501';end if;return new;end;$$;
create trigger school_graduate_upload_guard before insert or update on storage.objects for each row execute function public.school_block_graduate_upload();
revoke all on function public.school_guard_pending_files(),public.school_block_graduate_upload() from public,anon,authenticated;
create function public.school_protect_staff_background() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.bucket_id='account-backgrounds' and exists(select 1 from public.school_cleanup_user q join public.profiles p on p.id=q.user_id where p.id::text=split_part(old.name,'/',1) and p.roles<>array['user']::text[]) then raise exception 'Kontobild eines geschützten Kontos bleibt erhalten.' using errcode='42501';end if;return old;
end;$$;
create trigger school_staff_background_guard before delete on storage.objects for each row execute function public.school_protect_staff_background();
revoke all on function public.school_protect_staff_background() from public,anon,authenticated;
create function public.school_reset_plan(remove_groups boolean,remove_chats boolean,remove_graduates boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[];counts jsonb;plan uuid;version bigint;
begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if exists(select 1 from public.school_cleanup_file) or exists(select 1 from public.school_cleanup_user) then raise exception 'Es stehen noch Datei- oder Kontobereinigungen aus. Bitte zuerst die Bereinigung fortsetzen und danach eine neue Vorschau erstellen.' using errcode='22023';end if;
 select coalesce(array_agg(p.id),array[]::uuid[]) into ids from public.profiles p where remove_graduates and p.id<>auth.uid() and p.roles=array['user']::text[]
 and exists(select 1 from public.school_member m join public.school_group g on g.id=m.group_id join public.school_config c on true where m.user_id=p.id and m.member_kind='student' and g.kind='class' and g.grade=c.final_grade)
 and not exists(select 1 from public.school_member m join public.school_group g on g.id=m.group_id join public.school_config c on true where m.user_id=p.id and m.member_kind='student' and g.kind='class' and (g.grade is null or g.grade<>c.final_grade));
 counts:=jsonb_build_object('Hausaufgaben',(select count(*) from public.homework_task),'Abgaben',(select count(*) from public.homework_submission),'Materialien',(select count(*) from public.school_material),'Prüfungen',(select count(*) from public.school_exam),'Krankmeldungen',(select count(*) from public.teacher_absence),'Vertretungen',(select count(*) from public.substitution_entry),'Kalendertermine',(select count(*) from public.portal_event),'Benachrichtigungen',(select count(*) from public.portal_notification),'Stundenpläne',(select count(*) from public.school_schedule),'Klassen und Kurse',case when remove_groups then (select count(*) from public.school_group) else 0 end,'Chatnachrichten',(select count(*) from public.dm_message m join public.dm_thread t on t.id=m.thread_id where remove_chats or t.participant_a=any(ids) or t.participant_b=any(ids)),'Supporttickets',(select count(*) from public.support_ticket where remove_chats or owner_id=any(ids)),'Dateien',(select count(*) from storage.objects o where o.bucket_id in ('homework-submissions','school-materials') or (o.bucket_id='account-backgrounds' and split_part(o.name,'/',1)=any(ids::text[]))),'Abschlusskonten',cardinality(ids));
 select revision into version from public.school_revision;
 delete from public.school_reset_preview where actor=auth.uid() or expires_at<now();
 insert into public.school_reset_preview(actor,revision,expires_at,clear_groups,clear_chats,delete_graduates,graduates,counts) values(auth.uid(),version,now()+interval '10 minutes',remove_groups,remove_chats,remove_graduates,ids,counts) returning token into plan;
 return jsonb_build_object('final_grade',(select final_grade from public.school_config),'token',plan,'counts',counts,'graduates',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'email',p.email)) from public.profiles p where p.id=any(ids)),'[]'::jsonb),'confirmation',case when remove_graduates then 'SCHULJAHR UND ABSCHLUSSKONTEN LÖSCHEN' else 'SCHULJAHR ZURÜCKSETZEN' end);
end;$$;
create function public.school_reset_execute(plan uuid,confirmation text) returns jsonb language plpgsql security definer set search_path='' as $$
declare preview public.school_reset_preview;version bigint;
begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837266);
 select * into preview from public.school_reset_preview where token=plan and actor=auth.uid() and expires_at>now() for update;
 if not found then raise exception 'Vorschau abgelaufen. Bitte neu erstellen.' using errcode='22023';end if;
 if confirmation is distinct from (case when preview.delete_graduates then 'SCHULJAHR UND ABSCHLUSSKONTEN LÖSCHEN' else 'SCHULJAHR ZURÜCKSETZEN' end) then raise exception 'Bestätigungstext stimmt nicht überein.' using errcode='22023';end if;
 select revision into version from public.school_revision;if version<>preview.revision then raise exception 'Daten haben sich seit der Vorschau geändert. Bitte neue Vorschau erstellen.' using errcode='40001';end if;
 insert into public.school_cleanup_file(bucket,path) select o.bucket_id,o.name from storage.objects o where o.bucket_id in ('homework-submissions','school-materials') or (o.bucket_id='account-backgrounds' and split_part(o.name,'/',1)=any(preview.graduates::text[])) on conflict do nothing;
 if preview.delete_graduates then insert into public.school_cleanup_user(user_id) select unnest(preview.graduates) on conflict do nothing;end if;
 -- Any transient teaching-change notices are removed in this same transaction before commit.
 delete from public.teacher_absence;delete from public.substitution_entry;
 delete from public.school_material;delete from public.school_exam;delete from public.homework_task;delete from public.portal_event;delete from public.portal_notification;
 delete from public.hw_push_delivery;
 if preview.clear_chats then delete from public.dm_thread;delete from public.support_ticket;end if;
 if preview.clear_groups then delete from public.school_group;else update public.school_schedule set lessons='[]'::jsonb,updated_at=now();end if;
 insert into public.school_reset_audit(actor,counts,options) values(auth.uid(),preview.counts,jsonb_build_object('clear_groups',preview.clear_groups,'clear_chats',preview.clear_chats,'delete_graduates',preview.delete_graduates));
 delete from public.school_reset_preview where token=plan;
 return jsonb_build_object('ok',true,'counts',preview.counts,'files_pending',(select count(*) from public.school_cleanup_file),'accounts_pending',(select count(*) from public.school_cleanup_user));
end;$$;
-- Protect accounts promoted to a staff role after preview, even during Auth's cascade delete.
create function public.school_protect_cleanup_staff() returns trigger language plpgsql security definer set search_path='' as $$
begin if exists(select 1 from public.school_cleanup_user where user_id=old.id) and old.roles<>array['user']::text[] then raise exception 'Konto mit zusätzlichen Rollen bleibt geschützt.' using errcode='42501';end if;return old;end;$$;
create trigger school_cleanup_staff_guard before delete on public.profiles for each row execute function public.school_protect_cleanup_staff();
revoke all on function public.school_protect_cleanup_staff() from public,anon,authenticated;
-- Cleanup uses the Storage/Auth APIs, not raw SQL deletion of managed metadata.
create function public.school_cleanup_claim() returns table(kind text,bucket text,path text,user_id uuid,token uuid) language plpgsql security definer set search_path='' as $$
begin
 return query with candidates as(select f.bucket,f.path from public.school_cleanup_file f where f.lease_until is null or f.lease_until<now() limit 100 for update skip locked),claimed as(update public.school_cleanup_file f set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' from candidates c where f.bucket=c.bucket and f.path=c.path returning f.*) select 'file'::text,c.bucket,c.path,null::uuid,c.lease_token from claimed c;
 if not exists(select 1 from public.school_cleanup_file) then
  return query with candidates as(select u.user_id from public.school_cleanup_user u where u.lease_until is null or u.lease_until<now() limit 20 for update skip locked),claimed as(update public.school_cleanup_user u set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' from candidates c where u.user_id=c.user_id returning u.*) select 'user'::text,''::text,''::text,c.user_id,c.lease_token from claimed c;
 end if;
end;$$;
create function public.school_cleanup_finish(item_kind text,item_bucket text,item_path text,person uuid,token uuid) returns void language plpgsql security definer set search_path='' as $$
begin if item_kind='file' then delete from public.school_cleanup_file where bucket=item_bucket and path=item_path and lease_token=token;else delete from public.school_cleanup_user where user_id=person and lease_token=token;end if;end;$$;
create function public.school_cleanup_status() returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('files_pending',(select count(*) from public.school_cleanup_file),'accounts_pending',(select count(*) from public.school_cleanup_user));$$;
revoke all on function public.school_track_change(),public.school_reset_plan(boolean,boolean,boolean),public.school_reset_execute(uuid,text),public.school_cleanup_claim(),public.school_cleanup_finish(text,text,text,uuid,uuid),public.school_cleanup_status() from public,anon,authenticated;
grant execute on function public.school_reset_plan(boolean,boolean,boolean),public.school_reset_execute(uuid,text) to authenticated;
grant execute on function public.school_cleanup_claim(),public.school_cleanup_finish(text,text,text,uuid,uuid),public.school_cleanup_status() to service_role;
-- Persist cleanup intent even when a material's subsequent Storage API call fails.
create or replace function public.school_material_delete(material uuid) returns void language plpgsql security definer set search_path='' as $$
declare item public.school_material;
begin
 select * into item from public.school_material where id=material for update;
 if not found or not (public.portal_has_role(auth.uid(),'admin') or (item.author_id=auth.uid() and public.school_can_teach(auth.uid(),item.group_id))) then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 if item.file_path<>'' then insert into public.school_cleanup_file(bucket,path) values('school-materials',item.file_path) on conflict do nothing;end if;
 delete from public.school_material where id=material;
end;$$;
create function public.school_material_file_removed(path text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.school_material_can_delete(path) then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 if exists(select 1 from storage.objects where bucket_id='school-materials' and name=path) then raise exception 'Datei ist noch nicht gelöscht.';end if;
 delete from public.school_cleanup_file where bucket='school-materials' and school_cleanup_file.path=school_material_file_removed.path;
end;$$;
revoke all on function public.school_material_file_removed(text) from public,anon;grant execute on function public.school_material_file_removed(text) to authenticated;

-- Acquire the reset mutex before row locks in existing write RPCs, avoiding lock-order inversions.
do $$declare routine record;definition text;begin
 for routine in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where n.nspname='public' and l.lanname='plpgsql' and p.proname=any(array['hw_save','hw_save_group','hw_submit','hw_archive','hw_set_done','support_reply','support_create_ticket','support_set_status','dm_open','dm_start','dm_send','absence_request','absence_resolve','absence_request_preference','absence_set_identity','substitution_save','substitution_save_range','substitution_delete','set_profile_roles','set_profile_role','school_material_save','school_material_delete','school_exam_save','school_exam_delete','school_enrol','school_group_save','school_schedule_save','school_year_config','school_grade']) loop
  definition:=pg_get_functiondef(routine.oid);
  execute regexp_replace(definition,'\mbegin\M',E'begin\n perform pg_catalog.pg_advisory_xact_lock(837266);','i');
 end loop;
end$$;
notify pgrst,'reload schema';
commit;
