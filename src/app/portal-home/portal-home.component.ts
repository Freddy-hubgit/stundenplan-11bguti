import {PortalTilesService} from '../portal-tiles.service';
import { hasRole } from '../supabase.service';
import { HomeLayoutService } from '../home-layout.service';
import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { SettingsService } from '../settings.service';

interface PortalTile {
  title: string;
  description: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-portal-home',
  templateUrl: './portal-home.component.html',
  styleUrls: ['./portal-home.component.css'],
})
export class PortalHomeComponent implements OnInit,OnDestroy {
  tiles: PortalTile[] = [
    {title:'Meine Hefte',description:'Persönliche Notizen für jedes Fach und ein allgemeines Heft',route:'/hefte',icon:'📓'},
    {title:'Klassen & Kurse',description:'Deine Gruppen und Zuordnungen',route:'/klassen',icon:'👥'},
    {title:'Materialablage',description:'Arbeitsblätter, Dateien und Links deiner Gruppen',route:'/materialien',icon:'📂'},
    { title: 'Benachrichtigungen', description: 'Neue Meldungen und Unterrichtsänderungen', route: '/meldungen', icon: '🔔' },
    { title: 'Hausaufgaben', description: 'Aufgaben, Abgaben und Erinnerungen', route: '/hausaufgaben', icon: '📚' },
    { title: 'Nachrichten', description: 'Private Chats mit allen Nutzern', route: '/nachrichten', icon: '💬' },
    { title: 'Videokonferenz', description: 'Jitsi-Besprechungen ansehen und teilnehmen', route: '/videokonferenz', icon: '📹' },
    {
      title: 'Stundenplan',
      description: 'Dein Stundenplan mit Live-Ansicht',
      route: '/stundenplan',
      icon: '🗓️',
    },
  ];

  avatarAccount='';avatarName='';
  tileError='';private destroyed=false;private tileTimer?:ReturnType<typeof setInterval>;
  async refreshTileSettings():Promise<void>{try{await this.tileSettings.load();this.tileError='';if(this.contextTile&&!this.tileSettings.allowed(this.contextTile.route))this.contextTile=null;}catch{this.tileError='Die zentralen Kacheleinstellungen konnten nicht geladen werden. Die zuletzt verfügbare Ansicht wird angezeigt.';}}
  ngOnDestroy():void{this.destroyed=true;clearInterval(this.tileTimer);this.clearTileDrag();}
  get availableTiles():PortalTile[]{return this.tileSettings.ready?this.tiles.filter(t=>this.tileSettings.allowed(t.route)):[];}
  settingsOpen = false;
  greeting = 'Hi!';

  constructor(private supabase: SupabaseService, public settings: SettingsService, public homeLayout: HomeLayoutService,public tileSettings:PortalTilesService) { this.homeLayout.activate(null); }

  get visibleTiles(): PortalTile[] { return this.homeLayout.visible(this.availableTiles); }
  trackTile(_: number, tile: PortalTile): string { return tile.route; }

