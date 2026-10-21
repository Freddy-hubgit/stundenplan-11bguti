begin;

-- All access is through the checked RPC functions below. No changes to profile policies.
create table public.support_ticket (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_name text not null,
  subject text not null check (char_length(btrim(subject)) between 1 and 160),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.support_ticket_message (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_ticket(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null,
  sender_role text not null check (sender_role in ('user', 'support', 'admin')),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index on public.support_ticket (owner_id, updated_at desc);
create index on public.support_ticket (status, updated_at desc);
create index on public.support_ticket_message (ticket_id, created_at);
alter table public.support_ticket enable row level security;
alter table public.support_ticket_message enable row level security;
revoke all on public.support_ticket, public.support_ticket_message from public, anon, authenticated;

create function public.support_is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('support', 'admin'));
$$;

-- Only display names and roles; never expose the complete profile or email directory.
create function public.support_team()
returns table (id uuid, full_name text, role text)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), case when p.role = 'admin' then 'Administration' else 'Support' end), p.role::text
  from public.profiles p
  where auth.uid() is not null and p.role in ('support', 'admin')
  order by p.role, p.full_name, p.id;
$$;

create function public.support_tickets() returns setof public.support_ticket
language sql stable security definer set search_path = '' as $$
  select t.* from public.support_ticket t
  where auth.uid() is not null and (t.owner_id = auth.uid() or public.support_is_staff())
  order by t.updated_at desc, t.id;
$$;

create function public.support_messages(ticket_id uuid) returns setof public.support_ticket_message
language sql stable security definer set search_path = '' as $$
  select m.* from public.support_ticket_message m
  join public.support_ticket t on t.id = m.ticket_id
  where t.id = $1 and auth.uid() is not null and (t.owner_id = auth.uid() or public.support_is_staff())
  order by m.created_at, m.id;
$$;

-- Create ticket and first message atomically. Identity/role are always derived server-side.
create function public.support_create_ticket(subject text, body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_name text;
  caller_role text;
  new_id uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select coalesce(nullif(btrim(p.full_name), ''), 'Nutzer'), p.role into caller_name, caller_role
    from public.profiles p where p.id = caller;
  if caller_role is distinct from 'user' then raise exception 'User profile required' using errcode = '42501'; end if;
  if subject is null or char_length(btrim(subject)) not between 1 and 160
     or body is null or char_length(btrim(body)) not between 1 and 5000 then
    raise exception 'Invalid subject or message' using errcode = '22023';
  end if;
  insert into public.support_ticket(owner_id, owner_name, subject)
    values (caller, caller_name, btrim(subject)) returning id into new_id;
  insert into public.support_ticket_message(ticket_id, sender_id, sender_name, sender_role, body)
    values (new_id, caller, caller_name, caller_role, btrim(body));
  return new_id;
end;
$$;

create function public.support_reply(ticket_id uuid, body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  ticket public.support_ticket;
  caller_name text;
  caller_role text;
begin
  if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
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

create function public.support_set_status(ticket_id uuid, new_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.support_is_staff() then
    raise exception 'Staff required' using errcode = '42501';
  end if;
  if new_status is null or new_status not in ('open', 'closed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  -- UPDATE locks the same row as support_reply, preventing a reply after closure.
  update public.support_ticket t set status = new_status, updated_at = clock_timestamp() where t.id = $1;
  if not found then raise exception 'Ticket unavailable' using errcode = '42501'; end if;
end;
$$;

revoke all on function public.support_is_staff(), public.support_team(), public.support_tickets(),
  public.support_messages(uuid), public.support_create_ticket(text, text), public.support_reply(uuid, text),
  public.support_set_status(uuid, text) from public, anon, authenticated;
grant execute on function public.support_team(), public.support_tickets(), public.support_messages(uuid),
  public.support_create_ticket(text, text), public.support_reply(uuid, text), public.support_set_status(uuid, text)
  to authenticated;

commit;
