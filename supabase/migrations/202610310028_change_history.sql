begin;
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
notify pgrst,'reload schema';commit;
