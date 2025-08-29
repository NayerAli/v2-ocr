import { prodError } from './log'

export interface TokenClaims {
  id: string
  email: string
  role?: string
  aud?: string
  iss?: string
  exp?: number
  nbf?: number
}

interface VerifyOptions {
  audience?: string
  issuer?: string
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function verifyAccessToken(
  token: string | undefined,
  options: VerifyOptions = {}
): Promise<TokenClaims | null> {
  try {
    if (!token) return null;
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      prodError('[JWT] Missing SUPABASE_JWT_SECRET');
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const data = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signature = base64UrlDecode(signatureB64);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(data)
    );
    if (!valid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now >= payload.exp) return null;
    if (payload.nbf && now < payload.nbf) return null;
    if (options.audience && payload.aud !== options.audience) return null;
    if (options.issuer && payload.iss !== options.issuer) return null;

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      aud: payload.aud,
      iss: payload.iss,
      exp: payload.exp,
      nbf: payload.nbf
    };
  } catch (e) {
    prodError('[JWT] Verification failed', e);
    return null;
  }
}

