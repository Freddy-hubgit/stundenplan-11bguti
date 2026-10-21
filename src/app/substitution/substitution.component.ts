import { Component, OnDestroy, OnInit } from '@angular/core';
import { Profile, SupabaseService } from '../supabase.service';
import { SettingsService } from '../settings.service';
import { DEFAULT_LESSONS } from '../timetable-data';
import { Substitution, SubstitutionInput, SubstitutionService, dateKey } from '../substitution.service';

@Component({ selector: 'app-substitution', templateUrl: './substitution.component.html',
  styleUrls: ['../portal-home/portal-home.component.css', './substitution.component.css'] })
export class SubstitutionComponent implements OnInit, OnDestroy {
  profile: Profile | null = null;
  entries: Substitution[] = [];
  selectedDate = dateKey(new Date());
  draft: SubstitutionInput = this.emptyDraft();
  editingId: string | null = null;
  deletingId: string | null = null;
  teachers = Array.from(new Set(DEFAULT_LESSONS.map(l => l.teacher))).sort();
  loading = true;
  saving = false;
  error = '';
  loadError = '';
  success = '';
  settingsOpen = false;
  private timer?: ReturnType<typeof setInterval>;
  private refreshing = false;
  private revision = 0;
  private destroyed = false;
  constructor(private api: SubstitutionService, private auth: SupabaseService, public settings: SettingsService) {}
  get isStaff(): boolean { return this.profile?.role === 'support' || this.profile?.role === 'admin'; }
  get visibleEntries(): Substitution[] { return this.entries.filter(e => e.date === this.selectedDate); }
  emptyDraft(): SubstitutionInput {
    return { date: this.selectedDate, teacher: '', start_time: '07:00', end_time: '18:00',
      kind: 'replacement', replacement_teacher: '', room: '', note: '' };
  }
  async ngOnInit(): Promise<void> {
    try { this.profile = await this.auth.getMyProfile(); }
    catch { this.error = 'Dein Profil konnte nicht geladen werden. Bitte lade die Seite erneut.'; }
    await this.refresh();
    if (!this.destroyed) this.timer = setInterval(() => { if (!this.saving) void this.refresh(); }, 15000);
  }
  ngOnDestroy(): void { this.destroyed = true; clearInterval(this.timer); }
  async refresh(): Promise<void> {
    if (this.refreshing || this.destroyed) return;
    this.refreshing = true;
    const revision = this.revision;
    try {
      const entries = await this.api.list();
      if (revision === this.revision) this.entries = entries;
      this.loadError = '';
    }
    catch { this.loadError = 'Vertretungsplan konnte nicht geladen werden. Bitte erneut versuchen.'; }
    finally { this.loading = false; this.refreshing = false; }
  }
  changeDate(): void { if (!this.editingId) this.draft.date = this.selectedDate; }
  edit(entry: Substitution): void {
    if (this.saving) return;
    this.editingId = entry.id;
    this.draft = { date: entry.date, teacher: entry.teacher, start_time: entry.start_time.slice(0, 5),
      end_time: entry.end_time.slice(0, 5), kind: entry.kind, replacement_teacher: entry.replacement_teacher,
      room: entry.room, note: entry.note };
    this.error = ''; this.success = '';
  }
  reset(): void { this.editingId = null; this.draft = this.emptyDraft(); this.error = ''; }
  async save(): Promise<void> {
    if (!this.isStaff || this.saving) return;
    this.error = ''; this.success = '';
    if (!this.draft.teacher.trim() || !this.draft.date || !this.draft.start_time || !this.draft.end_time
      || this.draft.start_time >= this.draft.end_time || (this.draft.kind === 'replacement' && !this.draft.replacement_teacher.trim())) {
      this.error = 'Bitte Datum, fehlende Lehrkraft, einen gültigen Zeitraum und bei Vertretung eine Ersatzlehrkraft angeben.'; return;
    }
    this.saving = true;
    this.revision++;
    try {
      await this.api.save({ ...this.draft, replacement_teacher: this.draft.kind === 'cancelled' ? '' : this.draft.replacement_teacher }, this.editingId);
      this.selectedDate = this.draft.date; this.reset(); this.success = 'Eintrag gespeichert.';
      await this.reloadSavedEntries();
    } catch (e: any) {
      this.error = e?.code === '23P01' ? 'Für diese Lehrkraft überschneidet sich bereits ein Eintrag an diesem Tag.'
        : 'Speichern fehlgeschlagen. Bitte erneut versuchen. Deine Eingaben bleiben erhalten.';
    } finally { this.saving = false; }
  }
  async remove(id: string): Promise<void> {
    if (!this.isStaff || this.saving) return;
    this.saving = true;
    this.revision++; this.error = ''; this.success = '';
    try {
      await this.api.remove(id); this.deletingId = null;
      if (this.editingId === id) this.reset();
      this.success = 'Eintrag gelöscht.'; await this.reloadSavedEntries();
    } catch { this.error = 'Löschen fehlgeschlagen. Bitte erneut versuchen.'; }
    finally { this.saving = false; }
  }
  private async reloadSavedEntries(): Promise<void> {
    try { this.entries = await this.api.list(); this.loadError = ''; }
    catch { this.loadError = 'Die Änderung wurde gespeichert, aber die Anzeige konnte nicht aktualisiert werden. Bitte aktualisieren.'; }
  }
  trackId(_: number, entry: Substitution): string { return entry.id; }
}
