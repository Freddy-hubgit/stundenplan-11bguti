begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('account-backgrounds','account-backgrounds',false,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
-- Do not silently overwrite an existing bucket's security configuration.
do $$ begin
 if not exists(select 1 from storage.buckets where id='account-backgrounds' and public=false
  and file_size_limit=3145728 and allowed_mime_types @> array['image/jpeg','image/png','image/webp']
  and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']) then
  raise exception 'Der Bucket account-backgrounds hat eine abweichende Konfiguration. Bitte privat, max. 3 MB, nur JPEG/PNG/WebP konfigurieren.';
 end if;
end $$;
create policy account_background_read on storage.objects for select to authenticated
 using(bucket_id='account-backgrounds' and name=auth.uid()::text||'/background');
create policy account_background_insert on storage.objects for insert to authenticated
 with check(bucket_id='account-backgrounds' and name=auth.uid()::text||'/background');
create policy account_background_update on storage.objects for update to authenticated
 using(bucket_id='account-backgrounds' and name=auth.uid()::text||'/background')
 with check(bucket_id='account-backgrounds' and name=auth.uid()::text||'/background');
create policy account_background_delete on storage.objects for delete to authenticated
 using(bucket_id='account-backgrounds' and name=auth.uid()::text||'/background');
-- Existing permissive policies for other buckets must not expose account pictures.
create policy account_background_boundary on storage.objects as restrictive for all to public
 using(bucket_id<>'account-backgrounds' or (auth.uid() is not null and name=auth.uid()::text||'/background'))
 with check(bucket_id<>'account-backgrounds' or (auth.uid() is not null and name=auth.uid()::text||'/background'));
commit;
