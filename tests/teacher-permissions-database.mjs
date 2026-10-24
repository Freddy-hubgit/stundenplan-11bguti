import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
create table public.profiles(id uuid primary key references auth.users,full_name text,email text,role text check(role in ('user','support','admin')));
insert into auth.users select ('00000000-0000-0000-0000-00000000000'||n)::uuid from generate_series(1,4)n;
insert into profiles values
('00000000-0000-0000-0000-000000000001','User','user@example.test','user'),
('00000000-0000-0000-0000-000000000002','Support','support@example.test','support'),
('00000000-0000-0000-0000-000000000003','Admin','admin@example.test','admin'),
('00000000-0000-0000-0000-000000000004','Teacher','teacher@example.test','user');`);
for(const file of ['202610210001_support_tickets.sql','202610240004_calendar_and_meetings.sql','202610240005_teacher_permissions.sql','202610240006_edit_profile_role.sql','202610240007_support_edit_roles.sql'])
 await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
async function login(n){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?`00000000-0000-0000-0000-00000000000${n}`:'']);await db.exec(`set role ${n?'authenticated':'anon'}`);}
await login(4);
const {rows:[{id:ticket}]}=await db.query("select support_create_ticket('Existing ticket','Private message') id");
await db.exec('reset role');await db.exec("update profiles set role='teacher' where full_name='Teacher'");
await login(2);
for(const kind of ['event','meeting']) await db.query('select portal_event_save(null,$1,$2,$3,$4,$5,$6,$7)',[kind,kind,'','2026-10-26T10:00:00Z','2026-10-26T11:00:00Z','',kind==='meeting'?'https://meet.jit.si/test':'']);
await login(1);
assert.equal((await db.query('select * from portal_events_list()')).rows.length,1);
assert.equal((await db.query('select * from portal_events_list()')).rows[0].kind,'meeting');
await login(4);
assert.equal((await db.query('select * from portal_events_list()')).rows.length,2);
assert.equal((await db.query('select * from support_tickets()')).rows.length,0);
assert.equal((await db.query('select * from support_team()')).rows.length,0);
assert.equal((await db.query('select * from support_messages($1)',[ticket])).rows.length,0);
await assert.rejects(()=>db.query("select support_reply($1,'Forbidden')",[ticket]));
await assert.rejects(()=>db.query("select support_create_ticket('Forbidden','Forbidden')"));
await assert.rejects(()=>db.query("select support_set_status($1,'closed')",[ticket]));
await assert.rejects(()=>db.query("select portal_event_save(null,'event','Forbidden','','2026-10-26T10:00Z','2026-10-26T11:00Z','','')"));
await login(2);assert.equal((await db.query('select * from support_tickets()')).rows.length,1);
await login(3);assert.equal((await db.query('select * from portal_events_list()')).rows.length,2);
await login(4);await assert.rejects(()=>db.query("select set_profile_role('00000000-0000-0000-0000-000000000004','admin')"));
await login(2);
await db.query("select set_profile_role('00000000-0000-0000-0000-000000000004','user')");
await db.query("select set_profile_role('00000000-0000-0000-0000-000000000004','teacher')");
await db.query("select set_profile_role('00000000-0000-0000-0000-000000000004','support')");
await db.query("select set_profile_role('00000000-0000-0000-0000-000000000004','admin')");
await db.query("select set_profile_role('00000000-0000-0000-0000-000000000004','teacher')");
await assert.rejects(()=>db.query("select set_profile_role('00000000-0000-0000-0000-000000000003','user')"),{code:'P0001'});
await login(3);
await assert.rejects(()=>db.query("select set_profile_role('00000000-0000-0000-0000-000000000001','invalid')"));
await assert.rejects(()=>db.query("select set_profile_role('00000000-0000-0000-0000-000000000003','teacher')"),{code:'P0001'});
await db.query("select set_profile_role('00000000-0000-0000-0000-000000000001','teacher')");
await login(1);assert.equal((await db.query('select * from portal_events_list()')).rows.length,2);
await login(3);await db.query("select set_profile_role('00000000-0000-0000-0000-000000000001','admin')");
await db.query("select set_profile_role('00000000-0000-0000-0000-000000000003','support')");
await db.query("select set_profile_role('00000000-0000-0000-0000-000000000003','admin')");
await login(null);await assert.rejects(()=>db.query('select * from portal_events_list()'));
console.log('PASS permissions: teacher role constraint, user meetings-only, teacher calendar/no tickets including old owned tickets, staff unchanged, anonymous denied');
await db.close();
