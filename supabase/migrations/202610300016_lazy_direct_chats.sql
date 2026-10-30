begin;
do $$begin
 if to_regclass('public.dm_thread') is null or to_regprocedure('public.dm_open(uuid)') is null then
  raise exception 'Bitte zuerst die Nachrichtenfunktion (Migration 008) einrichten.';
 end if;
end$$;
-- The first message and the chat are committed together, or neither is saved.
create function public.dm_start(peer_id uuid,message_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare chat uuid;
begin
 if message_body is null or char_length(btrim(message_body)) not between 1 and 5000 or message_body !~ '[^[:space:]]' then
  raise exception 'Nachricht muss zwischen 1 und 5000 Zeichen enthalten.' using errcode='22023';
 end if;
 chat:=public.dm_open(peer_id);
 perform public.dm_send(chat,message_body);
 return chat;
end;$$;
-- Hide empty threads left by older clients; keep existing messages untouched.
create or replace function public.dm_threads() returns table(id uuid,peer_id uuid,peer_name text,peer_role text,updated_at timestamptz,last_message text)
language sql stable security definer set search_path='' as $$
 select t.id,p.id,coalesce(nullif(btrim(p.full_name),''),'Nutzer'),p.role::text,t.updated_at,m.body
 from public.dm_thread t join public.profiles p on p.id=case when t.participant_a=auth.uid() then t.participant_b else t.participant_a end
 join lateral(select left(message.body,100) body from public.dm_message message where message.thread_id=t.id order by message.created_at desc,message.id desc limit 1)m on true
 where auth.uid() is not null and auth.uid() in (t.participant_a,t.participant_b)
 order by t.updated_at desc,t.id;
$$;
revoke all on function public.dm_start(uuid,text) from public,anon,authenticated;
grant execute on function public.dm_start(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
