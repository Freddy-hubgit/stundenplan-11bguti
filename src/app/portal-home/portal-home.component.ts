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
    {
      title: 'Stundenplan',
      description: 'Dein Wochenstundenplan mit Live-Ansicht',
      route: '/stundenplan',
      icon: '🗓️',
    },
  ];

  settingsOpen = false;

  constructor(private supabase: SupabaseService, public settings: SettingsService) {}

  openSettings(): void {
    this.settingsOpen = true;
  }

  closeSettings(): void {
    this.settingsOpen = false;
  }

  async ngOnInit(): Promise<void> {
    const profile = await this.supabase.getMyProfile();
    const isStaff = profile?.role === 'admin' || profile?.role === 'support';

    if (isStaff) {
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