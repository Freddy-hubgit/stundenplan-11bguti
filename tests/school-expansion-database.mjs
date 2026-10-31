process.on('uncaughtException',e=>{console.error(e.message,e.code,e.where||'',e.query||'',e.position||'');process.exit(1);});
import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text,email text,role text check(role in ('user','teacher','support','admin')));
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));alter table storage.objects enable row level security;
grant usage on schema storage,auth to authenticated,anon;grant all on storage.objects to authenticated,anon;grant select,update on profiles to authenticated;create policy legacy_objects on storage.objects for all to public using(true) with check(true);
insert into auth.users select ('00000000-0000-0000-0000-00000000000'||n)::uuid from generate_series(1,6)n;
insert into profiles select id,'Person '||right(id::text,1),right(id::text,1)||'@example.test',case right(id::text,1) when '3' then 'teacher' when '4' then 'support' when '5' then 'admin' else 'user' end from auth.users;`);
for(const f of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&(!process.env.USE_EXPANSION_PACKAGE||f<'202610310024')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
if(process.env.USE_EXPANSION_PACKAGE){await db.exec(await readFile(new URL('../supabase/setup/school-expansion.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../supabase/migrations/202610310029_portal_tiles.sql',import.meta.url),'utf8'));}
const uid=n=>`00000000-0000-0000-0000-00000000000${n}`;
async function login(n,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec('set role '+role);}
// Group privacy, lazy creation, membership management, removal and unread state.
await login(1);await assert.rejects(()=>db.query("select chat_group_start('Empty',$1,'')",[[uid(2)]]));
const chat=(await db.query("select chat_group_start('Projekt',$1,'Hallo') id",[[uid(2),uid(3)]])).rows[0].id;
await login(5);assert.equal((await db.query('select * from chat_groups()')).rows.length,0);await assert.rejects(()=>db.query('select * from chat_group_messages($1)',[chat]),{code:'42501'});
await login(2);assert.equal(Number((await db.query('select dm_unread() n')).rows[0].n),1);await db.query('select * from chat_group_messages($1)',[chat]);assert.equal(Number((await db.query('select dm_unread() n')).rows[0].n),0);
await assert.rejects(()=>db.query("select chat_group_manage($1,'Hack',$2,true)",[chat,uid(1)]),{code:'42501'});
await login(1);await db.query("select chat_group_manage($1,'Projekt',$2,true)",[chat,uid(2)]);await login(2);await assert.rejects(()=>db.query('select chat_group_send($1,\'Hallo\')',[chat]),{code:'42501'});await assert.rejects(()=>db.query('select * from chat_group_roster($1)',[chat]),{code:'42501'});
await login(1);await db.query("select chat_group_manage($1,'Projekt',$2,false)",[chat,uid(2)]);await login(2);assert.equal((await db.query('select * from chat_group_messages($1)',[chat])).rows.length,1);
await db.query('select chat_group_leave($1,false)',[chat]);await login(1);await assert.rejects(()=>db.query('select chat_group_leave($1,false)',[chat]));
// Build two isolated teaching groups.
await login(5);const group=(await db.query("select school_group_save(null,'11A','class',null) id")).rows[0].id;const other=(await db.query("select school_group_save(null,'11B','class',null) id")).rows[0].id;
await db.query("select school_enrol($1,$2,'teacher',false)",[group,uid(3)]);await db.query("select school_enrol($1,$2,'student',false)",[group,uid(1)]);await db.query("select school_enrol($1,$2,'student',false)",[group,uid(2)]);
const lesson={subject:'Deutsch',teacher:'Herr Bendig',room:'B211',day:'Mon',start:'07:30',end:'09:00'};await db.query('select school_schedule_save($1,$2)',[group,[lesson]]);await db.query("select absence_set_identity($1,'Herr Bendig')",[uid(3)]);
const day=(await db.query("select (current_date+(8-extract(isodow from current_date)::int))::text as chosen_day")).rows[0].chosen_day;const plus=n=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
await login(3);const absence=(await db.query("select absence_request($1,$2,'07:00','10:00','cancelled','') id",[day,plus(2)])).rows[0].id;
await db.query("select absence_edit_period($1,$2,$3,'07:00','10:00',$4)",[absence,day,plus(2),[plus(1)]]);
await login(5);await assert.rejects(()=>db.query("select absence_edit_period($1,$2,$3,'07:00','10:00','{}')",[absence,day,plus(1)]),{code:'42501'});await db.query("select absence_resolve($1,'cancelled','')",[absence]);
await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from substitution_entry where absence_id=$1',[absence])).rows[0].n,2);
await login(3);await assert.rejects(()=>db.query("select absence_edit_period($1,$2,$3,'07:00','10:00','{}')",[absence,day,plus(1)]),{code:'42501'});
await login(4);await db.query("select absence_edit_period($1,$2,$3,'08:00','10:00',$4)",[absence,day,plus(3),[plus(1)]]);await assert.rejects(()=>db.query("select absence_edit_period($1,$2,$2,'08:00','10:00',$3)",[absence,day,[day]]));
await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from substitution_entry where absence_id=$1',[absence])).rows[0].n,3);
await login(4);await db.query('select absence_withdraw($1)',[absence]);
// Submission roster includes missing submissions, scoped reviewers and private feedback.
await login(3);const task=(await db.query("select hw_save_group(null,'Textanalyse','Deutsch','Lesen',$1,$2,true,true,$3) id",[day,plus(1),group])).rows[0].id;
assert.equal(Number((await db.query('select * from hw_review_overview()')).rows[0].expected),2);assert.equal((await db.query('select * from hw_review_students($1)',[task])).rows.filter(r=>!r.submitted_at).length,2);
await login(1);await db.query("select hw_submit($1,'Antwort','','','')",[task]);await assert.rejects(()=>db.query('select * from hw_review_students($1)',[task]),{code:'42501'});
await login(4);await assert.rejects(()=>db.query("select hw_review_save($1,$2,'Gut')",[task,uid(1)]),{code:'42501'});
await login(3);await db.query("select hw_review_save($1,$2,'Gut gelesen')",[task,uid(1)]);await login(1);assert.equal((await db.query('select * from hw_my_feedback($1)',[task])).rows[0].body,'Gut gelesen');
await login(2);assert.equal((await db.query('select * from hw_my_feedback($1)',[task])).rows.length,0);
await login(1);await db.query("select hw_submit($1,'Neue Antwort','','','')",[task]);assert.equal((await db.query('select * from hw_my_feedback($1)',[task])).rows.length,0);
await login(5);await db.query('select set_profile_roles($1,$2)',[uid(6),['teacher']]);await login(6);await assert.rejects(()=>db.query('select * from hw_review_students($1)',[task]),{code:'42501'});
await login(5);await db.query("select school_enrol($1,$2,'teacher',false)",[group,uid(6)]);await login(6);assert.equal((await db.query('select * from hw_review_students($1)',[task])).rows.length,2);
await db.exec('reset role');await db.query('update homework_submission set file_path=$1 where task_id=$2 and student_id=$3',[uid(1)+'/'+task+'/file.pdf',task,uid(1)]);await login(6);assert.equal((await db.query('select hw_file_read($1) allowed',[uid(1)+'/'+task+'/file.pdf'])).rows[0].allowed,true);await login(4);assert.equal((await db.query('select hw_file_read($1) allowed',[uid(1)+'/'+task+'/file.pdf'])).rows[0].allowed,false);await login(5);await db.query('select set_profile_roles($1,$2)',[uid(6),['user']]);await login(6);assert.equal((await db.query('select hw_file_read($1) allowed',[uid(1)+'/'+task+'/file.pdf'])).rows[0].allowed,false);
// Room permissions, recurring teaching conflicts, adjacent bookings and privacy.
await login(1);await assert.rejects(()=>db.query("select school_room_save(null,'B211','',true)"),{code:'42501'});
await login(5);const room=(await db.query("select school_room_save(null,'B211','Klassenraum',true) id")).rows[0].id;const disabled=(await db.query("select school_room_save(null,'B212','',false) id")).rows[0].id;
const instant=(day,time)=>day+'T'+time+':00+01:00';await login(1);
assert.equal((await db.query('select * from school_rooms()')).rows.length,1);
assert((await db.query('select * from school_room_slots($1)',[day])).rows.some(r=>r.teaching));
await assert.rejects(()=>db.query("select school_room_book($1,'Test',$2,$3)",[disabled,instant(day,'10:00'),instant(day,'11:00')]),{code:'42501'});
await assert.rejects(()=>db.query("select school_room_book($1,'Test',$2,$3)",[room,instant(day,'08:00'),instant(day,'09:00')]),{code:'23P01'});
const booking=(await db.query("select school_room_book($1,'Private Sitzung',$2,$3) id",[room,instant(day,'10:00'),instant(day,'11:00')])).rows[0].id;
await assert.rejects(()=>db.query("select school_room_book($1,'Überschneidung',$2,$3)",[room,instant(day,'10:30'),instant(day,'11:30')]),{code:'23P01'});
await db.query("select school_room_book($1,'Danach',$2,$3)",[room,instant(day,'11:00'),instant(day,'12:00')]);
await login(2);const slots=(await db.query('select * from school_room_slots($1)',[day])).rows;assert.equal(slots.find(r=>r.id===booking).label,'Reserviert');await assert.rejects(()=>db.query('select school_room_cancel($1)',[booking]),{code:'42501'});
await login(5);await assert.rejects(()=>db.query('select school_schedule_save($1,$2)',[group,[{...lesson,start:'10:00',end:'11:00'}]]),{code:'23P01'});await login(1);await db.query('select school_room_cancel($1)',[booking]);
// Cancelled teaching frees its room, including only the cancelled segment.
await login(3);const absence2=(await db.query("select absence_request($1,$1,'07:30','08:15','cancelled','') id",[day])).rows[0].id;await login(5);await db.query("select absence_resolve($1,'cancelled','')",[absence2]);
await login(1);await db.query("select school_room_book($1,'Freier Teil',$2,$3)",[room,instant(day,'07:30'),instant(day,'08:15')]);await assert.rejects(()=>db.query("select school_room_book($1,'Belegt',$2,$3)",[room,instant(day,'08:15'),instant(day,'09:00')]),{code:'23P01'});
// Audit access and conditional timetable undo; never restores roles or other content.
await login(1);await assert.rejects(()=>db.query('select * from portal_changes(null,\'\')'),{code:'42501'});
await login(5);await db.query('select school_schedule_save($1,$2)',[group,[{...lesson,room:'B213'}]]);let changes=(await db.query("select * from portal_changes(null,'school_schedule')")).rows;const change=changes[0];assert.equal(change.action,'UPDATE');await db.query('select portal_change_undo($1)',[change.id]);await assert.rejects(()=>db.query('select portal_change_undo($1)',[change.id]));
assert.equal((await db.query('select school_lessons($1) lessons',[group])).rows[0].lessons[0].room,'B211');
await db.query('select school_schedule_save($1,$2)',[group,[{...lesson,room:'B214'}]]);const stale=(await db.query("select * from portal_changes(null,'school_schedule')")).rows[0];await db.query('select school_schedule_save($1,$2)',[group,[{...lesson,room:'B215'}]]);await assert.rejects(()=>db.query('select portal_change_undo($1)',[stale.id]),{code:'40001'});
// Reading group chat does not invalidate a reset preview; new messages do.
const preview=(await db.query('select school_reset_plan(false,true,false) p')).rows[0].p;assert.equal(Number(preview.counts.Gruppenchats),1);assert.equal(Number(preview.counts.Raumbuchungen),2);
await login(1);await db.query('select * from chat_group_messages($1)',[chat]);await login(5);await db.query('select school_reset_execute($1,$2)',[preview.token,preview.confirmation]);
await login(1);assert.equal((await db.query('select * from chat_groups()')).rows.length,0);await login(5);assert.equal((await db.query('select * from school_rooms()')).rows.length,2);assert.equal((await db.query('select * from school_room_slots($1)',[day])).rows.length,0);assert((await db.query("select * from portal_changes(null,'')")).rows.length>0);
await login(1);assert.equal((await db.query('select portal_disabled_tiles() disabled')).rows[0].disabled.length,0);await assert.rejects(()=>db.query("select portal_tile_save('/materialien',false)"),{code:'42501'});
await login(4);await assert.rejects(()=>db.query("select portal_tile_save('/materialien',false)"),{code:'42501'});
await login(5);await db.query("select portal_tile_save('/materialien',false)");await assert.rejects(()=>db.query("select portal_tile_save('/admin',false)"));await assert.rejects(()=>db.query("select portal_tile_save('/invalid',true)"));
await login(1);assert.equal((await db.query('select portal_disabled_tiles() disabled')).rows[0].disabled.join(','),'/materialien');
await login(5);assert.equal((await db.query("select * from portal_changes(null,'portal_tile_setting')")).rows[0].after_value.enabled,false);await db.query("select portal_tile_save('/materialien',true)");await login(1);assert.equal((await db.query('select portal_disabled_tiles() disabled')).rows[0].disabled.length,0);
console.log('PASS expansion: group membership/privacy, excluded absence days, scoped feedback/missing submissions, room teaching/booking conflicts, audit access/undo/staleness, reset integration');
