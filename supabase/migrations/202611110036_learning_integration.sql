begin;
-- Only the caller's teaching entries are returned, never entire foreign class plans.
create or replace function public.school_my_teaching() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare who text;entries jsonb;
begin
 if not public.portal_has_role(auth.uid(),'teacher') then raise exception 'Lehrerrolle erforderlich.' using errcode='42501';end if;
 select timetable_name into who from public.teacher_identity where user_id=auth.uid();
 if coalesce(btrim(who),'')='' then return jsonb_build_object('teacher','','lessons','[]'::jsonb);end if;
 select coalesce(jsonb_agg(l||jsonb_build_object('group_id',g.id,'group_name',g.name)),'[]'::jsonb) into entries
 from public.school_schedule sc join public.school_group g on g.id=sc.group_id cross join lateral jsonb_array_elements(sc.lessons) l
 where exists(select 1 from unnest(string_to_array(l->>'teacher',',')) t where public.school_teacher_key(t)=public.school_teacher_key(who))
 or exists(select 1 from public.substitution_list() s where s.kind='replacement' and public.school_teacher_key(s.replacement_teacher)=public.school_teacher_key(who) and public.school_teacher_key(s.teacher)=public.school_teacher_key(l->>'teacher') and s.start_time::text<l->>'end' and s.end_time::text>l->>'start');
 return jsonb_build_object('teacher',who,'lessons',entries);
end;$$;
revoke all on function public.school_my_teaching() from public,anon,authenticated;
grant execute on function public.school_my_teaching() to authenticated;


alter table public.portal_tile_setting drop constraint portal_tile_setting_route_check;
alter table public.portal_tile_setting add constraint portal_tile_setting_route_check check(route in('/hefte','/klassen','/materialien','/meldungen','/hausaufgaben','/nachrichten','/videokonferenz','/stundenplan','/krankmeldung','/schuljahr','/raumbuchung','/abgaben','/aenderungsverlauf','/kalender','/support','/vertretungsplan','/noten','/pruefungen','/sprechstunden','/suche','/papierkorb','/lehrerstundenplan'));
-- New school-year content participates in the existing reviewed reset and its staleness checks.
do $$declare t text;definition text;begin
 foreach t in array array['learning_grade','learning_self_assessment','learning_teacher_grade','consultation_slot','consultation_booking','portal_trash'] loop
 execute format('create trigger school_reset_revision before insert or update or delete on public.%I for each statement execute function public.school_track_change()',t);end loop;
 select pg_get_functiondef('public.school_reset_plan(boolean,boolean,boolean)'::regprocedure) into definition;
 definition:=replace(definition,'counts:=jsonb_build_object(', 'counts:=jsonb_build_object(''Noteneinträge'',(select count(*) from public.learning_grade),''Sprechstundenangebote'',(select count(*) from public.consultation_slot),''Sprechstundenbuchungen'',(select count(*) from public.consultation_booking),''Papierkorb'',(select count(*) from public.portal_trash),');execute definition;
 select pg_get_functiondef('public.school_reset_execute(uuid,text)'::regprocedure) into definition;
 definition:=replace(definition,'delete from public.teacher_absence;', 'delete from public.consultation_slot;delete from public.learning_grade;delete from public.portal_trash;delete from public.teacher_absence;');execute definition;
end$$;
notify pgrst,'reload schema';commit;
