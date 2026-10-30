const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('../node_modules/typescript');
const js=ts.transpileModule(fs.readFileSync('src/app/supabase.service.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
const ctx={exports:{},require:name=>name==='@angular/core'?{Injectable:()=>c=>c}:{createClient:()=>({})}};vm.runInNewContext(js,ctx);const api=new ctx.exports.SupabaseService();
const error=(status,body)=>({message:'Edge Function returned a non-2xx status code',context:new Response(JSON.stringify(body),{status})});
(async()=>{
 let result=await api.unwrapFunctionResult(null,error(500,{error:'Profilanlage fehlgeschlagen. Bitte zuerst die Lehrer-Migration ausführen.'}),'create-teacher');assert.match(result.error,/Profilanlage/);
 result=await api.unwrapFunctionResult(null,error(400,{error:'Diese E-Mail wird bereits verwendet.'}),'create-teacher');assert.equal(result.error,'Diese E-Mail wird bereits verwendet.');
 result=await api.unwrapFunctionResult(null,error(401,{message:'Invalid JWT'}),'create-teacher');assert.match(result.error,/Verify JWT/);
 result=await api.unwrapFunctionResult(null,error(403,{error:'Keine Berechtigung.'}),'create-teacher');assert.equal(result.error,'Keine Berechtigung.');
 result=await api.unwrapFunctionResult(null,error(404,{message:'Requested function was not found'}),'create-teacher');assert.match(result.error,/create-teacher.*nicht gefunden/);
 result=await api.unwrapFunctionResult(null,{context:new Response('Bad gateway',{status:502})},'manage-user');assert.match(result.error,/HTTP 502/);
 result=await api.unwrapFunctionResult(null,{context:{error:'Legacy error'}},'manage-user');assert.equal(result.error,'Legacy error');
 result=await api.unwrapFunctionResult({ok:true},null,'create-teacher');assert.equal(result.ok,true);
 console.log('PASS account function Response parsing: profile validation, HTTP errors, JWT gateway, missing function, legacy errors and success');
})().catch(e=>{console.error(e);process.exitCode=1;});
