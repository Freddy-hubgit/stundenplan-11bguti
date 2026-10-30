import { Injectable, OnDestroy } from '@angular/core';
import { SupabaseService } from './supabase.service';
export interface PortalNotification {id:string;title:string;body:string;route:string;read_at:string|null;created_at:string;}
@Injectable({providedIn:'root'})
export class NotificationsService implements OnDestroy {
 account:string|null=null;items:PortalNotification[]=[];error='';private timer?:ReturnType<typeof setInterval>;private generation=0;
 constructor(private api:SupabaseService){}
 get unread():number{return this.items.filter(n=>!n.read_at).length;}
 activate(account:string|null):void{if(account===this.account)return;this.account=account;this.items=[];this.error='';this.generation++;clearInterval(this.timer);if(account){setTimeout(()=>void this.refresh(),0);this.timer=setInterval(()=>void this.refresh(),15000);}}
 async refresh():Promise<void>{if(!this.account)return;const generation=this.generation;try{const items=await this.api.supportRpc<PortalNotification[]>('portal_notifications');if(generation===this.generation){this.items=items;this.error='';}}catch{if(generation===this.generation)this.error='Benachrichtigungen konnten nicht geladen werden. Bitte prüfen, ob Migration 013 eingerichtet ist.';}}
 async read(item:PortalNotification):Promise<void>{const generation=this.generation;try{await this.api.supportRpc('portal_notification_read',{notification:item.id});if(generation===this.generation)item.read_at=new Date().toISOString();}catch{if(generation===this.generation)this.error='Benachrichtigung konnte nicht als gelesen markiert werden.';}}
 ngOnDestroy():void{clearInterval(this.timer);}
}
