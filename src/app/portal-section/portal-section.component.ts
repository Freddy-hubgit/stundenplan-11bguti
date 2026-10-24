import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SettingsService } from '../settings.service';

@Component({
  selector: 'app-portal-section',
  templateUrl: './portal-section.component.html',
  styleUrls: ['../portal-home/portal-home.component.css', './portal-section.component.css'],
})
export class PortalSectionComponent {
  settingsOpen = false;
  constructor(public route: ActivatedRoute, public settings: SettingsService) {}
}
