import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
export interface Homework {id:string;author_id:string;author_name:string;title:string;subject:string;description:string;lesson_date:string;due_date:string;is_shared:boolean;requires_submission:boolean;done:boolean;submitted:boolean;}
export interface HomeworkSubmission {student_id:string;student_name:string;body:string;link:string;file_path:string;file_name:string;submitted_at:string;}
@Injectable({providedIn:'root'})
export class HomeworkService {
 constructor(private api:SupabaseService){}
 list():Promise<Homework[]>{return this.api.supportRpc('hw_tasks');}
 save(draft:{id:string|null;title:string;subject:string;description:string;lesson_date:string;due_date:string;is_shared:boolean;requires_submission:boolean}):Promise<string>{return this.api.supportRpc('hw_save',{task:draft.id,task_title:draft.title,task_subject:draft.subject,details:draft.description,lesson:draft.lesson_date,due:draft.due_date,shared:draft.is_shared,submission_required:draft.requires_submission});}
 done(id:string,completed:boolean):Promise<void>{return this.api.supportRpc('hw_set_done',{task:id,completed});}
 archive(id:string):Promise<void>{return this.api.supportRpc('hw_archive',{task:id});}
 submissions(id:string):Promise<HomeworkSubmission[]>{return this.api.supportRpc('hw_submissions',{task:id});}
 submit(id:string,body:string,link:string,file:string,name:string):Promise<string>{return this.api.supportRpc('hw_submit',{task:id,answer:body,answer_link:link,attachment:file,attachment_name:name});}
}
