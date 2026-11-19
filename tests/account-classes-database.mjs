process.on('uncaughtException',e=>{console.error(e.stack||e.message,e.code,e.where||'',e.query||'',e.position||'');process.exit(1);});
import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text,email text,role text check(role in ('user','teacher','support','admin')));
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));alter table storage.objects enable row level security;
grant usage on schema storage,auth to authenticated,anon;grant all on storage.objects to authenticated,anon;grant select,update on profiles to authenticated;create policy legacy_objects on storage.objects for all to public using(true) with check(true);
insert into auth.users select ('00000000-0000-0000-0000-00000000000'||n)::uuid from generate_series(1,6)n;
insert into profiles select id,'Person '||right(id::text,1),right(id::text,1)||'@example.test',case right(id::text,1) when '3' then 'teacher' when '4' then 'support' when '5' then 'admin' else 'user' end from auth.users;`);
for(const f of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&(!process.env.USE_EXPANSION_PACKAGE||f<'202610310024')&&(!process.env.USE_LEARNING_PACKAGE||f<'202611110032')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
if(process.env.USE_EXPANSION_PACKAGE){await db.exec(await readFile(new URL('../supabase/setup/school-expansion.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../supabase/migrations/202610310029_portal_tiles.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../supabase/migrations/202611020030_personal_notebooks.sql',import.meta.url),'utf8'));}
if(process.env.USE_LEARNING_PACKAGE)await db.exec(await readFile(new URL('../supabase/setup/learning-suite.sql',import.meta.url),'utf8'));
const uid=n=>`00000000-0000-0000-0000-00000000000${n}`;
async function login(n,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+role);}

await login(5);const a=(await db.query("select school_group_save(null,'11A','class',null) id")).rows[0].id,b=(await db.query("select school_group_save(null,'11B','class',null) id")).rows[0].id,c=(await db.query("select school_group_save(null,'12A','class',null) id")).rows[0].id,course=(await db.query("select school_group_save(null,'Deutsch','course',$1) id",[a])).rows[0].id;
const set=(target,expected=[])=>db.query('select account_class_set($1,$2,$3) classes',[uid(1),target,expected]);
await set(a);await db.query("select school_enrol($1,$2,'student',false)",[course,uid(1)]);
await login(1);await assert.rejects(()=>db.query('select * from account_class_options()'),{code:'42501'});await assert.rejects(()=>db.query('select * from account_class_memberships()'),{code:'42501'});await assert.rejects(()=>set(b,[a]),{code:'42501'});
await login(3);await assert.rejects(()=>set(b,[a]),{code:'42501'});
await login(4);assert.equal((await db.query('select * from account_class_options()')).rows.length,3);await set(b,[a]);await assert.rejects(()=>set(c,[a]),{code:'40001'});assert.equal((await db.query('select * from account_class_memberships()')).rows.find(m=>m.person_id===uid(1)).class_id,b);
await assert.rejects(()=>set(course,[b]),{code:'22023'});await assert.rejects(()=>db.query('select account_class_set($1,$2,$3)',[uid(3),a,[]]),{code:'22023'});
await login(5);await db.query("select set_profile_roles($1,array['user','teacher'])",[uid(1)]);await db.query("select school_enrol($1,$2,'teacher',false)",[a,uid(1)]);await assert.rejects(()=>set(a,[b]),{code:'22023'});
await db.query("select school_enrol($1,$2,'student',false)",[c,uid(1)]);await set(b,[c,b]);
await set(null,[b]);await db.exec('reset role');const members=(await db.query('select * from school_member where user_id=$1',[uid(1)])).rows;assert(members.some(m=>m.group_id===a&&m.member_kind==='teacher'));assert(members.some(m=>m.group_id===course&&m.member_kind==='student'));assert(!members.some(m=>m.group_id===b||m.group_id===c));
await db.exec(await readFile('supabase/migrations/202611190037_account_classes.sql','utf8'));
await login(null,'anon');await assert.rejects(()=>db.query('select * from account_class_options()'),{code:'42501'});
await db.close();console.log('PASS account classes: admin/support assignment, unauthorized denial, stale edits, class-only validation, multi-role teacher protection, course preservation, clearing and repeatable migration');
