import { NotificationsService } from './notifications.service';
import { PushNotificationsService } from './push-notifications.service';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { BackgroundImageService } from './background-image.service';
import { SettingsService } from './settings.service';
import { SupabaseService } from './supabase.service';
@Component({selector:'app-root',templateUrl:'./app.component.html'})
export class AppComponent implements OnInit,OnDestroy {
 private unsubscribe?:()=>void;
 constructor(public background:BackgroundImageService,public settings:SettingsService,private auth:SupabaseService,private push:PushNotificationsService,public notifications:NotificationsService){}
 ngOnInit():void{
  let eventSeen=false;
  const subscription=this.auth.onAuthStateChange(session=>{eventSeen=true;this.notifications.activate(session?.user.id??null);this.background.activate(session?.user.id??null);this.push.activate(session?.user.id??null);});
  this.unsubscribe=()=>subscription.data.subscription.unsubscribe();
  void this.auth.getSession().then(session=>{if(!eventSeen){this.notifications.activate(session?.user.id??null);this.background.activate(session?.user.id??null);this.push.activate(session?.user.id??null);}}).catch(()=>{if(!eventSeen){this.notifications.activate(null);this.background.activate(null);this.push.activate(null);}});
 }
 ngOnDestroy():void{this.unsubscribe?.();this.notifications.activate(null);}
}
