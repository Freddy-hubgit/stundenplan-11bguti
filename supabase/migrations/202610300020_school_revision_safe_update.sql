-- Fix compatibility with Supabase safe-update protection. No user data is deleted.
begin;
create or replace function public.school_track_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(837266);
 update public.school_revision set revision=revision+1 where singleton=true;
 return null;
end;
$$;
commit;
