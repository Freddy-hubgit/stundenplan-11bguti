import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import webPush from 'npm:web-push@3.6.7';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const reply=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers});
const allowed=(endpoint:string)=>{try{const url=new URL(endpoint);return url.protocol==='https:'&&!url.username&&!url.password&&['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(url.hostname);}catch{return false;}};
function equalSecret(a:string,b:string):boolean{if(!a||!b)return false;const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);return diff===0;}
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply(405,{error:'Nur POST erlaubt.'});
 const bearer=request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]||'';
 let body;try{body=await request.json();}catch{return reply(400,{error:'Ungültige Anfrage.'});}
 if(!body||typeof body!=='object')return reply(400,{error:'Ungültige Anfrage.'});
 const api=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false}});
 if(body.action==='config'){
  const {data,error}=await api.auth.getUser(bearer);if(error||!data.user)return reply(401,{error:'Anmeldung erforderlich.'});
  const publicKey=Deno.env.get('VAPID_PUBLIC_KEY');return publicKey&&Deno.env.get('VAPID_PRIVATE_KEY')&&Deno.env.get('VAPID_SUBJECT')&&Deno.env.get('HOMEWORK_CRON_SECRET')?reply(200,{publicKey}):reply(503,{error:'Web-Push ist noch nicht eingerichtet.'});
 }
 if(body.action!=='send'||!equalSecret(bearer,Deno.env.get('HOMEWORK_CRON_SECRET')||''))return reply(403,{error:'Keine Berechtigung.'});
 const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT');
 if(!publicKey||!privateKey||!subject)return reply(503,{error:'Web-Push-Schlüssel fehlen.'});
 try{
  webPush.setVapidDetails(subject,publicKey,privateKey);
  const {data:jobs,error}=await api.rpc('hw_push_claim');if(error)return reply(500,{error:'Erinnerungen konnten nicht ermittelt werden.'});
  let delivered=0;
  await Promise.all((jobs||[]).map(async job=>{
   let success=false;
   if(Number(job.task_count)>0)for(const subscription of job.subscriptions||[]){
    if(!allowed(subscription.endpoint))continue;
    try{await webPush.sendNotification(subscription,JSON.stringify({userId:job.user_id,title:'Hausaufgaben für morgen',body:`Du hast noch ${job.task_count} offene Aufgabe(n) oder Abgabe(n).`,tag:`homework-${job.user_id}-${job.reminder_date}`}),{TTL:3600,timeout:10000});success=true;}
    catch(error: any){if([404,410].includes(Number(error.statusCode)))await api.from('hw_push_subscription').delete().eq('user_id',job.user_id).eq('endpoint',subscription.endpoint);}
   }
   // A completed task between claim and send needs no retry.
   const {error:finishError}=await api.rpc('hw_push_finish',{person:job.user_id,day:job.reminder_date,token:job.lease_token,delivered:success||Number(job.task_count)===0});
   if(finishError)throw new Error('Versandstatus konnte nicht gespeichert werden.');
   if(success)delivered++;
  }));
  return reply(200,{delivered});
 }catch{return reply(500,{error:'Erinnerungsversand fehlgeschlagen.'});}
});
