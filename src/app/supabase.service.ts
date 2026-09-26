import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://amwowtaxrgfcojlsxhzk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RAlat6kd4uEdZvjrFODVcQ_JQQnkJB7';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'user' | 'support' | 'admin';
  created_at: string;
}

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

  async signOut() {
    return this.client.auth.signOut();
  }

  async getMyProfile(): Promise<Profile | null> {
    const session = await this.getSession();
    if (!session) return null;
    const { data } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    return (data as Profile) ?? null;
  }

  async listProfiles(): Promise<Profile[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as Profile[]) ?? [];
  }

  async createUserAccount(
    email: string,
    password: string,
    role: 'user' | 'support' | 'admin',
    name: string
  ): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.client.functions.invoke('create-user', {
      body: { email, password, role, name },
    });

    if (error) {
      let message = error.message;
      try {
        const context = (error as any).context;
        if (context?.error) message = context.error;
      } catch {
        /* Fallback auf error.message */
      }
      return { ok: false, error: message };
    }

    if (data?.error) {
      return { ok: false, error: data.error };
    }

    return { ok: true };
  }
}