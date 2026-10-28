import { AccountRole, rolesOf, hasRole, roleNames } from '../supabase.service';
import { Router } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { Profile, SupabaseService } from '../supabase.service';
import { SettingsService } from '../settings.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css'],
})
export class AdminComponent implements OnInit {
  profiles: Profile[] = [];
  loading = true;
  loadError = '';
  myId: string | null = null;
  myRole: Profile['role'] | null = null;
  editRoles: AccountRole[] = ['user'];
  myProfile: Profile | null = null;
  readonly roleOptions: AccountRole[] = ['user','teacher','support','admin'];
  roleNames = roleNames;
  roleLabel(role: AccountRole): string { return ({user:'Nutzer',teacher:'Lehrer',support:'Support',admin:'Admin'})[role]; }
  toggleEditRole(role: AccountRole): void { this.editRoles = this.editRoles.includes(role) ? this.editRoles.filter(r=>r!==role) : [...this.editRoles,role]; }
  rolesChanged(p: Profile): boolean { return [...this.editRoles].sort().join() !== [...rolesOf(p)].sort().join(); }
  roleSaving = false;

  // Neues Konto
  newName = '';
  newEmail = '';
  newPassword = '';
  newRole: 'user' | 'teacher' | 'support' | 'admin' = 'user';
  creating = false;
  createError = '';
  createSuccess = '';

  // Konto bearbeiten
  editTargetId: string | null = null;
  editName = '';
  editEmail = '';
  editPassword = '';
  editSaving = false;
  editError = '';
  editSuccess = '';
  confirmingDelete = false;
  deleting = false;

  settingsOpen = false;

  constructor(private supabase: SupabaseService, public settings: SettingsService, private router: Router) {}

  openSettings(): void {
    this.settingsOpen = true;
  }

  closeSettings(): void {
    this.settingsOpen = false;
  }

  async ngOnInit(): Promise<void> {
    const me = await this.supabase.getMyProfile();
    this.myId = me?.id ?? null;
    this.myRole = me?.role ?? null;
    this.myProfile = me;
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading = true;
    this.loadError = '';
    try {
      this.profiles = await this.supabase.listProfiles();
    } catch (e: any) {
      this.loadError = e?.message ?? 'Konnte Konten nicht laden.';
    }
    this.loading = false;
  }

  displayName(p: Profile): string {
    return p.full_name?.trim() || p.email;
  }

  async createAccount(): Promise<void> {
    this.createError = '';
    this.createSuccess = '';

    if (!this.newEmail || !this.newPassword) {
      this.createError = 'E-Mail und Passwort erforderlich.';
      return;
    }

    this.creating = true;
    const result = await this.supabase.createUserAccount(
      this.newEmail,
      this.newPassword,
      this.newRole,
      this.newName
    );
    this.creating = false;

    if (!result.ok) {
      this.createError = result.error ?? 'Erstellung fehlgeschlagen.';
      return;
    }

    this.createSuccess = `Konto für ${this.newName || this.newEmail} wurde angelegt.`;
    this.newName = '';
    this.newEmail = '';
    this.newPassword = '';
    this.newRole = 'user';
    await this.reload();
  }

  startEdit(p: Profile): void {
    if (this.editSaving || this.roleSaving) return;
    this.editRoles = [...rolesOf(p)];
    this.editTargetId = p.id;
    this.editName = p.full_name ?? '';
    this.editEmail = p.email;
    this.editPassword = '';
    this.editError = '';
    this.editSuccess = '';
    this.confirmingDelete = false;
  }

  cancelEdit(): void {
    if (this.editSaving || this.roleSaving) return;
    this.editTargetId = null;
    this.editPassword = '';
    this.editError = '';
    this.editSuccess = '';
    this.confirmingDelete = false;
  }

  get canEditRoles(): boolean { return hasRole(this.myProfile, 'admin', 'support'); }

  async saveRole(p: Profile): Promise<void> {
    if (!this.canEditRoles || this.roleSaving || this.editSaving || !this.rolesChanged(p)) return;
    if (!this.editRoles.length) { this.editError = 'Mindestens eine Rolle auswählen.'; return; }
    this.roleSaving = true; this.editError = ''; this.editSuccess = '';
    const result = await this.supabase.changeUserRoles(p.id, this.editRoles);
    if (!result.ok) {
      this.editError = result.error ?? 'Rolle konnte nicht geändert werden.';
      this.roleSaving = false; return;
    }
    this.editSuccess = 'Rolle gespeichert.';
    try {
      if (p.id === this.myId) {
        const me = await this.supabase.getMyProfile();
        this.myRole = me?.role ?? null;
        this.myProfile = me;
        if (!hasRole(me, 'admin', 'support')) {
          await this.router.navigateByUrl('/'); return;
        }
      }
      await this.reload();
    } finally { this.roleSaving = false; }
  }

  async saveEdit(p: Profile): Promise<void> {
    if (this.roleSaving || this.editSaving) return;
    this.editError = '';
    this.editSuccess = '';

    const newEmail = this.editEmail.trim();
    const newName = this.editName.trim();

    if (!newEmail) {
      this.editError = 'E-Mail darf nicht leer sein.';
      return;
    }

    // Nur tatsächlich geänderte Felder an den Server schicken
    const changes: { email?: string; name?: string; password?: string } = {};
    if (newEmail !== p.email) changes.email = newEmail;
    if (newName !== (p.full_name ?? '')) changes.name = newName;
    if (this.editPassword) {
      if (this.editPassword.length < 6) {
        this.editError = 'Passwort muss mindestens 6 Zeichen haben.';
        return;
      }
      changes.password = this.editPassword;
    }

    if (Object.keys(changes).length === 0) {
      this.editError = 'Keine Änderungen vorgenommen.';
      return;
    }

    this.editSaving = true;
    const result = await this.supabase.updateUserAccount(p.id, changes);
    this.editSaving = false;

    if (!result.ok) {
      this.editError = result.error ?? 'Speichern fehlgeschlagen.';
      return;
    }

    this.editSuccess = 'Änderungen gespeichert.';
    this.editPassword = '';
    await this.reload();
    setTimeout(() => {
      if (this.editTargetId === p.id) this.cancelEdit();
    }, 1500);
  }

  requestDelete(): void {
    if (this.roleSaving || this.editSaving) return;
    this.confirmingDelete = true;
  }

  cancelDelete(): void {
    this.confirmingDelete = false;
  }

  async confirmDelete(p: Profile): Promise<void> {
    if (this.roleSaving || this.editSaving) return;
    this.editError = '';
    this.deleting = true;
    const result = await this.supabase.deleteUserAccount(p.id);
    this.deleting = false;

    if (!result.ok) {
      this.editError = result.error ?? 'Löschen fehlgeschlagen.';
      this.confirmingDelete = false;
      return;
    }

    this.cancelEdit();
    await this.reload();
  }
}