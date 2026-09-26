import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Profile, SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-profile-menu',
  templateUrl: './profile-menu.component.html',
  styleUrls: ['./profile-menu.component.css'],
})
export class ProfileMenuComponent implements OnInit {
  profile: Profile | null = null;
  open = false;

  changingPassword = false;
  newPassword = '';
  confirmPassword = '';
  passwordError = '';
  passwordSuccess = '';
  saving = false;

  constructor(private supabase: SupabaseService, private router: Router) {}

  async ngOnInit(): Promise<void> {
    this.profile = await this.supabase.getMyProfile();
  }

  get displayName(): string {
    return this.profile?.full_name?.trim() || this.profile?.email || '';
  }

  get initials(): string {
    const name = this.displayName;
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  toggle(): void {
    this.open = !this.open;
    if (!this.open) {
      this.resetPasswordForm();
    }
  }

  close(): void {
    this.open = false;
    this.resetPasswordForm();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  startChangePassword(): void {
    this.changingPassword = true;
    this.passwordError = '';
    this.passwordSuccess = '';
  }

  resetPasswordForm(): void {
    this.changingPassword = false;
    this.newPassword = '';
    this.confirmPassword = '';
    this.passwordError = '';
    this.passwordSuccess = '';
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

    this.saving = true;
    const result = await this.supabase.updatePassword(this.newPassword);
    this.saving = false;

    if (!result.ok) {
      this.passwordError = result.error ?? 'Ändern fehlgeschlagen.';
      return;
    }

    this.passwordSuccess = 'Passwort geändert.';
    this.newPassword = '';
    this.confirmPassword = '';
    setTimeout(() => this.resetPasswordForm(), 1500);
  }

  async logout(): Promise<void> {
    await this.supabase.signOut();
    this.router.navigateByUrl('/login');
  }
}