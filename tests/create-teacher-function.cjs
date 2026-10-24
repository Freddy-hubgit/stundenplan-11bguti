const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('../node_modules/typescript');
const source=fs.readFileSync('supabase/functions/create-teacher/index.ts','utf8').replace(/^import .*;\n/,'');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
async function run({role='admin',token='valid',profileError=false,method='POST',body={email:'teacher@example.test',password:'test-password',name:'Teacher',role:'admin'}}={}){
 let handler,created,upserted,deleted;
 const admin={auth:{getUser:async()=>({data:{user:token==='valid'?{id:'caller'}:null},error:null}),admin:{
 createUser:async data=>{created=data;return {data:{user:{id:'created'}},error:null}},
 deleteUser:async id=>{deleted=id;return {error:null}}
 }},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role},error:null})})}),
 upsert:async data=>{upserted=data;return {error:profileError?{}:null}}
 })};
 const context={createClient:()=>admin,Response,Request,JSON,Deno:{env:{get:()=> 'test-only'},serve:fn=>handler=fn}};
 vm.runInNewContext(js,context);
 const response=await handler(new Request('https://example.test/create-teacher',{method,
 headers:token?{Authorization:'Bearer '+token,'Content-Type':'application/json'}:{'Content-Type':'application/json'},
 ...(method==='POST'?{body:JSON.stringify(body)}:{})}));
 return {status:response.status,body:await (response.status===204?Promise.resolve(null):response.json()),created,upserted,deleted};
}
(async()=>{
 assert.equal((await run({token:''})).status,401);
 assert.equal((await run({token:'invalid'})).status,401);
 for(const role of ['user','teacher']){const r=await run({role});assert.equal(r.status,403);assert.equal(r.created,undefined);}
 for(const role of ['support','admin']){const r=await run({role});assert.equal(r.status,200);assert.equal(r.upserted.role,'teacher');assert.equal(r.created.app_metadata.role,'teacher');}
 const rollback=await run({profileError:true});assert.equal(rollback.status,500);assert.equal(rollback.deleted,'created');
 assert.equal((await run({body:{}})).status,400);
 assert.equal((await run({method:'OPTIONS',token:''})).status,204);
 console.log('PASS teacher edge handler: verified login, staff-only access, fixed teacher role, profile-failure rollback, invalid input, CORS; mocked Supabase SDK');
})();
