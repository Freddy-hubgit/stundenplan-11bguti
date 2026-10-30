process.on('uncaughtException',e=>{console.error(e.message,e.code,e.where||'');process.exit(1);});
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
create table public.profiles(id uuid primary key,full_name text,role text check(role in ('user','teacher','support','admin')));
grant usage on schema auth to authenticated,anon;grant select on profiles to authenticated;
insert into profiles select ('00000000-0000-0000-0000-00000000000'||n)::uuid,'Person '||n,case n when 3 then 'teacher' when 4 then 'support' when 5 then 'admin' else 'user' end from generate_series(1,5)n;`);
for(const f of ['202610210001_support_tickets.sql','202610210002_substitution_plan.sql','202610240004_calendar_and_meetings.sql','202610240005_teacher_permissions.sql','202610240006_edit_profile_role.sql','202610240007_support_edit_roles.sql','202610280010_multiple_roles.sql','202610300013_teacher_absences.sql','202610300014_notification_push.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));

const uid=n=>`00000000-0000-0000-0000-00000000000${n}`;
async function login(n,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+role);}
await login(5);await db.query('select absence_set_identity($1,$2)',[uid(3),'Herr Hansen']);
await login(3);const legacy=(await db.query("select absence_report(current_date,current_date+1,'07:00','18:00','') id")).rows[0].id;
await login(1);assert.equal((await db.query('select * from substitution_list()')).rows.length,2);
await db.exec('reset role');await db.exec(await readFile(new URL('../supabase/migrations/202610300015_absence_approval.sql',import.meta.url),'utf8'));
await login(1);assert.equal((await db.query('select * from substitution_list()')).rows.length,0);assert.equal((await db.query('select * from portal_notifications()')).rows.length,0);
await login(5);await db.query("select absence_resolve($1,'cancelled','')",[legacy]);
await login(1);assert.equal((await db.query('select * from substitution_list()')).rows.length,2);assert.equal((await db.query('select * from portal_notifications()')).rows.length,2);
await login(3);const request=(await db.query("select absence_request(current_date+3,current_date+3,'07:00','18:00','replacement','Frau Wunsch') id")).rows[0].id;
await assert.rejects(()=>db.query("select absence_request(current_date+3,current_date+3,'07:00','18:00','cancelled','')"),{code:'23P01'});
await db.query("select absence_request_preference($1,'cancelled','Frau Ignoriert')",[request]);
let pending=(await db.query('select * from absence_list()')).rows.find(r=>r.id===request);assert.equal(pending.requested_kind,'cancelled');assert.equal(pending.requested_teacher,'');
await db.query("select absence_request_preference($1,'replacement','Frau Gewünscht')",[request]);
await assert.rejects(()=>db.query("select absence_request_preference($1,'replacement','Herr Hansen')",[request]),{code:'22023'});
await login(1);assert.equal((await db.query('select * from substitution_list()')).rows.length,2);assert.equal((await db.query('select * from portal_notifications()')).rows.filter(n=>n.absence_id===request).length,0);
await assert.rejects(()=>db.query("select absence_request_preference($1,'cancelled','')",[request]),{code:'42501'});
await assert.rejects(()=>db.query("select absence_resolve($1,'cancelled','')",[request]),{code:'42501'});
await login(5);assert.ok((await db.query('select * from portal_notifications()')).rows.some(n=>n.title==='Antrag geändert'));
// A staff entry added while the request is pending must never be overwritten by approval.
const conflict=(await db.query("select substitution_save(null,current_date+3,'Herr Hansen','07:00','18:00','cancelled','','','') id")).rows[0].id;
await assert.rejects(()=>db.query("select absence_resolve($1,'replacement','Frau Bestätigt')",[request]),{code:'23P01'});
assert.equal((await db.query('select * from absence_list()')).rows.find(r=>r.id===request).status,'reported');
await db.query('select substitution_delete($1)',[conflict]);
await db.query("select absence_resolve($1,'replacement','Frau Bestätigt')",[request]);
await login(1);let approved=(await db.query('select * from substitution_list()')).rows.filter(e=>e.absence_id===request);assert.equal(approved.length,1);assert.equal(approved[0].replacement_teacher,'Frau Bestätigt');
assert.equal((await db.query('select * from portal_notifications()')).rows.filter(n=>n.absence_id===request).length,1);
await login(3);await assert.rejects(()=>db.query("select absence_request_preference($1,'cancelled','')",[request]),{code:'22023'});
// Old clients cannot publish or queue student push before approval either.
const device={endpoint:'https://fcm.googleapis.com/fcm/send/approval',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}};
await login(1);await db.query('select portal_push_save($1)',[device]);
await login(3);const oldClient=(await db.query("select absence_report(current_date+5,current_date+5,'07:00','18:00','') id")).rows[0].id;
await login(1);assert.equal((await db.query('select * from substitution_list()')).rows.filter(e=>e.absence_id===oldClient).length,0);
await login(null,'service_role');assert.equal((await db.query('select * from portal_push_claim()')).rows.length,0);
await login(5);await db.query("select absence_resolve($1,'cancelled','')",[oldClient]);
await login(null,'service_role');const jobs=(await db.query('select * from portal_push_claim()')).rows;assert.equal(jobs.length,1);assert.ok(jobs[0].body.includes('fällt aus'));
console.log('PASS pending request privacy, legacy migration/client safety, preference switching, owner/admin permissions, atomic approval conflicts, published timetable and push only after approval');
await db.close();
