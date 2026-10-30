import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
@Injectable({providedIn:'root'})
export class PushNotificationsService {
 supported=typeof window!=='undefined'&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;
 enabled=false;alertsEnabled=false;busy=false;error='';time='19:00';
 private user:string|null=null;private revision=0;private initialized=false;private contextQueue:Promise<void>=Promise.resolve();
 constructor(private api:SupabaseService){}
 activate(user:string|null):void{
  if(this.initialized&&user===this.user)return;this.initialized=true;this.user=user;this.enabled=false;this.alertsEnabled=false;const revision=++this.revision;
  this.contextQueue=this.contextQueue.catch(()=>{}).then(()=>revision===this.revision?this.writeContext(user):Promise.resolve());
 }
 private async writeContext(user:string|null):Promise<void>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('schulportal-push',1);r.onupgradeneeded=()=>r.result.createObjectStore('context');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('context','readwrite');tx.objectStore('context').put(user,'active-user');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
 }
 private async registration():Promise<ServiceWorkerRegistration>{return navigator.serviceWorker.register(new URL('push-sw.js',document.baseURI).href,{scope:new URL('.',document.baseURI).pathname});}
 async refresh():Promise<void>{
  if(!this.supported||!this.user)return;const revision=this.revision;
  try{const registration=await navigator.serviceWorker.getRegistration(new URL('.',document.baseURI).href);const subscription=await registration?.pushManager.getSubscription();
   const rows=await this.api.supportRpc<{reminder_time:string;active:boolean}[]>('hw_push_settings',{device_endpoint:subscription?.endpoint||''});
   if(revision===this.revision){this.time=rows[0]?.reminder_time||'19:00';this.enabled=!!subscription&&!!rows[0]?.active;}
  }catch{/* Other homework features remain available before push setup. */}
 }
 async refreshAlerts():Promise<void>{
  if(!this.supported||!this.user)return;const revision=this.revision;
  try{const registration=await navigator.serviceWorker.getRegistration(new URL('.',document.baseURI).href);const subscription=await registration?.pushManager.getSubscription();
   const active=await this.api.supportRpc<boolean>('portal_push_settings',{device_endpoint:subscription?.endpoint||''});
   if(revision===this.revision){this.alertsEnabled=!!subscription&&active;this.error='';}
  }catch(e:any){if(revision===this.revision){
   const code=String(e?.code||'');
   if(['PGRST202','42883','42P01'].includes(code))this.error='Die Push-Datenbankfunktion fehlt oder ist noch nicht verfügbar. Bitte Migration 014 und den Supabase-Schema-Cache prüfen. ('+code+')';
   else if(code==='42501')this.error='Keine Berechtigung für die Push-Einstellung. Bitte erneut anmelden; falls der Fehler bleibt, die Datenbankrechte prüfen. (42501)';
   else if(['PGRST301','PGRST303'].includes(code))this.error='Deine Sitzung ist abgelaufen. Bitte erneut anmelden.';
   else this.error='Die Push-Einstellung konnte nicht geladen werden. Bitte Verbindung prüfen und erneut versuchen.'+(code?' ('+code+')':'');
  }}
 }
 async enable(category:'homework'|'alerts'='homework'):Promise<void>{
  if(this.busy||!this.user||!this.supported)return;
  this.busy=true;this.error='';const revision=this.revision;
  try{
   const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Bitte Benachrichtigungen in den Browser-Einstellungen erlauben.');
   const key=await this.api.pushConfig();if(revision!==this.revision)return;
   await this.registration();const registration=await navigator.serviceWorker.ready;
   const bytes=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
   let subscription=await registration.pushManager.getSubscription();
   const previous=subscription?.options?.applicationServerKey;
   if(previous&&(new Uint8Array(previous).length!==bytes.length||new Uint8Array(previous).some((value,index)=>value!==bytes[index]))){await subscription!.unsubscribe();subscription=null;}
   if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
   if(revision!==this.revision)return;
   await this.writeContext(this.user);
   if(revision!==this.revision)return;
   if(category==='alerts')await this.api.supportRpc('portal_push_save',{device:subscription.toJSON()});
   else await this.api.supportRpc('hw_push_save',{device:subscription.toJSON(),remind_at:this.time});
   if(revision===this.revision){if(category==='alerts')this.alertsEnabled=true;else this.enabled=true;}
  }catch(e:any){if(revision===this.revision)this.error=e?.message||'Benachrichtigungen konnten nicht aktiviert werden.';}
  finally{this.busy=false;}
 }
 async disable(category:'homework'|'alerts'='homework'):Promise<void>{
  if(this.busy||!this.supported)return;this.busy=true;this.error='';const revision=this.revision;
  try{const registration=await navigator.serviceWorker.getRegistration(new URL('.',document.baseURI).href);const subscription=await registration?.pushManager.getSubscription();
   if(revision!==this.revision)return;
   if(subscription)await this.api.supportRpc(category==='alerts'?'portal_push_remove':'hw_push_remove',{device_endpoint:subscription.endpoint});
   // Keep the browser subscription for other accounts; the database opt-in is per account.
   if(revision===this.revision){if(category==='alerts')this.alertsEnabled=false;else this.enabled=false;}
  }catch{this.error='Erinnerungen konnten nicht deaktiviert werden.';}finally{this.busy=false;}
 }
}
