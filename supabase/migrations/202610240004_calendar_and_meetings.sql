begin;
create table public.portal_event (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event','meeting')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 5000),
  starts_at timestamptz not null check (isfinite(starts_at)),
  ends_at timestamptz not null check (isfinite(ends_at) and ends_at > starts_at),
  location text not null default '' check (char_length(location) <= 200),
  meeting_url text not null default '' check (char_length(meeting_url) <= 2000),
  updated_at timestamptz not null default now(),
  check (kind <> 'meeting' or meeting_url <> ''),
  check (meeting_url = '' or meeting_url ~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]<>]*)?$')
);
create index on public.portal_event (starts_at, ends_at);
alter table public.portal_event enable row level security;
revoke all on public.portal_event from public, anon, authenticated;

create function public.portal_events_list() returns setof public.portal_event
language sql stable security definer set search_path = '' as $$
 select e.* from public.portal_event e where auth.uid() is not null order by e.starts_at, e.title, e.id;
$$;

create function public.portal_event_save(entry_id uuid, entry_kind text, entry_title text, details text,
 starts timestamptz, ends timestamptz, place text, meeting_link text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
 if auth.uid() is null or not exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role in ('support','admin')
 ) then raise exception 'Staff required' using errcode = '42501'; end if;
 if entry_kind is null or entry_kind not in ('event','meeting') or entry_title is null
  or char_length(btrim(entry_title)) not between 1 and 160 or starts is null or ends is null
  or not pg_catalog.isfinite(starts) or not pg_catalog.isfinite(ends) or ends <= starts
  or char_length(coalesce(details,'')) > 5000 or char_length(coalesce(place,'')) > 200
  or char_length(coalesce(meeting_link,'')) > 2000
  or (entry_kind = 'meeting' and btrim(coalesce(meeting_link,'')) = '')
  or (btrim(coalesce(meeting_link,'')) <> '' and btrim(meeting_link) !~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]<>]*)?$') then
  raise exception 'Invalid event or HTTPS meeting URL' using errcode = '22023';
 end if;
 if entry_id is null then
  insert into public.portal_event(kind,title,description,starts_at,ends_at,location,meeting_url)
  values(entry_kind,btrim(entry_title),btrim(coalesce(details,'')),starts,ends,btrim(coalesce(place,'')),btrim(coalesce(meeting_link,'')))
  returning id into saved_id;
 else
  update public.portal_event e set kind=entry_kind,title=btrim(entry_title),description=btrim(coalesce(details,'')),
   starts_at=starts,ends_at=ends,location=btrim(coalesce(place,'')),meeting_url=btrim(coalesce(meeting_link,'')),updated_at=clock_timestamp()
  where e.id=entry_id returning e.id into saved_id;
  if not found then raise exception 'Event unavailable' using errcode = '22023'; end if;
 end if;
 return saved_id;
end;
$$;
create function public.portal_event_delete(entry_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists (
  select 1 from public.profiles p where p.id=auth.uid() and p.role in ('support','admin')
 ) then raise exception 'Staff required' using errcode = '42501'; end if;
 delete from public.portal_event e where e.id=entry_id;
 if not found then raise exception 'Event unavailable' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.portal_events_list(), public.portal_event_save(uuid,text,text,text,timestamptz,timestamptz,text,text),
 public.portal_event_delete(uuid) from public, anon, authenticated;
grant execute on function public.portal_events_list(), public.portal_event_save(uuid,text,text,text,timestamptz,timestamptz,text,text),
 public.portal_event_delete(uuid) to authenticated;
commit;
