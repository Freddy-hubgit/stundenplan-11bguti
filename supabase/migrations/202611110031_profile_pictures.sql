begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-pictures','profile-pictures',false,2097152,array['image/webp'])
on conflict(id) do nothing;
do $$ begin
 if not exists(select 1 from storage.buckets where id='profile-pictures' and public=false
 and file_size_limit=2097152 and allowed_mime_types=array['image/webp']) then
  raise exception 'profile-pictures muss privat sein, maximal 2 MB erlauben und nur image/webp akzeptieren.';
 end if;
end $$;
drop policy if exists profile_picture_read on storage.objects;
create policy profile_picture_read on storage.objects for select to authenticated
 using(bucket_id='profile-pictures' and name ~ '^[0-9a-f-]{36}/avatar[.]webp$');
drop policy if exists profile_picture_insert on storage.objects;
create policy profile_picture_insert on storage.objects for insert to authenticated
 with check(bucket_id='profile-pictures' and name=auth.uid()::text||'/avatar.webp');
drop policy if exists profile_picture_update on storage.objects;
create policy profile_picture_update on storage.objects for update to authenticated
 using(bucket_id='profile-pictures' and name=auth.uid()::text||'/avatar.webp')
 with check(bucket_id='profile-pictures' and name=auth.uid()::text||'/avatar.webp');
drop policy if exists profile_picture_delete on storage.objects;
create policy profile_picture_delete on storage.objects for delete to authenticated
 using(bucket_id='profile-pictures' and name=auth.uid()::text||'/avatar.webp');
-- Boundaries also constrain any broader existing permissive Storage policies.
drop policy if exists profile_picture_read_boundary on storage.objects;
create policy profile_picture_read_boundary on storage.objects as restrictive for select to public
 using(bucket_id<>'profile-pictures' or (auth.uid() is not null and name ~ '^[0-9a-f-]{36}/avatar[.]webp$'));
drop policy if exists profile_picture_insert_boundary on storage.objects;
create policy profile_picture_insert_boundary on storage.objects as restrictive for insert to public
 with check(bucket_id<>'profile-pictures' or (auth.uid() is not null and name=auth.uid()::text||'/avatar.webp'));
drop policy if exists profile_picture_update_boundary on storage.objects;
create policy profile_picture_update_boundary on storage.objects as restrictive for update to public
 using(bucket_id<>'profile-pictures' or (auth.uid() is not null and name=auth.uid()::text||'/avatar.webp'))
 with check(bucket_id<>'profile-pictures' or (auth.uid() is not null and name=auth.uid()::text||'/avatar.webp'));
drop policy if exists profile_picture_delete_boundary on storage.objects;
create policy profile_picture_delete_boundary on storage.objects as restrictive for delete to public
 using(bucket_id<>'profile-pictures' or (auth.uid() is not null and name=auth.uid()::text||'/avatar.webp'));
commit;
