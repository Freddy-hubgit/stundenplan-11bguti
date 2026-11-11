begin;
-- Existing events without an owner remain shared blockers. Newly created entries belong to their creator.
alter table public.portal_event add column owner_id uuid references public.profiles(id) on delete set null;
alter table public.portal_event alter column owner_id set default auth.uid();
create table public.consultation_slot(id uuid primary key default gen_random_uuid(),teacher_id uuid not null references public.profiles on delete cascade,starts_at timestamptz not null,ends_at timestamptz not null,location text not null default '' check(char_length(location)<=200),cancelled boolean not null default false,check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at and ends_at-starts_at<=interval '1 hour'));
create table public.consultation_booking(id uuid primary key default gen_random_uuid(),slot_id uuid not null references public.consultation_slot on delete cascade,student_id uuid not null references public.profiles on delete cascade,topic text not null check(char_length(btrim(topic)) between 1 and 500),cancelled_at timestamptz);
create unique index consultation_one_booking on public.consultation_booking(slot_id) where cancelled_at is null;
alter table public.consultation_slot enable row level security;alter table public.consultation_booking enable row level security;
revoke all on public.consultation_slot,public.consultation_booking from public,anon,authenticated;
create function public.person_teaching(person uuid,day date) returns table(starts time,ends time) language sql stable security definer set search_path='' as $$
 with lessons as(select sc.group_id,l from public.school_schedule sc cross join lateral jsonb_array_elements(sc.lessons) l where l->>'day'=(array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from day)::integer+1]),
 segments as(select group_id,l,points.at,lead(points.at) over(partition by group_id,l order by points.at) until from lessons cross join lateral (
 select (l->>'start')::time at union select (l->>'end')::time union
 select greatest(s.start_time,(l->>'start')::time) from public.substitution_list() s where s.date=day and public.school_teacher_key(s.teacher)=public.school_teacher_key(l->>'teacher') and s.start_time<(l->>'end')::time and s.end_time>(l->>'start')::time union
 select least(s.end_time,(l->>'end')::time) from public.substitution_list() s where s.date=day and public.school_teacher_key(s.teacher)=public.school_teacher_key(l->>'teacher') and s.start_time<(l->>'end')::time and s.end_time>(l->>'start')::time) points)
 select distinct seg.at,seg.until from segments seg left join lateral(select s.* from public.substitution_list() s where s.date=day and public.school_teacher_key(s.teacher)=public.school_teacher_key(seg.l->>'teacher') and s.start_time<=seg.at and s.end_time>=seg.until order by s.updated_at desc,s.id limit 1) change on true
 where seg.until>seg.at and coalesce(change.kind,'')<>'cancelled' and
 (exists(select 1 from public.school_member m where m.user_id=person and m.member_kind='student' and m.group_id=seg.group_id)
 or exists(select 1 from public.teacher_identity i cross join lateral unnest(string_to_array(case when change.kind='replacement' then change.replacement_teacher else seg.l->>'teacher' end,',')) t where i.user_id=person and public.school_teacher_key(i.timetable_name)=public.school_teacher_key(t)));$$;
create function public.consult_busy(person uuid,period_start timestamptz,period_end timestamptz,except_booking uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.portal_event e where (e.owner_id is null or e.owner_id=person) and e.starts_at<period_end and e.ends_at>period_start)
 or exists(select 1 from public.room_booking r where r.owner_id=person and r.starts_at<period_end and r.ends_at>period_start)
 or exists(select 1 from public.consultation_booking b join public.consultation_slot s on s.id=b.slot_id where b.cancelled_at is null and not s.cancelled and b.id is distinct from except_booking and (b.student_id=person or s.teacher_id=person) and s.starts_at<period_end and s.ends_at>period_start)
 or exists(select 1 from public.person_teaching(person,(period_start at time zone 'Europe/Berlin')::date) t where (((period_start at time zone 'Europe/Berlin')::date+t.starts) at time zone 'Europe/Berlin')<period_end and (((period_start at time zone 'Europe/Berlin')::date+t.ends) at time zone 'Europe/Berlin')>period_start)
 or exists(select 1 from public.school_exam e where ((e.date+e.starts) at time zone 'Europe/Berlin')<period_end and ((e.date+e.ends) at time zone 'Europe/Berlin')>period_start and (e.author_id=person or exists(select 1 from public.school_member m where m.user_id=person and m.member_kind='student' and m.group_id=e.group_id)));$$;
create function public.consultation_list() returns table(id uuid,teacher_id uuid,teacher_name text,starts_at timestamptz,ends_at timestamptz,location text,booking_id uuid,student_name text,topic text,available boolean,can_manage boolean,can_cancel boolean) language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 return query select s.id,s.teacher_id,coalesce(p.full_name,'Lehrkraft'),s.starts_at,s.ends_at,s.location,
 case when b.student_id=auth.uid() or s.teacher_id=auth.uid() then b.id else null end,
 case when b.student_id=auth.uid() or s.teacher_id=auth.uid() then sp.full_name else null end,
 case when b.student_id=auth.uid() or s.teacher_id=auth.uid() then b.topic else null end,
 b.id is null and s.starts_at>now() and not public.consult_busy(s.teacher_id,s.starts_at,s.ends_at) and not public.consult_busy(auth.uid(),s.starts_at,s.ends_at),
 s.teacher_id=auth.uid() or public.portal_has_role(auth.uid(),'admin'),b.student_id=auth.uid() or s.teacher_id=auth.uid()
 from public.consultation_slot s join public.profiles p on p.id=s.teacher_id left join public.consultation_booking b on b.slot_id=s.id and b.cancelled_at is null left join public.profiles sp on sp.id=b.student_id
 where not s.cancelled and s.ends_at>now() and (public.portal_has_role(auth.uid(),'user') or s.teacher_id=auth.uid() or public.portal_has_role(auth.uid(),'admin')) order by s.starts_at,s.id;
