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
 selected: DirectThread | null=null;
 search=''; loading=true; busy=false; messagesLoading=false; settingsOpen=false;
 error=''; refreshError='';
 private drafts: Record<string,string>={};
 private timer?:ReturnType<typeof setInterval>;
 private refreshing=false; private destroyed=false; private revision=0;
 constructor(private auth:SupabaseService,private api:MessagesService,public settings:SettingsService){}
 get draft():string{return this.selected?this.drafts[this.selected.id]||'':'';}
 set draft(value:string){if(this.selected)this.drafts[this.selected.id]=value;}
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
  this.refreshing=true;const revision=this.revision,id=this.selected?.id;
  try{
   const [people,threads,messages]=await Promise.all([this.api.people(),this.api.threads(),id?this.api.messages(id):Promise.resolve([])]);
   if(this.destroyed||revision!==this.revision)return;
   this.people=people;this.threads=threads;
   if(id){this.followNewMessages();this.selected=threads.find(t=>t.id===id)??null;this.messages=this.selected?messages:[];}
   this.refreshError='';
  }catch{this.refreshError='Chats konnten nicht aktualisiert werden. Bitte erneut laden.';}finally{this.refreshing=false;}
 }
 async select(thread:DirectThread):Promise<void>{
  if(this.busy)return;
  const revision=++this.revision;this.selected=thread;this.messages=[];this.messagesLoading=true;this.error='';
  try{const messages=await this.api.messages(thread.id);if(!this.destroyed&&revision===this.revision){this.messages=messages;this.followNewMessages(true);}}
  catch(e){if(revision===this.revision)this.showError(e);}finally{if(revision===this.revision)this.messagesLoading=false;}
 }
 async open(person:ChatPerson):Promise<void>{
  if(this.busy||this.messagesLoading)return;
  this.busy=true;this.revision++;this.error='';
  try{const id=await this.api.open(person.id);this.threads=await this.api.threads();const thread=this.threads.find(t=>t.id===id);
   if(!thread)throw new Error('Chat fehlt');this.busy=false;await this.select(thread);
  }catch(e){this.showError(e);}finally{this.busy=false;}
 }
 async send():Promise<void>{
  if(this.busy||this.messagesLoading||!this.selected||!this.draft.trim())return;
  const id=this.selected.id,body=this.draft.trim();this.busy=true;this.revision++;this.error='';
  try{await this.api.send(id,body);this.drafts[id]='';this.messages=await this.api.messages(id);this.followNewMessages(true);this.threads=await this.api.threads();}
  catch(e){this.showError(e);}finally{this.busy=false;}
 }
 trackId(_:number,item:{id:string}):string{return item.id;}
 private showError(e:any):void{this.error=e?.code==='PGRST202'?'Die Nachrichtenfunktion muss noch in Supabase eingerichtet werden.':'Die Aktion ist fehlgeschlagen. Bitte erneut versuchen. Nicht gesendete Eingaben bleiben erhalten.';}
}
