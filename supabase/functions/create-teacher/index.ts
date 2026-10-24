import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const response = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return response(405, { error: 'Methode nicht erlaubt.' });
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return response(401, { error: 'Anmeldung erforderlich.' });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return response(500, { error: 'Funktion noch nicht eingerichtet.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return response(401, { error: 'Anmeldung ungültig.' });
    const { data: profile, error: roleError } = await admin.from('profiles').select('role').eq('id', identity.user.id).single();
    if (roleError || !['support', 'admin'].includes(profile?.role)) return response(403, { error: 'Keine Berechtigung.' });
    let body;
    try { body = await request.json(); } catch { return response(400, { error: 'Ungültige Anfrage.' }); }
    const { email, password, name } = body ?? {};
    if (typeof email !== 'string' || !email.trim() || email.length > 320 || typeof password !== 'string' || password.length < 6
      || password.length > 1024 || typeof name !== 'string' || name.length > 160) {
      return response(400, { error: 'E-Mail, Name und ein Passwort mit mindestens 6 Zeichen angeben.' });
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email: email.trim(), password,
      email_confirm: true, user_metadata: { full_name: name.trim() }, app_metadata: { role: 'teacher' } });
    if (createError || !created.user) return response(400, { error: 'Konto konnte nicht angelegt werden. Prüfe die E-Mail und Passwortvorgaben.' });
    const { error: profileError } = await admin.from('profiles').upsert({ id: created.user.id, email: email.trim(), full_name: name.trim(), role: 'teacher' });
    if (profileError) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
      return response(500, { error: cleanupError ? 'Profilanlage fehlgeschlagen. Bitte das neu angelegte Konto in Supabase prüfen.' : 'Profilanlage fehlgeschlagen. Bitte zuerst die Lehrer-Migration ausführen.' });
    }
    return response(200, { ok: true });
  } catch { return response(500, { error: 'Konto konnte nicht angelegt werden. Bitte erneut versuchen.' }); }
});
