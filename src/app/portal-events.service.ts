import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface PortalEvent {
  id: string; kind: 'event' | 'meeting'; title: string; description: string;
  starts_at: string; ends_at: string; location: string; meeting_url: string;
}
export function safeMeetingUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
@Injectable({ providedIn: 'root' })
export class PortalEventsService {
  constructor(private api: SupabaseService) {}
  list(): Promise<PortalEvent[]> { return this.api.supportRpc('portal_events_list'); }
  save(event: Omit<PortalEvent, 'id'>, id: string | null): Promise<string> {
    return this.api.supportRpc('portal_event_save', { entry_id: id, entry_kind: event.kind, entry_title: event.title,
      details: event.description, starts: event.starts_at, ends: event.ends_at, place: event.location, meeting_link: event.meeting_url });
  }
  remove(id: string): Promise<void> { return this.api.supportRpc('portal_event_delete', { entry_id: id }); }
}
