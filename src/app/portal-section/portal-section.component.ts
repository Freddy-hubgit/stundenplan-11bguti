import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SettingsService } from '../settings.service';
import { Profile, SupabaseService } from '../supabase.service';
import { PortalEvent, PortalEventsService, safeMeetingUrl } from '../portal-events.service';
import { dateKey } from '../substitution.service';

@Component({ selector: 'app-portal-section', templateUrl: './portal-section.component.html',
  styleUrls: ['../portal-home/portal-home.component.css', './portal-section.component.css'] })
export class PortalSectionComponent implements OnInit, OnDestroy {
  settingsOpen = false;
  profile: Profile | null = null;
  events: PortalEvent[] = [];
  selectedDate = dateKey(new Date());
  month = new Date();
  weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  showPast = false;
  loading = true;
  busy = false;
  error = '';
  loadError = '';
  success = '';
  deletingId: string | null = null;
  editingId: string | null = null;
  editorOpen = false;
  draft = this.emptyDraft();
  now = Date.now();
  private timer?: ReturnType<typeof setInterval>;
  private refreshing = false;
  private revision = 0;
  private destroyed = false;
  constructor(public route: ActivatedRoute, public settings: SettingsService, private auth: SupabaseService,
    private api: PortalEventsService) {}
  get isMeetings(): boolean { return this.route.snapshot.data.title === 'Videokonferenz'; }
  get isStaff(): boolean { return this.profile?.role === 'admin' || this.profile?.role === 'support'; }
  get monthLabel(): string { return this.month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }); }
  get selectedDateLabel(): string { return new Date(this.selectedDate + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  eventsOn(date: string): PortalEvent[] {
    const start = new Date(date + 'T00:00:00');
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return this.events.filter(e => Date.parse(e.starts_at) < end.getTime() && Date.parse(e.ends_at) > start.getTime());
  }
  get agenda(): PortalEvent[] {
    return this.isMeetings ? this.events.filter(e => e.kind === 'meeting' && (this.showPast || Date.parse(e.ends_at) > this.now)) : this.eventsOn(this.selectedDate);
  }
  get calendarDays() {
    const first = new Date(this.month.getFullYear(), this.month.getMonth(), 1, 12);
    first.setDate(first.getDate() - (first.getDay() + 6) % 7);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(first); date.setDate(date.getDate() + i);
      const key = dateKey(date);
      return { date: key, number: date.getDate(), outside: date.getMonth() !== this.month.getMonth(),
        today: key === dateKey(new Date()), count: this.eventsOn(key).length,
        label: date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) };
    });
  }
  async ngOnInit(): Promise<void> {
    try { this.profile = await this.auth.getMyProfile(); }
    catch { this.error = 'Dein Profil konnte nicht geladen werden. Bitte lade die Seite erneut.'; }
    await this.refresh();
    if (!this.destroyed) this.timer = setInterval(() => { this.now = Date.now(); if (!this.busy) void this.refresh(); }, 30000);
  }
  ngOnDestroy(): void { this.destroyed = true; clearInterval(this.timer); }
  async refresh(): Promise<void> {
    if (this.refreshing || this.destroyed) return;
    this.refreshing = true;
    const revision = this.revision;
    try {
      const events = await this.api.list();
      if (!this.destroyed && revision === this.revision) this.events = events;
      this.loadError = '';
    } catch { this.loadError = 'Termine konnten nicht geladen werden. Bitte erneut versuchen.'; }
    finally { this.loading = false; this.refreshing = false; }
  }
  private async reloadSaved(): Promise<void> {
    try { this.events = await this.api.list(); this.loadError = ''; }
    catch { this.loadError = 'Die Änderung wurde gespeichert, aber die Anzeige konnte nicht aktualisiert werden.'; }
  }
  selectDay(date: string): void { this.selectedDate = date; this.month = new Date(date + 'T12:00:00'); }
  shiftMonth(offset: number): void {
    this.month = new Date(this.month.getFullYear(), this.month.getMonth() + offset, 1, 12);
    this.selectedDate = dateKey(this.month);
  }
  today(): void { this.month = new Date(); this.selectedDate = dateKey(this.month); }
  private localInput(date: Date): string {
    return dateKey(date) + 'T' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }
  private emptyDraft() {
    return { kind: 'event' as 'event' | 'meeting', title: '', description: '', start: '', end: '', location: '', meeting_url: '' };
  }
  newEntry(): void {
    this.editingId = null; this.draft = this.emptyDraft();
    this.draft.start = this.selectedDate + 'T09:00'; this.draft.end = this.selectedDate + 'T10:00';
    if (this.isMeetings) {
      const start = new Date(Math.ceil(Date.now() / 900000) * 900000);
      this.draft.start = this.localInput(start); this.draft.end = this.localInput(new Date(start.getTime() + 3600000));
      this.draft.kind = 'meeting'; this.createRoom();
    }
    this.error = ''; this.success = ''; this.editorOpen = true;
  }
  setKind(): void { if (this.draft.kind === 'meeting' && !this.draft.meeting_url) this.createRoom(); }
  createRoom(): void {
    const random = crypto.getRandomValues(new Uint8Array(16));
    this.draft.meeting_url = 'https://meet.jit.si/Schulportal-' + Array.from(random).map(n => n.toString(16).padStart(2, '0')).join('');
  }
  edit(event: PortalEvent): void {
    if (this.busy) return;
    this.editingId = event.id;
    this.draft = { kind: event.kind, title: event.title, description: event.description,
      start: this.localInput(new Date(event.starts_at)), end: this.localInput(new Date(event.ends_at)),
      location: event.location, meeting_url: event.meeting_url };
    this.editorOpen = true; this.error = ''; this.success = '';
  }
  closeEditor(): void { if (!this.busy) { this.editorOpen = false; this.draft = this.emptyDraft(); this.editingId = null; } }
  async save(): Promise<void> {
    if (!this.isStaff || this.busy) return;
    this.error = ''; this.success = '';
    const start = new Date(this.draft.start), end = new Date(this.draft.end);
    if (!this.draft.title.trim() || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      this.error = 'Bitte Titel und einen gültigen Beginn und ein Ende angeben.'; return;
    }
    const url = this.draft.kind === 'meeting' ? safeMeetingUrl(this.draft.meeting_url) : '';
    if (this.draft.kind === 'meeting' && !url) { this.error = 'Bitte einen gültigen HTTPS-Meetinglink angeben.'; return; }
    this.busy = true; this.revision++;
    try {
      await this.api.save({ kind: this.draft.kind, title: this.draft.title.trim(), description: this.draft.description,
        starts_at: start.toISOString(), ends_at: end.toISOString(), location: this.draft.location, meeting_url: url || '' }, this.editingId);
      this.selectDay(dateKey(start)); this.editorOpen = false; this.draft = this.emptyDraft(); this.editingId = null;
      this.success = 'Termin gespeichert.'; await this.reloadSaved();
    } catch (e: any) {
      this.error = e?.code === 'PGRST202' ? 'Die Kalenderfunktion muss noch in Supabase eingerichtet werden.'
        : 'Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten.';
    } finally { this.busy = false; }
  }
  async remove(id: string): Promise<void> {
    if (!this.isStaff || this.busy) return;
    this.busy = true; this.revision++; this.error = ''; this.success = '';
    try {
      await this.api.remove(id); this.deletingId = null;
      if (this.editingId === id) { this.editorOpen = false; this.draft = this.emptyDraft(); this.editingId = null; }
      this.success = 'Termin gelöscht.'; await this.reloadSaved();
    } catch { this.error = 'Löschen fehlgeschlagen. Bitte erneut versuchen.'; }
    finally { this.busy = false; }
  }
  meetingUrl(event: PortalEvent): string | null { return safeMeetingUrl(event.meeting_url); }
  isLive(event: PortalEvent): boolean { return Date.parse(event.starts_at) <= this.now && Date.parse(event.ends_at) > this.now; }
  async copyLink(event: PortalEvent): Promise<void> {
    const url = this.meetingUrl(event); if (!url) return;
    try { await navigator.clipboard.writeText(url); this.success = 'Meetinglink kopiert.'; }
    catch { this.error = 'Link konnte nicht kopiert werden. Du kannst ihn über „Teilnehmen“ öffnen.'; }
  }
  exportEvent(event: PortalEvent): void {
    const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n|\r/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const utc = (s: string) => new Date(s).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Schulportal//Kalender//DE', 'BEGIN:VEVENT',
      'UID:' + event.id + '@schulportal', 'DTSTAMP:' + utc(new Date().toISOString()),
      'DTSTART:' + utc(event.starts_at), 'DTEND:' + utc(event.ends_at), 'SUMMARY:' + escape(event.title),
      'DESCRIPTION:' + escape(event.description), 'LOCATION:' + escape(event.location)];
    const url = this.meetingUrl(event); if (url) lines.push('URL:' + url);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    const encoder = new TextEncoder();
    const folded = lines.map(line => {
      let result = '', part = '';
      for (const char of line) {
        if (encoder.encode(part + char).length > 75) { result += part + '\r\n'; part = ' '; }
        part += char;
      }
      return result + part;
    }).join('\r\n') + '\r\n';
    const blob = URL.createObjectURL(new Blob([folded], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a'); link.href = blob; link.download = 'termin.ics'; link.click();
    setTimeout(() => URL.revokeObjectURL(blob), 1000);
  }
  trackId(_: number, event: PortalEvent): string { return event.id; }
  trackDay(_: number, day: { date: string }): string { return day.date; }
}
