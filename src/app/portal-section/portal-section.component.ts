import { hasRole } from '../supabase.service';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SettingsService } from '../settings.service';
import { Profile, SupabaseService } from '../supabase.service';
import { PortalEvent, PortalEventsService, safeMeetingUrl } from '../portal-events.service';
import { dateKey } from '../substitution.service';

type ModalDialog = HTMLDialogElement & { showModal(): void; close(): void };

@Component({ selector: 'app-portal-section', templateUrl: './portal-section.component.html',
  styleUrls: ['../portal-home/portal-home.component.css', './portal-section.component.css'] })
export class PortalSectionComponent implements OnInit, OnDestroy {
  dayOpen = false;
  selectedTimelineEvent: PortalEvent | null = null;
  private dialog?: ModalDialog;
  private draftInstants: { start?: string; end?: string } = {};
  @ViewChild('dayDialog') set dayDialog(ref: ElementRef<ModalDialog> | undefined) {
    if (!ref) return;
    this.dialog = ref.nativeElement;
    this.dialog.showModal();
    requestAnimationFrame(() => {
      const scroll = this.dialog?.querySelector('.timeline-scroll');
      const firstMorningSlot = this.daySlots.findIndex(slot => new Date(slot.instant).getHours() >= 7);
      if (scroll) scroll.scrollTop = Math.max(0, firstMorningSlot) * 36;
    });
  }
  @ViewChild('editorTitle') set editorTitle(ref: ElementRef<HTMLInputElement> | undefined) {
    if (ref) requestAnimationFrame(() => { ref.nativeElement.focus(); ref.nativeElement.scrollIntoView({ block: 'center' }); });
  }
  openDay(date: string): void { this.selectDay(date); this.selectedTimelineEvent = null; this.dayOpen = true; }
  closeDay(event?: Event): void {
    event?.preventDefault(); this.dialog?.close(); this.dayOpen = false; this.selectedTimelineEvent = null;
  }
  dayBackdrop(event: MouseEvent): void {
    if (event.target !== this.dialog) return;
    const box = this.dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) this.closeDay();
  }
  private get dayBounds(): { start: Date; end: Date } {
    const start = new Date(this.selectedDate + 'T00:00:00');
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { start, end };
  }
  get daySlots(): { instant: string; label: string; fullLabel: string }[] {
    const { start, end } = this.dayBounds;
    const slots = [];
    for (let time = start.getTime(); time < end.getTime(); time += 1800000) {
      const date = new Date(time);
      slots.push({ instant: date.toISOString(), label: date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        fullLabel: date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) });
    }
    return slots;
  }
  trackSlot(_: number, slot: { instant: string }): string { return slot.instant; }
  trackBlock(_: number, block: { event: PortalEvent }): string { return block.event.id; }
  get timelineEvents(): { event: PortalEvent; top: number; height: number; left: number; width: number }[] {
    const { start, end } = this.dayBounds;
    const result = [];
    let group: { event: PortalEvent; start: number; end: number; lane: number }[] = [];
    let laneEnds: number[] = [], groupEnd = 0;
    const flush = () => {
      group.forEach(item => result.push({ event: item.event, top: (item.start - start.getTime()) / 1800000 * 36,
        height: Math.max(26, (item.end - item.start) / 1800000 * 36),
        left: item.lane / laneEnds.length * 100, width: 100 / laneEnds.length }));
      group = []; laneEnds = []; groupEnd = 0;
    };
    this.eventsOn(this.selectedDate).slice().sort((a,b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)).forEach(event => {
      const from = Math.max(start.getTime(), Date.parse(event.starts_at));
      const until = Math.min(end.getTime(), Date.parse(event.ends_at));
      if (group.length && from >= groupEnd) flush();
      let lane = laneEnds.findIndex(value => value <= from);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = until; groupEnd = Math.max(groupEnd, until);
      group.push({ event, start: from, end: until, lane });
    });
    if (group.length) flush();
    return result;
  }
  newEntryAt(instant: string): void {
    if (!this.isStaff || this.busy) return;
    this.closeDay(); this.newEntry();
    const start = new Date(instant), end = new Date(start.getTime() + 3600000);
    this.draft.start = this.localInput(start); this.draft.end = this.localInput(end);
    this.draftInstants = { start: start.toISOString(), end: end.toISOString() };
  }
  editFromDay(event: PortalEvent): void { this.closeDay(); this.edit(event); }
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
  get isStaff(): boolean { return hasRole(this.profile, 'admin', 'support'); }
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
    this.draftInstants = {};
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
    this.draftInstants = { start: event.starts_at, end: event.ends_at };
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
    const parse = (key: 'start' | 'end') => {
      const original = this.draftInstants[key];
      return original && this.localInput(new Date(original)) === this.draft[key] ? new Date(original) : new Date(this.draft[key]);
    };
    const start = parse('start'), end = parse('end');
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
