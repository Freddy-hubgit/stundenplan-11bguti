import {Component,Input,OnChanges,OnDestroy} from '@angular/core';
import {Subscription} from 'rxjs';
import {SupabaseService} from '../supabase.service';
@Component({selector:'app-avatar',template:'<img *ngIf="url;else initials" [src]="url" alt="" (error)="url=null"><ng-template #initials><span aria-hidden="true">{{initial}}</span></ng-template>',styles:[':host{display:inline-flex;width:40px;height:40px;flex-shrink:0;border-radius:50%;overflow:hidden;background:var(--surface-2,#1c353c);color:var(--accent,#70d9e5);align-items:center;justify-content:center;vertical-align:middle;font-weight:600}img{width:100%;height:100%;object-fit:cover}']})
export class AvatarComponent implements OnChanges,OnDestroy{
 @Input() account='';@Input() name='';url:string|null=null;private request=0;private subscription:Subscription;
 get initial():string{return (this.name.trim().charAt(0)||'?').toLocaleUpperCase('de');}
 constructor(private api:SupabaseService){this.subscription=api.avatarChanges.subscribe(id=>{if(id===this.account)void this.load();});}
 ngOnChanges():void{this.url=null;void this.load();}
 private async load():Promise<void>{const request=++this.request;try{const url=await this.api.profilePictureUrl(this.account);if(request===this.request)this.url=url;}catch{if(request===this.request)this.url=null;}}
 ngOnDestroy():void{this.request++;this.subscription.unsubscribe();}
}
