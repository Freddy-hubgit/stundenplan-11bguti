import {Component,OnInit} from '@angular/core';import {SupabaseService,Profile,hasRole} from '../supabase.service';import {SettingsService} from '../settings.service';import {dateKey} from '../substitution.service';
interface Room{id:string;name:string;details:string;bookable:boolean;}
interface Slot{id:string|null;room_id:string;label:string;starts_at:string;ends_at:string;can_cancel:boolean;teaching:boolean;}
@Component({selector:'app-room-booking',templateUrl:'./room-booking.component.html',styleUrls:['../portal-home/portal-home.component.css','../homework/homework.component.css','./room-booking.component.css']})
export class RoomBookingComponent implements OnInit{
 profile:Profile|null=null;rooms:Room[]=[];slots:Slot[]=[];day=dateKey(new Date());room='';title='';from='15:00';to='16:00';busy=false;error='';success='';editing:string|null=null;roomName='';roomInfo='';enabled=false;
 constructor(private api:SupabaseService,public settings:SettingsService){}
 get isAdmin():boolean{return hasRole(this.profile,'admin');}get bookable():Room[]{return this.rooms.filter(r=>r.bookable);}
 async ngOnInit():Promise<void>{try{this.profile=await this.api.getMyProfile();await this.refresh();}catch(e:any){this.error=e?.message||'Profil konnte nicht geladen werden.';}}
 async refresh():Promise<void>{if(this.busy)return;this.busy=true;this.error='';try{await this.load();}catch(e:any){this.error=e?.message||'Raumbelegung nicht verfügbar.';}finally{this.busy=false;}}
 private async load():Promise<void>{const [rooms,slots]=await Promise.all([this.api.supportRpc<Room[]>('school_rooms'),this.api.supportRpc<Slot[]>('school_room_slots',{day:this.day})]);this.rooms=rooms;this.slots=slots.sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));}
 roomSlots(id:string):Slot[]{return this.slots.filter(s=>s.room_id===id);}
 editRoom(room?:Room):void{this.editing=room?.id||null;this.roomName=room?.name||'';this.roomInfo=room?.details||'';this.enabled=room?.bookable||false;}
 async act(action:()=>Promise<unknown>,message:string):Promise<void>{if(this.busy)return;this.busy=true;this.error='';this.success='';try{await action();await this.load();this.success=message;}catch(e:any){this.error=e?.message||'Aktion fehlgeschlagen. Eingaben bleiben erhalten.';}finally{this.busy=false;}}
 saveRoom():Promise<void>{return this.act(async()=>{await this.api.supportRpc('school_room_save',{target:this.editing,label:this.roomName,info:this.roomInfo,enabled:this.enabled});this.editRoom();},'Raum gespeichert.');}
 book():Promise<void>{return this.act(async()=>{const from=new Date(this.day+'T'+this.from+':00'),to=new Date(this.day+'T'+this.to+':00');if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime()))throw new Error('Bitte gültige Uhrzeiten wählen.');await this.api.supportRpc('school_room_book',{target:this.room,label:this.title,from_time:from.toISOString(),to_time:to.toISOString()});this.title='';},'Raum gebucht.');}
 cancel(slot:Slot):Promise<void>{if(!slot.id||!slot.can_cancel||!confirm('Diese Raumbuchung stornieren?'))return Promise.resolve();return this.act(()=>this.api.supportRpc('school_room_cancel',{booking:slot.id}),'Buchung storniert.');}
}
