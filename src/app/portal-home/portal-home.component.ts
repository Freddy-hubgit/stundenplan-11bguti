import { hasRole } from '../supabase.service';
import { HomeLayoutService } from '../home-layout.service';
import { Component, OnInit, HostListener } from '@angular/core';
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
export class PortalHomeComponent implements OnInit {
  tiles: PortalTile[] = [
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

  settingsOpen = false;
  greeting = 'Hi!';

  constructor(private supabase: SupabaseService, public settings: SettingsService, public homeLayout: HomeLayoutService) { this.homeLayout.activate(null); }

  get visibleTiles(): PortalTile[] { return this.homeLayout.visible(this.tiles); }
  trackTile(_: number, tile: PortalTile): string { return tile.route; }

  contextTile:PortalTile|null=null;menuX=0;menuY=0;private rightDrag:{route:string;x:number;y:number;moved:boolean}|null=null;private suppressContext=false;
  tileContext(event:MouseEvent,tile:PortalTile):void{event.preventDefault();event.stopPropagation();if(this.suppressContext){this.suppressContext=false;return;}this.contextTile=tile;this.menuX=Math.max(8,Math.min(event.clientX,window.innerWidth-280));this.menuY=Math.max(8,Math.min(event.clientY,window.innerHeight-420));}
  tileDown(event:MouseEvent,tile:PortalTile):void{if(event.button!==2)return;event.preventDefault();this.contextTile=null;this.suppressContext=false;this.rightDrag={route:tile.route,x:event.clientX,y:event.clientY,moved:false};}
  @HostListener('document:mousemove',['$event']) moveTile(event:MouseEvent):void{const drag=this.rightDrag;if(!drag||!(event.buttons&2))return;if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>8)drag.moved=true;if(drag.moved){this.contextTile=null;const target=(document.elementFromPoint(event.clientX,event.clientY) as HTMLElement|null)?.closest('[data-route]')?.getAttribute('data-route');if(target&&target!==drag.route)this.homeLayout.moveTo(this.tiles,drag.route,target);}}
  @HostListener('document:mouseup',['$event']) releaseTile(event:MouseEvent):void{if(event.button===2&&this.rightDrag){this.suppressContext=this.rightDrag.moved;this.rightDrag=null;}}
  @HostListener('document:click') closeTileMenu():void{this.contextTile=null;}
  @HostListener('document:keydown.escape') escapeTileMenu():void{this.contextTile=null;this.rightDrag=null;}
  @HostListener('window:blur') cancelTileDrag():void{this.rightDrag=null;}
  openSettings(): void {
    this.settingsOpen = true;
  }

  closeSettings(): void {
    this.settingsOpen = false;
  }

  async ngOnInit(): Promise<void> {
    const profile = await this.supabase.getMyProfile();
    this.homeLayout.activate(profile?.id ?? null);
    const name = profile?.full_name?.trim().split(/\s+/)[0];
    const greetings = ['Hi', 'Hallo', 'Hey', 'Willkommen', 'Schön, dich zu sehen', 'Schön, dass du da bist'];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    this.greeting = name ? `${greeting}, ${name}` : `${greeting}!`;
    if(hasRole(profile,'teacher','admin'))this.tiles=[...this.tiles,{title:'Krankmeldungen',description:hasRole(profile,'admin')?'Abwesenheiten prüfen und Vertretungen bestätigen':'Abwesenheit melden und Wunschvertretung vorschlagen',route:'/krankmeldung',icon:'🩺'}];
    if(hasRole(profile,'admin'))this.tiles=[...this.tiles,{title:'Schuljahres-Reset',description:'Vorschau und kontrollierter Neustart',route:'/schuljahr',icon:'⚠'}];
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
  }
}
