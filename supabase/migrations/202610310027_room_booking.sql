begin;
create table public.school_room(id uuid primary key default gen_random_uuid(),name text not null check(char_length(btrim(name)) between 1 and 80),details text not null default '' check(char_length(details)<=1000),bookable boolean not null default false);
create unique index school_room_name on public.school_room(lower(btrim(name)));
create table public.room_booking(id uuid primary key default gen_random_uuid(),room_id uuid not null references public.school_room(id),owner_id uuid not null references public.profiles(id) on delete cascade,title text not null check(char_length(btrim(title)) between 1 and 160),starts_at timestamptz not null,ends_at timestamptz not null,created_at timestamptz not null default now(),check(ends_at>starts_at and ends_at-starts_at<=interval '12 hours'));
create index on public.room_booking(room_id,starts_at,ends_at);
alter table public.school_room enable row level security;alter table public.room_booking enable row level security;revoke all on public.school_room,public.room_booking from public,anon,authenticated;
create function public.school_rooms() returns setof public.school_room language sql stable security definer set search_path='' as $$ select r.* from public.school_room r where auth.uid() is not null and (r.bookable or public.portal_has_role(auth.uid(),'admin') or exists(select 1 from public.room_booking b where b.room_id=r.id and b.owner_id=auth.uid() and b.ends_at>now())) order by r.name,r.id;$$;
create function public.school_room_save(target uuid,label text,info text,enabled boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.portal_has_role(auth.uid(),'admin') then raise exception 'Admin erforderlich.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if enabled is null then raise exception 'Buchbarkeit erforderlich.';end if;
 if target is null then insert into public.school_room(name,details,bookable) values(btrim(label),coalesce(info,''),enabled) returning id into result;
 else update public.school_room set name=btrim(label),details=coalesce(info,''),bookable=enabled where id=target returning id into result;if result is null then raise exception 'Raum fehlt.';end if;end if;return result;
end;$$;
-- Resolve ordinary teaching and approved partial substitutions into occupied room segments.
create function public.room_teaching(day date) returns table(room text,starts time,ends time) language sql stable security definer set search_path='' as $$
 with lessons as(select l from public.school_schedule sc cross join lateral jsonb_array_elements(sc.lessons) l where l->>'day'=(array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from day)::int+1]),
 segments as(select l,points.at,lead(points.at) over(partition by l order by points.at) until from lessons cross join lateral (
 select (l->>'start')::time at union select (l->>'end')::time union
 select greatest(s.start_time,(l->>'start')::time) from public.substitution_list() s where s.date=day and public.school_teacher_key(s.teacher)=public.school_teacher_key(l->>'teacher') and s.start_time<(l->>'end')::time and s.end_time>(l->>'start')::time union
 select least(s.end_time,(l->>'end')::time) from public.substitution_list() s where s.date=day and public.school_teacher_key(s.teacher)=public.school_teacher_key(l->>'teacher') and s.start_time<(l->>'end')::time and s.end_time>(l->>'start')::time) points)
 select distinct btrim(r),seg.at,seg.until from segments seg left join lateral(select s.* from public.substitution_list() s where s.date=day and public.school_teacher_key(s.teacher)=public.school_teacher_key(seg.l->>'teacher') and s.start_time<=seg.at and s.end_time>=seg.until order by s.updated_at desc,s.id limit 1) change on true
 cross join lateral unnest(string_to_array(coalesce(nullif(change.room,''),seg.l->>'room'),',')) r
 where seg.until>seg.at and coalesce(change.kind,'')<>'cancelled';$$;
revoke all on function public.room_teaching(date) from public,anon,authenticated;
create function public.school_room_slots(day date) returns table(id uuid,room_id uuid,label text,starts_at timestamptz,ends_at timestamptz,can_cancel boolean,teaching boolean) language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where profiles.id=auth.uid()) then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 if day is null or not isfinite(day) then raise exception 'Tag erforderlich.';end if;
 return query select b.id,b.room_id,case when b.owner_id=auth.uid() or public.portal_has_role(auth.uid(),'admin') then b.title else 'Reserviert' end,b.starts_at,b.ends_at,b.owner_id=auth.uid() or public.portal_has_role(auth.uid(),'admin'),false
 from public.room_booking b join public.school_room r on r.id=b.room_id where (r.bookable or public.portal_has_role(auth.uid(),'admin') or b.owner_id=auth.uid()) and b.starts_at<(day+1)::timestamp at time zone 'Europe/Berlin' and b.ends_at>day::timestamp at time zone 'Europe/Berlin'
 union all select null::uuid,r.id,'Unterricht'::text,(day+t.starts) at time zone 'Europe/Berlin',(day+t.ends) at time zone 'Europe/Berlin',false,true from public.room_teaching(day) t join public.school_room r on lower(btrim(r.name))=lower(btrim(t.room)) where r.bookable or public.portal_has_role(auth.uid(),'admin');
