import { SupabaseService } from './supabase.service';
import { Injectable } from '@angular/core';

@Injectable({providedIn:'root'})
export class BackgroundImageService {
 url: string | null=null;
 get cssImage():string|null{return this.url?'url("'+this.url+'")':null;}
 busy=false;
 error='';
 notice='';
 cloudSaved=false;
 private blob: Blob | null=null;
 constructor(private api:SupabaseService){}
 private account: string | null=null;
 private revision=0;
 private initialized=false;
 private readonly types=['image/jpeg','image/png','image/webp'];
 private mode(account:string):string|null { try{return localStorage.getItem('portal-background-mode:'+account);}catch{return null;} }
 private setMode(account:string,value:'local'|'account'):void { try{localStorage.setItem('portal-background-mode:'+account,value);}catch{/* The image still works for this session. */} }
 private valid(blob:unknown):blob is Blob { return blob instanceof Blob&&this.types.includes(blob.type)&&blob.size<=3*1024*1024; }
 activate(account:string|null):void{
  if(this.initialized&&account===this.account)return;
  this.initialized=true;this.account=account;const revision=++this.revision;
  this.apply(null);this.error='';this.notice='';this.cloudSaved=false;this.busy=!!account;
  if(account)void this.loadInitial(account,revision).finally(()=>{if(this.revision===revision)this.busy=false;});
 }
 private async loadInitial(account:string,revision:number):Promise<void>{
  let local:unknown;
  try{local=await this.read(account);}catch{if(this.revision===revision)this.error='Lokale Hintergrundbilder konnten nicht geladen werden.';}
  if(this.revision!==revision)return;
  if(this.valid(local))this.apply(local);
  const mode=this.mode(account);
  // Keep existing local-only pictures local; new devices check for an account picture.
  if(mode==='local'||(!mode&&this.valid(local)))return;
  // Optional network loading must not block choosing a local picture.
  this.busy=false;
  try{
   const remote=await this.api.downloadAccountBackground(account);
   if(this.revision!==revision)return;
   if(remote&&!this.valid(remote))throw new Error('Ungültiges Kontobild');
   this.apply(remote);this.cloudSaved=!!remote;this.setMode(account,'account');
   try{await this.store(account,remote);}catch{/* Remote loading does not depend on browser storage. */}
  }catch{if(this.revision===revision&&this.valid(local))this.notice='Kontobild aktuell nicht erreichbar. Die lokale Kopie wird angezeigt.';}
 }
 private apply(blob:Blob|null):void{const previous=this.url;this.blob=blob;this.url=blob?URL.createObjectURL(blob):null;if(previous)URL.revokeObjectURL(previous);}
 async saveToAccount():Promise<void>{
  if(this.busy||!this.account||!this.blob)return;
  const account=this.account,blob=this.blob,revision=++this.revision;
  this.busy=true;this.error='';this.notice='';
  try{
   await this.api.uploadAccountBackground(account,blob);
   if(this.revision===revision){this.cloudSaved=true;this.setMode(account,'account');this.notice='Im Konto gespeichert. Andere Geräte laden das Bild bei der nächsten Anmeldung oder beim Neuladen.';}
  }catch{if(this.revision===revision)this.error='Kontobild konnte nicht hochgeladen werden. Dein lokales Bild bleibt erhalten. Bitte prüfe, ob die Supabase-Migration für Kontobilder eingerichtet ist.';}
  finally{if(this.revision===revision)this.busy=false;}
 }
 async loadFromAccount():Promise<void>{
  if(this.busy||!this.account)return;
  const account=this.account,revision=++this.revision;this.busy=true;this.error='';this.notice='';
  try{
   const remote=await this.api.downloadAccountBackground(account);
   if(this.revision!==revision)return;
   if(!remote){this.cloudSaved=false;this.setMode(account,'local');this.notice='Für dieses Konto ist kein Hintergrundbild gespeichert.';return;}
   if(!this.valid(remote))throw new Error('Ungültiges Kontobild');
   this.apply(remote);this.cloudSaved=true;this.setMode(account,'account');this.notice='Kontobild geladen.';
   try{await this.store(account,remote);}catch{/* Showing a valid account picture does not require a local cache. */}
  }catch{if(this.revision===revision)this.error='Kontobild konnte nicht geladen werden. Das bisherige Bild bleibt erhalten.';}
  finally{if(this.revision===revision)this.busy=false;}
 }
 async deleteFromAccount():Promise<void>{
  if(this.busy||!this.account)return;
  const account=this.account,revision=++this.revision;this.busy=true;this.error='';this.notice='';
  try{
   await this.api.deleteAccountBackground(account);
   if(this.revision===revision){this.cloudSaved=false;this.setMode(account,'local');this.notice='Kontobild gelöscht. Das aktuelle Bild bleibt nur in diesem Browser gespeichert.';}
  }catch{if(this.revision===revision)this.error='Das Kontobild konnte nicht gelöscht werden. Bitte erneut versuchen.';}
  finally{if(this.revision===revision)this.busy=false;}
 }
 private open():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
   const request=indexedDB.open('schulportal-backgrounds',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('images'))request.result.createObjectStore('images');};
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Speicher nicht verfügbar'));
   request.onblocked=()=>reject(new Error('Speicher blockiert'));
  });
 }
 private async read(account:string):Promise<unknown>{
  const db=await this.open();
  try{return await new Promise((resolve,reject)=>{
   const transaction=db.transaction('images','readonly'),request=transaction.objectStore('images').get(account);
   transaction.oncomplete=()=>resolve(request.result);
   transaction.onerror=transaction.onabort=()=>reject(new Error('Lesen fehlgeschlagen'));
  });}finally{db.close();}
 }
 private async store(account:string,blob:Blob|null):Promise<void>{
  const db=await this.open();
  try{return await new Promise((resolve,reject)=>{
   const transaction=db.transaction('images','readwrite'),store=transaction.objectStore('images');
   if(blob)store.put(blob,account);else store.delete(account);
   transaction.oncomplete=()=>resolve();
   transaction.onerror=transaction.onabort=()=>reject(new Error('Speichern fehlgeschlagen'));
  });}finally{db.close();}
 }
 private async prepare(file:File):Promise<Blob>{
  if(!this.types.includes(file.type))throw new Error('Bitte ein JPG-, PNG- oder WebP-Bild auswählen.');
  if(file.size>10*1024*1024)throw new Error('Das Bild darf höchstens 10 MB groß sein.');
  const url=URL.createObjectURL(file);
  try{
   const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Das Bild konnte nicht gelesen werden.'));image.src=url;});
   if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw new Error('Das Bild ist zu groß. Bitte ein Bild mit höchstens 40 Megapixeln auswählen.');
   const scale=Math.min(1,1920/Math.max(image.naturalWidth,image.naturalHeight));
   const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
   const context=canvas.getContext('2d');if(!context)throw new Error('Bildverarbeitung ist in diesem Browser nicht verfügbar.');
   context.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Das Bild konnte nicht verarbeitet werden.')),'image/webp',.85));
   if(blob.size>3*1024*1024)throw new Error('Das Bild ist nach der Verarbeitung zu groß. Bitte ein kleineres Bild auswählen.');
   return blob;
  }finally{URL.revokeObjectURL(url);}
 }
 async upload(file:File):Promise<void>{
  if(this.busy)return;
  const account=this.account,revision=++this.revision;
  if(!account){this.error='Bitte melde dich erneut an, um ein Hintergrundbild zu speichern.';return;}
  this.busy=true;this.error='';this.notice='';
  try{const blob=await this.prepare(file);if(this.revision!==revision)return;try{await this.store(account,blob);}catch{throw new Error('Speichern fehlgeschlagen');}if(this.revision===revision){this.apply(blob);this.cloudSaved=false;this.setMode(account,'local');}}
  catch(e:any){if(this.revision===revision)this.error=e?.message==='Speichern fehlgeschlagen'?'Das Bild konnte nicht in diesem Browser gespeichert werden. Das bisherige Bild bleibt erhalten.':e?.message||'Hintergrundbild konnte nicht gespeichert werden.';}
  finally{if(this.revision===revision)this.busy=false;}
 }
 async remove():Promise<boolean>{
  if(this.busy)return false;
  const account=this.account,revision=++this.revision;
  if(!account)return true;
  this.busy=true;this.error='';
  try{await this.store(account,null);if(this.revision===revision){this.apply(null);this.cloudSaved=false;this.setMode(account,'local');this.notice='Hintergrundbild in diesem Browser entfernt. Ein Kontobild bleibt unverändert.';return true;}return false;}
  catch{if(this.revision===revision)this.error='Das Hintergrundbild konnte nicht entfernt werden. Bitte erneut versuchen.';return false;}
  finally{if(this.revision===revision)this.busy=false;}
 }
}
