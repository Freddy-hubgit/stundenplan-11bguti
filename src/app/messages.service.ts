import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
export interface ChatPerson { id: string; full_name: string; role: string; }
export interface DirectThread { id: string; peer_id: string; peer_name: string; peer_role: string; updated_at: string; last_message: string | null; }
export interface DirectMessage { id: string; sender_id: string; sender_name: string; body: string; created_at: string; }
@Injectable({ providedIn: 'root' })
export class MessagesService {
 constructor(private api: SupabaseService) {}
 people(): Promise<ChatPerson[]> { return this.api.supportRpc('dm_people'); }
 threads(): Promise<DirectThread[]> { return this.api.supportRpc('dm_threads'); }
 start(id: string,body: string): Promise<string> { return this.api.supportRpc('dm_start',{peer_id:id,message_body:body}); }
 async messages(id: string): Promise<DirectMessage[]> { const rows=await this.api.supportRpc<DirectMessage[]>('dm_messages',{chat_id:id});try{await this.api.supportRpc('dm_mark_read',{chat_id:id});}catch{/* Read counters must not prevent reading messages before their migration is installed. */}return rows; }
 send(id: string,body: string): Promise<void> { return this.api.supportRpc('dm_send',{chat_id:id,message_body:body}); }
}
