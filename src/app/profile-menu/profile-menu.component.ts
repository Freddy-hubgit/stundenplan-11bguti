import { Component, OnInit } from '@angular/core';
import { Profile, SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-profile-menu',
  templateUrl: './profile-menu.component.html',
  styleUrls: ['./profile-menu.component.css'],
})
export class ProfileMenuComponent implements OnInit {
  profile: Profile | null = null;
  open = false;

  constructor(private supabase: SupabaseService) {}
  async ngOnInit(): Promise<void> { this.profile = await this.supabase.getMyProfile(); }
  get displayName(): string { return this.profile?.full_name?.trim() || this.profile?.email || 'Konto'; }
  get initials(): string {
    return this.displayName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  }
}
