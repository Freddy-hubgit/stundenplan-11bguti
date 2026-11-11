import {prepareAvatar} from '../avatar/prepare-avatar';
import { roleNames } from '../supabase.service';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Profile, SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-account-settings',
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.css'],
})
export class AccountSettingsComponent implements OnInit {
  roleNames = roleNames;
  profile: Profile | null = null;
  loading = true;
  loadError = '';
  newPassword = '';
  confirmPassword = '';
  passwordError = '';
  passwordSuccess = '';
  saving = false;
  avatarBusy=false;avatarError='';avatarSuccess='';
  async selectAvatar(event:Event):Promise<void>{
    const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file||this.avatarBusy)return;
    this.avatarBusy=true;this.avatarError='';this.avatarSuccess='';
    try{await this.supabase.saveProfilePicture(await prepareAvatar(file),this.profile?.id||'');this.avatarSuccess='Profilbild gespeichert.';}
    catch(e:any){this.avatarError=e?.message||'Profilbild konnte nicht gespeichert werden.';}
    finally{this.avatarBusy=false;input.value='';}
  }
  async removeAvatar():Promise<void>{
    if(this.avatarBusy)return;this.avatarBusy=true;this.avatarError='';this.avatarSuccess='';
    try{await this.supabase.saveProfilePicture(null,this.profile?.id||'');this.avatarSuccess='Profilbild entfernt.';}
    catch(e:any){this.avatarError=e?.message||'Profilbild konnte nicht entfernt werden.';}
    finally{this.avatarBusy=false;}
  }
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
    if (this.loggingOut || this.saving || this.avatarBusy) return;
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
