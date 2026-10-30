const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('../node_modules/typescript');
const source=fs.readFileSync('supabase/functions/portal-notifications/index.ts','utf8').replace(/^import .*\n/gm,'');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
async function run(token,expired=false){
 let handler,claims=0,sent=[],finished=[],deleted=[];
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}};
 const api={rpc:async(name,args)=>{if(name==='portal_push_claim'){claims++;return {data:[{notification_id:'n1',user_id:'u1',title:'Unterrichtsänderung',body:'Vertretung: Frau Beispiel',route:'/stundenplan',lease_token:'l1',subscriptions:[subscription,{...subscription,endpoint:'https://127.0.0.1/private'}]}],error:null};}finished.push(args);return {error:null};},from:table=>({delete:()=>({eq:(key,val)=>({eq:async(k,v)=>{deleted.push({table,user:val,endpoint:v});return {error:null};}})})})};
 const env={SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'service-test',VAPID_PUBLIC_KEY:'public-test',VAPID_PRIVATE_KEY:'private-test',VAPID_SUBJECT:'mailto:test@example.test',HOMEWORK_CRON_SECRET:'cron-test'};
 vm.runInNewContext(js,{createClient:()=>api,webPush:{setVapidDetails(){},sendNotification:async(sub,payload)=>{sent.push(JSON.parse(payload));if(expired){const e=new Error('Expired');e.statusCode=410;throw e;}}},URL,TextEncoder,Response,JSON,Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn}});
 const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'send'})}));return {status:response.status,data:await response.json(),claims,sent,finished,deleted};
}
(async()=>{
 const denied=await run('user-jwt');assert.equal(denied.status,403);assert.equal(denied.claims,0);
 const valid=await run('cron-test');assert.equal(valid.status,200);assert.equal(valid.sent.length,1);assert.equal(valid.sent[0].route,'/stundenplan');assert.equal(valid.sent[0].userId,'u1');assert.equal(valid.sent[0].tag,'portal-n1');assert.equal(valid.finished[0].delivered,true);
 const expired=await run('cron-test',true);assert.equal(expired.deleted[0].table,'portal_push_subscription');assert.equal(expired.finished[0].delivered,false);
 let handlers={},shown=[],navigated=[],waiting;const ctx={URL,testActive:'u1',self:{addEventListener:(n,fn)=>handlers[n]=fn,registration:{scope:'https://example.test/app/',showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async u=>navigated.push(u)}}};
 const worker=fs.readFileSync('src/push-sw.js','utf8').replace(/async function activeUser\(\)\{.*?\}\n/s,'async function activeUser(){return globalThis.testActive;}\n');vm.runInNewContext(worker,ctx);
 handlers.push({data:{json:()=>valid.sent[0]},waitUntil:p=>waiting=p});await waiting;assert.equal(shown[0][0],'Unterrichtsänderung');assert.equal(shown[0][1].data.route,'/stundenplan');
 for(const route of ['/stundenplan','/krankmeldung','https://evil.test','//evil.test']){
  handlers.notificationclick({notification:{data:{userId:'u1',route},close(){}},waitUntil:p=>waiting=p});await waiting;
  assert.equal(navigated.at(-1),'https://example.test/app/'+(['/stundenplan','/krankmeldung'].includes(route)?route.slice(1):'hausaufgaben'));
 }
 ctx.testActive='other';handlers.push({data:{json:()=>valid.sent[0]},waitUntil:p=>waiting=p});await waiting;assert.equal(shown.length,1);
 console.log('PASS portal push cron authentication, endpoint allowlist, delivery finish, expired device cleanup, titles, safe navigation and account isolation; network mocked');
})().catch(e=>{console.error(e);process.exitCode=1;});