end;$$;
create function public.school_room_book(target uuid,label text,from_time timestamptz,to_time timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;local_day date;
begin
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837266);perform pg_catalog.pg_advisory_xact_lock(hashtextextended(target::text,85));
 if not exists(select 1 from public.school_room where id=target and bookable) then raise exception 'Raum ist nicht zur Buchung freigegeben.' using errcode='42501';end if;
 if from_time is null or to_time is null or not isfinite(from_time) or not isfinite(to_time) or from_time<=now() or to_time<=from_time or to_time-from_time>interval '12 hours' or from_time>now()+interval '366 days' or (from_time at time zone 'Europe/Berlin')::date<>(to_time at time zone 'Europe/Berlin')::date then raise exception 'Bitte einen zukünftigen Zeitraum am selben Tag (maximal 12 Stunden) wählen.';end if;
 local_day:=(from_time at time zone 'Europe/Berlin')::date;
 if exists(select 1 from public.room_booking b where b.room_id=target and b.starts_at<to_time and b.ends_at>from_time) or exists(select 1 from public.room_teaching(local_day) t join public.school_room r on r.id=target and lower(btrim(r.name))=lower(btrim(t.room)) where (local_day+t.starts) at time zone 'Europe/Berlin'<to_time and (local_day+t.ends) at time zone 'Europe/Berlin'>from_time) then raise exception 'Raum ist durch Unterricht oder eine Buchung belegt.' using errcode='23P01';end if;
 insert into public.room_booking(room_id,owner_id,title,starts_at,ends_at) values(target,auth.uid(),btrim(label),from_time,to_time) returning id into result;return result;
end;$$;
create function public.school_room_cancel(booking uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 delete from public.room_booking where id=booking and (owner_id=auth.uid() or public.portal_has_role(auth.uid(),'admin'));
 if not found then raise exception 'Keine Berechtigung oder Buchung bereits entfernt.' using errcode='42501';end if;
end;$$;
-- A later timetable/room substitution may not silently overwrite an existing reservation.
create function public.school_room_teaching_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.room_booking b join public.school_room r on r.id=b.room_id cross join lateral public.room_teaching((b.starts_at at time zone 'Europe/Berlin')::date) t
 where b.ends_at>now() and lower(btrim(t.room))=lower(btrim(r.name)) and (((b.starts_at at time zone 'Europe/Berlin')::date+t.starts) at time zone 'Europe/Berlin')<b.ends_at and (((b.starts_at at time zone 'Europe/Berlin')::date+t.ends) at time zone 'Europe/Berlin')>b.starts_at) then raise exception 'Die Unterrichtsänderung kollidiert mit einer Raumbuchung. Bitte die Buchung zuerst im Bereich Raumbuchung prüfen.' using errcode='23P01';end if;
 return null;
end;$$;
create constraint trigger room_timetable_conflict after insert or update or delete on public.school_schedule deferrable initially deferred for each row execute function public.school_room_teaching_guard();
create constraint trigger room_substitution_conflict after insert or update or delete on public.substitution_entry deferrable initially deferred for each row execute function public.school_room_teaching_guard();
revoke all on function public.school_rooms(),public.school_room_save(uuid,text,text,boolean),public.school_room_slots(date),public.school_room_book(uuid,text,timestamptz,timestamptz),public.school_room_cancel(uuid) from public,anon,authenticated;
grant execute on function public.school_rooms(),public.school_room_save(uuid,text,text,boolean),public.school_room_slots(date),public.school_room_book(uuid,text,timestamptz,timestamptz),public.school_room_cancel(uuid) to authenticated;
revoke all on function public.school_room_teaching_guard() from public,anon,authenticated;
notify pgrst,'reload schema';commit;
