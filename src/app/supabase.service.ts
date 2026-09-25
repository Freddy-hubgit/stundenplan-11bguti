import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://amwowtaxrgfcojlsxhzk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RAlat6kd4uEdZvjrFODVcQ_JQQnkJB7';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession();
    return data.session;
  }

  onAuthStateChange(callback: (session: Session | null) => void) {
    return this.client.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
  }

  async signIn(email: string, password: string) {
    return this.client.auth.signInWithPassword({ email, password });
  }

  async signUp(email: string, password: string) {
    return this.client.auth.signUp({ email, password });
  }

  async signOut() {
    return this.client.auth.signOut();
  }
}