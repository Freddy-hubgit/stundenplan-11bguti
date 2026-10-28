import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://amwowtaxrgfcojlsxhzk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RAlat6kd4uEdZvjrFODVcQ_JQQnkJB7';

export type AccountRole = 'user' | 'teacher' | 'support' | 'admin';
export function rolesOf(profile: Profile | null): AccountRole[] { return profile ? (profile.roles?.length ? profile.roles : [profile.role]) : []; }
export function hasRole(profile: Profile | null, ...roles: string[]): boolean { return rolesOf(profile).some(role => roles.includes(role)); }
export function roleNames(profile: Profile | null): string { return rolesOf(profile).map(role => ({user:'Nutzer',teacher:'Lehrer',support:'Support',admin:'Admin'})[role]).join(', '); }

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: AccountRole;
  roles?: AccountRole[];
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

  // Löst einen Login-Bezeichner (Name ODER E-Mail) zu einer E-Mail auf.
  // Gibt { email } bei eindeutigem Treffer zurück, sonst { error }.
  async resolveLoginEmail(identifier: string): Promise<{ email?: string; error?: string }> {
    const trimmed = identifier.trim();
    if (!trimmed) return { error: 'Bitte Name oder E-Mail eingeben.' };

    if (trimmed.includes('@')) {
      return { email: trimmed };
    }

    const { data, error } = await this.client.rpc('get_login_email', { p_name: trimmed });
    if (error) return { error: 'Anmeldung gerade nicht möglich.' };

    const matches: string[] = data ?? [];
    if (matches.length === 0) return { error: 'Kein Konto mit diesem Namen gefunden.' };
    if (matches.length > 1) return { error: 'Mehrere Konten mit diesem Namen. Bitte mit E-Mail anmelden.' };

    return { email: matches[0] };
  }

  async signIn(email: string, password: string) {
    return this.client.auth.signInWithPassword({ email, password });
  }

  async signOut() {
    return this.client.auth.signOut();
  }

  // Selbstbedienung: eingeloggter Nutzer ändert sein eigenes Passwort.
  async updatePassword(newPassword: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
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

  async supportRpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw error;
    return data as T;
  }

  async uploadHomeworkFile(task: string, file: File): Promise<string> {
    const session = await this.getSession(); if (!session) throw new Error('Anmeldung erforderlich.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Dateien dürfen höchstens 10 MB groß sein.');
    const mime: Record<string,string> = {pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',txt:'text/plain',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',odt:'application/vnd.oasis.opendocument.text'};
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!mime[extension]) throw new Error('Bitte PDF, Office-Datei, Bild oder TXT auswählen.');
    const random = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(n=>n.toString(16).padStart(2,'0')).join('');
    const path = session.user.id + '/' + task + '/' + random + '.' + extension;
    const { error } = await this.client.storage.from('homework-submissions').upload(path,file,{contentType:mime[extension],upsert:false});
    if(error)throw error;return path;
  }
  async removeHomeworkFile(path: string): Promise<void> { if(!path)return; const {error}=await this.client.storage.from('homework-submissions').remove([path]);if(error)throw error; }
  async homeworkFileUrl(path: string, name: string): Promise<string> {
    const {data,error}=await this.client.storage.from('homework-submissions').createSignedUrl(path,60,{download:name||true});
    if(error)throw error;return data.signedUrl;
  }
  async pushConfig(): Promise<string> {
    const {data,error}=await this.client.functions.invoke('homework-reminders',{body:{action:'config'}});
    if(error||!data?.publicKey)throw new Error('Web-Push muss noch in Supabase eingerichtet werden.');return data.publicKey;
  }

  async downloadAccountBackground(account: string): Promise<Blob | null> {
    const { data, error } = await this.client.storage.from('account-backgrounds').download(account + '/background');
    if (error) {
      const status = String((error as any).statusCode || (error as any).status || '');
      if ((status === '404' || status === '400') && !/bucket/i.test(error.message) && /not found|does not exist/i.test(error.message)) return null;
      throw error;
    }
    return data;
  }

  async uploadAccountBackground(account: string, image: Blob): Promise<void> {
    const { error } = await this.client.storage.from('account-backgrounds').upload(account + '/background', image,
      { upsert: true, contentType: image.type, cacheControl: '0' });
    if (error) throw error;
  }

  async deleteAccountBackground(account: string): Promise<void> {
    const { error } = await this.client.storage.from('account-backgrounds').remove([account + '/background']);
    if (error) throw error;
  }

  async changeUserRoles(id: string, roles: AccountRole[]): Promise<{ ok: boolean; error?: string }> {
    try { await this.supportRpc('set_profile_roles', { target_id: id, new_roles: roles }); return { ok: true }; }
    catch(e:any) { return { ok:false, error:e?.code==='PGRST202'?'Die Mehrfachrollen-Migration muss noch in Supabase eingerichtet werden.':e?.message||'Rollen konnten nicht geändert werden.' }; }
  }

  async createUserAccount(
    email: string,
    password: string,
    role: 'user' | 'teacher' | 'support' | 'admin',
    name: string
  ): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.client.functions.invoke(role === 'teacher' ? 'create-teacher' : 'quick-responder', {
      body: { email, password, role, name },
    });
    return this.unwrapFunctionResult(data, error);
  }

  // Ändert E-Mail, Name und/oder Passwort eines Kontos (nur Felder, die im Objekt stehen).
  async updateUserAccount(
    userId: string,
    changes: { email?: string; name?: string; password?: string }
  ): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.client.functions.invoke('manage-user', {
      body: { action: 'update', userId, ...changes },
    });
    return this.unwrapFunctionResult(data, error);
  }

  async deleteUserAccount(userId: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.client.functions.invoke('manage-user', {
      body: { action: 'delete', userId },
    });
    return this.unwrapFunctionResult(data, error);
  }

  private unwrapFunctionResult(data: any, error: any): { ok: boolean; error?: string } {
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
