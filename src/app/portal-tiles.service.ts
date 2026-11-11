import {Injectable} from '@angular/core';import {SupabaseService} from './supabase.service';
export const PORTAL_TILE_OPTIONS=[
 {route:'/noten',title:'Notenübersicht'},{route:'/pruefungen',title:'Prüfungskalender'},{route:'/sprechstunden',title:'Sprechstunden'},{route:'/suche',title:'Suche'},{route:'/papierkorb',title:'Papierkorb'},{route:'/lehrerstundenplan',title:'Mein Unterricht'},
 {route:'/hefte',title:'Meine Hefte'},
 {route:'/stundenplan',title:'Stundenplan'},{route:'/klassen',title:'Klassen & Kurse'},{route:'/materialien',title:'Materialablage'},
 {route:'/hausaufgaben',title:'Hausaufgaben'},{route:'/abgaben',title:'Abgabeübersicht'},{route:'/nachrichten',title:'Nachrichten'},
 {route:'/videokonferenz',title:'Videokonferenz'},{route:'/kalender',title:'Kalender'},{route:'/raumbuchung',title:'Raumbuchung'},
 {route:'/meldungen',title:'Benachrichtigungen'},{route:'/krankmeldung',title:'Krankmeldungen'},{route:'/vertretungsplan',title:'Vertretungsplan'},
 {route:'/support',title:'Support & Tickets'},{route:'/aenderungsverlauf',title:'Änderungsverlauf'},{route:'/schuljahr',title:'Schuljahres-Reset'}
];
@Injectable({providedIn:'root'})
export class PortalTilesService{
 disabled:string[]=[];ready=false;private revision=0;
 constructor(private api:SupabaseService){}
 async load():Promise<void>{const revision=++this.revision;try{const disabled=await this.api.supportRpc<string[]>('portal_disabled_tiles');if(revision===this.revision)this.disabled=disabled;}finally{if(revision===this.revision)this.ready=true;}}
 allowed(route:string):boolean{return route==='/admin'||!this.disabled.includes(route);}
 async save(route:string,enabled:boolean):Promise<void>{await this.api.supportRpc('portal_tile_save',{tile_route:route,is_enabled:enabled});await this.load();}
}
