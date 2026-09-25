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

  tiles: PortalTile[] = [
    {
      title: 'Stundenplan',
      description: 'Dein Wochenstundenplan mit Live-Ansicht',
      route: '/stundenplan',
      icon: '🗓️',
    },
    // Weitere Kacheln kommen hier spaeter dazu, z.B.:
    // { title: 'Vertretungsplan', description: '...', route: '/vertretung', icon: '📋' },
  ];

  constructor(private supabase: SupabaseService, private router: Router) {}

  async ngOnInit(): Promise<void> {
    const session = await this.supabase.getSession();
    this.userEmail = session?.user?.email ?? null;
  }

  async logout(): Promise<void> {
    await this.supabase.signOut();
    this.router.navigateByUrl('/login');
  }
}