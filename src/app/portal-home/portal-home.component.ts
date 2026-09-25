import { Component } from '@angular/core';

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
export class PortalHomeComponent {
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
}