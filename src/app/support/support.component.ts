import { hasRole } from '../supabase.service';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Profile, SupabaseService } from '../supabase.service';
import { SettingsService } from '../settings.service';
import { SupportService, SupportTicket, TeamMember, TicketMessage } from '../support.service';

@Component({
  selector: 'app-support', templateUrl: './support.component.html',
  styleUrls: ['../portal-home/portal-home.component.css', './support.component.css'],
})
export class SupportComponent implements OnInit, OnDestroy {
  profile: Profile | null = null;
  team: TeamMember[] = [];
  tickets: SupportTicket[] = [];
  messages: TicketMessage[] = [];
  selected: SupportTicket | null = null;
  subject = '';
  firstMessage = '';
  reply = '';
  filter: 'open' | 'closed' | 'all' = 'open';
  loading = true;
  messagesLoading = false;
  busy = false;
  error = '';
  refreshError = '';
  teamError = '';
  private timer: ReturnType<typeof setInterval> | undefined;
  private refreshing = false;
  private destroyed = false;
  private selectionVersion = 0;

  constructor(private auth: SupabaseService, private support: SupportService, public settings: SettingsService) {}
  get isStaff(): boolean { return hasRole(this.profile, 'support', 'admin'); }
  get visibleTickets(): SupportTicket[] {
    return this.tickets.filter(t => this.filter === 'all' || t.status === this.filter);
  }
  async ngOnInit(): Promise<void> {
    try {
      this.profile = await this.auth.getMyProfile();
      if (!this.profile) throw new Error('Dein Profil konnte nicht geladen werden. Bitte melde dich erneut an.');
      await Promise.all([this.loadTeam(), this.refresh()]);
      if (!this.destroyed) this.timer = setInterval(() => { if (!this.busy) void this.refresh(); }, 5000);
    } catch (e) { this.showError(e); }
    finally { this.loading = false; }
  }
  ngOnDestroy(): void { this.destroyed = true; clearInterval(this.timer); this.selectionVersion++; }
  async loadTeam(): Promise<void> {
    this.teamError = '';
    try { this.team = await this.support.team(); }
    catch { this.teamError = 'Das Support-Team konnte nicht geladen werden. Bitte erneut versuchen.'; }
  }
  async refresh(): Promise<void> {
    if (this.refreshing || this.destroyed) return;
    this.refreshing = true;
    const version = this.selectionVersion;
    const id = this.selected?.id;
    try {
      const tickets = await this.support.tickets();
      const messages = id ? await this.support.messages(id) : null;
      if (this.destroyed || version !== this.selectionVersion) return;
      this.tickets = tickets;
      if(hasRole(this.profile,'support')&&tickets.length)try{
        const key='support-seen:'+this.profile?.id;
        const latest=Math.max(Number(localStorage.getItem(key))||0,...tickets.map(t=>Date.parse(t.created_at)).filter(Number.isFinite));
        localStorage.setItem(key,String(latest));
      }catch{ /* Browser storage is optional. */ }
      if (version === this.selectionVersion && id) {
        this.selected = tickets.find(t => t.id === id) ?? null;
        this.messages = this.selected ? messages ?? [] : [];
      }
      this.refreshError = '';
    } catch { this.refreshError = 'Tickets konnten nicht aktualisiert werden. Bitte erneut laden.'; }
    finally { this.refreshing = false; }
  }
  async select(ticket: SupportTicket): Promise<void> {
    if (this.busy) return;
    const version = ++this.selectionVersion;
    this.selected = ticket; this.messages = []; this.reply = ''; this.error = ''; this.messagesLoading = true;
    try {
      const messages = await this.support.messages(ticket.id);
      if (version === this.selectionVersion && !this.destroyed) this.messages = messages;
    } catch (e) { if (version === this.selectionVersion) this.showError(e); }
    finally { if (version === this.selectionVersion) this.messagesLoading = false; }
  }
  async create(): Promise<void> {
    if (this.busy || !this.subject.trim() || !this.firstMessage.trim()) return;
    this.busy = true; this.error = '';
    this.selectionVersion++;
    try {
      const id = await this.support.create(this.subject.trim(), this.firstMessage.trim());
      this.subject = ''; this.firstMessage = ''; this.filter = 'open';
      this.tickets = await this.support.tickets();
      const ticket = this.tickets.find(t => t.id === id);
      this.busy = false;
      if (ticket) await this.select(ticket);
    } catch (e) { this.showError(e); }
    finally { this.busy = false; }
  }
  async send(): Promise<void> {
    if (this.busy || this.messagesLoading || !this.selected || !this.reply.trim() || this.selected.status !== 'open') return;
    this.busy = true; this.error = '';
    this.selectionVersion++;
    try {
      await this.support.reply(this.selected.id, this.reply.trim());
      this.reply = '';
      this.messages = await this.support.messages(this.selected.id);
    } catch (e) { this.showError(e); }
    finally { this.busy = false; }
  }
  async changeStatus(): Promise<void> {
    if (this.busy || this.messagesLoading || !this.selected || !this.isStaff) return;
    this.busy = true; this.error = '';
    this.selectionVersion++;
    try {
      const status = this.selected.status === 'open' ? 'closed' : 'open';
      await this.support.setStatus(this.selected.id, status);
      this.selected = { ...this.selected, status };
      await this.refresh();
    } catch (e) { this.showError(e); }
    finally { this.busy = false; }
  }
  trackId(_: number, item: { id: string }): string { return item.id; }
  private showError(error: any): void {
    this.error = error?.code === 'PGRST202'
      ? 'Die Ticketfunktion ist noch nicht in der Datenbank eingerichtet.'
      : 'Die Aktion ist fehlgeschlagen. Bitte erneut versuchen. Deine noch nicht gesendete Nachricht bleibt erhalten.';
  }
}