end;$$;
create function public.consultation_offer(starts timestamptz,ends timestamptz,place text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if not public.portal_has_role(auth.uid(),'teacher') then raise exception 'Lehrerrolle erforderlich.' using errcode='42501';end if;
 if starts is null or ends is null or starts<=now() or starts>now()+interval '366 days' or (starts at time zone 'Europe/Berlin')::date<>(ends at time zone 'Europe/Berlin')::date or ends<=starts or ends-starts>interval '1 hour' then raise exception 'Zukünftigen Zeitraum am selben Tag, höchstens 60 Minuten, wählen.';end if;
 if public.consult_busy(auth.uid(),starts,ends) then raise exception 'Der Zeitraum ist durch Kalender, Unterricht, Prüfung oder eine Buchung belegt.' using errcode='23P01';end if;
 if exists(select 1 from public.consultation_slot s where s.teacher_id=auth.uid() and not s.cancelled and s.starts_at<ends and s.ends_at>starts) then raise exception 'Es besteht bereits ein Sprechstundenangebot in diesem Zeitraum.';end if;
 insert into public.consultation_slot(teacher_id,starts_at,ends_at,location) values(auth.uid(),starts,ends,coalesce(place,'')) returning id into result;return result;
end;$$;
create function public.consultation_book(slot uuid,details text) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.consultation_slot;result uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if not public.portal_has_role(auth.uid(),'user') then raise exception 'Schülerrolle erforderlich.' using errcode='42501';end if;
 select * into s from public.consultation_slot where id=slot and not cancelled for update;
 if not found or s.teacher_id=auth.uid() or s.starts_at<=now() then raise exception 'Sprechstunde ist nicht buchbar.';end if;
 if public.consult_busy(auth.uid(),s.starts_at,s.ends_at) or public.consult_busy(s.teacher_id,s.starts_at,s.ends_at) then raise exception 'Kalender, Unterricht, Prüfung oder Buchung einer beteiligten Person überschneidet sich.' using errcode='23P01';end if;
 insert into public.consultation_booking(slot_id,student_id,topic) values(slot,auth.uid(),btrim(details)) returning id into result;return result;
end;$$;
create function public.consultation_cancel(booking uuid default null,slot uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if booking is not null then
 update public.consultation_booking b set cancelled_at=clock_timestamp() from public.consultation_slot s where b.id=booking and b.slot_id=s.id and b.cancelled_at is null and (b.student_id=auth.uid() or s.teacher_id=auth.uid());
 if not found then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 elsif slot is not null then
 update public.consultation_slot s set cancelled=true where s.id=slot and (s.teacher_id=auth.uid() or public.portal_has_role(auth.uid(),'admin'));
 if not found then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 update public.consultation_booking set cancelled_at=clock_timestamp() where slot_id=slot and cancelled_at is null;
 end if;
end;$$;
-- A later change cannot silently double-book a confirmed appointment.
create function public.consultation_conflict_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if exists(select 1 from public.consultation_booking b join public.consultation_slot s on s.id=b.slot_id where b.cancelled_at is null and not s.cancelled and s.ends_at>now() and (public.consult_busy(b.student_id,s.starts_at,s.ends_at,b.id) or public.consult_busy(s.teacher_id,s.starts_at,s.ends_at,b.id))) then raise exception 'Änderung kollidiert mit einer gebuchten Sprechstunde. Bitte die Sprechstunde zuerst absagen.' using errcode='23P01';end if;
 return null;
end;$$;
do $$declare t text;begin foreach t in array array['portal_event','school_schedule','substitution_entry','room_booking','school_exam','school_member','teacher_identity'] loop execute format('create constraint trigger consultation_conflict after insert or update or delete on public.%I deferrable initially deferred for each row execute function public.consultation_conflict_guard()',t);end loop;end$$;
revoke all on function public.person_teaching(uuid,date),public.consult_busy(uuid,timestamptz,timestamptz,uuid),public.consultation_conflict_guard() from public,anon,authenticated;
revoke all on function public.consultation_list(),public.consultation_offer(timestamptz,timestamptz,text),public.consultation_book(uuid,text),public.consultation_cancel(uuid,uuid) from public,anon;
grant execute on function public.consultation_list(),public.consultation_offer(timestamptz,timestamptz,text),public.consultation_book(uuid,text),public.consultation_cancel(uuid,uuid) to authenticated;
create or replace function public.portal_event_save(entry_id uuid, entry_kind text, entry_title text, details text,
 starts timestamptz, ends timestamptz, place text, meeting_link text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
 if auth.uid() is null or not (public.support_is_staff() or public.portal_has_role(auth.uid(),'teacher')) then raise exception 'Lehrer-, Support- oder Adminrolle erforderlich.' using errcode='42501';end if;
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
  where e.id=entry_id and (public.support_is_staff() or e.owner_id=auth.uid()) returning e.id into saved_id;
  if not found then raise exception 'Event unavailable' using errcode = '22023'; end if;
 end if;
 return saved_id;
end;
$$;
create or replace function public.portal_event_delete(entry_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not (public.support_is_staff() or public.portal_has_role(auth.uid(),'teacher')) then raise exception 'Keine Berechtigung.' using errcode='42501';end if;
 delete from public.portal_event e where e.id=entry_id and (public.support_is_staff() or e.owner_id=auth.uid());
 if not found then raise exception 'Event unavailable' using errcode = '22023'; end if;
end;
$$;

notify pgrst,'reload schema';commit;
