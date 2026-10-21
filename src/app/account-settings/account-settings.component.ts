import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Profile, SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-account-settings',
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.css'],
})
export class AccountSettingsComponent implements OnInit {
  profile: Profile | null = null;
  loading = true;
  loadError = '';
  newPassword = '';
  confirmPassword = '';
  passwordError = '';
  passwordSuccess = '';
  saving = false;
  loggingOut = false;
  logoutError = '';
  constructor(private supabase: SupabaseService, private router: Router) {}
  async ngOnInit(): Promise<void> {
    try {
      this.profile = await this.supabase.getMyProfile();
      if (!this.profile) this.loadError = 'Kontodaten konnten nicht geladen werden.';
    } catch { this.loadError = 'Kontodaten konnten nicht geladen werden.'; }
    finally { this.loading = false; }
  }
  async submitPasswordChange(): Promise<void> {
    this.passwordError = '';
    this.passwordSuccess = '';

    if (this.newPassword.length < 6) {
      this.passwordError = 'Passwort muss mindestens 6 Zeichen haben.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError = 'Passwörter stimmen nicht überein.';
      return;
    }

    if (this.saving) return;
    this.saving = true;
    let result: { ok: boolean; error?: string };
    try { result = await this.supabase.updatePassword(this.newPassword); }
    catch { result = { ok: false, error: 'Passwort konnte nicht geändert werden. Bitte erneut versuchen.' }; }
    finally { this.saving = false; }

    if (!result.ok) {
      this.passwordError = result.error ?? 'Ändern fehlgeschlagen.';
      return;
    }

    this.passwordSuccess = 'Passwort geändert.';
    this.newPassword = '';
    this.confirmPassword = '';

  }


  async logout(): Promise<void> {
    if (this.loggingOut || this.saving) return;
    this.loggingOut = true;
    this.logoutError = '';
    try {
      const result = await this.supabase.signOut();
      if (result.error) throw result.error;
      await this.router.navigateByUrl('/login');
    } catch { this.logoutError = 'Abmelden fehlgeschlagen. Bitte erneut versuchen.'; }
    finally { this.loggingOut = false; }
  }
}
