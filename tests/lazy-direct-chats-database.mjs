import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite }=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
create table public.profiles(id uuid primary key,full_name text,role text);
insert into profiles select ('00000000-0000-0000-0000-00000000000'||n)::uuid,'Person '||n,
case n when 1 then 'user' when 2 then 'teacher' when 3 then 'support' else 'admin' end from generate_series(1,4)n;`);
await db.exec(await readFile(new URL('../supabase/migrations/202610270008_direct_messages.sql',import.meta.url),'utf8'));

await db.exec(await readFile(new URL('../supabase/migrations/202610300016_lazy_direct_chats.sql',import.meta.url),'utf8'));
const uid=n=>`00000000-0000-0000-0000-00000000000${n}`;
async function login(n){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec(`set role ${n?'authenticated':'anon'}`);}
const start=(n,body)=>db.query('select dm_start($1,$2) id',[uid(n),body]);
await login(1);for(const body of ['', '   ', '\t\n',null,'a'.repeat(5001)])await assert.rejects(()=>start(2,body));
await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from dm_thread')).rows[0].n,0);
// A first-message failure must roll back the newly created thread as well.
await db.exec(`create function public.test_fail_message() returns trigger language plpgsql as $$begin raise exception 'Simulated write failure';end;$$;
create trigger test_fail_message before insert on public.dm_message for each row execute function public.test_fail_message();`);
await login(1);await assert.rejects(()=>start(2,'Hello'));
await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from dm_thread')).rows[0].n,0);
await db.exec('drop trigger test_fail_message on public.dm_message;drop function public.test_fail_message();');
await login(1);const id=(await start(2,' Hello ')).rows[0].id;
assert.equal((await db.query('select * from dm_threads()')).rows.length,1);
assert.equal((await db.query('select * from dm_messages($1)',[id])).rows[0].body,'Hello');
const empty=(await db.query('select dm_open($1) id',[uid(3)])).rows[0].id;
assert.equal((await db.query('select * from dm_threads()')).rows.length,1);
assert.equal((await start(3,'First real message')).rows[0].id,empty);
assert.equal((await db.query('select * from dm_threads()')).rows.length,2);
await login(2);assert.equal((await start(1,'Reply')).rows[0].id,id);
assert.equal((await db.query('select * from dm_messages($1)',[empty])).rows.length,0);
await assert.rejects(()=>start(2,'Self chat'));
await login(null);await assert.rejects(()=>start(1,'Anonymous'));
console.log('PASS lazy chats: invalid first messages leave no thread, failed writes roll back atomically, legacy empty chats hidden/reused, symmetric pair uniqueness and participant privacy');
await db.close();
