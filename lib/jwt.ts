import { createHmac } from 'crypto'
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

export function verifyAccessToken(token: string | undefined, options: VerifyOptions = {}): TokenClaims | null {
  try {
    if (!token) return null
    const secret = process.env.SUPABASE_JWT_SECRET
    if (!secret) {
      prodError('[JWT] Missing SUPABASE_JWT_SECRET')
      return null
    }

    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, signatureB64] = parts
    const data = `${headerB64}.${payloadB64}`
    const expectedSig = createHmac('sha256', secret).update(data).digest('base64url')
    if (expectedSig !== signatureB64) return null

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8')
    const payload = JSON.parse(payloadJson)
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && now >= payload.exp) return null
    if (payload.nbf && now < payload.nbf) return null
    if (options.audience && payload.aud !== options.audience) return null
    if (options.issuer && payload.iss !== options.issuer) return null

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      aud: payload.aud,
      iss: payload.iss,
      exp: payload.exp,
      nbf: payload.nbf
    }
  } catch (e) {
    prodError('[JWT] Verification failed', e)
    return null
  }
}

