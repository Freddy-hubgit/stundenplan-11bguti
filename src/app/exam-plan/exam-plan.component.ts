import {Component,Input,OnInit} from '@angular/core';import {SchoolService,SchoolExam} from '../school.service';import {dateKey} from '../substitution.service';
@Component({selector:'app-exam-plan',templateUrl:'./exam-plan.component.html',styleUrls:['./exam-plan.component.css']})
export class ExamPlanComponent implements OnInit{
 @Input() dates:string[]=[];all=false;editor=false;busy=false;error='';deleting='';conflicts:number|null=null;
 draft={id:'',group_id:'',title:'',subject:'',date:dateKey(new Date()),starts:'07:30',ends:'09:00',room:'',details:''};
 constructor(public school:SchoolService){}
 get visible():SchoolExam[]{return this.school.exams.filter(e=>(this.all||this.dates.includes(e.date))&&this.relevant(e));}
 relevant(e:SchoolExam):boolean{const g=this.school.groups.find(x=>x.id===e.group_id);if(this.school.groups.find(x=>x.id===this.school.classId)?.kind==='course')return e.group_id===this.school.classId;return !this.school.classId||e.group_id===this.school.classId||g?.parent_id===this.school.classId||g?.kind==='course'&&!g.parent_id;}
 async ngOnInit():Promise<void>{try{if(!this.school.ready)await this.school.load();await this.school.loadExams();if(!this.dates.includes(this.draft.date))this.draft.date=this.dates[0]||this.draft.date;this.draft.group_id=this.school.teaching.find(g=>g.id===this.school.classId)?.id||this.school.teaching[0]?.id||'';}catch{this.error='Prüfungen konnten nicht geladen werden. Bitte Supabase-Einrichtung prüfen.';}}
 async refresh():Promise<void>{if(this.busy)return;this.error='';try{await this.school.loadExams();}catch{this.error='Prüfungen konnten nicht aktualisiert werden.';}}
 canEdit(e:SchoolExam):boolean{return this.school.isAdmin||(e.author_id===this.school.profile?.id&&this.school.teaching.some(g=>g.id===e.group_id));}
 edit(e:SchoolExam):void{this.draft={...e};this.editor=true;this.conflicts=null;}
 async check():Promise<void>{this.error='';try{this.conflicts=await this.school.api.supportRpc('school_exam_conflicts',{target:this.draft.group_id,day:this.draft.date,except_exam:this.draft.id||null});}catch{this.error='Prüfungsüberschneidungen konnten nicht geprüft werden.';}}
 async save():Promise<void>{if(this.busy)return;this.busy=true;this.error='';try{await this.school.saveExam(this.draft);await this.school.loadExams();this.editor=false;this.draft={...this.draft,id:'',title:'',details:''};}catch(e:any){this.error=e?.message||'Prüfung konnte nicht gespeichert werden.';}finally{this.busy=false;}}
 async remove(e:SchoolExam):Promise<void>{if(this.busy)return;this.busy=true;try{await this.school.deleteExam(e.id);await this.school.loadExams();this.deleting='';}catch{this.error='Prüfung konnte nicht gelöscht werden.';}finally{this.busy=false;}}
}
