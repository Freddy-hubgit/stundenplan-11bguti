begin;
create table public.learning_grade(
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.profiles(id) on delete cascade,
 group_id uuid not null references public.school_group(id) on delete cascade,author_id uuid not null references public.profiles(id),
 subject text not null check(char_length(btrim(subject)) between 1 and 100),title text not null check(char_length(btrim(title)) between 1 and 160),
 term text not null check(char_length(btrim(term)) between 1 and 40),entry_date date not null check(isfinite(entry_date)),
 scale text not null check(scale in('grade','points')),category text not null check(category in('written','oral','other')),
 weight numeric not null default 1 check(weight>0 and weight<=100),student_value numeric,revision integer not null default 1,
 check(student_value is null or (scale='grade' and student_value between 1 and 6) or (scale='points' and student_value between 0 and 15))
);
create index on public.learning_grade(student_id,group_id,subject,term);
create table public.learning_self_assessment(grade_id uuid primary key references public.learning_grade on delete cascade,value numeric not null,notes text not null default '' check(char_length(notes)<=2000));
create table public.learning_teacher_grade(grade_id uuid references public.learning_grade on delete cascade,teacher_id uuid references public.profiles on delete cascade,value numeric not null,updated_at timestamptz not null default clock_timestamp(),primary key(grade_id,teacher_id));
alter table public.learning_grade enable row level security;alter table public.learning_self_assessment enable row level security;alter table public.learning_teacher_grade enable row level security;
revoke all on public.learning_grade,public.learning_self_assessment,public.learning_teacher_grade from public,anon,authenticated;
create function public.learning_can_grade(person uuid,student uuid,target uuid,subject_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.school_member m where m.group_id=target and m.user_id=student and m.member_kind='student') and
 (public.portal_has_role(person,'admin') or (public.school_can_teach(person,target) and exists(
 select 1 from public.teacher_identity i join public.school_schedule sc on sc.group_id=target cross join lateral jsonb_array_elements(sc.lessons) l
 where i.user_id=person and lower(btrim(l->>'subject'))=lower(btrim(subject_name)) and exists(select 1 from unnest(string_to_array(l->>'teacher',',')) t where public.school_teacher_key(t)=public.school_teacher_key(i.timetable_name)))));$$;
create function public.learning_roster(target uuid) returns table(id uuid,name text) language sql stable security definer set search_path='' as $$
 select p.id,coalesce(p.full_name,'Nutzer') from public.school_member m join public.profiles p on p.id=m.user_id
 where m.group_id=target and m.member_kind='student' and public.school_can_teach(auth.uid(),target) order by p.full_name,p.id;$$;
create function public.learning_grades() returns table(id uuid,student_id uuid,student_name text,group_id uuid,group_name text,author_id uuid,subject text,title text,term text,entry_date date,scale text,category text,weight numeric,student_value numeric,teacher_value numeric,teacher_name text,self_value numeric,self_notes text,can_edit boolean,revision integer) language sql stable security definer set search_path='' as $$
 select g.id,g.student_id,coalesce(p.full_name,'Nutzer'),g.group_id,c.name,g.author_id,g.subject,g.title,g.term,g.entry_date,g.scale,g.category,g.weight,g.student_value,
 teacher.value,tp.full_name,
 case when g.student_id=auth.uid() or own.value is not null then a.value else null end,
 case when g.student_id=auth.uid() or own.value is not null then a.notes else null end,
 public.learning_can_grade(auth.uid(),g.student_id,g.group_id,g.subject) or (g.student_id=auth.uid() and g.author_id=auth.uid() and not exists(select 1 from public.learning_teacher_grade x where x.grade_id=g.id)),g.revision
 from public.learning_grade g join public.profiles p on p.id=g.student_id join public.school_group c on c.id=g.group_id
 left join public.learning_self_assessment a on a.grade_id=g.id
 left join public.learning_teacher_grade own on own.grade_id=g.id and own.teacher_id=auth.uid()
 left join lateral(select t.* from public.learning_teacher_grade t where t.grade_id=g.id and (g.student_id=auth.uid() or t.teacher_id=auth.uid()) order by t.updated_at desc,t.teacher_id limit 1) teacher on true
 left join public.profiles tp on tp.id=teacher.teacher_id
 where g.student_id=auth.uid()
 or public.learning_can_grade(auth.uid(),g.student_id,g.group_id,g.subject)
 order by g.entry_date desc,g.id;$$;
