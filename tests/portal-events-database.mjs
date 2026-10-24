import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
create table public.profiles(id uuid primary key, role text);
insert into profiles values ('00000000-0000-0000-0000-000000000001','user'),
('00000000-0000-0000-0000-000000000002','support'),('00000000-0000-0000-0000-000000000003','admin');`);
await db.exec(await readFile(new URL('../supabase/migrations/202610240004_calendar_and_meetings.sql', import.meta.url),'utf8'));
async function login(n) {
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n ? `00000000-0000-0000-0000-00000000000${n}` : '']);
 await db.exec(`set role ${n ? 'authenticated' : 'anon'}`);
}
const save = (id=null, kind='meeting', url='https://meet.jit.si/Schulportal-test', title='Besprechung', end='2026-10-26T11:00:00Z') => db.query(
 'select portal_event_save($1,$2,$3,$4,$5,$6,$7,$8) id',[id,kind,title,'Info','2026-10-26T10:00:00Z',end,'Online',url]);
await login(1); await assert.rejects(() => save());
await assert.rejects(() => db.query('select * from portal_event'));
await login(2); const {rows:[{id}]}=await save();
await assert.rejects(() => save(null,'meeting','javascript:alert(1)'));
await assert.rejects(() => save(null,'meeting','http://meet.jit.si/insecure'));
await assert.rejects(() => save(null,'meeting','https://user:password@meet.jit.si/room'));
await assert.rejects(() => save(null,'meeting',''));
await assert.rejects(() => save(null,'event','',' '));
await assert.rejects(() => save(null,'event','','Titel','2026-10-26T09:00:00Z'));
await save(null,'event','');
await login(1);
assert.equal((await db.query('select * from portal_events_list()')).rows.length,2);
await assert.rejects(() => save(id));
await assert.rejects(() => db.query('select portal_event_delete($1)',[id]));
await login(3); await save(id,'meeting','https://meet.jit.si/Schulportal-test','Geändert');
assert.equal((await db.query('select * from portal_events_list() where id=$1',[id])).rows[0].title,'Geändert');
await db.query('select portal_event_delete($1)',[id]);
assert.equal((await db.query('select * from portal_events_list()')).rows.length,1);
await login(null);
await assert.rejects(() => db.query('select * from portal_events_list()'));
await assert.rejects(() => save());
console.log('PASS events: staff/admin CRUD, read-only users, anonymous/direct-table denial, valid times, HTTPS URL validation');
await db.close();
