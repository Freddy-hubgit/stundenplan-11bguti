const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('../node_modules/typescript');
const js=ts.transpileModule(fs.readFileSync('supabase/functions/school-year-reset/index.ts','utf8').replace(/^import .*\n/,''),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
async function run({role='admin',token='valid',action='execute',confirmation='CONFIRM',failFile=false,staffBackground=false}={}){
 let handler,removed=[],deleted=[],finished=[],executions=0,claims=0;
 const admin={auth:{getUser:async t=>({data:{user:t==='valid'?{id:'admin'}:null},error:null}),admin:{deleteUser:async id=>{deleted.push(id);return {error:null};}}},
 from:()=>({select:()=>({eq:(_k,id)=>({single:async()=>({data:{role,roles:[role]},error:null}),maybeSingle:async()=>({data:{roles:[id==='graduate'?'user':'teacher']},error:null})})}),delete:()=>({eq:async()=>({error:null})})}),
 storage:{from:bucket=>({remove:async paths=>{removed.push({bucket,paths});return {error:failFile?{}:null};}})},
 rpc:async(name,args)=>{if(name==='school_cleanup_claim'){claims++;return {data:claims===1?[{kind:'file',bucket:staffBackground?'account-backgrounds':'school-materials',path:staffBackground?'staff/background':'class/user/file.pdf',token:'file-token'}]:claims===2?[{kind:'user',user_id:'graduate',token:'u1'},{kind:'user',user_id:'staff',token:'u2'}]:[],error:null};}if(name==='school_cleanup_finish'){finished.push(args);return {error:null};}return {data:{files_pending:failFile?1:0,accounts_pending:0},error:null};}};
 const caller={rpc:async(name,args)=>{executions++;if(name==='school_reset_execute'&&args.confirmation!=='CONFIRM')return {error:{message:'Bestätigung falsch.'}};return {data:{ok:true},error:null};}};
 vm.runInNewContext(js,{createClient:(_u,_k,options)=>options?.global?caller:admin,Response,Request,JSON,Deno:{env:{get:()=> 'test-only'},serve:fn=>handler=fn}});
 const response=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,plan:'preview-token',confirmation,clear_groups:false,clear_chats:false,delete_graduates:true,user_id:'not-authorized-by-preview'})}));return {status:response.status,body:await response.json(),removed,deleted,finished,executions};
}
(async()=>{
 for(const role of ['user','teacher','support']){const r=await run({role});assert.equal(r.status,403);assert.equal(r.executions,0);assert.equal(r.deleted.length,0);}
 assert.equal((await run({token:'invalid'})).status,401);
 const status=await run({action:'status'});assert.equal(status.status,200);assert.equal(status.removed.length,0);assert.equal(status.deleted.length,0);
 const preview=await run({action:'preview'});assert.equal(preview.status,200);assert.equal(preview.removed.length,0);assert.equal(preview.deleted.length,0);
 const rejected=await run({confirmation:'wrong'});assert.equal(rejected.status,400);assert.equal(rejected.removed.length,0);
 const ok=await run();assert.equal(ok.status,200);assert.deepEqual(ok.deleted,['graduate']);assert.equal(ok.removed[0].bucket,'school-materials');assert.equal(ok.finished.length,3);assert.equal(ok.body.warnings.length,1);
 const protectedImage=await run({staffBackground:true});assert.equal(protectedImage.removed.length,0);assert.ok(protectedImage.body.warnings.some(w=>w.includes('Kontobild')));
 const failed=await run({failFile:true});assert.equal(failed.status,200);assert.equal(failed.body.files_pending,1);assert.ok(failed.body.cleanup_errors.length);assert.equal(failed.deleted.length,0);
 console.log('PASS reset Edge: verified admin only, read-only preview, SQL confirmation, Storage/Auth API cleanup, staff protection, queue-only deletion and retryable partial failure; APIs mocked');
})().catch(e=>{console.error(e);process.exitCode=1;});
