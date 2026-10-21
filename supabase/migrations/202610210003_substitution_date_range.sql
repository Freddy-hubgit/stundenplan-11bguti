begin;
-- Reuse the existing per-day writer inside one transaction. Any conflict rolls back every day.
create function public.substitution_save_range(entry_date date, end_date date, absent_teacher text,
  starts time, ends time, entry_kind text, replacement text, new_room text, info text) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  day_offset integer;
  ids uuid[] := '{}';
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('support','admin')
  ) then raise exception 'Staff required' using errcode = '42501'; end if;
  if entry_date is null or end_date is null or not pg_catalog.isfinite(entry_date) or not pg_catalog.isfinite(end_date)
    or end_date < entry_date or end_date - entry_date > 365 then
    raise exception 'Invalid date range (maximum 366 days)' using errcode = '22023';
  end if;
  for day_offset in 0..(end_date - entry_date) loop
    ids := pg_catalog.array_append(ids, public.substitution_save(null, entry_date + day_offset, absent_teacher,
      starts, ends, entry_kind, replacement, new_room, info));
  end loop;
  return ids;
end;
$$;
revoke all on function public.substitution_save_range(date,date,text,time,time,text,text,text,text) from public, anon, authenticated;
grant execute on function public.substitution_save_range(date,date,text,time,time,text,text,text,text) to authenticated;
commit;
