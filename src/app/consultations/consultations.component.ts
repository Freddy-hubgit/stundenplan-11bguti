import {learningError} from '../learning-errors';
import {Component,OnInit} from '@angular/core';import {SupabaseService,hasRole} from '../supabase.service';import {SettingsService} from '../settings.service';
interface Slot{id:string;teacher_id:string;teacher_name:string;starts_at:string;ends_at:string;location:string;booking_id:string|null;student_name:string|null;topic:string|null;available:boolean;can_manage:boolean;can_cancel:boolean;}
@Component({selector:'app-consultations',templateUrl:'./consultations.component.html',styleUrls:['../portal-home/portal-home.component.css','../learning.css']})
export class ConsultationsComponent implements OnInit{
 slots:Slot[]=[];teacher=false;student=false;busy=false;loading=true;error='';success='';filter='';onlyMine=false;booking='';topic='';confirm='';draft={starts:'',ends:'',location:''};
 constructor(private api:SupabaseService,public settings:SettingsService){}
 get teachers():string[]{return Array.from(new Set(this.slots.map(s=>s.teacher_name))).sort((a,b)=>a.localeCompare(b,'de'));}
 get visible():Slot[]{return this.slots.filter(s=>(!this.filter||s.teacher_name===this.filter)&&(!this.onlyMine||s.can_manage||!!s.booking_id));}
 async ngOnInit():Promise<void>{try{const profile=await this.api.getMyProfile();this.teacher=hasRole(profile,'teacher');this.student=hasRole(profile,'user');await this.load();}catch(e:any){this.error=learningError(e,'Sprechstunden konnten nicht geladen werden. Bitte Einrichtung prüfen.');}finally{this.loading=false;}}
 private async load():Promise<void>{this.slots=await this.api.supportRpc('consultation_list');}
 async act(action:'refresh'|'offer'|'book'|'cancelBooking'|'cancelSlot',slot?:Slot):Promise<void>{if(this.busy)return;this.busy=true;this.error='';this.success='';try{
 if(action==='offer'){await this.api.supportRpc('consultation_offer',{starts:new Date(this.draft.starts).toISOString(),ends:new Date(this.draft.ends).toISOString(),place:this.draft.location});this.draft={starts:'',ends:'',location:''};this.success='Sprechstunde angeboten.';}
 if(action==='book'){await this.api.supportRpc('consultation_book',{slot:this.booking,details:this.topic});this.booking='';this.topic='';this.success='Sprechstunde gebucht.';}
 if(action==='cancelBooking'&&slot){await this.api.supportRpc('consultation_cancel',{booking:slot.booking_id,slot:null});this.success='Buchung abgesagt.';}
 if(action==='cancelSlot'&&slot){await this.api.supportRpc('consultation_cancel',{booking:null,slot:slot.id});this.success='Sprechstunde samt Buchung abgesagt.';}
 await this.load();this.confirm='';
 }catch(e:any){this.error=learningError(e,'Aktion fehlgeschlagen. Eingaben bleiben erhalten.');}finally{this.busy=false;}}
}
