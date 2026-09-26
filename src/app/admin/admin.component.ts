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

  newName = '';
  newEmail = '';
  newPassword = '';
  newRole: 'user' | 'support' | 'admin' = 'user';
  creating = false;
  createError = '';
  createSuccess = '';

  resetTargetId: string | null = null;
  resetPasswordValue = '';
  resetting = false;
  resetError = '';
  resetSuccess = '';

  constructor(private supabase: SupabaseService) {}

  async ngOnInit(): Promise<void> {
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

  startReset(p: Profile): void {
    this.resetTargetId = p.id;
    this.resetPasswordValue = '';
    this.resetError = '';
    this.resetSuccess = '';
  }

  cancelReset(): void {
    this.resetTargetId = null;
    this.resetPasswordValue = '';
  }

  async confirmReset(p: Profile): Promise<void> {
    this.resetError = '';
    this.resetSuccess = '';

    if (this.resetPasswordValue.length < 6) {
      this.resetError = 'Passwort muss mindestens 6 Zeichen haben.';
      return;
    }

    this.resetting = true;
    const result = await this.supabase.resetPassword(p.id, this.resetPasswordValue);
    this.resetting = false;

    if (!result.ok) {
      this.resetError = result.error ?? 'Zurücksetzen fehlgeschlagen.';
      return;
    }

    this.resetSuccess = `Passwort für ${this.displayName(p)} wurde geändert.`;
    this.resetPasswordValue = '';
    setTimeout(() => {
      if (this.resetTargetId === p.id) {
        this.resetTargetId = null;
        this.resetSuccess = '';
      }
    }, 2000);
  }
}