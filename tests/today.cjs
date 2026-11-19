const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('../node_modules/typescript');
const source=ts.transpileModule(fs.readFileSync('src/app/today.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
let instant='2026-11-19T12:00:00Z';class Clock extends Date{constructor(...args){if(args.length)super(...args);else super(instant);}}
const ctx={exports:{},Intl,Date:Clock,Number};vm.runInNewContext(source,ctx);
assert.equal(ctx.exports.todayKey(),'2026-11-19');instant='2026-11-19T23:30:00Z';assert.equal(ctx.exports.todayKey(),'2026-11-20');instant='2026-03-29T22:30:00Z';assert.equal(ctx.exports.todayKey(),'2026-03-30');assert.equal(ctx.exports.schoolDateKey(new Date('invalid')),'');
console.log('PASS current school day: Berlin date, UTC midnight boundary, DST and invalid inputs');
