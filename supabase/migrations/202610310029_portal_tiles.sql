begin;
create table public.portal_tile_setting(route text primary key,enabled boolean not null default true,check(route in('/klassen','/materialien','/meldungen','/hausaufgaben','/nachrichten','/videokonferenz','/stundenplan','/krankmeldung','/schuljahr','/raumbuchung','/abgaben','/aenderungsverlauf','/kalender','/support','/vertretungsplan')));
alter table public.portal_tile_setting enable row level security;revoke all on public.portal_tile_setting from public,anon,authenticated;
create function public.portal_disabled_tiles() returns text[] language plpgsql stable security definer set search_path='' as $$begin
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 return coalesce((select array_agg(route order by route) from public.portal_tile_setting where not enabled),'{}');
end;$$;
create function public.portal_tile_save(tile_route text,is_enabled boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 if is_enabled is null then raise exception 'Status erforderlich.';end if;
 perform pg_catalog.pg_advisory_xact_lock(837266);
 insert into public.portal_tile_setting(route,enabled) values(tile_route,is_enabled) on conflict(route) do update set enabled=excluded.enabled;
end;$$;
-- Record these central settings in the admin change history, without reset side effects.
create function public.portal_tile_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and old.enabled=new.enabled then return null;end if;
 insert into public.portal_audit(actor,actor_name,entity,record_key,record_label,action,before_value,after_value)
 values(auth.uid(),coalesce((select full_name from public.profiles where id=auth.uid()),'System'),'portal_tile_setting',new.route,new.route,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return null;
end;$$;
create trigger portal_tile_change after insert or update on public.portal_tile_setting for each row execute function public.portal_tile_audit();
revoke all on function public.portal_tile_audit() from public,anon,authenticated;
revoke all on function public.portal_disabled_tiles(),public.portal_tile_save(text,boolean) from public,anon,authenticated;
grant execute on function public.portal_disabled_tiles(),public.portal_tile_save(text,boolean) to authenticated;
notify pgrst,'reload schema';commit;
