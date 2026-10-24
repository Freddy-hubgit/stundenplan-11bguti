import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class FeatureAccessGuard implements CanActivate {
  constructor(private api: SupabaseService, private router: Router) {}
  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean | UrlTree> {
    try {
      const profile = await this.api.getMyProfile();
      if (profile && (route.data.allowedRoles as string[]).includes(profile.role)) return true;
    } catch { /* Deny access if profile verification fails. */ }
    return this.router.parseUrl('/');
  }
}
