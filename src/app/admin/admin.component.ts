import { Component, OnInit } from '@angular/core';
import { Profile, SupabaseService } from '../supabase.service';

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

  // Neues Konto
  newName = '';
  newEmail = '';
  newPassword = '';
  newRole: 'user' | 'support' | 'admin' = 'user';
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

  constructor(private supabase: SupabaseService) {}

  async ngOnInit(): Promise<void> {
    const me = await this.supabase.getMyProfile();
    this.myId = me?.id ?? null;
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
    this.editTargetId = p.id;
    this.editName = p.full_name ?? '';
    this.editEmail = p.email;
    this.editPassword = '';
    this.editError = '';
    this.editSuccess = '';
    this.confirmingDelete = false;
  }

  cancelEdit(): void {
    this.editTargetId = null;
    this.editPassword = '';
    this.editError = '';
    this.editSuccess = '';
    this.confirmingDelete = false;
  }

  async saveEdit(p: Profile): Promise<void> {
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
    this.confirmingDelete = true;
  }

  cancelDelete(): void {
    this.confirmingDelete = false;
  }

  async confirmDelete(p: Profile): Promise<void> {
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