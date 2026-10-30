begin;
-- Only the caller's teaching entries are returned, never entire foreign class plans.
create function public.school_my_teaching() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare who text;entries jsonb;
begin
 if not public.portal_has_role(auth.uid(),'teacher') then raise exception 'Lehrerrolle erforderlich.' using errcode='42501';end if;
 select timetable_name into who from public.teacher_identity where user_id=auth.uid();
 if coalesce(btrim(who),'')='' then return jsonb_build_object('teacher','','lessons','[]'::jsonb);end if;
 select coalesce(jsonb_agg(l||jsonb_build_object('group_id',g.id)),'[]'::jsonb) into entries
 from public.school_schedule sc join public.school_group g on g.id=sc.group_id cross join lateral jsonb_array_elements(sc.lessons) l
 where exists(select 1 from unnest(string_to_array(l->>'teacher',',')) t where public.school_teacher_key(t)=public.school_teacher_key(who))
 or exists(select 1 from public.substitution_list() s where s.kind='replacement' and public.school_teacher_key(s.replacement_teacher)=public.school_teacher_key(who) and public.school_teacher_key(s.teacher)=public.school_teacher_key(l->>'teacher') and s.start_time::text<l->>'end' and s.end_time::text>l->>'start');
 return jsonb_build_object('teacher',who,'lessons',entries);
end;$$;
revoke all on function public.school_my_teaching() from public,anon,authenticated;
grant execute on function public.school_my_teaching() to authenticated;
notify pgrst,'reload schema';
commit;
