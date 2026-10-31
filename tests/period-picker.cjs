const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('../node_modules/typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
const periods={exports:{}};vm.runInNewContext(compile('src/app/school-periods.ts'),periods);
class Emitter{handlers=[];emit(v){this.handlers.forEach(fn=>fn(v));}subscribe(fn){this.handlers.push(fn);}}
const context={exports:{},require:n=>n==='@angular/core'?{Component:()=>c=>c,Input:()=>()=>{},Output:()=>()=>{},EventEmitter:Emitter}:periods.exports};vm.runInNewContext(compile('src/app/period-picker/period-picker.component.ts'),context);
const picker=new context.exports.PeriodPickerComponent();picker.startChange.subscribe(v=>picker.start=v);picker.endChange.subscribe(v=>picker.end=v);
assert.equal(picker.summary,'1. Stunde');assert.equal(picker.custom,false);picker.lastChanged('1');assert.equal(picker.end,'09:00');assert.equal(picker.summary,'1.–2. Stunde');
picker.firstChanged('2');assert.equal(picker.start,'09:15');assert.equal(picker.end,'10:00');picker.lastChanged('0');assert.equal(picker.start,'07:30');assert.equal(picker.end,'08:15');
picker.start='07:00';picker.end='18:00';assert.equal(picker.custom,true);assert.equal(picker.start,'07:00');assert.equal(picker.end,'18:00');picker.mode('lessons');assert.equal(picker.custom,false);assert.equal(picker.start,'07:30');assert.equal(picker.end,'08:15');
picker.mode('custom');assert.equal(picker.custom,true);picker.mode('lessons');picker.lastChanged('9');assert.equal(picker.end,'16:15');assert.equal(picker.summary,'1.–10. Stunde');picker.firstChanged('99');assert.equal(picker.start,'07:30');
assert.equal(periods.exports.periodRangeLabel('07:30:00','09:00:00'),'1.–2. Stunde');assert.equal(periods.exports.periodRangeLabel('07:00','18:00'),'');assert.equal(periods.exports.SCHOOL_PERIODS.length,10);
console.log('PASS lesson periods: single/double/full day, backwards range, break boundaries, legacy/custom preservation, mode changes and invalid indexes');
