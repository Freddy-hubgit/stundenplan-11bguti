import {Router} from '@angular/router';
import {hasRole} from './supabase.service';
import {berlinReminderClock,pendingNativeHomework,nativeNotificationIds,freshNativeNotifications} from './desktop-reminders';
import { Injectable,NgZone } from '@angular/core';
import { SupabaseService } from './supabase.service';
@Injectable({providedIn:'root'})
export class PushNotificationsService {
 readonly nativeDownloadUrl='https://github.com/Freddy-hubgit/stundenplan-app/releases/latest';
 get desktopApp():boolean{return typeof window!=='undefined'&&(!!(window as any).stundenplanDesktop||/Electron\//i.test(navigator.userAgent||''));}
 readonly browserUrl='https://freddy-hubgit.github.io/stundenplan-11bguti/';
 get nativeApp():boolean{if(typeof window==='undefined')return false;const host=window as any;return !!host.stundenplanDesktop||/Electron\//i.test(navigator.userAgent||'')||!!host.Capacitor?.isNativePlatform?.()||/; wv[;)]/i.test(navigator.userAgent||'');}
 get nativeSupported():boolean{const api=typeof window!=='undefined'?(window as any).stundenplanDesktop?.notifications:null;return api?.version===1&&['configure','show','onOpen'].every(name=>typeof api[name]==='function');}
 get supported():boolean{return this.nativeSupported||this.browserSupported;}
 private get browserSupported():boolean{return typeof window!=='undefined'&&!this.nativeApp&&window.isSecureContext!==false&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;}
 get unsupportedReason():string{if(this.nativeApp&&!this.desktopApp)return 'Diese App unterstützt Web-Push derzeit nicht. Bitte das Schulportal in Chrome öffnen und dort Benachrichtigungen aktivieren.';if(this.nativeApp)return 'Diese App-Version besitzt noch keine native Benachrichtigungsfunktion. Bitte die neue Windows-Version installieren. Alternativ: Öffne das Schulportal in Chrome oder Edge, melde dich dort an und aktiviere die Benachrichtigungen. Sie werden dann vom Browser zugestellt, auch wenn die Webseite geschlossen ist.';return 'Dieser Browser unterstützt Web-Push hier nicht. Auf iPhone/iPad die Webseite in Safari zum Home-Bildschirm hinzufügen und darüber öffnen.';}

 enabled=false;alertsEnabled=false;busy=false;error='';time='19:00';
 private user:string|null=null;private revision=0;private initialized=false;private contextQueue:Promise<void>=Promise.resolve();
 private nativeTimer?:ReturnType<typeof setInterval>;private nativeInit?:ReturnType<typeof setTimeout>;private nativePolling=false;private nativeGeneration=0;private nativeAvailable=true;
 private nativePrefs={homework:false,alerts:false,time:'19:00',lastDay:'',seen:[] as string[]};
 constructor(private api:SupabaseService,private router:Router,private zone:NgZone){if(this.nativeSupported)this.desktop.onOpen((route:string)=>{if(this.user){const navigate=()=>void this.router.navigateByUrl(route);if(this.zone)this.zone.run(navigate);else navigate();}});}
 private get desktop():any{return (window as any).stundenplanDesktop.notifications;}
 private get nativeKey():string{return 'schulportal-desktop-notifications:'+this.user;}
 private readNative():void{this.nativePrefs={homework:false,alerts:false,time:'19:00',lastDay:'',seen:[] as string[]};if(!this.user)return;try{const p=JSON.parse(localStorage.getItem(this.nativeKey)||'null');if(!p)return;this.nativePrefs={homework:p.homework===true,alerts:p.alerts===true,time:this.validReminderTime(p.time)?p.time:'19:00',lastDay:typeof p.lastDay==='string'?p.lastDay:'',seen:Array.isArray(p.seen)?p.seen.filter((id:any)=>typeof id==='string'):[]};}catch{}}
 private saveNative():void{localStorage.setItem(this.nativeKey,JSON.stringify(this.nativePrefs));}
 private validReminderTime(value:any):boolean{return typeof value==='string'&&/^\d{2}:\d{2}$/.test(value)&&value>='16:00'&&value<='22:00'&&Number(value.slice(3))<60&&Number(value.slice(3))%5===0;}
 private nativeContext():Promise<any>{return this.desktop.configure({userId:this.user,homework:!!this.user&&this.nativePrefs.homework,alerts:!!this.user&&this.nativePrefs.alerts});}
 private async initializeNative(revision:number):Promise<void>{try{const status=await this.nativeContext();if(revision!==this.revision)return;this.nativeAvailable=!!status.supported;this.enabled=this.nativeAvailable&&this.nativePrefs.homework;this.alertsEnabled=!!status.supported&&this.nativePrefs.alerts;this.time=this.nativePrefs.time;if(this.user){this.nativeTimer=setInterval(()=>void this.pollNative(),60000);void this.pollNative();}}catch{if(revision===this.revision)this.error='Windows-Benachrichtigungen konnten nicht initialisiert werden. Bitte die App neu starten.';}}
 private async enableNative(category:'homework'|'alerts',revision:number):Promise<void>{
  this.nativeGeneration++;if(category==='homework'&&!this.validReminderTime(this.time))throw new Error('Bitte eine Erinnerungszeit zwischen 16:00 und 22:00 Uhr in 5-Minuten-Schritten wählen.');
  const previous={...this.nativePrefs,seen:this.nativePrefs.seen.slice()};
  const session=await this.api.getSession();if(revision!==this.revision)return;if(session?.user.id!==this.user)throw new Error('Bitte erneut anmelden.');
  const rows=await this.api.supportRpc<any[]>(category==='alerts'?'portal_notifications':'hw_tasks_group');if(revision!==this.revision)return;
  if(category==='alerts'){if(!this.nativePrefs.alerts)this.nativePrefs.seen=nativeNotificationIds(rows);this.nativePrefs.alerts=true;}else{this.nativePrefs.homework=true;this.nativePrefs.time=this.time;}
  try{const status=await this.nativeContext();if(revision!==this.revision)return;this.nativeAvailable=!!status.supported;if(!status.supported)throw new Error('Windows-Benachrichtigungen werden auf diesem System nicht unterstützt.');
   const shown=await this.desktop.show({userId:this.user,category,title:'Schulportal',body:category==='homework'?'Hausaufgaben-Erinnerungen sind aktiviert. Die App bleibt beim Schließen des Fensters im Infobereich aktiv.':'Benachrichtigungen für neue Meldungen sind aktiviert.',path:category==='homework'?'/hausaufgaben':'/meldungen'});
   if(revision!==this.revision)return;if(!shown.ok)throw new Error(shown.error||'Windows konnte keine Benachrichtigung anzeigen.');this.saveNative();this.enabled=this.nativePrefs.homework;this.alertsEnabled=this.nativePrefs.alerts;
  }catch(e){if(revision===this.revision){this.nativePrefs=previous;await this.nativeContext();}throw e;}
 }
 private async disableNative(category:'homework'|'alerts',revision:number):Promise<void>{this.nativeGeneration++;const old={...this.nativePrefs};this.nativePrefs[category]=false;try{await this.nativeContext();if(revision!==this.revision)return;this.saveNative();this.enabled=this.nativePrefs.homework;this.alertsEnabled=this.nativePrefs.alerts;}catch(e){if(revision===this.revision)this.nativePrefs=old;throw e;}}
 async pollNative():Promise<void>{
  if(!this.nativeSupported||!this.nativeAvailable||!this.user||this.busy||this.nativePolling||!this.nativePrefs.homework&&!this.nativePrefs.alerts)return;
  this.nativePolling=true;const revision=this.revision,user=this.user,generation=this.nativeGeneration;
  try{const session=await this.api.getSession();if(revision!==this.revision||generation!==this.nativeGeneration)return;if(session?.user.id!==user){await this.desktop.configure({userId:null,homework:false,alerts:false});return;}
   const clock=berlinReminderClock(new Date());
   if(this.nativePrefs.homework&&clock.time>=this.nativePrefs.time&&this.nativePrefs.lastDay!==clock.day){
    const [tasks,profile]=await Promise.all([this.api.supportRpc<any[]>('hw_tasks_group'),this.api.getMyProfile()]);if(revision!==this.revision||generation!==this.nativeGeneration)return;
    const count=pendingNativeHomework(tasks,clock.tomorrow,hasRole(profile,'user'));
    if(count){const result=await this.desktop.show({userId:user,category:'homework',title:'Hausaufgaben für morgen',body:`${count} Aufgabe(n) sind noch offen oder müssen abgegeben werden.`,path:'/hausaufgaben'});if(revision!==this.revision||generation!==this.nativeGeneration)return;if(!result.ok)throw new Error(result.error||'Benachrichtigung konnte nicht angezeigt werden.');this.nativePrefs.lastDay=clock.day;this.saveNative();}
   }
   if(this.nativePrefs.alerts){const rows=await this.api.supportRpc<any[]>('portal_notifications');if(revision!==this.revision||generation!==this.nativeGeneration)return;const fresh=freshNativeNotifications(rows,this.nativePrefs.seen);
    if(fresh.length){const result=await this.desktop.show({userId:user,category:'alerts',title:fresh.length===1?fresh[0].title:`${fresh.length} neue Meldungen`,body:fresh.length===1?fresh[0].body:'Es gibt neue Unterrichtsänderungen oder Krankmeldungen. Bitte die Meldungen im Schulportal prüfen.',path:'/meldungen'});if(revision!==this.revision||generation!==this.nativeGeneration)return;if(!result.ok)throw new Error(result.error||'Benachrichtigung konnte nicht angezeigt werden.');}
    this.nativePrefs.seen=nativeNotificationIds(rows);this.saveNative();
   }
   if(revision===this.revision&&generation===this.nativeGeneration)this.error='';
  }catch(e:any){if(revision===this.revision&&generation===this.nativeGeneration)this.error='Die App konnte Benachrichtigungen zuletzt nicht prüfen. Bitte Internetverbindung und Anmeldung prüfen. '+(e?.message||'');}finally{this.nativePolling=false;}
 }

 activate(user:string|null):void{
  if(this.initialized&&user===this.user)return;this.initialized=true;this.user=user;this.enabled=false;this.alertsEnabled=false;const revision=++this.revision;clearInterval(this.nativeTimer);clearTimeout(this.nativeInit);if(this.nativeSupported){this.readNative();this.nativeInit=setTimeout(()=>void this.initializeNative(revision),0);}
  this.contextQueue=this.contextQueue.catch(()=>{}).then(()=>revision===this.revision?this.writeContext(user):Promise.resolve());
 }
 private async writeContext(user:string|null):Promise<void>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('schulportal-push',1);r.onupgradeneeded=()=>r.result.createObjectStore('context');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('context','readwrite');tx.objectStore('context').put(user,'active-user');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
 }
 private async registration():Promise<ServiceWorkerRegistration>{return navigator.serviceWorker.register(new URL('push-sw.js',document.baseURI).href,{scope:new URL('.',document.baseURI).pathname});}
 async refresh():Promise<void>{
  if(!this.supported||!this.user)return;if(this.nativeSupported){this.enabled=this.nativeAvailable&&this.nativePrefs.homework;this.time=this.nativePrefs.time;return;}const revision=this.revision;
  try{const registration=await navigator.serviceWorker.getRegistration(new URL('.',document.baseURI).href);const subscription=await registration?.pushManager.getSubscription();
   const rows=await this.api.supportRpc<{reminder_time:string;active:boolean}[]>('hw_push_settings',{device_endpoint:subscription?.endpoint||''});
   if(revision===this.revision){this.time=rows[0]?.reminder_time||'19:00';this.enabled=!!subscription&&!!rows[0]?.active;}
  }catch{/* Other homework features remain available before push setup. */}
 }
 async refreshAlerts():Promise<void>{
  if(!this.supported||!this.user)return;if(this.nativeSupported){this.alertsEnabled=this.nativeAvailable&&this.nativePrefs.alerts;return;}const revision=this.revision;
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
  if(this.busy||!this.user)return;if(!this.supported){this.error=this.unsupportedReason;return;}
  this.busy=true;this.error='';const revision=this.revision;
  try{
   if(this.nativeSupported){await this.enableNative(category,revision);return;}
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
  }catch(e:any){if(revision===this.revision){const detail=String(e?.message||'');this.error=/push service not available|push service unavailable/i.test(detail)?'Der Push-Dienst dieses Browsers ist nicht verfügbar. Bitte Chrome oder Edge aktualisieren und erneut versuchen. Falls es dort ebenfalls auftritt, können Browserrichtlinien oder die Netzwerkverbindung den Push-Dienst blockieren.':detail||'Benachrichtigungen konnten nicht aktiviert werden.';}}
  finally{this.busy=false;}
 }
 async disable(category:'homework'|'alerts'='homework'):Promise<void>{
  if(this.busy||!this.supported)return;this.busy=true;this.error='';const revision=this.revision;
  try{if(this.nativeSupported){await this.disableNative(category,revision);return;}const registration=await navigator.serviceWorker.getRegistration(new URL('.',document.baseURI).href);const subscription=await registration?.pushManager.getSubscription();
   if(revision!==this.revision)return;
   if(subscription)await this.api.supportRpc(category==='alerts'?'portal_push_remove':'hw_push_remove',{device_endpoint:subscription.endpoint});
   // Keep the browser subscription for other accounts; the database opt-in is per account.
   if(revision===this.revision){if(category==='alerts')this.alertsEnabled=false;else this.enabled=false;}
  }catch{this.error='Erinnerungen konnten nicht deaktiviert werden.';}finally{this.busy=false;}
 }
}
