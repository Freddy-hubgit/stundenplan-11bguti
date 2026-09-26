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

    this.createSuccess = `Konto fuer ${this.newName || this.newEmail} wurde angelegt.`;
    this.newName = '';
    this.newEmail = '';
    this.newPassword = '';
    this.newRole = 'user';
    await this.reload();
  }
}