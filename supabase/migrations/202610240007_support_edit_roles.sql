begin;
create or replace function public.set_profile_role(target_id uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare target_role text;
begin
 if auth.uid() is null then raise exception 'Anmeldung erforderlich.' using errcode='42501'; end if;
 -- Serialize role changes and recheck the caller after obtaining the lock.
 perform pg_catalog.pg_advisory_xact_lock(837262);
 if not exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','support')) then
  raise exception 'Nur Support und Admins dürfen Rollen ändern.' using errcode='42501';
 end if;
 if new_role is null or new_role not in ('user','teacher','support','admin') then
  raise exception 'Ungültige Rolle.' using errcode='22023';
 end if;
 select p.role into target_role from public.profiles p where p.id=target_id for update;
 if not found then raise exception 'Konto nicht gefunden.' using errcode='22023'; end if;
 if target_role='admin' and new_role <> 'admin' and not exists (
  select 1 from public.profiles p where p.role='admin' and p.id<>target_id
 ) then raise exception 'Der letzte Admin muss seine Adminrolle behalten.' using errcode='P0001'; end if;
 update public.profiles p set role=new_role where p.id=target_id;
end;
$$;
revoke all on function public.set_profile_role(uuid,text) from public, anon, authenticated;
grant execute on function public.set_profile_role(uuid,text) to authenticated;
commit;
