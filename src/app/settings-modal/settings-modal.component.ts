import { HomeLayoutService, HomeTile } from '../home-layout.service';
import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { SettingsService } from '../settings.service';

@Component({
  selector: 'app-settings-modal',
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.css']
})
export class SettingsModalComponent implements OnInit, OnChanges {
  @Input() open = false;
  @Output() openChange = new EventEmitter<boolean>();

  @Input() initialCategory: 'darstellung' | 'konto' = 'darstellung';
  settingsCategory: 'darstellung' | 'konto' | 'start' = 'darstellung';
  @Input() homeTiles: HomeTile[] = [];
  draggedRoute: string | null = null;
  get editableTiles(): HomeTile[] { return this.homeLayout.ordered(this.homeTiles); }
  trackTile(_: number, tile: HomeTile): string { return tile.route; }
  startDrag(event: DragEvent, route: string): void { this.draggedRoute = route; event.dataTransfer?.setData('text/plain', route); }
  dropTile(event: DragEvent, target: string): void { event.preventDefault(); if (this.draggedRoute) this.homeLayout.moveTo(this.homeTiles, this.draggedRoute, target); this.draggedRoute = null; }


  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.settingsCategory = this.initialCategory;
      this.currentTheme = this.settings.theme;
      this.currentBackground = this.settings.backgroundKey;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.open) this.close(); }

  currentTheme: 'dark' | 'light' = 'dark';
  currentBackground: string = 'default';

  readonly themeOptions: { key: 'dark' | 'light'; label: string }[] = [
    { key: 'dark', label: 'Dunkel' },
    { key: 'light', label: 'Hell' },
  ];

  readonly backgroundOptions: { key: string; label: string }[] = [
    { key: 'default', label: 'Cockpit (Standard)' },
    { key: 'aurora', label: 'Aurora' },
    { key: 'sunset', label: 'Sonnenuntergang' },
    { key: 'forest', label: 'Wald' },
  ];

  constructor(public settings: SettingsService, public homeLayout: HomeLayoutService) {}

  ngOnInit(): void {
    this.currentTheme = this.settings.theme;
    this.currentBackground = this.settings.backgroundKey;
  }

  close(): void {
    this.openChange.emit(false);
  }

  onBackdropClick(): void {
    this.close();
  }
}
