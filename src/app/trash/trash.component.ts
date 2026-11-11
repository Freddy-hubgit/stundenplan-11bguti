import {learningError} from '../learning-errors';
import {Component,OnInit} from '@angular/core';import {SupabaseService} from '../supabase.service';import {SettingsService} from '../settings.service';
interface Item{id:string;kind:string;title:string;deleted_at:string;expires_at:string;}
@Component({selector:'app-trash',templateUrl:'./trash.component.html',styleUrls:['../portal-home/portal-home.component.css','../learning.css']})
export class TrashComponent implements OnInit{
 items:Item[]=[];busy=false;loading=true;error='';success='';purging='';labels:Record<string,string>={notebook:'Heftseite',material:'Material',exam:'Prüfung',homework:'Hausaufgabe'};
 constructor(private api:SupabaseService,public settings:SettingsService){}
 async ngOnInit():Promise<void>{await this.act('refresh');this.loading=false;}
 async act(action:'refresh'|'restore'|'purge',id?:string):Promise<void>{if(this.busy)return;this.busy=true;this.error='';this.success='';try{if(action!=='refresh'){await this.api.supportRpc(action==='restore'?'portal_trash_restore':'portal_trash_purge',{item:id});this.success=action==='restore'?'Eintrag wiederhergestellt.':'Eintrag endgültig gelöscht.';this.purging='';}this.items=await this.api.supportRpc('portal_trash_list');}catch(e:any){this.error=learningError(e,'Papierkorb konnte nicht geladen werden. Bitte Einrichtung prüfen.');}finally{this.busy=false;}}
}
