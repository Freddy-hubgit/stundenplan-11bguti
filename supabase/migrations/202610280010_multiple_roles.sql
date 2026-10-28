begin;
alter table public.profiles add column roles text[];
update public.profiles set roles=array[role::text];
alter table public.profiles alter column roles set not null;
alter table public.profiles add constraint profiles_roles_check check (
 cardinality(roles) between 1 and 4 and roles <@ array['user','teacher','support','admin'] and array_position(roles,null) is null);
create function public.sync_profile_roles() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.roles:=coalesce(new.roles,array[coalesce(new.role::text,'user')]);
 elsif new.roles is not distinct from old.roles and new.role is distinct from old.role then new.roles:=array[new.role::text];end if;
 if current_user in ('authenticated','anon') and (
  (tg_op='INSERT' and new.roles<>array['user']) or (tg_op='UPDATE' and (new.roles is distinct from old.roles or new.role is distinct from old.role))
 ) then raise exception 'Rollen nur über die Rollenverwaltung ändern.' using errcode='42501';end if;
 if cardinality(new.roles) not between 1 and 4 or not new.roles <@ array['user','teacher','support','admin'] or array_position(new.roles,null) is not null then
  raise exception 'Mindestens eine gültige Rolle auswählen.' using errcode='22023';end if;
 select array_agg(value order by priority) into new.roles from (
  select distinct value,array_position(array['admin','support','teacher','user'],value) priority from unnest(new.roles) value
 ) ordered;
 new.role:=new.roles[1];return new;
end;$$;
create trigger sync_profile_roles before insert or update on public.profiles for each row execute function public.sync_profile_roles();
create function public.portal_has_role(person uuid,wanted text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=person and wanted=any(p.roles));
$$;
revoke all on function public.portal_has_role(uuid,text) from public,anon,authenticated;
create or replace function public.support_is_staff() returns boolean language sql stable security definer set search_path='' as $$
 select public.portal_has_role(auth.uid(),'support') or public.portal_has_role(auth.uid(),'admin');$$;
create or replace function public.portal_can_use_tickets() returns boolean language sql stable security definer set search_path='' as $$
 select public.support_is_staff() or public.portal_has_role(auth.uid(),'user');$$;
create function public.set_profile_roles(target_id uuid,new_roles text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837262);
 if not public.support_is_staff() then raise exception 'Nur Support und Admin dürfen Rollen ändern.' using errcode='42501';end if;
 if new_roles is null or cardinality(new_roles) not between 1 and 4 or not new_roles <@ array['user','teacher','support','admin'] or array_position(new_roles,null) is not null then
  raise exception 'Mindestens eine gültige Rolle auswählen.' using errcode='22023';end if;
 perform 1 from public.profiles p where p.id=target_id for update;
 if not found then raise exception 'Konto nicht gefunden.' using errcode='22023';end if;
 if public.portal_has_role(target_id,'admin') and not 'admin'=any(new_roles) and not exists(
  select 1 from public.profiles p where p.id<>target_id and 'admin'=any(p.roles)
 ) then raise exception 'Der letzte Admin muss seine Adminrolle behalten.' using errcode='P0001';end if;
 update public.profiles p set roles=new_roles where p.id=target_id;
end;$$;
revoke all on function public.set_profile_roles(uuid,text[]) from public,anon,authenticated;
grant execute on function public.set_profile_roles(uuid,text[]) to authenticated;
create or replace function public.set_profile_role(target_id uuid,new_role text) returns void language plpgsql security definer set search_path='' as $$
begin perform public.set_profile_roles(target_id,array[new_role]);end;$$;
create or replace function public.portal_events_list() returns setof public.portal_event language sql stable security definer set search_path='' as $$
 select e.* from public.portal_event e where exists(select 1 from public.profiles p where p.id=auth.uid())
 and (e.kind='meeting' or public.portal_has_role(auth.uid(),'teacher') or public.support_is_staff()) order by e.starts_at,e.title,e.id;
$$;
create or replace function public.support_create_ticket(subject text, body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_name text;
  caller_role text;
  new_id uuid;
begin
  if caller is null or not public.portal_can_use_tickets() then raise exception 'Authentication required' using errcode = '42501'; end if;
  select coalesce(nullif(btrim(p.full_name), ''), 'Nutzer'), case when public.portal_has_role(caller,'admin') then 'admin' when public.portal_has_role(caller,'support') then 'support' else 'user' end into caller_name, caller_role
    from public.profiles p where p.id = caller;
  if not public.portal_has_role(caller,'user') then raise exception 'User profile required' using errcode = '42501'; end if;
  if subject is null or char_length(btrim(subject)) not between 1 and 160
     or body is null or char_length(btrim(body)) not between 1 and 5000 then
    raise exception 'Invalid subject or message' using errcode = '22023';
  end if;
  caller_role := 'user';
  insert into public.support_ticket(owner_id, owner_name, subject)
    values (caller, caller_name, btrim(subject)) returning id into new_id;
  insert into public.support_ticket_message(ticket_id, sender_id, sender_name, sender_role, body)
    values (new_id, caller, caller_name, caller_role, btrim(body));
  return new_id;
end;
$$;


create or replace function public.support_reply(ticket_id uuid, body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  ticket public.support_ticket;
  caller_name text;
  caller_role text;
begin
  if caller is null or not public.portal_can_use_tickets() then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into ticket from public.support_ticket t where t.id = $1 for update;
  if not found or not (ticket.owner_id = caller or public.support_is_staff()) then
    raise exception 'Ticket unavailable' using errcode = '42501';
  end if;
  if ticket.status <> 'open' then raise exception 'Ticket closed' using errcode = '22023'; end if;
  if body is null or char_length(btrim(body)) not between 1 and 5000 then
    raise exception 'Invalid message' using errcode = '22023';
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), 'Nutzer'), case when public.portal_has_role(caller,'admin') then 'admin' when public.portal_has_role(caller,'support') then 'support' else 'user' end into caller_name, caller_role
    from public.profiles p where p.id = caller;
  if caller_role is null then raise exception 'Profile required' using errcode = '42501'; end if;
  insert into public.support_ticket_message(ticket_id, sender_id, sender_name, sender_role, body)
    values ($1, caller, caller_name, caller_role, btrim(body));
  update public.support_ticket t set updated_at = clock_timestamp() where t.id = $1;
end;
$$;


commit;
