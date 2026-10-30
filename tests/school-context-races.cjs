const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('../node_modules/typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
const data={exports:{}};vm.runInNewContext(compile('src/app/timetable-data.ts'),data);
const angular={Component:()=>c=>c,ViewChild:()=>()=>{},HostListener:()=>()=>{},ViewEncapsulation:{None:2}};
const ctx={exports:{},require:n=>n==='@angular/core'?angular:n.includes('timetable-data')?data.exports:n.includes('supabase.service')?{hasRole:(p,...roles)=>p.roles.some(r=>roles.includes(r))}:n.includes('substitution.service')?{dateKey:()=> '2026-10-30'}:{}};
vm.runInNewContext(compile('src/app/stundenplan/stundenplan-page.component.ts'),ctx);
(async()=>{
 const requests=[],writes=[];let finishSave;
 const school={classId:'A',groups:[{id:'A',can_teach:true},{id:'B',can_teach:true}],profile:{roles:['admin']},choose(id){this.classId=id;},timetable(){const id=this.classId;return new Promise(resolve=>requests.push({id,resolve}));},loadExams:async()=>{},saveLessons:(id,lessons)=>{writes.push({id,lessons});return new Promise(resolve=>finishSave=resolve);}};
 const component=new ctx.exports.StundenplanPageComponent({},null,null,school,null);
 const lesson=(group)=>({subject:group,teacher:'Teacher',room:'R',day:'Mon',start:'07:30',end:'09:00',group_id:group});
 const a=component.changeSchoolClass();school.classId='B';const b=component.changeSchoolClass();requests[1].resolve([lesson('B')]);await b;requests[0].resolve([lesson('A')]);await a;assert.equal(component.lessons[0].group_id,'B');
 school.classId='A';const reload=component.changeSchoolClass();requests[2].resolve([lesson('A'),lesson('course')]);await reload;
 const saving=component.saveClassSchedule();assert.equal(writes[0].id,'A');assert.equal(writes[0].lessons.length,1);assert.equal(writes[0].lessons[0].group_id,undefined);
 school.classId='B';const changed=component.changeSchoolClass();requests[3].resolve([lesson('B')]);await changed;finishSave();await saving;assert.equal(component.lessons[0].group_id,'B');assert.equal(requests.length,4);
 console.log('PASS class switches ignore late responses; saving preserves selected group and cannot overwrite merged courses or a newly selected plan');
})().catch(e=>{console.error(e);process.exitCode=1;});