create function public.learning_grade_save(entry uuid,expected_revision integer,student uuid,target uuid,subject_name text,label text,period text,day date,grading_scale text,grade_category text,grade_weight numeric,score numeric) returns uuid language plpgsql security definer set search_path='' as $$
declare g public.learning_grade;result uuid;teacher boolean;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 if not exists(select 1 from public.profiles where profiles.id=auth.uid()) then raise exception 'Bitte anmelden.' using errcode='42501';end if;
 teacher:=public.learning_can_grade(auth.uid(),student,target,subject_name) and student<>auth.uid();
 if not teacher and not (student=auth.uid() and public.portal_has_role(auth.uid(),'user') and exists(select 1 from public.school_member m where m.group_id=target and m.user_id=student and m.member_kind='student')) then raise exception 'Nur eigene Noten oder das eigene Unterrichtsfach sind bearbeitbar.' using errcode='42501';end if;
 if score is not null and not ((grading_scale='grade' and score between 1 and 6) or (grading_scale='points' and score between 0 and 15)) then raise exception 'Note 1–6 oder Punkte 0–15 angeben.' using errcode='22023';end if;
 if entry is null then
 insert into public.learning_grade(student_id,group_id,author_id,subject,title,term,entry_date,scale,category,weight,student_value)
 values(student,target,auth.uid(),btrim(subject_name),btrim(label),btrim(period),day,grading_scale,grade_category,grade_weight,case when teacher then null else score end) returning learning_grade.id into result;
 else
 select * into g from public.learning_grade where learning_grade.id=entry for update;
 if not found or g.revision is distinct from expected_revision then raise exception 'Eintrag wurde inzwischen geändert. Bitte neu laden.' using errcode='40001';end if;
 if (g.student_id,g.group_id,g.subject,g.term,g.scale) is distinct from (student,target,btrim(subject_name),btrim(period),grading_scale) then raise exception 'Person, Fach, Gruppe, Halbjahr und Notensystem eines vorhandenen Eintrags bleiben erhalten.';end if;
 if not teacher and (g.author_id<>auth.uid() or exists(select 1 from public.learning_teacher_grade t where t.grade_id=entry)) then raise exception 'Lehrereinträge können nur von zuständigen Lehrkräften geändert werden.' using errcode='42501';end if;
 update public.learning_grade set title=btrim(label),entry_date=day,category=grade_category,weight=grade_weight,student_value=case when teacher then student_value else score end,revision=revision+1 where learning_grade.id=entry;result:=entry;
 end if;
 if teacher and score is not null then insert into public.learning_teacher_grade values(result,auth.uid(),score,clock_timestamp()) on conflict(grade_id,teacher_id) do update set value=excluded.value,updated_at=excluded.updated_at;end if;
 return result;
end;$$;
create function public.learning_assess(entry uuid,score numeric,comment text) returns void language plpgsql security definer set search_path='' as $$
declare g public.learning_grade;
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 select * into g from public.learning_grade where id=entry and student_id=auth.uid() for update;
 if not found or not exists(select 1 from public.school_member m where m.group_id=g.group_id and m.user_id=auth.uid() and m.member_kind='student') then raise exception 'Nur die eigene Selbsteinschätzung ist bearbeitbar.' using errcode='42501';end if;
 if score is null or not ((g.scale='grade' and score between 1 and 6) or (g.scale='points' and score between 0 and 15)) then raise exception 'Ungültige Selbsteinschätzung.';end if;
 insert into public.learning_self_assessment values(entry,score,coalesce(comment,'')) on conflict(grade_id) do update set value=excluded.value,notes=excluded.notes;
end;$$;
create function public.learning_grade_delete(entry uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 delete from public.learning_grade g where g.id=entry and (public.learning_can_grade(auth.uid(),g.student_id,g.group_id,g.subject) or (g.student_id=auth.uid() and g.author_id=auth.uid() and not exists(select 1 from public.learning_teacher_grade t where t.grade_id=g.id)));
 if not found then raise exception 'Eintrag nicht löschbar.' using errcode='42501';end if;
end;$$;
revoke all on function public.learning_can_grade(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.learning_roster(uuid),public.learning_grades(),public.learning_grade_save(uuid,integer,uuid,uuid,text,text,text,date,text,text,numeric,numeric),public.learning_assess(uuid,numeric,text),public.learning_grade_delete(uuid) from public,anon;
grant execute on function public.learning_roster(uuid),public.learning_grades(),public.learning_grade_save(uuid,integer,uuid,uuid,text,text,text,date,text,text,numeric,numeric),public.learning_assess(uuid,numeric,text),public.learning_grade_delete(uuid) to authenticated;
notify pgrst,'reload schema';commit;
