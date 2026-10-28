const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),ts=require('../node_modules/typescript');
const realPush=require(process.env.WEB_PUSH_MODULE_PATH||'/workspace/.onboarding/homework-push-tools/node_modules/web-push');
const vapid=realPush.generateVAPIDKeys(),ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
const source=fs.readFileSync('supabase/functions/homework-reminders/index.ts','utf8').replace(/^import .*\n/gm,'');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
async function run(action,token,{expired=false}={}){
 let handler,sends=0,claims=0,finish=[],removed=0;
 const api={auth:{getUser:async t=>({data:{user:t==='valid-user'?{id:'u1'}:null},error:null})},
 rpc:async(name,args)=>{if(name==='hw_push_claim'){claims++;return {data:[{user_id:'u1',reminder_date:'2026-10-28',lease_token:'lease',task_count:2,subscriptions:[subscription,{...subscription,endpoint:'https://127.0.0.1/private'}]}],error:null};}finish.push(args);return {error:null};},
 from:()=>({delete:()=>({eq:()=>({eq:async()=>{removed++;return {error:null};}})})})};
 const push={setVapidDetails:(...args)=>realPush.setVapidDetails(...args),sendNotification:async(s,payload,options)=>{
  sends++;if(expired){const e=new Error('Gone');e.statusCode=410;throw e;}
  const request=realPush.generateRequestDetails(s,payload,options);
  assert.match(request.headers.Authorization,/^vapid /);assert.ok(Buffer.isBuffer(request.body));assert.ok(!request.body.includes(Buffer.from('offene Aufgabe')));
 }};
 const env={SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test-only',VAPID_PUBLIC_KEY:vapid.publicKey,VAPID_PRIVATE_KEY:vapid.privateKey,VAPID_SUBJECT:'mailto:test@example.test',HOMEWORK_CRON_SECRET:'cron-test-only'};
 vm.runInNewContext(js,{createClient:()=>api,webPush:push,URL,TextEncoder,Response,JSON,Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn}});
 const response=await handler(new Request('https://example.test/functions',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action})}));
 return {status:response.status,data:await response.json(),sends,claims,finish,removed};
}
(async()=>{
 const config=await run('config','valid-user');assert.equal(config.status,200);assert.deepEqual(Object.keys(config.data),['publicKey']);
 assert.equal((await run('config','bad-user')).status,401);
 const denied=await run('send','valid-user');assert.equal(denied.status,403);assert.equal(denied.claims,0);
 const good=await run('send','cron-test-only');assert.equal(good.status,200);assert.equal(good.sends,1);assert.equal(good.data.delivered,1);assert.equal(good.finish[0].delivered,true);
 const expired=await run('send','cron-test-only',{expired:true});assert.equal(expired.removed,1);assert.equal(expired.finish[0].delivered,false);
 // Worker notification dispatch is isolated to the last active account and same-origin app URL.
 let handlers={},shown=[],navigated=[],active='u1',waiting;
 const worker=fs.readFileSync('src/push-sw.js','utf8').replace(/async function activeUser\(\)\{.*?\}\n/s,"async function activeUser(){return globalThis.testActive;}\n");
 const ctx={URL,testActive:'u1',self:{addEventListener:(name,fn)=>handlers[name]=fn,registration:{scope:'https://example.test/stundenplan-11bguti/',showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[{url:'https://example.test/stundenplan-11bguti/',navigate:async u=>navigated.push(u),focus:async()=>{}}],openWindow:async u=>navigated.push(u)}}};
 vm.runInNewContext(worker,ctx);
 const dispatch=async data=>{handlers.push({data:{json:()=>data},waitUntil:p=>waiting=p});await waiting;};
 await dispatch({userId:'other',body:'Private'});assert.equal(shown.length,0);
 await dispatch({userId:'u1',body:'Noch 2 Aufgaben',url:'https://evil.test'});assert.equal(shown.length,1);
 handlers.notificationclick({notification:{data:{userId:'u1'},close(){}},waitUntil:p=>waiting=p});await waiting;assert.equal(navigated[0],'https://example.test/stundenplan-11bguti/hausaufgaben');
 ctx.testActive=null;await dispatch({userId:'u1',body:'No leak after logout'});assert.equal(shown.length,1);
 console.log('PASS push handler auth/config, cron-only dispatch, real VAPID signing/encrypted request generation, endpoint allowlist, expired-subscription cleanup/retry, worker account isolation and safe navigation; network mocked');
})().catch(e=>{console.error(e);process.exitCode=1;});
