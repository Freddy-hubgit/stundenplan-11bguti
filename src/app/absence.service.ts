import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
export interface TeacherIdentity {user_id:string;full_name:string;timetable_name:string;}
export interface TeacherAbsence {id:string;teacher_id:string;teacher_name:string;start_date:string;end_date:string;starts:string;ends:string;requested_teacher:string;status:string;resolution:string;replacement_teacher:string;}
@Injectable({providedIn:'root'})
export class AbsenceService {
 constructor(private api:SupabaseService){}
 identities():Promise<TeacherIdentity[]>{return this.api.supportRpc('absence_identities');}
 assign(person:string,teacher:string):Promise<void>{return this.api.supportRpc('absence_set_identity',{person,teacher});}
 list():Promise<TeacherAbsence[]>{return this.api.supportRpc('absence_list');}
 report(first_day:string,last_day:string,from_time:string,to_time:string,wish:string):Promise<string>{return this.api.supportRpc('absence_report',{first_day,last_day,from_time,to_time,wish});}
 resolve(report:string,kind:string,replacement:string):Promise<void>{return this.api.supportRpc('absence_resolve',{report,kind,replacement});}
}
