import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Profile, SupabaseService } from '../supabase.service';
import { SettingsService } from '../settings.service';
import { ChatPerson, DirectMessage, DirectThread, MessagesService } from '../messages.service';

@Component({ selector: 'app-messages',templateUrl:'./messages.component.html',
 styleUrls:['../portal-home/portal-home.component.css','./messages.component.css'] })
export class MessagesComponent implements OnInit,OnDestroy {
 @ViewChild('messageLog') log?: ElementRef<HTMLElement>;
 profile: Profile | null=null;
 people: ChatPerson[]=[];
 threads: DirectThread[]=[];
 messages: DirectMessage[]=[];
 selected: DirectThread | null=null;pending=false;
 search=''; loading=true; busy=false; messagesLoading=false; settingsOpen=false;
 error=''; refreshError='';
 private drafts: Record<string,string>={};
 private timer?:ReturnType<typeof setInterval>;
 private refreshing=false; private destroyed=false; private revision=0;
 constructor(private auth:SupabaseService,private api:MessagesService,public settings:SettingsService){}
 get draft():string{return this.selected?this.drafts[this.selected.peer_id]||'':'';}
 set draft(value:string){if(this.selected)this.drafts[this.selected.peer_id]=value;}
 get filteredPeople():ChatPerson[]{const q=this.search.trim().toLocaleLowerCase('de');return this.people.filter(p=>(p.full_name+' '+this.roleLabel(p.role)).toLocaleLowerCase('de').includes(q));}
 roleLabel(role:string):string{return ({user:'Nutzer',teacher:'Lehrer',support:'Support',admin:'Admin'} as Record<string,string>)[role]||'Nutzer';}
 async ngOnInit():Promise<void>{
  try{
   this.profile=await this.auth.getMyProfile();
   if(!this.profile)throw new Error('Profil fehlt');
   [this.people,this.threads]=await Promise.all([this.api.people(),this.api.threads()]);
   if(!this.destroyed)this.timer=setInterval(()=>{if(!this.busy&&!this.messagesLoading)void this.refresh();},4000);
  }catch(e){this.showError(e);}finally{this.loading=false;}
 }
 ngOnDestroy():void{this.destroyed=true;this.revision++;clearInterval(this.timer);}
 private followNewMessages(force=false):void{
  const element=this.log?.nativeElement;
  const follow=force||!element||element.scrollHeight-element.scrollTop-element.clientHeight<70;
  if(follow)requestAnimationFrame(()=>{const log=this.log?.nativeElement;if(log)log.scrollTop=log.scrollHeight;});
 }
 async refresh():Promise<void>{
  if(this.refreshing||this.destroyed)return;
  this.refreshing=true;const revision=this.revision,id=this.pending?undefined:this.selected?.id,peer=this.selected?.peer_id;
  try{
   const [people,threads,messages]=await Promise.all([this.api.people(),this.api.threads(),id?this.api.messages(id):Promise.resolve([])]);
   if(this.destroyed||revision!==this.revision)return;
   this.people=people;this.threads=threads;
   if(!id&&peer){const existing=threads.find(t=>t.peer_id===peer);if(existing)await this.select(existing);}
   if(id){this.followNewMessages();this.selected=threads.find(t=>t.id===id)??null;this.messages=this.selected?messages:[];}
   this.refreshError='';
  }catch(e){this.refreshError=this.errorText(e,'Chats konnten nicht aktualisiert werden.');}finally{this.refreshing=false;}
 }
 async select(thread:DirectThread):Promise<void>{
  if(this.busy)return;
  const revision=++this.revision;this.selected=thread;this.pending=false;this.messages=[];this.messagesLoading=true;this.error='';
  try{const messages=await this.api.messages(thread.id);if(!this.destroyed&&revision===this.revision){this.messages=messages;this.followNewMessages(true);}}
  catch(e){if(revision===this.revision)this.showError(e);}finally{if(revision===this.revision)this.messagesLoading=false;}
 }
 async open(person:ChatPerson):Promise<void>{
  if(this.busy||this.messagesLoading)return;
  const existing=this.threads.find(t=>t.peer_id===person.id);
  if(existing){await this.select(existing);return;}
  this.revision++;this.error='';this.messages=[];this.pending=true;
  this.selected={id:'draft:'+person.id,peer_id:person.id,peer_name:person.full_name,peer_role:person.role,updated_at:'',last_message:null};
 }
 async send():Promise<void>{
  if(this.busy||this.messagesLoading||!this.selected||!this.draft.trim())return;
  const thread=this.selected,peer=thread.peer_id,body=this.draft.trim();this.busy=true;this.revision++;this.error='';
  try{let id=thread.id;if(this.pending){id=await this.api.start(peer,body);this.selected={...thread,id};this.pending=false;}else await this.api.send(id,body);this.drafts[peer]='';this.messages=await this.api.messages(id);this.followNewMessages(true);this.threads=await this.api.threads();}
  catch(e){this.showError(e);}finally{this.busy=false;}
 }
 trackId(_:number,item:{id:string}):string{return item.id;}
 private errorText(e:any,fallback:string):string{
  const code=typeof e?.code==='string'?e.code.slice(0,40):'';
  if(code==='PGRST202')return 'Bitte die aktuelle Chat-Migration 016 in Supabase ausführen und die Seite erneut laden. (PGRST202)';
  if(['PGRST301','PGRST303'].includes(code))return 'Deine Sitzung ist abgelaufen. Bitte erneut anmelden. ('+code+')';
  const detail=typeof e?.message==='string'?e.message.trim().slice(0,300):'';
  return fallback+(detail?' '+detail:'')+(code?' ('+code+')':'');
 }
 private showError(e:any):void{this.error=this.errorText(e,'Die Chat-Aktion ist fehlgeschlagen.')+' Nicht gesendete Eingaben bleiben erhalten.';}

}
