-- Read-only: run in the Supabase SQL Editor. Returns no account emails or IDs.
select
 i.timetable_name as zugeordneter_name,
 count(distinct sc.group_id) as gespeicherte_plaene,
 count(l) filter(where exists(
   select 1 from unnest(string_to_array(l->>'teacher',',')) t
   where public.school_teacher_key(t)=public.school_teacher_key(i.timetable_name)
 )) as passende_stunden,
 coalesce(jsonb_agg(distinct jsonb_build_object(
   'fach',l->>'subject','lehrer',l->>'teacher','tag',l->>'day','beginn',l->>'start'
 )) filter(where exists(
   select 1 from unnest(string_to_array(l->>'teacher',',')) t
   where public.school_teacher_key(t)=public.school_teacher_key(i.timetable_name)
 )), '[]'::jsonb) as gefundener_unterricht
from public.teacher_identity i
left join public.school_schedule sc on true
left join lateral jsonb_array_elements(sc.lessons) l on true
where public.school_teacher_key(i.timetable_name)='herr bendig'
group by i.user_id,i.timetable_name;
