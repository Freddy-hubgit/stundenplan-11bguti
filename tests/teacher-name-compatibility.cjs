const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('../node_modules/typescript');
const load=(file,imports={})=>{const ctx={exports:{},require:name=>imports[name]||{Injectable:()=>c=>c}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,ctx);return ctx.exports;};
const data=load('src/app/timetable-data.ts'),api=load('src/app/substitution.service.ts',{'./timetable-data':data});
for(const [subject,day,oldTeacher] of [['Deutsch','Wed','Her Bendig'],['Sport','Thu','Faru Roos, Herr Sommer'],['Technische Wissenschaft','Mon','Frau Von Willich']]){
 const lesson=data.DEFAULT_LESSONS.find(l=>l.subject===subject&&l.day===day);
 const entry={date:'2026-11-02',teacher:oldTeacher,start_time:lesson.start,end_time:lesson.end,kind:'cancelled'};
 assert.equal(api.applySubstitution(lesson,entry.date,[entry]).cancelled,true);
 assert.equal(api.splitSubstitutions(lesson,entry.date,[entry])[0].cancelled,true);
 const replacement={...entry,kind:'replacement',replacement_teacher:'Frau Beispiel'};
 assert.equal(api.splitSubstitutions(lesson,entry.date,[replacement])[0].teacher,'Frau Beispiel');
 assert.equal(api.applySubstitution(lesson,entry.date,[{...entry,teacher:'Andere Person'}]).cancelled,false);
}
console.log('PASS corrected teacher names still match existing absences and replacements with former spellings');
