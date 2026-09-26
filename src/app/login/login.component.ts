import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  identifier = '';
  password = '';
  errorMessage = '';
  loading = false;

  constructor(private supabase: SupabaseService, private router: Router) {}

  async submit(): Promise<void> {
    this.errorMessage = '';
    this.loading = true;

    const resolved = await this.supabase.resolveLoginEmail(this.identifier);
    if (resolved.error || !resolved.email) {
      this.errorMessage = resolved.error ?? 'Anmeldung fehlgeschlagen.';
      this.loading = false;
      return;
    }

    const result = await this.supabase.signIn(resolved.email, this.password);
    this.loading = false;

    if (result.error) {
      this.errorMessage = 'Name/E-Mail oder Passwort falsch.';
      return;
    }

    this.router.navigateByUrl('/');
  }
}