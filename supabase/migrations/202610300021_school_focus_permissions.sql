begin;
alter table public.school_group add column focus text check(focus in ('Informatik','Umwelttechnik'));
create function public.school_focus(target uuid,new_focus text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 update public.school_group set focus=new_focus where id=target and kind='class';
 if not found then raise exception 'Klasse fehlt.';end if;
end;$$;
revoke all on function public.school_focus(uuid,text) from public,anon,authenticated;
grant execute on function public.school_focus(uuid,text) to authenticated;
drop function public.school_groups();
create function public.school_groups() returns table(id uuid,name text,kind text,parent_id uuid,can_teach boolean,grade integer,focus text) language sql stable security definer set search_path='' as $$
 select g.id,g.name,g.kind,g.parent_id,public.school_can_teach(auth.uid(),g.id),g.grade,g.focus from public.school_group g where public.school_can_read(auth.uid(),g.id) order by g.kind,g.name,g.id;$$;
revoke all on function public.school_groups() from public,anon,authenticated;
grant execute on function public.school_groups() to authenticated;
-- Preserve validation and reset locking while removing support-only write access.
do $$declare definition text;begin
 select pg_get_functiondef('public.school_schedule_save(uuid,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'(public.school_can_teach(auth.uid(),target) or (public.portal_has_role(auth.uid(),''support'') and public.school_can_read(auth.uid(),target)))','public.school_can_teach(auth.uid(),target)');
 execute definition;
end;$$;
notify pgrst,'reload schema';
commit;
