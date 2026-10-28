import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
create table public.profiles(id uuid primary key references auth.users,full_name text,email text,role text check(role in ('user','teacher','support','admin')));
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));alter table storage.objects enable row level security;
grant usage on schema storage,auth to authenticated,anon;grant all on storage.objects to authenticated,anon;grant select,update on profiles to authenticated;
create policy legacy_objects on storage.objects for all to public using(true) with check(true);
insert into auth.users select ('00000000-0000-0000-0000-00000000000'||n)::uuid from generate_series(1,5)n;
insert into profiles select id,'Person '||right(id::text,1),right(id::text,1)||'@example.test',case right(id::text,1) when '3' then 'teacher' when '4' then 'support' when '5' then 'admin' else 'user' end from auth.users;`);
for(const file of ['202610210001_support_tickets.sql','202610240004_calendar_and_meetings.sql','202610240005_teacher_permissions.sql','202610240006_edit_profile_role.sql','202610240007_support_edit_roles.sql','202610280010_multiple_roles.sql','202610280011_homework.sql','202610280012_homework_push.sql']){
 let source=await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');
 // Deterministic Berlin reminder window; production retains the real server clock.
 if(file.includes('012'))source=source.replace("current_timestamp at time zone 'Europe/Berlin'", "timestamptz '2026-10-28T18:05:00Z' at time zone 'Europe/Berlin'");
 await db.exec(source);
}
const uid=n=>`00000000-0000-0000-0000-00000000000${n}`;
async function login(n,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+(n?role:role==='service_role'?role:'anon'));}
await login(1);await assert.rejects(()=>db.query("update profiles set roles=array['admin'] where id=$1",[uid(1)]));
await assert.rejects(()=>db.query("update profiles set role='admin' where id=$1",[uid(1)]));
await login(5);await assert.rejects(()=>db.query('select set_profile_roles($1,$2)',[uid(5),['teacher']]),{code:'P0001'});
await assert.rejects(()=>db.query('select set_profile_roles($1,$2)',[uid(3),[]]),{code:'22023'});
await db.query('select set_profile_roles($1,$2)',[uid(3),['teacher','support']]);
assert.deepEqual((await db.query('select roles from profiles where id=$1',[uid(3)])).rows[0].roles,['support','teacher']);
await login(3);const save=(shared=true,required=true)=>db.query("select hw_save(null,'Übung','Mathe','Aufgabe lösen','2026-10-28','2026-10-29',$1,$2) id",[shared,required]);
const task=(await save()).rows[0].id;
await login(4);await assert.rejects(()=>save());
await login(1);const personal=(await save(false,false)).rows[0].id;
await assert.rejects(()=>save());await db.query('select hw_set_done($1,true)',[task]);
await login(2);let rows=(await db.query('select * from hw_tasks()')).rows;assert.equal(rows.length,1);assert.equal(rows[0].done,false);
await assert.rejects(()=>db.query("select hw_save($1,'Hack','Mathe','','2026-10-28','2026-10-29',true,false)",[task]));
await assert.rejects(()=>db.query('select hw_archive($1)',[task]));
await login(1);const path=uid(1)+'/'+task+'/answer.pdf';await db.query("insert into storage.objects(bucket_id,name) values('homework-submissions',$1)",[path]);
await db.query("select hw_submit($1,'Antwort','https://example.test',$2,'answer.pdf')",[task,path]);
await assert.rejects(()=>db.query("select hw_submit($1,'','javascript:alert(1)','','')",[task]));
await login(2);assert.equal((await db.query('select * from hw_submissions($1)',[task])).rows.length,0);
assert.equal((await db.query('select * from storage.objects where name=$1',[path])).rows.length,0);
await assert.rejects(()=>db.query("select hw_submit($1,'Fremde Datei','',$2,'x.pdf')",[task,path]));
await login(5);assert.equal((await db.query('select * from hw_submissions($1)',[task])).rows.length,0);
await login(3);assert.equal((await db.query('select * from hw_submissions($1)',[task])).rows.length,1);assert.equal((await db.query('select * from storage.objects where name=$1',[path])).rows.length,1);
// Reminder preferences and push credentials are private; arbitrary endpoints are rejected.
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}};
await login(1);await db.query('select hw_push_save($1,$2)',[subscription,'19:00']);
await assert.rejects(()=>db.query('select hw_push_save($1,$2)',[{...subscription,endpoint:'https://127.0.0.1/internal'},'19:00']));
await assert.rejects(()=>db.query('select * from hw_push_subscription'));await assert.rejects(()=>db.query('select * from hw_push_claim()'));
await login(null,'service_role');const first=(await db.query('select * from hw_push_claim()')).rows;assert.equal(first.length,1);assert.equal(Number(first[0].task_count),1); // Only personal is still outstanding; shared is done and submitted.
assert.equal((await db.query('select * from hw_push_claim()')).rows.length,0);
await db.query('select hw_push_finish($1,$2,$3,true)',[first[0].user_id,first[0].reminder_date,first[0].lease_token]);assert.equal((await db.query('select * from hw_push_claim()')).rows.length,0);
await login(1);await db.query('select hw_set_done($1,true)',[personal]);
await login(null,'service_role');assert.equal((await db.query('select * from hw_push_claim()')).rows.length,0);
// Done but missing a mandatory submission still qualifies for an evening reminder.
await login(2);await db.query('select hw_set_done($1,true)',[task]);
await db.query('select hw_push_save($1,$2)',[{...subscription,endpoint:'https://fcm.googleapis.com/fcm/send/second'},'19:00']);
await login(null,'service_role');const missing=(await db.query('select * from hw_push_claim()')).rows;assert.equal(missing.length,1);assert.equal(missing[0].user_id,uid(2));assert.equal(Number(missing[0].task_count),1);
await login(2);await db.query("select hw_submit($1,'Fertig','','','')",[task]);
await db.exec('reset role');await db.exec('delete from hw_push_delivery');
await login(null,'service_role');assert.equal((await db.query('select * from hw_push_claim()')).rows.length,0);
await login(5);await db.query('select set_profile_roles($1,$2)',[uid(1),['user','teacher']]);
await login(1);await db.query("select support_create_ticket('Combined role','User rights remain')");
await assert.rejects(()=>db.query('select set_profile_roles($1,$2)',[uid(1),['admin']]));
await login(1);await save(false,false);
await db.query("select hw_save(null,'Übermorgen','Deutsch','','2026-10-28','2026-10-30',false,false)");
let claimSource=await readFile(new URL('../supabase/migrations/202610280012_homework_push.sql',import.meta.url),'utf8');
claimSource=claimSource.slice(claimSource.indexOf('create function public.hw_push_claim()'),claimSource.indexOf('create function public.hw_push_finish'));
await db.exec('reset role');await db.exec(claimSource.replace('create function','create or replace function').replace("current_timestamp at time zone 'Europe/Berlin'","timestamptz '2026-10-28T13:05:00Z' at time zone 'Europe/Berlin'"));
await login(null,'service_role');assert.equal((await db.query('select * from hw_push_claim()')).rows.length,0);
await db.exec('reset role');await db.exec(claimSource.replace('create function','create or replace function').replace("current_timestamp at time zone 'Europe/Berlin'","timestamptz '2026-10-28T18:05:00Z' at time zone 'Europe/Berlin'"));
await login(null,'service_role');const dueTomorrow=(await db.query('select * from hw_push_claim()')).rows;assert.equal(dueTomorrow.length,1);assert.equal(Number(dueTomorrow[0].task_count),1);
await login(null);await assert.rejects(()=>db.query('select * from hw_tasks()'));
console.log('PASS multi-role union/direct escalation protection, private/shared tasks, per-student completion, teacher-only publishing, submission/file privacy, push endpoint validation, service-only claims, idempotent reminders and completed-task exclusion');
await db.close();
