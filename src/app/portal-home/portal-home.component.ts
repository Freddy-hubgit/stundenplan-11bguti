import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../supabase.service';

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
  userEmail: string | null = null;
  isStaff = false;

  tiles: PortalTile[] = [
    {
      title: 'Stundenplan',
      description: 'Dein Wochenstundenplan mit Live-Ansicht',
      route: '/stundenplan',
      icon: '🗓️',
    },
  ];

  constructor(private supabase: SupabaseService, private router: Router) {}

  async ngOnInit(): Promise<void> {
    const session = await this.supabase.getSession();
    this.userEmail = session?.user?.email ?? null;

    const profile = await this.supabase.getMyProfile();
    this.isStaff = profile?.role === 'admin' || profile?.role === 'support';

    if (this.isStaff) {
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

  async logout(): Promise<void> {
    await this.supabase.signOut();
    this.router.navigateByUrl('/login');
  }
}