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
const uid=n=>`00000000-0000-0000-0000-00000000000${n}`;
async function login(n){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec(`set role ${n?'authenticated':'anon'}`);}
const open=n=>db.query('select dm_open($1) id',[uid(n)]);
await login(1);
const people=(await db.query('select * from dm_people()')).rows;
assert.equal(people.length,3);assert.deepEqual(Object.keys(people[0]).sort(),['full_name','id','role']);
const {rows:[{id}]}=await open(2);assert.equal((await open(2)).rows[0].id,id);
await assert.rejects(()=>open(1));
await db.query("select dm_send($1,' Hello teacher ')",[id]);
await login(2);assert.equal((await open(1)).rows[0].id,id);
assert.equal((await db.query('select * from dm_messages($1)',[id])).rows[0].body,'Hello teacher');
await db.query("select dm_send($1,'Teacher reply')",[id]);
await login(3);
assert.equal((await db.query('select * from dm_messages($1)',[id])).rows.length,0);
assert.equal((await db.query('select * from dm_threads()')).rows.length,0);
await assert.rejects(()=>db.query("select dm_send($1,'Unauthorized')",[id]));
await login(4);assert.equal((await db.query('select * from dm_messages($1)',[id])).rows.length,0);
await assert.rejects(()=>db.query("select dm_send($1,'Admin cannot read other chats')",[id]));
await assert.rejects(()=>db.query('select * from dm_message'));
// Every role can initiate a chat with every other role; pair uniqueness is symmetric.
for(let caller=1;caller<=4;caller++){await login(caller);for(let peer=1;peer<=4;peer++){if(peer!==caller)await open(peer);}}
await login(1);assert.equal((await db.query('select * from dm_threads()')).rows.length,3);
await assert.rejects(()=>db.query("select dm_send($1,' ')",[id]));
await assert.rejects(()=>db.query("select dm_send($1,repeat('a',5001))",[id]));
assert.equal((await db.query('select * from dm_messages($1)',[id])).rows.length,2);
await login(null);for(const sql of ['select * from dm_people()','select * from dm_threads()','select * from dm_thread'])await assert.rejects(()=>db.query(sql));
console.log('PASS direct messages: all role pairs, one thread per pair, participant-only history/send, no staff override, no email directory, input validation, anonymous/direct-table denial');
await db.close();
