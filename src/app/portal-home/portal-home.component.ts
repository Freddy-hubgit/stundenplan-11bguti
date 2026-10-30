import { hasRole } from '../supabase.service';
import { HomeLayoutService } from '../home-layout.service';
import { Component, OnInit } from '@angular/core';
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

  openSettings(): void {
    this.settingsOpen = true;
  }

  closeSettings(): void {
    this.settingsOpen = false;
  }

  async ngOnInit(): Promise<void> {
    const profile = await this.supabase.getMyProfile();
    this.homeLayout.activate(profile?.id ?? null);
    const name = profile?.full_name?.trim();
    this.greeting = name ? `Hi, ${name}` : 'Hi!';
    if(hasRole(profile,'teacher','admin'))this.tiles=[...this.tiles,{title:'Krankmeldungen',description:hasRole(profile,'admin')?'Abwesenheiten prüfen und Vertretungen bestätigen':'Abwesenheit melden und Wunschvertretung vorschlagen',route:'/krankmeldung',icon:'🩺'}];
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
