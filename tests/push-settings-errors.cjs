const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('../node_modules/typescript');
const js=ts.transpileModule(fs.readFileSync('src/app/push-notifications.service.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
const ctx={exports:{},require:()=>({Injectable:()=>c=>c}),window:{Notification:{},PushManager:{}},navigator:{serviceWorker:{getRegistration:async()=>undefined}},document:{baseURI:'https://example.test/'},URL};
vm.runInNewContext(js,ctx);
(async()=>{
 let failure;const service=new ctx.exports.PushNotificationsService({supportRpc:async()=>{if(failure)throw failure;return false;}});service.user='support-id';
 for(const [code,text] of [['PGRST202','Migration 014'],['42P01','Migration 014'],['42501','Keine Berechtigung'],['PGRST301','Sitzung ist abgelaufen'],['','Verbindung prüfen']]){
  failure={code};await service.refreshAlerts();assert.ok(service.error.includes(text),service.error);
 }
 failure=null;await service.refreshAlerts();assert.equal(service.error,'');assert.equal(service.alertsEnabled,false);
 console.log('PASS push settings distinguish missing RPC, permissions, session and connection errors; successful refresh clears stale error');
})().catch(e=>{console.error(e);process.exitCode=1;});
