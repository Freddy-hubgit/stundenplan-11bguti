begin;
-- The existing project uses a text role column with the standard profile role constraint.
-- Fail atomically on an incompatible schema instead of silently replacing an enum or policies.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role::text in ('user','teacher','support','admin'));

create function public.portal_can_use_tickets() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('user','support','admin'));
$$;
revoke all on function public.portal_can_use_tickets() from public, anon, authenticated;

create or replace function public.support_team()
returns table (id uuid, full_name text, role text)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), case when p.role = 'admin' then 'Administration' else 'Support' end), p.role::text
  from public.profiles p
  where public.portal_can_use_tickets() and p.role in ('support', 'admin')
  order by p.role, p.full_name, p.id;
$$;


create or replace function public.support_tickets() returns setof public.support_ticket
language sql stable security definer set search_path = '' as $$
  select t.* from public.support_ticket t
  where public.portal_can_use_tickets() and (t.owner_id = auth.uid() or public.support_is_staff())
  order by t.updated_at desc, t.id;
$$;


create or replace function public.support_messages(ticket_id uuid) returns setof public.support_ticket_message
language sql stable security definer set search_path = '' as $$
  select m.* from public.support_ticket_message m
  join public.support_ticket t on t.id = m.ticket_id
  where t.id = $1 and public.portal_can_use_tickets() and (t.owner_id = auth.uid() or public.support_is_staff())
  order by m.created_at, m.id;
$$;


create or replace function public.support_reply(ticket_id uuid, body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  ticket public.support_ticket;
  caller_name text;
  caller_role text;
begin
  if caller is null or not public.portal_can_use_tickets() then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into ticket from public.support_ticket t where t.id = $1 for update;
  if not found or not (ticket.owner_id = caller or public.support_is_staff()) then
    raise exception 'Ticket unavailable' using errcode = '42501';
  end if;
  if ticket.status <> 'open' then raise exception 'Ticket closed' using errcode = '22023'; end if;
  if body is null or char_length(btrim(body)) not between 1 and 5000 then
    raise exception 'Invalid message' using errcode = '22023';
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), 'Nutzer'), p.role into caller_name, caller_role
    from public.profiles p where p.id = caller;
  if caller_role is null then raise exception 'Profile required' using errcode = '42501'; end if;
  insert into public.support_ticket_message(ticket_id, sender_id, sender_name, sender_role, body)
    values ($1, caller, caller_name, caller_role, btrim(body));
  update public.support_ticket t set updated_at = clock_timestamp() where t.id = $1;
end;
$$;


-- Normal users can only fetch conferences, including through direct RPC calls.
create or replace function public.portal_events_list() returns setof public.portal_event
language sql stable security definer set search_path = '' as $$
 select e.* from public.portal_event e
 where exists (select 1 from public.profiles p where p.id = auth.uid()
  and p.role in ('user','teacher','support','admin') and (e.kind = 'meeting' or p.role <> 'user'))
 order by e.starts_at, e.title, e.id;
$$;
commit;
