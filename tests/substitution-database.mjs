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
await db.exec(await readFile(new URL('../supabase/migrations/202610210003_substitution_date_range.sql', import.meta.url), 'utf8'));
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
const range = (from, to, teacher='Range Teacher') => db.query(
 'select substitution_save_range($1,$2,$3,$4,$5,$6,$7,$8,$9) ids',
 [from,to,teacher,'07:00','18:00','replacement','Frau Beispiel','','']);
await login(1); await assert.rejects(() => range('2026-10-21','2026-10-23'));
await login(2);
const result = await range('2026-10-21','2026-10-23');
assert.equal(result.rows[0].ids.length,3);
let all = (await db.query('select * from substitution_list()')).rows;
assert.deepEqual(all.filter(e=>e.teacher==='Range Teacher').map(e=>e.date.toISOString().slice(0,10)).sort(), ['2026-10-21','2026-10-22','2026-10-23']);
// A conflict on the final day must roll back earlier days of the same request.
await assert.rejects(() => range('2026-10-19','2026-10-21'), {code:'23P01'});
all = (await db.query('select * from substitution_list()')).rows;
assert.equal(all.filter(e=>e.teacher==='Range Teacher').length,3);
await assert.rejects(() => range('2026-10-23','2026-10-21'),{code:'22023'});
await assert.rejects(() => range('2026-01-01','2027-01-02'),{code:'22023'});
await login(3); assert.equal((await range('2026-12-31','2027-01-01','Year Boundary')).rows[0].ids.length,2);
await login(null); await assert.rejects(() => db.query('select * from substitution_list()'));
await assert.rejects(() => save());
await assert.rejects(() => range('2026-10-21','2026-10-23'));
console.log('PASS: migration, staff/admin create/edit/delete, read-only users, anonymous denial, invalid input, overlap protection, adjacent intervals');
await db.close();
