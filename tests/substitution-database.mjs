import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
create table public.profiles(id uuid primary key, role text);
insert into profiles values ('00000000-0000-0000-0000-000000000001','user'),
('00000000-0000-0000-0000-000000000002','support'),('00000000-0000-0000-0000-000000000003','admin');`);
await db.exec(await readFile(new URL('../supabase/migrations/202610210002_substitution_plan.sql', import.meta.url), 'utf8'));
async function login(n) {
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n ? `00000000-0000-0000-0000-00000000000${n}` : '']);
 await db.exec(`set role ${n ? 'authenticated' : 'anon'}`);
}
const save = (id=null, teacher='Herr Hansen', start='07:30', end='09:00', kind='replacement', replacement='Frau Beispiel') =>
 db.query('select substitution_save($1,$2,$3,$4,$5,$6,$7,$8,$9) id',[id,'2026-10-21',teacher,start,end,kind,replacement,'B200','Hinweis']);
await login(1); await assert.rejects(() => save());
await assert.rejects(() => db.query('select * from substitution_entry'));
await login(2);
const {rows:[{id}]}=await save();
await assert.rejects(() => save(null,' herr hansen ','08:00','10:00'), {code:'23P01'});
await assert.rejects(() => save(null,'Other','10:00','09:00'));
await assert.rejects(() => save(null,'Other','10:00','11:00','replacement',''));
await save(id,'Herr Hansen','07:30','09:00','cancelled','');
await login(1);
const {rows}=await db.query('select * from substitution_list()');
assert.equal(rows.length,1); assert.equal(rows[0].kind,'cancelled'); assert.equal(rows[0].replacement_teacher,'');
await assert.rejects(() => db.query('select substitution_delete($1)',[id]));
await login(3); await save(id);
await save(null,'Herr Hansen','09:00','10:00'); // Touching intervals are allowed.
await db.query('select substitution_delete($1)',[id]);
assert.equal((await db.query('select * from substitution_list()')).rows.length,1);
await login(null); await assert.rejects(() => db.query('select * from substitution_list()'));
await assert.rejects(() => save());
console.log('PASS: migration, staff/admin create/edit/delete, read-only users, anonymous denial, invalid input, overlap protection, adjacent intervals');
await db.close();
