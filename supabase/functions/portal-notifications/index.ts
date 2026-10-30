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
 if(body.action!=='send'||!equalSecret(bearer,Deno.env.get('HOMEWORK_CRON_SECRET')||''))return reply(403,{error:'Keine Berechtigung.'});
 const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT');
 if(!publicKey||!privateKey||!subject)return reply(503,{error:'Web-Push-Schlüssel fehlen.'});
 try{
  webPush.setVapidDetails(subject,publicKey,privateKey);
  const {data:jobs,error}=await api.rpc('portal_push_claim');if(error)return reply(500,{error:'Benachrichtigungen konnten nicht ermittelt werden.'});
  let delivered=0;
  await Promise.all((jobs||[]).map(async job=>{
   let success=false;
   for(const subscription of job.subscriptions||[]){
    if(!allowed(subscription.endpoint))continue;
    try{await webPush.sendNotification(subscription,JSON.stringify({userId:job.user_id,title:job.title,body:job.body,route:job.route,tag:`portal-${job.notification_id}`}),{TTL:3600,timeout:10000});success=true;}
    catch(error: any){if([404,410].includes(Number(error.statusCode)))await api.from('portal_push_subscription').delete().eq('user_id',job.user_id).eq('endpoint',subscription.endpoint);}
   }
   // Lease token prevents a delayed worker from completing a newer attempt.
   const {error:finishError}=await api.rpc('portal_push_finish',{notification:job.notification_id,token:job.lease_token,delivered:success});
   if(finishError)throw new Error('Versandstatus konnte nicht gespeichert werden.');
   if(success)delivered++;
  }));
  return reply(200,{delivered});
 }catch{return reply(500,{error:'Benachrichtigungsversand fehlgeschlagen.'});}
});
