// Run with PGLITE_MODULE_PATH pointing to an independently installed @electric-sql/pglite module.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.profiles(id uuid primary key references auth.users, full_name text, email text, role text);
insert into auth.users select ('00000000-0000-0000-0000-00000000000' || n)::uuid from generate_series(1,4) n;
insert into profiles values
 ('00000000-0000-0000-0000-000000000001','Alice','alice@example.test','user'),
 ('00000000-0000-0000-0000-000000000002','Bob','bob@example.test','user'),
 ('00000000-0000-0000-0000-000000000003','Sam','sam@example.test','support'),
 ('00000000-0000-0000-0000-000000000004','Ada','ada@example.test','admin');
`);
await db.exec(await readFile(new URL('../supabase/migrations/202610210001_support_tickets.sql', import.meta.url), 'utf8'));
const login = async n => {
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub', $1, false)", [n ? `00000000-0000-0000-0000-00000000000${n}` : '']);
 await db.exec(`set role ${n ? 'authenticated' : 'anon'}`);
};
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const rejects = async (sql, params = []) => assert.rejects(() => db.query(sql, params));
await login(1);
const team = await rows('select * from support_team()');
assert.equal(team.length, 2); assert.deepEqual(Object.keys(team[0]).sort(), ['full_name', 'id', 'role']);
const [{ id }] = await rows("select support_create_ticket(' Hilfe ', ' Hallo ') as id");
assert.equal((await rows('select * from support_tickets()'))[0].subject, 'Hilfe');
assert.equal((await rows('select * from support_messages($1)', [id]))[0].body, 'Hallo');
await rejects("select support_create_ticket(' ', 'message')");
await rejects("select support_create_ticket('Subject', repeat('a',5001))");
await rejects('select * from support_ticket');
await rejects("update profiles set role='admin'");
await rejects("select support_set_status($1,'closed')", [id]);
await login(2);
assert.equal((await rows('select * from support_tickets()')).length, 0);
assert.equal((await rows('select * from support_messages($1)', [id])).length, 0);
await rejects("select support_reply($1,'unauthorized')", [id]);
await login(3);
assert.equal((await rows('select * from support_tickets()')).length, 1);
await rows("select support_reply($1,'We can help')", [id]);
await rejects("select support_create_ticket('Subject', 'staff cannot impersonate user')");
await rows("select support_set_status($1,'closed')", [id]);
await rejects("select support_reply($1,'closed reply')", [id]);
await login(1);
await rejects("select support_reply($1,'closed reply')", [id]);
assert.equal((await rows('select * from support_messages($1)', [id])).length, 2);
await login(4);
await rows("select support_set_status($1,'open')", [id]);
await rows("select support_reply($1,'Admin reply')", [id]);
await login(1);
await rows("select support_reply($1,'Thanks')", [id]);
const messages = await rows('select * from support_messages($1)', [id]);
assert.equal(messages.length, 4);
assert.deepEqual(messages.map(m => m.sender_role).sort(), ['admin','support','user','user']);
await login(null);
await rejects('select * from support_tickets()');
await rejects('select * from support_team()');
await rejects('select * from support_ticket_message');
console.log('PASS: migration, atomic creation, team privacy, owner isolation, staff/admin replies, closure/reopening, input validation, anonymous and direct-table denial');
await db.close();
