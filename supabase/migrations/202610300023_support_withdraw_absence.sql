begin;
create or replace function public.absence_list() returns setof public.teacher_absence
language sql stable security definer set search_path='' as $$
 select a.* from public.teacher_absence a where public.portal_has_role(auth.uid(),'admin') or public.portal_has_role(auth.uid(),'support')
 or (a.teacher_id=auth.uid() and public.portal_has_role(auth.uid(),'teacher')) order by a.created_at desc,a.id;
$$;
create function public.absence_withdraw(report uuid) returns void language plpgsql security definer set search_path='' as $$
declare entry public.teacher_absence;
begin
 if not public.portal_has_role(auth.uid(),'support') then raise exception 'Nur Support darf Krankmeldungen zurücknehmen.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837266);
 perform pg_catalog.pg_advisory_xact_lock(837261);
 select * into entry from public.teacher_absence where id=report for update;
 if not found then raise exception 'Krankmeldung nicht mehr vorhanden.' using errcode='22023';end if;
 -- Remove obsolete notices first. Deleting published substitutions produces scoped correction notices.
 delete from public.portal_notification where absence_id=report;
 delete from public.substitution_entry where absence_id=report;
 -- Keep newly generated corrections when the report's cascading FK is removed.
 update public.portal_notification set absence_id=null where absence_id=report;
 delete from public.teacher_absence where id=report;
 insert into public.portal_notification(user_id,title,body,route)
 values(entry.teacher_id,'Krankmeldung zurückgenommen','Support hat deine Krankmeldung vom '||to_char(entry.start_date,'DD.MM.YYYY')||' bis '||to_char(entry.end_date,'DD.MM.YYYY')||' zurückgenommen. Es gilt wieder der reguläre Stundenplan.','/krankmeldung');
end;$$;
revoke all on function public.absence_withdraw(uuid) from public,anon,authenticated;
grant execute on function public.absence_withdraw(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
