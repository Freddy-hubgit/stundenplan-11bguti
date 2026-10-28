import { Injectable } from '@angular/core';

@Injectable({providedIn:'root'})
export class BackgroundImageService {
 url: string | null=null;
 get cssImage():string|null{return this.url?'url("'+this.url+'")':null;}
 busy=false;
 error='';
 private account: string | null=null;
 private revision=0;
 private initialized=false;
 private readonly types=['image/jpeg','image/png','image/webp'];
 activate(account:string|null):void{
  if(this.initialized&&account===this.account)return;
  this.initialized=true;this.account=account;const revision=++this.revision;
  this.apply(null);this.error='';this.busy=!!account;
  if(account)void this.read(account).then(blob=>{
   if(this.revision===revision&&blob instanceof Blob&&this.types.includes(blob.type)&&blob.size<=3*1024*1024)this.apply(blob);
  }).catch(()=>{if(this.revision===revision)this.error='Gespeicherte Hintergrundbilder konnten nicht geladen werden.';}).finally(()=>{if(this.revision===revision)this.busy=false;});
 }
 private apply(blob:Blob|null):void{const previous=this.url;this.url=blob?URL.createObjectURL(blob):null;if(previous)URL.revokeObjectURL(previous);}
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
  this.busy=true;this.error='';
  try{const blob=await this.prepare(file);if(this.revision!==revision)return;try{await this.store(account,blob);}catch{throw new Error('Speichern fehlgeschlagen');}if(this.revision===revision)this.apply(blob);}
  catch(e:any){if(this.revision===revision)this.error=e?.message==='Speichern fehlgeschlagen'?'Das Bild konnte nicht in diesem Browser gespeichert werden. Das bisherige Bild bleibt erhalten.':e?.message||'Hintergrundbild konnte nicht gespeichert werden.';}
  finally{if(this.revision===revision)this.busy=false;}
 }
 async remove():Promise<boolean>{
  if(this.busy)return false;
  const account=this.account,revision=++this.revision;
  if(!account)return true;
  this.busy=true;this.error='';
  try{await this.store(account,null);if(this.revision===revision){this.apply(null);return true;}return false;}
  catch{if(this.revision===revision)this.error='Das Hintergrundbild konnte nicht entfernt werden. Bitte erneut versuchen.';return false;}
  finally{if(this.revision===revision)this.busy=false;}
 }
}
