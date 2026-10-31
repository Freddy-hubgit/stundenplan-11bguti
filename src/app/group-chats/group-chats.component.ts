import {Component,OnInit,OnDestroy,ViewChild,ElementRef} from '@angular/core';
import {SupabaseService,Profile} from '../supabase.service';
import {ChatPerson,DirectMessage} from '../messages.service';
interface Group{id:string;name:string;owner_id:string;member_count:number;unread:number;}
@Component({selector:'app-group-chats',templateUrl:'./group-chats.component.html',styleUrls:['../messages/messages.component.css','./group-chats.component.css']})
export class GroupChatsComponent implements OnInit,OnDestroy{
 @ViewChild('groupLog') log?:ElementRef<HTMLElement>;
 profile:Profile|null=null;groups:Group[]=[];people:ChatPerson[]=[];selected:Group|null=null;messages:DirectMessage[]=[];members:{user_id:string;full_name:string}[]=[];
 creating=false;label='';first='';invite:Record<string,boolean>={};drafts:Record<string,string>={};member='';groupName='';error='';busy=false;loading=true;search='';private timer?:ReturnType<typeof setInterval>;private revision=0;private destroyed=false;private refreshing=false;
 constructor(private api:SupabaseService){}
 trackMessage(_:number,msg:DirectMessage):string{return msg.id;}
 get draft():string{return this.selected?this.drafts[this.selected.id]||'':'';}set draft(v:string){if(this.selected)this.drafts[this.selected.id]=v;}
 get owner():boolean{return !!this.selected&&this.selected.owner_id===this.profile?.id;}
 get candidates():ChatPerson[]{return this.people.filter(p=>(p.full_name||'').toLocaleLowerCase('de').includes(this.search.toLocaleLowerCase('de')));}
 async ngOnInit():Promise<void>{try{this.profile=await this.api.getMyProfile();this.people=await this.api.supportRpc('dm_people');await this.refresh();this.timer=setInterval(()=>{if(!this.busy)void this.refresh();},4000);}catch(e:any){this.error=e?.message||'Gruppen konnten nicht geladen werden.';}finally{this.loading=false;}}
 ngOnDestroy():void{this.destroyed=true;this.revision++;clearInterval(this.timer);}
 async refresh():Promise<void>{if(this.refreshing||this.destroyed)return;this.refreshing=true;const revision=this.revision;try{const groups=await this.api.supportRpc<Group[]>('chat_groups');if(this.destroyed||revision!==this.revision)return;this.groups=groups;if(this.selected){const selected=groups.find(g=>g.id===this.selected?.id);if(!selected){this.selected=null;this.messages=[];this.members=[];return;}this.selected=selected;await this.loadChat(revision);}}catch(e:any){this.error=e?.message||'Gruppen konnten nicht aktualisiert werden.';}finally{this.refreshing=false;}}
 private async loadChat(revision:number):Promise<void>{if(!this.selected)return;const target=this.selected.id,element=this.log?.nativeElement,follow=!element||element.scrollHeight-element.scrollTop-element.clientHeight<70;const [messages,members]=await Promise.all([this.api.supportRpc<DirectMessage[]>('chat_group_messages',{target}),this.api.supportRpc<{user_id:string;full_name:string}[]>('chat_group_roster',{target})]);if(!this.destroyed&&revision===this.revision&&this.selected?.id===target){this.messages=messages;this.members=members;if(follow)requestAnimationFrame(()=>{const log=this.log?.nativeElement;if(log)log.scrollTop=log.scrollHeight;});}}
 async select(g:Group):Promise<void>{if(this.busy)return;this.revision++;this.selected=g;this.creating=false;this.messages=[];this.members=[];this.groupName=g.name;this.error='';try{await this.loadChat(this.revision);}catch(e:any){this.error=e?.message||'Chat nicht verfügbar.';}}
 newGroup():void{if(this.busy)return;this.revision++;this.selected=null;this.creating=true;this.error='';}
 async act(action:()=>Promise<void>):Promise<void>{if(this.busy)return;this.busy=true;this.error='';try{await action();await this.refresh();}catch(e:any){this.error=e?.message||'Aktion fehlgeschlagen. Eingaben bleiben erhalten.';}finally{this.busy=false;}}
 create():Promise<void>{return this.act(async()=>{const id=await this.api.supportRpc<string>('chat_group_start',{label:this.label,people:Object.keys(this.invite).filter(id=>this.invite[id]),message_body:this.first});this.label='';this.first='';this.invite={};this.groups=await this.api.supportRpc('chat_groups');const g=this.groups.find(g=>g.id===id);if(g)await this.selectCreated(g);});}
 private async selectCreated(g:Group):Promise<void>{this.revision++;this.selected=g;this.creating=false;this.groupName=g.name;await this.loadChat(this.revision);}
 send():Promise<void>{if(!this.selected||!this.draft.trim())return Promise.resolve();const target=this.selected.id,body=this.draft;return this.act(async()=>{await this.api.supportRpc('chat_group_send',{target,message_body:body});this.drafts[target]='';});}
 manage(person:string|null=null,remove_person=false):Promise<void>{if(!this.selected||!this.owner)return Promise.resolve();if(remove_person&&!confirm('Dieses Mitglied aus der Gruppe entfernen?'))return Promise.resolve();return this.act(async()=>{await this.api.supportRpc('chat_group_manage',{target:this.selected!.id,label:this.groupName,person,remove_person});this.member='';});}
 leave():Promise<void>{if(!this.selected||!confirm(this.owner?'Gruppe samt Nachrichten für alle Mitglieder löschen?':'Gruppe verlassen? Du verlierst den Zugriff auf den Verlauf.'))return Promise.resolve();return this.act(async()=>{await this.api.supportRpc('chat_group_leave',{target:this.selected!.id,delete_group:this.owner});this.revision++;this.selected=null;this.messages=[];});}
}