  contextTile:PortalTile|null=null;menuX=0;menuY=0;
  private rightDrag:{route:string;x:number;y:number;offsetX:number;offsetY:number;source:HTMLElement;ghost:HTMLElement|null;target:HTMLElement|null;moved:boolean;cursor:string;userSelect:string}|null=null;
  private suppressContext=false;
  tileContext(event:MouseEvent,tile:PortalTile):void{event.preventDefault();event.stopPropagation();if(this.suppressContext){this.suppressContext=false;return;}this.contextTile=tile;this.menuX=Math.max(8,Math.min(event.clientX,window.innerWidth-280));this.menuY=Math.max(8,Math.min(event.clientY,window.innerHeight-420));}
  tileDown(event:MouseEvent,tile:PortalTile):void{
    if(event.button!==2)return;event.preventDefault();this.clearTileDrag();this.contextTile=null;this.suppressContext=false;
    const source=event.currentTarget as HTMLElement,rect=source.getBoundingClientRect();
    this.rightDrag={route:tile.route,x:event.clientX,y:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,source,ghost:null,target:null,moved:false,cursor:document.body.style.cursor,userSelect:document.body.style.userSelect};
  }
  private tileAt(x:number,y:number):HTMLElement|null{
    const tile=(document.elementFromPoint(x,y) as HTMLElement|null)?.closest('.tile-grid > .tile[data-route]') as HTMLElement|null;
    return tile&&tile.parentElement===this.rightDrag?.source.parentElement?tile:null;
  }
  @HostListener('document:mousemove',['$event']) moveTile(event:MouseEvent):void{
    const drag=this.rightDrag;if(!drag)return;if(!(event.buttons&2)){this.suppressContext=drag.moved;this.clearTileDrag();return;}
    if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>8){
      drag.moved=true;this.contextTile=null;const rect=drag.source.getBoundingClientRect();
      const ghost=drag.source.cloneNode(true) as HTMLElement;ghost.removeAttribute('data-route');ghost.removeAttribute('href');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.classList.add('tile-drag-ghost');const colors=getComputedStyle(drag.source);['--tile-accent','--tile-tint'].forEach(name=>ghost.style.setProperty(name,colors.getPropertyValue(name)));
      Object.assign(ghost.style,{position:'fixed',left:'0px',top:'0px',width:rect.width+'px',height:rect.height+'px',minHeight:'0',margin:'0',pointerEvents:'none',zIndex:'2500',transition:'none'});
      drag.source.parentElement?.appendChild(ghost);drag.ghost=ghost;drag.source.classList.add('tile-drag-source');document.body.style.cursor='grabbing';document.body.style.userSelect='none';
    }
    if(!drag.moved)return;
    if(drag.ghost)drag.ghost.style.transform=`translate3d(${event.clientX-drag.offsetX}px,${event.clientY-drag.offsetY}px,0)`;
    const target=this.tileAt(event.clientX,event.clientY);if(target!==drag.target){drag.target?.classList.remove('tile-drop-target');drag.target=target;drag.target?.classList.add('tile-drop-target');}
  }
  @HostListener('document:mouseup',['$event']) releaseTile(event:MouseEvent):void{
    const drag=this.rightDrag;if(event.button!==2||!drag)return;this.suppressContext=drag.moved;
    const target=drag.moved?this.tileAt(event.clientX,event.clientY)?.getAttribute('data-route'):null;
    this.clearTileDrag();if(target&&target!==drag.route)this.homeLayout.moveTo(this.tiles,drag.route,target);
  }
  private clearTileDrag():void{const drag=this.rightDrag;if(!drag)return;drag.ghost?.remove();drag.source.classList.remove('tile-drag-source');drag.target?.classList.remove('tile-drop-target');document.body.style.cursor=drag.cursor;document.body.style.userSelect=drag.userSelect;this.rightDrag=null;}
  @HostListener('document:click') closeTileMenu():void{this.contextTile=null;}
  @HostListener('document:keydown.escape') escapeTileMenu():void{this.contextTile=null;this.suppressContext=!!this.rightDrag?.moved;this.clearTileDrag();}
  @HostListener('window:blur') cancelTileDrag():void{this.suppressContext=!!this.rightDrag?.moved;this.clearTileDrag();}
  openSettings(): void {
    this.settingsOpen = true;
  }

  closeSettings(): void {
    this.settingsOpen = false;
  }

  async ngOnInit(): Promise<void> {
    const profile = await this.supabase.getMyProfile();
    this.avatarAccount=profile?.id||'';this.avatarName=profile?.full_name||'';
    this.homeLayout.activate(profile?.id ?? null);
    const name = profile?.full_name?.trim().split(/\s+/)[0];
    const greetings = ['Hi', 'Hallo', 'Hey', 'Willkommen', 'Schön, dich zu sehen', 'Schön, dass du da bist'];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    this.greeting = name ? `${greeting}, ${name}` : `${greeting}!`;
    if(hasRole(profile,'teacher','admin','support'))this.tiles=[...this.tiles,{title:'Krankmeldungen',description:hasRole(profile,'admin')?'Abwesenheiten prüfen und Vertretungen bestätigen':hasRole(profile,'support')?'Krankmeldungen prüfen und zurücknehmen':'Abwesenheit melden und Wunschvertretung vorschlagen',route:'/krankmeldung',icon:'🩺'}];
    if(hasRole(profile,'admin'))this.tiles=[...this.tiles,{title:'Schuljahres-Reset',description:'Vorschau und kontrollierter Neustart',route:'/schuljahr',icon:'⚠'}];
    this.tiles=[...this.tiles,{title:'Raumbuchung',description:'Freie Räume finden und reservieren',route:'/raumbuchung',icon:'🚪'}];
    if(hasRole(profile,'teacher','admin'))this.tiles=[...this.tiles,{title:'Abgabeübersicht',description:'Abgaben prüfen und Rückmeldungen geben',route:'/abgaben',icon:'📥'}];
    if(hasRole(profile,'admin'))this.tiles=[...this.tiles,{title:'Änderungsverlauf',description:'Änderungen prüfen und Stundenpläne wiederherstellen',route:'/aenderungsverlauf',icon:'📜'}];
    const isStaff = hasRole(profile, 'admin', 'support');

    if (hasRole(profile, 'teacher', 'support', 'admin')) this.tiles = [...this.tiles, { title: 'Kalender', description: 'Termine, Veranstaltungen und Besprechungen', route: '/kalender', icon: '📅' }];

    if (hasRole(profile, 'user', 'support', 'admin')) this.tiles = [...this.tiles, {
      title: isStaff ? 'Support-Tickets' : 'Support & Tickets',
      description: isStaff ? 'Offene Tickets ansehen und im Chat beantworten' : 'Support-Team kennenlernen und Hilfe im Chat erhalten',
      route: '/support',
      icon: '💬',
    }];

    if (isStaff) {
      this.tiles = [...this.tiles, { title: 'Vertretungsplan', description: 'Fehlende Lehrkräfte, Ersatzlehrer und Unterrichtsausfälle', route: '/vertretungsplan', icon: '🔄' }];
      this.tiles = [
        ...this.tiles,
        {
          title: 'Verwaltung',
          description: 'Konten anlegen und verwalten',
          route: '/admin',
          icon: '🛠️',
        },
      ];
    }
    await this.refreshTileSettings();if(!this.destroyed)this.tileTimer=setInterval(()=>void this.refreshTileSettings(),30000);
  }
}
