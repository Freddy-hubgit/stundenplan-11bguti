begin;
create table public.notebook_page(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id) on delete cascade,
 subject text not null default '' check(char_length(subject)<=100),title text not null check(char_length(btrim(title)) between 1 and 160),
 body text not null default '' check(char_length(body)<=50000),page_date date not null default current_date check(isfinite(page_date)),
 pinned boolean not null default false,revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default clock_timestamp()
);
create index on public.notebook_page(owner_id,subject,updated_at desc);
alter table public.notebook_page enable row level security;revoke all on public.notebook_page from public,anon,authenticated;
create function public.notebook_pages() returns setof public.notebook_page language sql stable security definer set search_path='' as $$
 select p.* from public.notebook_page p where p.owner_id=auth.uid() order by p.pinned desc,p.page_date desc,p.updated_at desc,p.id;$$;
create function public.notebook_subjects() returns text[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(s.subject order by s.subject),'{}') from (
 select distinct btrim(l->>'subject') subject from public.school_schedule sc cross join lateral jsonb_array_elements(sc.lessons) l where public.school_can_read(auth.uid(),sc.group_id) and btrim(coalesce(l->>'subject',''))<>''
 union select p.subject from public.notebook_page p where p.owner_id=auth.uid() and p.subject<>''
 ) s;$$;
create function public.notebook_save(page uuid,expected_revision integer,subject_name text,label text,content text,entry_date date,is_pinned boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Bitte erneut anmelden.' using errcode='42501';end if;
 if subject_name is null or label is null or content is null or entry_date is null or is_pinned is null then raise exception 'Bitte alle Pflichtfelder ausfüllen.' using errcode='22023';end if;
 if page is null then
  insert into public.notebook_page(owner_id,subject,title,body,page_date,pinned) values(auth.uid(),btrim(subject_name),btrim(label),content,entry_date,is_pinned) returning id into result;
 else
  update public.notebook_page set subject=btrim(subject_name),title=btrim(label),body=content,page_date=entry_date,pinned=is_pinned,revision=revision+1,updated_at=clock_timestamp() where id=page and owner_id=auth.uid() and revision=expected_revision returning id into result;
  if result is null then raise exception 'Die Seite wurde inzwischen geändert oder gelöscht, oder gehört nicht dir. Deine Eingaben behalten und zuerst den aktuellen Stand laden.' using errcode='40001';end if;
 end if;return result;
end;$$;
create function public.notebook_delete(page uuid,expected_revision integer) returns void language plpgsql security definer set search_path='' as $$begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 delete from public.notebook_page where id=page and owner_id=auth.uid() and revision=expected_revision;
 if not found then raise exception 'Die Seite wurde inzwischen geändert oder gelöscht, oder gehört nicht dir.' using errcode='40001';end if;
end;$$;
revoke all on function public.notebook_pages(),public.notebook_subjects(),public.notebook_save(uuid,integer,text,text,text,date,boolean),public.notebook_delete(uuid,integer) from public,anon,authenticated;
grant execute on function public.notebook_pages(),public.notebook_subjects(),public.notebook_save(uuid,integer,text,text,text,date,boolean),public.notebook_delete(uuid,integer) to authenticated;
-- Notebook visibility can be centrally hidden like the other main-menu tiles.
alter table public.portal_tile_setting drop constraint portal_tile_setting_route_check;
alter table public.portal_tile_setting add constraint portal_tile_setting_route_check check(route in('/hefte','/klassen','/materialien','/meldungen','/hausaufgaben','/nachrichten','/videokonferenz','/stundenplan','/krankmeldung','/schuljahr','/raumbuchung','/abgaben','/aenderungsverlauf','/kalender','/support','/vertretungsplan'));
-- Personal notebooks survive a school-year content reset. Account deletion still removes that account's own pages.
notify pgrst,'reload schema';commit;
