import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(private supabase: SupabaseService, private router: Router) {}

  async canActivate(): Promise<boolean | UrlTree> {
    const profile = await this.supabase.getMyProfile();
    if (profile && (profile.role === 'admin' || profile.role === 'support')) {
      return true;
    }
    return this.router.parseUrl('/');
  }
}