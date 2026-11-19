begin;
create or replace function public.account_class_options() returns table(id uuid,name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.support_is_staff() then raise exception 'Nur Support und Admin dürfen Konten verwalten.' using errcode='42501';end if;
 return query select g.id,g.name from public.school_group g where g.kind='class' order by g.name,g.id;
end;$$;
create or replace function public.account_class_memberships() returns table(person_id uuid,class_id uuid,class_name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.support_is_staff() then raise exception 'Nur Support und Admin dürfen Konten verwalten.' using errcode='42501';end if;
 return query select m.user_id,g.id,g.name from public.school_member m join public.school_group g on g.id=m.group_id where m.member_kind='student' and g.kind='class' order by m.user_id,g.name,g.id;
end;$$;
create or replace function public.account_class_set(person uuid,target uuid,expected_classes uuid[]) returns uuid[] language plpgsql security definer set search_path='' as $$
declare actual uuid[];expected uuid[];
begin
 if not public.support_is_staff() then raise exception 'Nur Support und Admin dürfen Klassen zuordnen.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(837266);
 perform 1 from public.profiles where id=person for update;
 if not found then raise exception 'Konto nicht gefunden.' using errcode='22023';end if;
 if expected_classes is null or array_position(expected_classes,null) is not null then raise exception 'Bitte den aktuellen Klassenstand neu laden.' using errcode='22023';end if;
 select coalesce(array_agg(m.group_id order by m.group_id),'{}'::uuid[]) into actual from public.school_member m join public.school_group g on g.id=m.group_id where m.user_id=person and m.member_kind='student' and g.kind='class';
 select coalesce(array_agg(distinct c order by c),'{}'::uuid[]) into expected from unnest(expected_classes) c;
 if actual is distinct from expected then raise exception 'Die Klassenzuordnung wurde inzwischen geändert. Bitte Konten neu laden und erneut bearbeiten.' using errcode='40001';end if;
 if target is not null then
 if not public.portal_has_role(person,'user') then raise exception 'Für eine Schülerklasse benötigt das Konto die Nutzerrolle. Bitte zuerst die Rolle speichern.' using errcode='22023';end if;
 if not exists(select 1 from public.school_group where id=target and kind='class') then raise exception 'Bitte eine bestehende Klasse auswählen.' using errcode='22023';end if;
 if exists(select 1 from public.school_member where group_id=target and user_id=person and member_kind='teacher') then raise exception 'Das Konto ist dieser Klasse als Lehrkraft zugeordnet. Diese Lehrerzuordnung wird nicht überschrieben.' using errcode='22023';end if;
 end if;
 delete from public.school_member m using public.school_group g where m.group_id=g.id and m.user_id=person and m.member_kind='student' and g.kind='class' and m.group_id is distinct from target;
 if target is not null then insert into public.school_member(group_id,user_id,member_kind) values(target,person,'student') on conflict(group_id,user_id) do nothing;end if;
 return case when target is null then '{}'::uuid[] else array[target] end;
end;$$;
revoke all on function public.account_class_options(),public.account_class_memberships(),public.account_class_set(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.account_class_options(),public.account_class_memberships(),public.account_class_set(uuid,uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';commit;
