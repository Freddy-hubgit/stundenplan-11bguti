import {learningError} from '../learning-errors';
import {Component} from '@angular/core';import {SupabaseService} from '../supabase.service';import {SettingsService} from '../settings.service';
interface Result{kind:string;id:string;title:string;preview:string;route:string;}
@Component({selector:'app-portal-search',templateUrl:'./portal-search.component.html',styleUrls:['../portal-home/portal-home.component.css','../learning.css']})
export class PortalSearchComponent{
 query='';filter='';results:Result[]=[];busy=false;searched=false;error='';
 constructor(private api:SupabaseService,public settings:SettingsService){}
 get visible():Result[]{return this.results.filter(r=>!this.filter||r.kind===this.filter);}
 async search():Promise<void>{if(this.busy||this.query.trim().length<2)return;this.busy=true;this.error='';try{this.results=await this.api.supportRpc('portal_search',{query:this.query.trim()});this.searched=true;}catch(e:any){this.error=learningError(e,'Suche fehlgeschlagen. Bitte Einrichtung prüfen.');}finally{this.busy=false;}}
}
