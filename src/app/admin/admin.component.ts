import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  email = '';
  password = '';
  errorMessage = '';
  loading = false;

  constructor(private supabase: SupabaseService, private router: Router) {}

  async submit(): Promise<void> {
    this.errorMessage = '';
    this.loading = true;

    const result = await this.supabase.signIn(this.email, this.password);

    this.loading = false;

    if (result.error) {
      this.errorMessage = result.error.message;
      return;
    }

    this.router.navigateByUrl('/');
  }
}