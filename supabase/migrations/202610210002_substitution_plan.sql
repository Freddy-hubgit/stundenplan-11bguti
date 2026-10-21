begin;
create table public.substitution_entry (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  teacher text not null check (char_length(btrim(teacher)) between 1 and 160),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  kind text not null check (kind in ('replacement', 'cancelled')),
  replacement_teacher text not null default '' check (char_length(replacement_teacher) <= 160),
  room text not null default '' check (char_length(room) <= 100),
  note text not null default '' check (char_length(note) <= 2000),
  updated_at timestamptz not null default now(),
  check (kind <> 'replacement' or char_length(btrim(replacement_teacher)) > 0)
);
create index on public.substitution_entry (date, start_time);
alter table public.substitution_entry enable row level security;
revoke all on public.substitution_entry from public, anon, authenticated;

create function public.substitution_list() returns setof public.substitution_entry
language sql stable security definer set search_path = '' as $$
  select e.* from public.substitution_entry e where auth.uid() is not null order by e.date, e.start_time, e.teacher, e.id;
$$;

create function public.substitution_save(entry_id uuid, entry_date date, absent_teacher text,
  starts time, ends time, entry_kind text, replacement text, new_room text, info text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('support','admin')
  ) then raise exception 'Staff required' using errcode = '42501'; end if;
  if entry_date is null or absent_teacher is null or char_length(btrim(absent_teacher)) not between 1 and 160
    or starts is null or ends is null or starts >= ends or ends = '24:00'::time
    or entry_kind is null or entry_kind not in ('replacement','cancelled')
    or (entry_kind = 'replacement' and char_length(btrim(coalesce(replacement,''))) not between 1 and 160)
    or char_length(coalesce(new_room,'')) > 100 or char_length(coalesce(info,'')) > 2000 then
    raise exception 'Invalid substitution' using errcode = '22023';
  end if;
  -- Serializes competing writes, including moves/edits, so overlap checks cannot race.
  perform pg_catalog.pg_advisory_xact_lock(837261);
  if exists (select 1 from public.substitution_entry e where e.date = entry_date
    and lower(btrim(e.teacher)) = lower(btrim(absent_teacher)) and e.start_time < ends and e.end_time > starts
    and (entry_id is null or e.id <> entry_id)) then
    raise exception 'Overlapping absence' using errcode = '23P01';
  end if;
  if entry_id is null then
    insert into public.substitution_entry(date, teacher, start_time, end_time, kind, replacement_teacher, room, note)
    values (entry_date, btrim(absent_teacher), starts, ends, entry_kind,
      case when entry_kind = 'cancelled' then '' else btrim(replacement) end,
      case when entry_kind = 'cancelled' then '' else btrim(coalesce(new_room,'')) end, btrim(coalesce(info,''))) returning id into saved_id;
  else
    update public.substitution_entry e set date = entry_date, teacher = btrim(absent_teacher), start_time = starts,
      end_time = ends, kind = entry_kind, replacement_teacher = case when entry_kind = 'cancelled' then '' else btrim(replacement) end,
      room = case when entry_kind = 'cancelled' then '' else btrim(coalesce(new_room,'')) end,
      note = btrim(coalesce(info,'')), updated_at = clock_timestamp() where e.id = entry_id returning e.id into saved_id;
    if not found then raise exception 'Entry unavailable' using errcode = '22023'; end if;
  end if;
  return saved_id;
end;
$$;

create function public.substitution_delete(entry_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('support','admin')
  ) then raise exception 'Staff required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(837261);
  delete from public.substitution_entry e where e.id = entry_id;
  if not found then raise exception 'Entry unavailable' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.substitution_list(), public.substitution_save(uuid,date,text,time,time,text,text,text,text),
  public.substitution_delete(uuid) from public, anon, authenticated;
grant execute on function public.substitution_list(), public.substitution_save(uuid,date,text,time,time,text,text,text,text),
  public.substitution_delete(uuid) to authenticated;
commit;
