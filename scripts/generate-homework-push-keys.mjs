// Run locally. Copy privateKey only into Supabase Edge Function secrets, never into Git/chat.
import {generateKeyPairSync,randomBytes} from 'node:crypto';
const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const key=privateKey.export({format:'jwk'});
const publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(key.x,'base64url'),Buffer.from(key.y,'base64url')]).toString('base64url');
console.log(JSON.stringify({VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_KEY:key.d,HOMEWORK_CRON_SECRET:randomBytes(32).toString('base64url')},null,2));
