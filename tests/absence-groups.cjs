const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('../node_modules/typescript');
let clock='2026-10-30T22:59:00Z';class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}}
const imports={'@angular/core':{Component:()=>c=>c},'../supabase.service':{hasRole:()=>false},'../timetable-data':{DEFAULT_LESSONS:[]},'../substitution.service':{dateKey:()=> '2026-10-30'}};
const ctx={exports:{},require:n=>imports[n]||{},Date:ClockDate,Intl};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/absence/absence.component.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,ctx);
const component=new ctx.exports.AbsenceComponent(null,null,null,null);
component.reports=[
 {id:'future-open',start_date:'2026-11-02',end_date:'2026-11-03',status:'reported'},
 {id:'future-confirmed',start_date:'2026-11-02',end_date:'2026-11-03',status:'resolved'},
 {id:'ongoing-open',start_date:'2026-10-29',end_date:'2026-10-31',status:'reported'},
 {id:'last-day',start_date:'2026-10-29',end_date:'2026-10-30',status:'reported'},
 {id:'past-open',start_date:'2026-10-28',end_date:'2026-10-29',status:'reported'},
 {id:'past-confirmed',start_date:'2026-10-28',end_date:'2026-10-29',status:'resolved'}
];
const group=k=>Array.from(component.reportGroups.find(g=>g.key===k).reports,r=>r.id);
assert.deepEqual(group('new'),['future-open']);assert.deepEqual(group('current'),['future-confirmed','ongoing-open','last-day']);assert.deepEqual(group('past'),['past-open','past-confirmed']);
component.reports[0].status='resolved';assert.equal(group('new').length,0);assert.ok(group('current').includes('future-open'));
clock='2026-10-30T23:00:00Z';assert.ok(group('past').includes('last-day'));assert.ok(group('current').includes('ongoing-open'));
assert.equal(new Set(component.reportGroups.flatMap(g=>g.reports.map(r=>r.id))).size,component.reports.length);
console.log('PASS absence groups: pending/future, confirmed/future, ongoing, inclusive final day, expired regardless of approval and Berlin midnight');
