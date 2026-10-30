import {PushNotificationsService} from '../push-notifications.service';
import {Component} from '@angular/core';
import {NotificationsService} from '../notifications.service';
import {SettingsService} from '../settings.service';
@Component({selector:'app-notifications',templateUrl:'./notifications.component.html',styleUrls:['../portal-home/portal-home.component.css','../homework/homework.component.css','./notifications.component.css']})
export class NotificationsComponent {
 constructor(public notifications:NotificationsService,public settings:SettingsService,public push:PushNotificationsService){void notifications.refresh();void push.refreshAlerts();}
 safeRoute(route:string):string{return route==='/krankmeldung'?route:'/stundenplan';}
}
