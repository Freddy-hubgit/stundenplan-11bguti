import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface TeamMember { id: string; full_name: string; role: 'support' | 'admin'; }
export interface SupportTicket {
  id: string; owner_id: string; owner_name: string; subject: string;
  status: 'open' | 'closed'; created_at: string; updated_at: string;
}
export interface TicketMessage {
  id: string; sender_id: string; sender_name: string; sender_role: string;
  body: string; created_at: string;
}

@Injectable({ providedIn: 'root' })
export class SupportService {
  constructor(private supabase: SupabaseService) {}
  team(): Promise<TeamMember[]> { return this.supabase.supportRpc('support_team'); }
  tickets(): Promise<SupportTicket[]> { return this.supabase.supportRpc('support_tickets'); }
  messages(id: string): Promise<TicketMessage[]> {
    return this.supabase.supportRpc('support_messages', { ticket_id: id });
  }
  create(subject: string, body: string): Promise<string> {
    return this.supabase.supportRpc('support_create_ticket', { subject, body });
  }
  reply(id: string, body: string): Promise<void> {
    return this.supabase.supportRpc('support_reply', { ticket_id: id, body });
  }
  setStatus(id: string, status: 'open' | 'closed'): Promise<void> {
    return this.supabase.supportRpc('support_set_status', { ticket_id: id, new_status: status });
  }
}
