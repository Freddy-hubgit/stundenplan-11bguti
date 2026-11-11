import {CanDeactivate,ActivatedRoute,ActivatedRouteSnapshot,RouterStateSnapshot} from '@angular/router';
import {Component,OnInit,HostListener,Injectable} from '@angular/core';import {SupabaseService} from '../supabase.service';import {SettingsService} from '../settings.service';import {dateKey} from '../substitution.service';
interface Page{id:string;subject:string;title:string;body:string;page_date:string;pinned:boolean;revision:number;updated_at:string;}
interface Draft{id:string|null;revision:number|null;subject:string;title:string;body:string;page_date:string;pinned:boolean;}
@Component({selector:'app-notebooks',templateUrl:'./notebooks.component.html',styleUrls:['../portal-home/portal-home.component.css','../homework/homework.component.css','./notebooks.component.css']})
export class NotebooksComponent implements OnInit{
 pages:Page[]=[];subjects:string[]=[];active='';search='';newSubject='';editor=false;busy=false;loading=true;error='';success='';deleting='';draft:Draft=this.blank();private snapshot='';
 constructor(private api:SupabaseService,public settings:SettingsService,private route:ActivatedRoute){}
 private blank():Draft{return {id:null,revision:null,subject:this.active||'',title:'',body:'',page_date:dateKey(new Date()),pinned:false};}
 get title():string{return this.active?this.active+' – Heft':'Allgemeines Heft';}
 get dirty():boolean{return this.editor&&JSON.stringify(this.draft)!==this.snapshot;}
 get visible():Page[]{const q=this.search.trim().toLocaleLowerCase('de');return this.pages.filter(p=>p.subject===this.active&&(!q||(p.title+' '+p.body).toLocaleLowerCase('de').includes(q)));}
 get notebookPages():Page[]{return this.pages.filter(p=>p.subject===this.active);}
 count(subject:string):number{return this.pages.filter(p=>p.subject===subject).length;}
 @HostListener('window:beforeunload',['$event']) beforeUnload(event:BeforeUnloadEvent):void{if(this.dirty){event.preventDefault();event.returnValue='';}}
 async ngOnInit():Promise<void>{await this.reload();const item=this.route.snapshot.queryParamMap.get('item');const page=this.pages.find(p=>p.id===item);if(page){this.active=page.subject;this.edit(page);}this.loading=false;}
 private async load():Promise<void>{const [pages,subjects]=await Promise.all([this.api.supportRpc<Page[]>('notebook_pages'),this.api.supportRpc<string[]>('notebook_subjects')]);this.pages=pages;this.subjects=Array.from(new Set([...subjects,...pages.map(p=>p.subject),...(this.active?[this.active]:[])])).filter(Boolean).sort((a,b)=>a.localeCompare(b,'de'));}
 async reload():Promise<void>{if(this.busy)return;this.busy=true;this.error='';try{await this.load();}catch(e:any){this.error=e?.code==='PGRST202'?'Die Hefte müssen noch eingerichtet werden. Bitte einen Admin bitten, Migration 030 auszuführen.':e?.message||'Hefte konnten nicht geladen werden.';}finally{this.busy=false;}}
 canLeave():boolean{return !this.busy&&this.leaveDraft();}
 private leaveDraft():boolean{return !this.dirty||confirm('Nicht gespeicherte Änderungen verwerfen?');}
 choose(subject:string):void{if(this.busy||!this.leaveDraft())return;this.active=subject;this.editor=false;this.search='';this.deleting='';this.error='';this.success='';}
 addSubject():void{const subject=this.newSubject.trim();if(!subject||subject.length>100||this.busy||!this.leaveDraft())return;this.active=subject;this.subjects=Array.from(new Set([...this.subjects,subject])).sort((a,b)=>a.localeCompare(b,'de'));this.newSubject='';this.editor=false;this.newPage();}
 newPage():void{if(this.busy||!this.leaveDraft())return;this.draft=this.blank();this.snapshot=JSON.stringify(this.draft);this.editor=true;this.error='';this.success='';}
 edit(page:Page):void{if(this.busy||!this.leaveDraft())return;this.draft={id:page.id,revision:page.revision,subject:page.subject,title:page.title,body:page.body,page_date:page.page_date,pinned:page.pinned};this.snapshot=JSON.stringify(this.draft);this.editor=true;this.error='';this.success='';requestAnimationFrame(()=>document.getElementById('notebook-editor')?.scrollIntoView({behavior:'smooth',block:'start'}));}
 cancel():void{if(this.leaveDraft())this.editor=false;}
 async save():Promise<void>{if(this.busy)return;this.busy=true;this.error='';this.success='';try{await this.api.supportRpc('notebook_save',{page:this.draft.id,expected_revision:this.draft.revision,subject_name:this.draft.subject,label:this.draft.title,content:this.draft.body,entry_date:this.draft.page_date,is_pinned:this.draft.pinned});this.active=this.draft.subject.trim();this.search='';this.editor=false;this.snapshot='';await this.load();this.success='Seite gespeichert.';}catch(e:any){this.error=e?.message||'Seite konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten.';}finally{this.busy=false;}}
 async remove(page:Page):Promise<void>{if(this.busy)return;this.busy=true;this.error='';try{await this.api.supportRpc('notebook_delete',{page:page.id,expected_revision:page.revision});this.deleting='';if(this.draft.id===page.id)this.editor=false;await this.load();this.success='Seite in den Papierkorb verschoben.';}catch(e:any){this.error=e?.message||'Seite konnte nicht gelöscht werden.';}finally{this.busy=false;}}
 exportNotebook():void{const text=this.title+'\n\n'+this.notebookPages.map(p=>p.page_date+' · '+p.title+'\n\n'+p.body).join('\n\n──────────\n\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=(this.active||'Allgemeines-Heft').replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g,'_')+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}

@Injectable({providedIn:'root'})
export class NotebookLeaveGuard implements CanDeactivate<NotebooksComponent>{canDeactivate(component:NotebooksComponent,_route:ActivatedRouteSnapshot,_state:RouterStateSnapshot,next?:RouterStateSnapshot):boolean{return next?.url.split('?')[0]==='/login'||component.canLeave();}}
