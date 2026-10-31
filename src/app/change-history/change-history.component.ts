import {Component,OnInit} from '@angular/core';import {SupabaseService} from '../supabase.service';import {SettingsService} from '../settings.service';
interface Change{id:number;actor_name:string;entity:string;record_key:string;record_label:string;action:string;before_value:any;after_value:any;created_at:string;reverted_by:number|null;}
@Component({selector:'app-change-history',templateUrl:'./change-history.component.html',styleUrls:['../portal-home/portal-home.component.css','../homework/homework.component.css','./change-history.component.css']})
export class ChangeHistoryComponent implements OnInit{
 changes:Change[]=[];filter='';busy=false;error='';success='';more=true;
 entities=[{key:'school_schedule',label:'Stundenpläne'},{key:'profiles',label:'Kontorollen'},{key:'school_member',label:'Klassenzuordnungen'},{key:'school_group',label:'Klassen und Kurse'},{key:'teacher_absence',label:'Krankmeldungen'},{key:'substitution_entry',label:'Vertretungen'},{key:'school_room',label:'Räume'},{key:'room_booking',label:'Raumbuchungen'}];
 constructor(private api:SupabaseService,public settings:SettingsService){}
 name(entity:string):string{return this.entities.find(e=>e.key===entity)?.label||entity;}
 describe(value:any,entity:string):string[]{
  if(!value)return ['Kein Eintrag'];
  const days:Record<string,string>={Mon:'Montag',Tue:'Dienstag',Wed:'Mittwoch',Thu:'Donnerstag',Fri:'Freitag',Sat:'Samstag',Sun:'Sonntag'};
  const roles:Record<string,string>={user:'Nutzer',teacher:'Lehrer',support:'Support',admin:'Admin'};
  if(entity==='school_schedule')return (value.lessons||[]).length?(value.lessons||[]).map((l:any)=>`${days[l.day]||l.day} ${l.start}–${l.end} · ${l.subject} · ${l.teacher} · Raum ${l.room}`):['Keine Stunden eingetragen'];
  if(entity==='profiles')return ['Rollen: '+(value.roles||[value.role]).map((r:string)=>roles[r]||r).join(', ')];
  if(entity==='school_group')return [value.name,value.kind==='class'?'Klasse':'Kurs',value.grade?'Jahrgang '+value.grade:'',value.focus||''].filter(Boolean);
  if(entity==='school_member')return [value.member_kind==='teacher'?'Als Lehrkraft zugeordnet':'Als Schüler zugeordnet'];
  if(entity==='school_room')return [value.name,value.bookable?'Zur Buchung freigegeben':'Nicht buchbar',value.details].filter(Boolean);
  if(entity==='room_booking')return [value.title,new Date(value.starts_at).toLocaleString('de-DE')+' – '+new Date(value.ends_at).toLocaleString('de-DE')];
  const result=[value.teacher_name||value.teacher,(value.start_date||value.date)+' – '+(value.end_date||value.date),(value.starts||value.start_time)+'–'+(value.ends||value.end_time)];
  if(value.status)result.push(value.status==='reported'?'Offener Antrag':'Bestätigt');
  if(value.kind||value.resolution)result.push((value.kind||value.resolution)==='replacement'?'Vertretung: '+value.replacement_teacher:'Entfall');
  if(value.excluded_dates?.length)result.push('Regulärer Unterricht an: '+value.excluded_dates.join(', '));
  return result.filter(Boolean);
 }
 actionLabel(action:string):string{return ({INSERT:'Angelegt',UPDATE:'Geändert',DELETE:'Gelöscht'} as Record<string,string>)[action]||action;}
 async ngOnInit():Promise<void>{await this.load();}
 async load(append=false):Promise<void>{if(this.busy)return;this.busy=true;this.error='';try{const rows=await this.api.supportRpc<Change[]>('portal_changes',{before_id:append?this.changes[this.changes.length-1]?.id||null:null,entity_filter:this.filter});this.changes=append?this.changes.concat(rows):rows;this.more=rows.length===50;}catch(e:any){this.error=e?.message||'Änderungsverlauf konnte nicht geladen werden.';}finally{this.busy=false;}}
 async undo(change:Change):Promise<void>{if(this.busy||!confirm('Diese Stundenplanänderung rückgängig machen? Die Datenbank prüft vorher, ob inzwischen weitere Änderungen erfolgt sind.'))return;this.busy=true;this.error='';this.success='';try{await this.api.supportRpc('portal_change_undo',{change_id:change.id});this.success='Stundenplanänderung rückgängig gemacht.';}catch(e:any){this.error=e?.message||'Rückgängig nicht möglich.';}finally{this.busy=false;}if(!this.error)await this.load();}
}
