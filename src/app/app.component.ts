import { Component, OnDestroy, OnInit } from '@angular/core';
import { BackgroundImageService } from './background-image.service';
import { SettingsService } from './settings.service';
import { SupabaseService } from './supabase.service';
@Component({selector:'app-root',templateUrl:'./app.component.html'})
export class AppComponent implements OnInit,OnDestroy {
 private unsubscribe?:()=>void;
 constructor(public background:BackgroundImageService,public settings:SettingsService,private auth:SupabaseService){}
 ngOnInit():void{
  let eventSeen=false;
  const subscription=this.auth.onAuthStateChange(session=>{eventSeen=true;this.background.activate(session?.user.id??null);});
  this.unsubscribe=()=>subscription.data.subscription.unsubscribe();
  void this.auth.getSession().then(session=>{if(!eventSeen)this.background.activate(session?.user.id??null);}).catch(()=>{if(!eventSeen)this.background.activate(null);});
 }
 ngOnDestroy():void{this.unsubscribe?.();}
}
