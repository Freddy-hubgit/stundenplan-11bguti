import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  mode: 'login' | 'signup' = 'login';
  email = '';
  password = '';
  errorMessage = '';
  infoMessage = '';
  loading = false;

  constructor(private supabase: SupabaseService, private router: Router) {}

  toggleMode(): void {
    this.mode = this.mode === 'login' ? 'signup' : 'login';
    this.errorMessage = '';
    this.infoMessage = '';
  }

  async submit(): Promise<void> {
    this.errorMessage = '';
    this.infoMessage = '';
    this.loading = true;

    const result = this.mode === 'login'
      ? await this.supabase.signIn(this.email, this.password)
      : await this.supabase.signUp(this.email, this.password);

    this.loading = false;

    if (result.error) {
      this.errorMessage = result.error.message;
      return;
    }

    if (this.mode === 'signup' && !result.data.session) {
      this.infoMessage = 'Bestaetigungs-Mail verschickt. Bitte pruefe dein Postfach und logg dich danach ein.';
      this.mode = 'login';
      return;
    }

    this.router.navigateByUrl('/');
  }
}