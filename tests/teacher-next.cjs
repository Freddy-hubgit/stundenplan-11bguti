const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('../node_modules/typescript');
function load(path,deps={}){const context={exports:{},require:n=>deps[n]||{Injectable:()=>()=>{}}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,context);return context.exports;}
const data=load('src/app/timetable-data.ts');const subs=load('src/app/substitution.service.ts',{'./timetable-data':data});const {nextTeachingLesson:next}=load('src/app/teacher-next.ts',{'./timetable-data':data,'./substitution.service':subs});
const now=new Date('2026-10-30T19:00:00'),lessons=data.DEFAULT_LESSONS;
let result=next(lessons,'Herr Bendig',[],now);assert.equal(result.lesson.subject,'Deutsch');assert.equal(result.date.getDay(),1);assert.equal(result.lesson.start,'13:00');
assert.equal(next(lessons,'',[],now),null);assert.equal(next(lessons,'Unbekannt',[],now),null);
const cancellation={date:'2026-11-02',teacher:'Herr Bendig',start_time:'07:00',end_time:'18:00',kind:'cancelled',replacement_teacher:'',room:''};
assert.equal(next(lessons,'Herr Bendig',[cancellation],now).date.getDay(),3);
const replacement={...cancellation,teacher:'Herr Hansen',kind:'replacement',replacement_teacher:'Herr Bendig'};
assert.equal(next(lessons,'Herr Bendig',[replacement],now).lesson.start,'07:30');
assert.equal(next([{...lessons[0],teacher:'Her Bendig'}],'Herr Bendig',[],now).lesson.start,'07:30');
console.log('PASS Herr Bendig: own Monday lesson, missing mapping, cancelled Monday, replacement and legacy typo');
