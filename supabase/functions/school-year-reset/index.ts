import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.117.2';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const reply=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')return reply(405,{error:'Nur POST erlaubt.'});
 const token=request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];if(!token)return reply(401,{error:'Anmeldung erforderlich.'});
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!key)return reply(503,{error:'Reset-Funktion noch nicht eingerichtet.'});
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:identity,error:authError}=await admin.auth.getUser(token);if(authError||!identity.user)return reply(401,{error:'Bitte erneut anmelden.'});
  const {data:profile,error:profileError}=await admin.from('profiles').select('role,roles').eq('id',identity.user.id).single();
  if(profileError||!(profile?.roles||[profile?.role]).includes('admin'))return reply(403,{error:'Nur Admins dürfen einen Schuljahres-Reset ausführen.'});
  let body;try{body=await request.json();}catch{return reply(400,{error:'Ungültige Anfrage.'});}if(!body||typeof body!=='object')return reply(400,{error:'Ungültige Anfrage.'});
  const caller=createClient(url,key,{auth:{persistSession:false},global:{headers:{Authorization:'Bearer '+token}}});
  if(body.action==='preview'){
   if(['clear_groups','clear_chats','delete_graduates'].some(k=>typeof body[k]!=='boolean'))return reply(400,{error:'Bitte Reset-Optionen auswählen.'});
   const {data,error}=await caller.rpc('school_reset_plan',{remove_groups:body.clear_groups,remove_chats:body.clear_chats,remove_graduates:body.delete_graduates});if(error)return reply(400,{error:error.message});return reply(200,data);
  }
  if(body.action==='status'){const {data,error}=await admin.rpc('school_cleanup_status');return error?reply(500,{error:'Bereinigungsstatus nicht verfügbar.'}):reply(200,{...data,ok:false,cleanup_errors:[]});}
  let result:any={ok:true};
  if(body.action==='execute'){
   if(typeof body.plan!=='string'||typeof body.confirmation!=='string')return reply(400,{error:'Vorschau und Bestätigung erforderlich.'});
   const {data,error}=await caller.rpc('school_reset_execute',{plan:body.plan,confirmation:body.confirmation});if(error)return reply(400,{error:error.message});result=data;
  }else if(body.action!=='cleanup')return reply(400,{error:'Unbekannte Aktion.'});
  const errors:string[]=[];const warnings:string[]=[];
  for(let batch=0;batch<3;batch++){
   const {data:jobs,error}=await admin.rpc('school_cleanup_claim');if(error){errors.push('Bereinigung konnte nicht gestartet werden.');break;}if(!jobs?.length)break;
   for(const bucket of [...new Set(jobs.filter(j=>j.kind==='file').map(j=>j.bucket))]){
    const files:any[]=[];
    for(const job of jobs.filter(j=>j.kind==='file'&&j.bucket===bucket)){
     if(bucket==='account-backgrounds'){
      const {data:owner,error:ownerError}=await admin.from('profiles').select('roles').eq('id',job.path.split('/')[0]).maybeSingle();
      if(ownerError){errors.push('Rollen für ein Kontobild konnten nicht geprüft werden.');continue;}
      if(owner&&(!Array.isArray(owner.roles)||owner.roles.length!==1||owner.roles[0]!=='user')){
       const {error:skipError}=await admin.rpc('school_cleanup_finish',{item_kind:'file',item_bucket:job.bucket,item_path:job.path,person:null,token:job.token});if(skipError)errors.push('Geschützter Dateistatus konnte nicht aktualisiert werden.');warnings.push('Das Kontobild eines inzwischen geschützten Kontos wurde beibehalten.');continue;
      }
     }
     files.push(job);
    }
    if(!files.length)continue;
    const {error:removeError}=await admin.storage.from(bucket).remove(files.map(j=>j.path));
    if(removeError){errors.push('Dateibereinigung fehlgeschlagen. Erneuter Versuch nach zwei Minuten möglich.');continue;}
    for(const job of files){const {error:finishError}=await admin.rpc('school_cleanup_finish',{item_kind:'file',item_bucket:job.bucket,item_path:job.path,person:null,token:job.token});if(finishError)errors.push('Dateistatus konnte nicht aktualisiert werden.');}
   }
   for(const job of jobs.filter(j=>j.kind==='user')){
    if(job.user_id===identity.user.id){await admin.rpc('school_cleanup_finish',{item_kind:'user',item_bucket:'',item_path:'',person:job.user_id,token:job.token});warnings.push('Eigenes Konto wurde geschützt und nicht gelöscht.');continue;}
    const {data:person,error:personError}=await admin.from('profiles').select('roles').eq('id',job.user_id).maybeSingle();
    if(personError){errors.push('Kontorollen konnten nicht geprüft werden.');continue;}
    if(person&&(!Array.isArray(person.roles)||person.roles.length!==1||person.roles[0]!=='user')){const {error:skipError}=await admin.rpc('school_cleanup_finish',{item_kind:'user',item_bucket:'',item_path:'',person:job.user_id,token:job.token});if(skipError)errors.push('Geschützter Kontostatus konnte nicht aktualisiert werden.');warnings.push('Ein Konto hat inzwischen zusätzliche Rollen und wurde nicht gelöscht.');continue;}
    const {error:deleteError}=await admin.auth.admin.deleteUser(job.user_id);if(deleteError&&deleteError.status!==404&&deleteError.code!=='user_not_found'){errors.push('Ein Abschlusskonto konnte nicht gelöscht werden. Bitte Auth- und Storage-Zuordnung prüfen.');continue;}
    const {error:rowError}=await admin.from('profiles').delete().eq('id',job.user_id);if(rowError){errors.push('Profilbereinigung noch ausstehend.');continue;}
    const {error:finishError}=await admin.rpc('school_cleanup_finish',{item_kind:'user',item_bucket:'',item_path:'',person:job.user_id,token:job.token});if(finishError)errors.push('Kontostatus konnte nicht aktualisiert werden.');
   }
   if(errors.length)break;
  }
  const {data:pending,error:statusError}=await admin.rpc('school_cleanup_status');if(statusError)return reply(500,{error:'Reset wurde ausgeführt; Bereinigungsstatus konnte nicht geladen werden. Bitte Bereinigung erneut aufrufen.'});
  return reply(200,{...result,...pending,cleanup_errors:[...new Set(errors)],warnings:[...new Set(warnings)]});
 }catch{return reply(500,{error:'Aktion nicht vollständig abgeschlossen. Bitte Status prüfen; bei ausgeführtem Reset die Bereinigung erneut starten.'});}
});
